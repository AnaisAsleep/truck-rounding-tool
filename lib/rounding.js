/**
 * lib/rounding.js — Core Truck Rounding Algorithm
 *
 * Pure functions only — no side effects, no API calls, no DOM access.
 * Input data in → results out. This makes the logic easy to test,
 * debug, and extend in future versions.
 *
 * BUSINESS LOGIC OVERVIEW:
 * ========================
 * The goal is to turn a list of "need" quantities (how many pieces to order
 * from each supplier for each destination) into full truck/container loads.
 * We want trucks as full as possible to minimize cost per piece.
 *
 * The algorithm runs in this order:
 *  1. Group lines by lane (supplier → warehouse)
 *  2. Stack Prio 1 → 2 → 3 quantities into trucks, rounding to full pallets
 *  3. Assign Vendor Shipment Numbers to each truck
 *  4. Evaluate each truck's utilization and apply decision rules:
 *     - ≥80% → keep (top up with Prio 4 to 95% if possible)
 *     - 50-80% → try Prio 4 to reach 80%; if can't, check cost/piece
 *     - <50% → try to eliminate (cut if all Prio 3); otherwise try Prio 4
 *  5. Return confirmed trucks, borderline trucks (for user review), and cut lines
 */

// ============================================================
// SECTION 1: Quantity Rounding Helpers
// ============================================================

/**
 * Round a quantity to fit the palletization rules of a SKU.
 *
 * For PALLETIZED items:
 *   - Round DOWN to the nearest full pallet (pcs_per_pallet)
 *   - Example: 10 pieces with 4 pcs/pallet → 2 pallets = 8 pieces (remainder: 2)
 *   - MOQ check: if rounded qty > 0 but < MOQ, round UP to MOQ
 *     (ensures we don't place an order below the supplier's minimum)
 *
 * For LOOSE LOADED items:
 *   - Use the raw piece quantity (no pallet rounding needed)
 *   - No remainder
 *
 * @param {number} qty - Raw requested quantity in pieces
 * @param {Object} palletData - Palletization record from Airtable
 * @param {number} moq - Minimum Supply Lot from the upload file
 * @returns {{ roundedQty: number, pallets: number, remainder: number }}
 */
export function roundQuantity(qty, palletData, moq) {
  if (qty <= 0) {
    return { roundedQty: 0, pallets: 0, remainder: 0 };
  }

  const isLooseLoaded = palletData.loading_type === 'Loose Loaded';

  if (isLooseLoaded) {
    // Loose loaded: no pallet rounding, use pieces directly
    return { roundedQty: qty, pallets: 0, remainder: 0 };
  }

  // Palletized: round down to full pallets
  const pcsPerPallet = palletData.pcs_per_pallet;
  if (!pcsPerPallet || pcsPerPallet <= 0) {
    // Safety fallback: if pcs_per_pallet is missing, use raw quantity
    return { roundedQty: qty, pallets: 0, remainder: 0 };
  }

  const fullPallets = Math.floor(qty / pcsPerPallet);
  let roundedQty = fullPallets * pcsPerPallet;
  let remainder = qty - roundedQty;

  if (roundedQty === 0) {
    // All pieces go to remainder (not even one full pallet)
    return { roundedQty: 0, pallets: 0, remainder: qty };
  }

  // MOQ CHECK: if rounded qty is below the Minimum Supply Lot,
  // round UP to the MOQ. This ensures supplier minimums are respected.
  if (moq && moq > 0 && roundedQty < moq) {
    // Round up to the nearest full pallet quantity that meets or exceeds MOQ
    const palletsNeededForMOQ = Math.ceil(moq / pcsPerPallet);
    const moqQty = palletsNeededForMOQ * pcsPerPallet;
    // Only round up if it doesn't exceed the original quantity significantly
    // (if original qty >= moq, we keep moqQty; if original was already < moq, we use moqQty)
    const newFullPallets = Math.ceil(moq / pcsPerPallet);
    roundedQty = newFullPallets * pcsPerPallet;
    // Adjust remainder: we added pieces, so remainder decreases (may become 0 or negative)
    remainder = Math.max(0, qty - roundedQty);
    return { roundedQty, pallets: newFullPallets, remainder };
  }

  return { roundedQty, pallets: fullPallets, remainder };
}

/**
 * Calculate how much of a truck's capacity a line uses, as a fraction (0-1).
 *
 * For palletized: fraction = pallets / pallets_per_truck
 * For loose loaded: fraction = pieces / pcs_per_ftl_container
 *
 * This unified percentage approach handles mixed trucks (palletized + loose loaded
 * on the same lane) correctly.
 *
 * @param {number} qty - Rounded quantity in pieces
 * @param {number} pallets - Number of pallets used (0 if loose loaded)
 * @param {Object} palletData - Palletization record
 * @returns {number} Fill fraction 0-1
 */
function calcLineFraction(qty, pallets, palletData) {
  const isLooseLoaded = palletData.loading_type === 'Loose Loaded';

  if (isLooseLoaded) {
    const capacity = palletData.pcs_per_ftl_container;
    if (!capacity || capacity <= 0) return 0;
    return qty / capacity;
  } else {
    const palletsPerTruck = palletData.pallets_per_truck;
    if (!palletsPerTruck || palletsPerTruck <= 0) return 0;
    return pallets / palletsPerTruck;
  }
}

// ============================================================
// SECTION 2: Truck Building
// ============================================================

/**
 * Build trucks for a single lane by stacking quantities in priority order.
 *
 * The algorithm fills trucks sequentially:
 *   - Add Prio 1 for all SKUs → fills trucks until full, then starts new truck
 *   - Add Prio 2 for all SKUs → continues filling
 *   - Add Prio 3 for all SKUs → continues filling
 *
 * When a truck reaches 100% capacity, a new truck is started.
 * Pallet rounding remainders are tracked and become cut lines.
 *
 * @param {Array} laneLines - All rows for one lane (same origin+destination)
 * @param {number} weekNum - ISO week number (for VSN assignment later)
 * @param {number} year - Year (for VSN assignment later)
 * @returns {{ trucks: Array, cutLines: Array }}
 */
export function buildTrucksForLane(laneLines) {
  if (!laneLines || laneLines.length === 0) {
    return { trucks: [], cutLines: [] };
  }

  // All trucks for this lane will share origin/destination
  const origin = laneLines[0].originLocationCode;
  const destination = laneLines[0].destinationLocation;

  const trucks = [];
  const cutLines = []; // Collects pallet rounding remainders

  // Current truck being filled
  let currentTruck = createEmptyTruck(origin, destination);

  /**
   * Attempt to add a quantity of a SKU to the current truck.
   * If it doesn't fit, close the current truck and open a new one.
   * If a single line is larger than a full truck, split it across multiple trucks.
   */
  const addLinesToTruck = (row, qty, prio) => {
    const { palletData, sku, supplierName, moq, lane, costData } = row;

    // Apply pallet rounding
    const { roundedQty, pallets, remainder } = roundQuantity(qty, palletData, moq);

    // Track remainder as a cut line (pallet rounding leftover)
    if (remainder > 0) {
      cutLines.push({
        originLocationCode: origin,
        supplierName,
        destinationLocation: destination,
        sku,
        originalQty: remainder,
        priority: prio,
        lane,
        cutReason: `Pallet rounding remainder — ${remainder} pieces did not fill a complete pallet`,
      });
    }

    if (roundedQty === 0) return;

    // Calculate how much of a truck this quantity occupies
    const totalFraction = calcLineFraction(roundedQty, pallets, palletData);

    // If this entire quantity fits in the remaining space, add it
    if (currentTruck.usedFraction + totalFraction <= 1.0001) { // small epsilon for float safety
      currentTruck.lines.push({
        sku,
        supplierName,
        originLocationCode: origin,
        destinationLocation: destination,
        qty: roundedQty,
        pallets,
        priority: prio,
        loadingType: palletData.loading_type,
        loadingUnit: palletData.loading_unit,
        lineFraction: totalFraction,
        palletData,
        lane,
        costData,
      });
      currentTruck.usedFraction += totalFraction;
      if (prio < currentTruck.minPrio) currentTruck.minPrio = prio;
    } else {
      // Doesn't fit entirely — fill current truck first, then overflow to new truck
      const remainingFraction = Math.max(0, 1 - currentTruck.usedFraction);

      if (remainingFraction > 0.001) { // Some space left in current truck
        // Calculate how many pieces/pallets fit in the remaining space
        let qtyForCurrentTruck, palletsForCurrentTruck;

        if (palletData.loading_type === 'Loose Loaded') {
          qtyForCurrentTruck = Math.floor(remainingFraction * palletData.pcs_per_ftl_container);
          palletsForCurrentTruck = 0;
        } else {
          palletsForCurrentTruck = Math.floor(remainingFraction * palletData.pallets_per_truck);
          qtyForCurrentTruck = palletsForCurrentTruck * palletData.pcs_per_pallet;
        }

        if (qtyForCurrentTruck > 0) {
          const fitFraction = calcLineFraction(qtyForCurrentTruck, palletsForCurrentTruck, palletData);
          currentTruck.lines.push({
            sku,
            supplierName,
            originLocationCode: origin,
            destinationLocation: destination,
            qty: qtyForCurrentTruck,
            pallets: palletsForCurrentTruck,
            priority: prio,
            loadingType: palletData.loading_type,
            loadingUnit: palletData.loading_unit,
            lineFraction: fitFraction,
            palletData,
            lane,
            costData,
          });
          currentTruck.usedFraction += fitFraction;
          if (prio < currentTruck.minPrio) currentTruck.minPrio = prio;
        }

        // Overflow quantity goes to next truck
        const overflowQty = roundedQty - qtyForCurrentTruck;
        const overflowPallets = pallets - palletsForCurrentTruck;

        if (overflowQty > 0) {
          trucks.push(currentTruck);
          currentTruck = createEmptyTruck(origin, destination);
          // Add overflow to new truck (simplified: put all remaining)
          const overflowFraction = calcLineFraction(overflowQty, overflowPallets, palletData);
          currentTruck.lines.push({
            sku,
            supplierName,
            originLocationCode: origin,
            destinationLocation: destination,
            qty: overflowQty,
            pallets: overflowPallets,
            priority: prio,
            loadingType: palletData.loading_type,
            loadingUnit: palletData.loading_unit,
            lineFraction: overflowFraction,
            palletData,
            lane,
            costData,
          });
          currentTruck.usedFraction += overflowFraction;
          if (prio < currentTruck.minPrio) currentTruck.minPrio = prio;
        }
      } else {
        // Current truck is essentially full — start a new one
        trucks.push(currentTruck);
        currentTruck = createEmptyTruck(origin, destination);
        // Add the full line to the new truck
        const newFraction = calcLineFraction(roundedQty, pallets, palletData);
        currentTruck.lines.push({
          sku,
          supplierName,
          originLocationCode: origin,
          destinationLocation: destination,
          qty: roundedQty,
          pallets,
          priority: prio,
          loadingType: palletData.loading_type,
          loadingUnit: palletData.loading_unit,
          lineFraction: newFraction,
          palletData,
          lane,
          costData,
        });
        currentTruck.usedFraction += newFraction;
        if (prio < currentTruck.minPrio) currentTruck.minPrio = prio;
      }
    }
  };

  // STEP 1: Process Prio 1 quantities for all SKUs on this lane
  for (const row of laneLines) {
    if (row.prio1 > 0) addLinesToTruck(row, row.prio1, 1);
  }

  // STEP 2: Process Prio 2 quantities
  for (const row of laneLines) {
    if (row.prio2 > 0) addLinesToTruck(row, row.prio2, 2);
  }

  // STEP 3: Process Prio 3 quantities
  for (const row of laneLines) {
    if (row.prio3 > 0) addLinesToTruck(row, row.prio3, 3);
  }

  // Close the last truck if it has any lines
  if (currentTruck.lines.length > 0) {
    trucks.push(currentTruck);
  }

  return { trucks, cutLines };
}

/** Create a new empty truck object for a given lane */
function createEmptyTruck(origin, destination) {
  return {
    origin,
    destination,
    lane: `${origin}|${destination}`,
    lines: [],
    usedFraction: 0,
    minPrio: 9, // Will be updated as lines are added
    vendorShipmentNumber: null, // Assigned in Step 2
    decision: null, // Set during decision rules
    cutReason: null,
  };
}

// ============================================================
// SECTION 3: Vendor Shipment Number Assignment
// ============================================================

/**
 * Assign Vendor Shipment Numbers to all trucks.
 *
 * Format: YYWW{origin}_{destination}_P{minPrio}_{seq:02d}
 * Example: 2615MI_PT_HA_DE_P1_01
 *
 * Sequential numbers reset per lane. So if there are 3 trucks on MI_PT→HA_DE,
 * they get _01, _02, _03.
 *
 * @param {Array} trucks - Array of truck objects
 * @param {number} weekNum - ISO week number (1-53)
 * @param {number} year - Full year (e.g. 2026)
 * @returns {Array} Trucks with vendorShipmentNumber set
 */
export function assignVendorShipmentNumbers(trucks, weekNum, year) {
  const yy = String(year).slice(-2);
  const ww = String(weekNum).padStart(2, '0');

  // Track sequential counter per lane
  const laneCounters = {};

  return trucks.map(truck => {
    const laneKey = `${truck.origin}_${truck.destination}`;
    laneCounters[laneKey] = (laneCounters[laneKey] || 0) + 1;
    const seq = String(laneCounters[laneKey]).padStart(2, '0');
    const minPrio = truck.minPrio === 9 ? 1 : truck.minPrio;

    return {
      ...truck,
      vendorShipmentNumber: `${yy}${ww}${truck.origin}_${truck.destination}_P${minPrio}_${seq}`,
    };
  });
}

// ============================================================
// SECTION 4: Prio 4 Top-Up
// ============================================================

/**
 * Try to top up a truck's utilization using Prio 4 quantities.
 *
 * Rules:
 * - Only add Prio 4 for SKUs that exist on the same lane
 * - Follow same pallet rounding rules
 * - Don't exceed truck capacity (100%)
 * - Don't exceed target utilization (targetFraction)
 *
 * @param {Object} truck - Truck to top up
 * @param {Array} prio4Lines - Prio 4 rows for this lane
 * @param {number} targetFraction - Max fill fraction (0.95 or 0.80)
 * @returns {{ updatedTruck, usedPrio4Lines, cutLines }}
 */
export function topUpTruckWithPrio4(truck, prio4Lines, targetFraction) {
  if (!prio4Lines || prio4Lines.length === 0) {
    return { updatedTruck: truck, usedPrio4Lines: [], cutLines: [] };
  }

  const addedLines = [];
  const cutLines = [];
  let currentFraction = truck.usedFraction;

  for (const row of prio4Lines) {
    if (currentFraction >= targetFraction) break;

    const { palletData, sku, supplierName, moq, lane, costData } = row;
    const qty = row.prio4;
    if (qty <= 0) continue;

    const { roundedQty, pallets, remainder } = roundQuantity(qty, palletData, moq);

    // Track remainder
    if (remainder > 0) {
      cutLines.push({
        originLocationCode: truck.origin,
        supplierName,
        destinationLocation: truck.destination,
        sku,
        originalQty: remainder,
        priority: 4,
        lane,
        cutReason: `Pallet rounding remainder — ${remainder} pieces did not fill a complete pallet`,
      });
    }

    if (roundedQty === 0) continue;

    const lineFraction = calcLineFraction(roundedQty, pallets, palletData);

    // How much room do we have up to the target?
    const availableFraction = targetFraction - currentFraction;

    if (lineFraction <= availableFraction + 0.001) {
      // Fits within target — add it
      addedLines.push({
        sku,
        supplierName,
        originLocationCode: truck.origin,
        destinationLocation: truck.destination,
        qty: roundedQty,
        pallets,
        priority: 4,
        loadingType: palletData.loading_type,
        loadingUnit: palletData.loading_unit,
        lineFraction,
        palletData,
        lane,
        costData,
      });
      currentFraction += lineFraction;
    } else {
      // Partial fit: add as many pallets/pieces as fit within target
      if (palletData.loading_type === 'Loose Loaded') {
        const fittingPcs = Math.floor(availableFraction * palletData.pcs_per_ftl_container);
        if (fittingPcs > 0) {
          const fittingFraction = fittingPcs / palletData.pcs_per_ftl_container;
          addedLines.push({
            sku, supplierName,
            originLocationCode: truck.origin,
            destinationLocation: truck.destination,
            qty: fittingPcs, pallets: 0, priority: 4,
            loadingType: palletData.loading_type,
            loadingUnit: palletData.loading_unit,
            lineFraction: fittingFraction,
            palletData, lane, costData,
          });
          currentFraction += fittingFraction;
        }
      } else {
        const fittingPallets = Math.floor(availableFraction * palletData.pallets_per_truck);
        if (fittingPallets > 0) {
          const fittingPcs = fittingPallets * palletData.pcs_per_pallet;
          const fittingFraction = fittingPallets / palletData.pallets_per_truck;
          addedLines.push({
            sku, supplierName,
            originLocationCode: truck.origin,
            destinationLocation: truck.destination,
            qty: fittingPcs, pallets: fittingPallets, priority: 4,
            loadingType: palletData.loading_type,
            loadingUnit: palletData.loading_unit,
            lineFraction: fittingFraction,
            palletData, lane, costData,
          });
          currentFraction += fittingFraction;
        }
      }
    }
  }

  const updatedTruck = {
    ...truck,
    lines: [...truck.lines, ...addedLines],
    usedFraction: currentFraction,
  };

  return { updatedTruck, usedPrio4Lines: addedLines, cutLines };
}

// ============================================================
// SECTION 5: Decision Rules
// ============================================================

/**
 * Apply post-rounding decision rules to all trucks.
 *
 * Decision tree:
 *
 *  RULE A: utilization >= 80%
 *    → Try to top up to 95% with Prio 4
 *    → Keep the truck (confirmed)
 *
 *  RULE B: utilization >= 50% AND < 80%
 *    → Try Prio 4 to reach 80% (Step 3a)
 *    → If reaches 80%: keep
 *    → If still < 80%: check cost per piece
 *
 *  RULE C: utilization < 50%
 *    → Step 2a: Can we eliminate?
 *      → If removing all Prio 3 makes truck empty: CUT all Prio 3 lines
 *      → If Prio 1/2 remain: try Prio 4 to reach 80% (Step 3a)
 *    → Step 3a: same as Rule B
 *
 *  Step 3a — cost per piece check (when below 80% even with Prio 4):
 *    → cost/piece = transport_cost / total_pieces
 *    → < €10: keep (auto-confirmed)
 *    → €10-20: borderline (flag for user review)
 *    → > €20: cut (cost too high)
 *
 * @param {Array} trucks - All trucks after Prio 1-3 stacking
 * @param {Object} costMap - lane → cost record
 * @param {Object} prio4ByLane - lane → array of Prio 4 rows
 * @returns {{ confirmedTrucks, borderlineTrucks, cutTrucks, additionalCutLines }}
 */
export function applyDecisionRules(trucks, costMap, prio4ByLane) {
  const confirmedTrucks = [];
  const borderlineTrucks = [];
  const cutTrucks = [];
  const additionalCutLines = [];

  for (let truck of trucks) {
    const utilization = truck.usedFraction; // 0-1
    const lane = truck.lane;
    const prio4Lines = prio4ByLane[lane] || [];
    const costRecord = costMap[lane];

    // ─── RULE C: Utilization < 50% → Try to eliminate ──────────────
    if (utilization < 0.50) {
      // Step 2a: Check if removing ALL Prio 3 lines empties the truck
      const nonPrio3Lines = truck.lines.filter(l => l.priority < 3);
      const prio3Lines = truck.lines.filter(l => l.priority === 3);

      if (nonPrio3Lines.length === 0 && prio3Lines.length > 0) {
        // Truck is 100% Prio 3 and utilization < 50% → ELIMINATE IT
        for (const line of prio3Lines) {
          additionalCutLines.push({
            originLocationCode: line.originLocationCode,
            supplierName: line.supplierName,
            destinationLocation: line.destinationLocation,
            sku: line.sku,
            originalQty: line.qty,
            priority: line.priority,
            lane,
            cutReason: 'Truck eliminated — all quantities were Prio 3 and utilization was below 50%',
          });
        }
        // Don't add this truck to any list — it's gone
        continue;
      }

      // Has Prio 1/2 lines → can't eliminate, fall through to Step 3a
    }

    // ─── RULE A: Utilization >= 80% → Top up to 95% then keep ──────
    if (utilization >= 0.80) {
      if (prio4Lines.length > 0) {
        const { updatedTruck, cutLines } = topUpTruckWithPrio4(truck, prio4Lines, 0.95);
        truck = updatedTruck;
        additionalCutLines.push(...cutLines);
      }
      confirmedTrucks.push({ ...truck, decision: 'Auto-confirmed' });
      continue;
    }

    // ─── RULE B / Step 3a: Try Prio 4 to reach 80% ─────────────────
    // (applies to Rule B range 50-80%, and to Rule C trucks with Prio 1/2 lines)
    let reachedTarget = false;

    if (prio4Lines.length > 0) {
      const { updatedTruck, cutLines } = topUpTruckWithPrio4(truck, prio4Lines, 0.80);
      additionalCutLines.push(...cutLines);

      if (updatedTruck.usedFraction >= 0.80) {
        // Reached 80% with Prio 4 → keep it
        truck = updatedTruck;
        reachedTarget = true;
        confirmedTrucks.push({ ...truck, decision: 'Auto-confirmed' });
        continue;
      } else {
        truck = updatedTruck;
      }
    }

    // Still below 80% — apply cost per piece check
    if (!reachedTarget) {
      const totalPieces = truck.lines.reduce((sum, l) => sum + l.qty, 0);

      if (totalPieces === 0) {
        // Empty truck (edge case) — cut it
        continue;
      }

      if (!costRecord || !costRecord.transport_cost_total_eur) {
        // No cost data → treat as OK (can't make cost decision without cost)
        confirmedTrucks.push({ ...truck, decision: 'Auto-confirmed (no cost data)' });
        continue;
      }

      const transportCost = costRecord.transport_cost_total_eur;
      const costPerPiece = transportCost / totalPieces;

      // Attach cost info to truck for display
      truck = { ...truck, transportCost, costPerPiece, totalPieces };

      if (costPerPiece < 10) {
        // < €10/piece → cost is acceptable, keep the truck
        confirmedTrucks.push({ ...truck, decision: 'Auto-confirmed' });
      } else if (costPerPiece <= 20) {
        // €10-20/piece → flag for user review (borderline)
        borderlineTrucks.push({ ...truck, decision: null }); // User decides
      } else {
        // > €20/piece → too expensive, cut the truck
        const cutReason = `Cost per piece too high (€${costPerPiece.toFixed(2)}/piece, transport cost: €${transportCost.toFixed(2)}, total pieces: ${totalPieces})`;
        cutTrucks.push({ ...truck, decision: 'cut', cutReason });
      }
    }
  }

  return { confirmedTrucks, borderlineTrucks, cutTrucks, additionalCutLines };
}

// ============================================================
// SECTION 6: Main Orchestrator
// ============================================================

/**
 * Run the full rounding algorithm.
 *
 * This is the main entry point called from the UI.
 * It takes the validated rows from the upload file and the Airtable data,
 * and returns everything needed to show the Review/Override steps and
 * generate the output files.
 *
 * @param {Array} validRows - Validated rows from excelParser.validateRows()
 * @param {Array} prio4Rows - Validated Prio 4 rows (may be empty)
 * @param {Object} costMap - lane → cost record (from excelParser.validateRows)
 * @param {number} weekNum - ISO week number (from Setup step)
 * @param {number} year - Year (from Setup step)
 * @returns {{
 *   confirmedTrucks: Array,
 *   borderlineTrucks: Array,
 *   cutTrucks: Array,
 *   cutLines: Array,
 * }}
 */
export function runRounding(validRows, prio4Rows, costMap, weekNum, year) {
  // ── Step 0: Group rows by lane ──────────────────────────────────────
  const laneMap = {}; // lane key → array of rows
  for (const row of validRows) {
    if (!laneMap[row.lane]) laneMap[row.lane] = [];
    laneMap[row.lane].push(row);
  }

  const prio4ByLane = {};
  for (const row of (prio4Rows || [])) {
    if (!prio4ByLane[row.lane]) prio4ByLane[row.lane] = [];
    prio4ByLane[row.lane].push(row);
  }

  // ── Step 1: Build trucks for each lane ─────────────────────────────
  let allTrucks = [];
  let allCutLines = [];

  for (const [, laneLines] of Object.entries(laneMap)) {
    const { trucks, cutLines } = buildTrucksForLane(laneLines);
    allTrucks.push(...trucks);
    allCutLines.push(...cutLines);
  }

  // ── Step 2: Assign Vendor Shipment Numbers ──────────────────────────
  allTrucks = assignVendorShipmentNumbers(allTrucks, weekNum, year);

  // ── Step 3: Apply decision rules ───────────────────────────────────
  const {
    confirmedTrucks,
    borderlineTrucks,
    cutTrucks,
    additionalCutLines,
  } = applyDecisionRules(allTrucks, costMap, prio4ByLane);

  allCutLines.push(...additionalCutLines);

  // Cut lines from explicitly cut trucks
  for (const truck of cutTrucks) {
    for (const line of truck.lines) {
      allCutLines.push({
        originLocationCode: line.originLocationCode,
        supplierName: line.supplierName,
        destinationLocation: line.destinationLocation,
        sku: line.sku,
        originalQty: line.qty,
        priority: line.priority,
        lane: truck.lane,
        cutReason: truck.cutReason,
      });
    }
  }

  return {
    confirmedTrucks,
    borderlineTrucks,
    cutTrucks,
    cutLines: allCutLines,
  };
}

/**
 * Finalize results after user decisions on borderline trucks.
 *
 * Called after the Review step when the user has made Keep/Cut decisions.
 * Also called after the Override step when the user may have force-kept trucks.
 *
 * @param {Object} roundingResults - Result from runRounding()
 * @param {Object} userDecisions - Map of vendorShipmentNumber → 'keep' | 'cut'
 * @param {Array} forceKeptVSNs - VSNs the user force-kept in the Override step
 * @returns {{ finalConfirmed, finalCut, finalCutLines }}
 */
export function finalizeResults(roundingResults, userDecisions, forceKeptVSNs) {
  const { confirmedTrucks, borderlineTrucks, cutTrucks, cutLines } = roundingResults;

  const finalConfirmed = [...confirmedTrucks];
  const finalCutLines = [...cutLines];

  // Process borderline trucks based on user decisions
  for (const truck of borderlineTrucks) {
    const decision = userDecisions[truck.vendorShipmentNumber];

    if (decision === 'keep') {
      finalConfirmed.push({
        ...truck,
        decision: `User confirmed (borderline — €${truck.costPerPiece?.toFixed(2)}/piece)`,
      });
    } else {
      // User chose to cut, or no decision made (default to cut for borderline)
      for (const line of truck.lines) {
        finalCutLines.push({
          originLocationCode: line.originLocationCode,
          supplierName: line.supplierName,
          destinationLocation: line.destinationLocation,
          sku: line.sku,
          originalQty: line.qty,
          priority: line.priority,
          lane: truck.lane,
          cutReason: `User decision — truck flagged for review and rejected (€${truck.costPerPiece?.toFixed(2)}/piece)`,
        });
      }
    }
  }

  // Process cut trucks — check if user force-kept any
  const forceKeptSet = new Set(forceKeptVSNs || []);
  for (const truck of cutTrucks) {
    if (forceKeptSet.has(truck.vendorShipmentNumber)) {
      finalConfirmed.push({
        ...truck,
        decision: 'Manually kept — user override (urgent stock)',
      });
      // Remove the cut lines that were added for this truck
      // (they were added to finalCutLines from roundingResults.cutLines)
      // We need to filter them out
    }
    // Trucks not force-kept remain as cut lines (already in finalCutLines)
  }

  // Remove cut lines that belong to force-kept trucks
  const finalCutLinesFiltered = finalCutLines.filter(cl => {
    // Find if there's a force-kept truck on this lane
    const laneForceKept = cutTrucks
      .filter(t => forceKeptSet.has(t.vendorShipmentNumber))
      .some(t => t.lane === cl.lane && cl.cutReason && !cl.cutReason.includes('pallet rounding'));
    return !laneForceKept;
  });

  return {
    finalConfirmed,
    finalCutLines: finalCutLinesFiltered,
  };
}

// ============================================================
// SECTION 7: Summary Statistics
// ============================================================

/**
 * Calculate summary statistics for the Results step.
 *
 * @param {Array} confirmedTrucks
 * @param {Array} cutLines
 * @returns {Object} stats
 */
export function calcSummaryStats(confirmedTrucks, cutLines) {
  const totalTrucksConfirmed = confirmedTrucks.length;
  const totalPiecesShipped = confirmedTrucks.reduce(
    (sum, t) => sum + t.lines.reduce((s, l) => s + l.qty, 0),
    0
  );
  const totalTransportCost = confirmedTrucks.reduce(
    (sum, t) => sum + (t.transportCost || 0),
    0
  );
  const avgUtilization = confirmedTrucks.length > 0
    ? confirmedTrucks.reduce((sum, t) => sum + t.usedFraction, 0) / confirmedTrucks.length
    : 0;
  const totalPiecesCut = cutLines.reduce((sum, cl) => sum + (cl.originalQty || 0), 0);

  return {
    totalTrucksConfirmed,
    totalTrucksCut: new Set(cutLines.map(cl => cl.lane)).size, // approximate
    totalPiecesShipped,
    totalPiecesCut,
    avgUtilization,
    totalTransportCost,
  };
}
