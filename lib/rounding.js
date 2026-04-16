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
// SECTION 0: Constants & Transport Unit Helpers
// ============================================================

/**
 * Root cause options presented to the user when they manually cut a truck.
 * These appear as a dropdown in the Review step and are written to the Cut Lines output.
 */
export const RAIL_REASON_CODES = [
  { code: 'R1', label: 'R1 — Forecast Changes: Rail used due to forecast increases' },
  { code: 'R2', label: 'R2 — Oversales: Rail used due to oversales of previous weeks' },
  { code: 'R3', label: 'R3 — Stock Discrepancies: Rail used due to stock discrepancies in warehouses' },
  { code: 'R4', label: 'R4 — Special Projects & Product Launches: Rail used due to special circumstances' },
  { code: 'R5', label: 'R5 — Carrier Delays: Sea carrier late pick-up date' },
  { code: 'R6', label: 'R6 — Supplier Delays: Capacity restrictions or quality issues' },
  { code: 'R7', label: 'R7 — Others: Production team delays, ERP issues, etc.' },
];

export const LU_REASON_CODES = [
  { code: 'LU1', label: 'LU1 — Out of Stock' },
  { code: 'LU2', label: 'LU2 — Components' },
  { code: 'LU3', label: 'LU3 — Launch / Special Topic' },
  { code: 'LU4', label: 'LU4 — Made to Order' },
];

export const ROOT_CAUSE_OPTIONS = [
  'Demand spike — need faster delivery',
  'SKU mismatch — wrong pallet configuration',
  'Supplier constraint — can\'t consolidate',
  'Other — manual review needed',
];

/** Van capacity in pallets (hardcoded industry standard) */
const VAN_PALLET_CAPACITY = 8;

/** 20ft container capacity as a fraction of a 40ft FTL/container */
const CONTAINER_20FT_FRACTION = 0.45;

/**
 * Map Airtable's loading_unit field to a human-readable transport unit type
 * for display in output files.
 */
export function getTransportUnitType(loadingUnit) {
  if (loadingUnit === 'CONTAINER 40FT') return '40ft Container';
  return 'FTL'; // Default for 'FTL' or unknown
}

/**
 * Determine whether a cut quantity could fit in a smaller transport unit
 * (van or 20ft container) as a fallback suggestion.
 *
 * This does NOT create new trucks — it just adds a suggestion column to the
 * Cut Lines output so the user can manually decide whether to book a smaller unit.
 *
 * Logic:
 *  - Van: max 8 pallets (palletized) or proportional piece count (loose loaded)
 *  - 20ft container: 45% of the 40ft FTL/container capacity
 *
 * @param {number} qty - Piece quantity being cut
 * @param {number} pallets - Pallet count (0 if loose loaded)
 * @param {Object} palletData - Palletization record from Airtable (may be null)
 * @returns {string|null} 'Van', '20ft Container', or null (no suitable fallback)
 */
export function calcFallbackUnit(qty, pallets, palletData) {
  if (!palletData || qty <= 0) return null;

  const isLooseLoaded = palletData.loading_type === 'Loose Loaded';
  // Containers are sea/rail shipments — a van is never an appropriate fallback
  const isContainer = palletData.loading_unit === 'CONTAINER 40FT';

  if (!isLooseLoaded) {
    // Palletized: compare in pallets
    const palletsPerTruck = palletData.pallets_per_truck || 20;
    const container20ftPallets = Math.floor(palletsPerTruck * CONTAINER_20FT_FRACTION);

    if (!isContainer && pallets <= VAN_PALLET_CAPACITY) return 'Van';
    if (pallets <= container20ftPallets) return '20ft Container';
    return null;
  } else {
    // Loose loaded: compare in pieces
    const palletsPerTruck = palletData.pallets_per_truck || 33;
    const pcsPerFtl = palletData.pcs_per_ftl_container || 1;
    const vanCapacityPcs = Math.round(pcsPerFtl * (VAN_PALLET_CAPACITY / palletsPerTruck));
    const container20ftCapacityPcs = Math.floor(pcsPerFtl * CONTAINER_20FT_FRACTION);

    if (!isContainer && qty <= vanCapacityPcs) return 'Van';
    if (qty <= container20ftCapacityPcs) return '20ft Container';
    return null;
  }
}

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

  // All trucks for this lane+pgrdWeek group share the same origin/destination/pgrdWeek
  const origin = laneLines[0].originLocationCode;
  const destination = laneLines[0].destinationLocation;
  const pgrdWeek = laneLines[0].pgrdWeek || '';
  const pgrdYear = laneLines[0].pgrdYear || '';

  const trucks = [];
  const cutLines = []; // Collects pallet rounding remainders

  // Current truck being filled
  let currentTruck = createEmptyTruck(origin, destination, pgrdYear, pgrdWeek);

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
      const remainderPallets = palletData.pcs_per_pallet > 0
        ? Math.floor(remainder / palletData.pcs_per_pallet) : 0;
      cutLines.push({
        originLocationCode: origin,
        supplierName,
        destinationLocation: destination,
        sku,
        originalQty: remainder,
        priority: prio,
        lane,
        cutReason: `Pallet rounding remainder — ${remainder} pieces did not fill a complete pallet`,
        transportUnitType: getTransportUnitType(palletData.loading_unit),
        fallbackUnit: calcFallbackUnit(remainder, remainderPallets, palletData),
        rootCause: null,
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

        // Overflow quantity goes to next truck(s) — recurse so it is properly split
        const overflowQty = roundedQty - qtyForCurrentTruck;

        if (overflowQty > 0) {
          trucks.push(currentTruck);
          currentTruck = createEmptyTruck(origin, destination, pgrdYear, pgrdWeek);
          // moq:0 — already rounded, no need to re-apply minimum supply lot
          addLinesToTruck({ ...row, moq: 0 }, overflowQty, prio);
        }
      } else {
        // Current truck is essentially full — push it and retry on a fresh truck
        trucks.push(currentTruck);
        currentTruck = createEmptyTruck(origin, destination, pgrdYear, pgrdWeek);
        // moq:0 — already rounded, remainder already tracked above
        addLinesToTruck({ ...row, moq: 0 }, roundedQty, prio);
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
function createEmptyTruck(origin, destination, pgrdYear, pgrdWeek) {
  return {
    origin,
    destination,
    lane: `${origin}|${destination}`,
    pgrdYear: pgrdYear || '',
    pgrdWeek: pgrdWeek || '',
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
  // First pass: build base VSNs
  const withBase = trucks.map(truck => {
    const minPrio = truck.minPrio === 9 ? 1 : truck.minPrio;
    const loadingUnit = truck.lines[0]?.loadingUnit ||
      truck.lines[0]?.palletData?.loading_unit || 'FTL';
    const typeCode = loadingUnit === 'CONTAINER 40FT' ? 'S40FT' : 'FTL';
    const pgrdSuffix = truck.pgrdWeek ? `_PW${truck.pgrdWeek}` : '';
    return { ...truck, _baseVSN: `${typeCode}_P${minPrio}${pgrdSuffix}` };
  });

  // Second pass: disambiguate duplicates by appending _2, _3, etc.
  const seen = {};
  return withBase.map(truck => {
    const base = truck._baseVSN;
    seen[base] = (seen[base] || 0) + 1;
    const vsn = seen[base] === 1 ? base : `${base}_${seen[base]}`;
    const { _baseVSN, ...rest } = truck;
    return { ...rest, vendorShipmentNumber: vsn };
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
      const remPallets = palletData.pcs_per_pallet > 0
        ? Math.floor(remainder / palletData.pcs_per_pallet) : 0;
      cutLines.push({
        originLocationCode: truck.origin,
        supplierName,
        destinationLocation: truck.destination,
        sku,
        originalQty: remainder,
        priority: 4,
        lane,
        cutReason: `Pallet rounding remainder — ${remainder} pieces did not fill a complete pallet`,
        transportUnitType: getTransportUnitType(palletData.loading_unit),
        fallbackUnit: calcFallbackUnit(remainder, remPallets, palletData),
        rootCause: null,
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
        // Truck is 100% Prio 3 and fill < 50% — flag for user review rather than silently cutting
        const cutReason = `Fill ${Math.round(utilization * 100)}% — all Prio 3, below 50% threshold`;
        cutTrucks.push({ ...truck, decision: 'cut', cutReason });
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
        // No cost data — if fill is also low, flag for review; otherwise keep
        if (truck.usedFraction < 0.50) {
          const cutReason = `Fill ${Math.round(truck.usedFraction * 100)}% — below 50% threshold (no cost data)`;
          borderlineTrucks.push({ ...truck, decision: null, cutReason });
        } else {
          confirmedTrucks.push({ ...truck, decision: 'Auto-confirmed (no cost data)' });
        }
        continue;
      }

      const transportCost = costRecord.transport_cost_total_eur;
      const costPerPiece = transportCost / totalPieces;

      // Attach cost info to truck for display
      truck = { ...truck, transportCost, costPerPiece, totalPieces };

      // Trucks below 50% fill must always go to review — never auto-confirm
      if (truck.usedFraction < 0.50) {
        const cutReason = `Fill ${Math.round(truck.usedFraction * 100)}% — below 50% threshold (€${costPerPiece.toFixed(2)}/piece)`;
        borderlineTrucks.push({ ...truck, decision: null, cutReason });
      } else if (costPerPiece < 10) {
        // >= 50% fill and < €10/piece → cost is acceptable, keep the truck
        confirmedTrucks.push({ ...truck, decision: 'Auto-confirmed' });
      } else if (costPerPiece <= 20) {
        // €10-20/piece → flag for user review (borderline)
        borderlineTrucks.push({ ...truck, decision: null });
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
  // ── Step 0: Group rows by lane + PGRD week (never mix PGRD weeks) ──
  const laneMap = {}; // "lane|pgrdYear|pgrdWeek" → array of rows
  for (const row of validRows) {
    const key = `${row.lane}|${row.pgrdYear || ''}|${row.pgrdWeek || ''}`;
    if (!laneMap[key]) laneMap[key] = [];
    laneMap[key].push(row);
  }

  // For FENN_EE / FEN1_EE only these SKUs are eligible for Prio 4 top-up
  const FENN_PRIO4_ALLOWED_SKUS = new Set([
    'EBDSN000000FMT', 'EBDSN000000FWD',
    'EBDSN140000BG3', 'EBDSN140000BG4', 'EBDSN140200BG1', 'EBDSN140200BG2', 'EBDSN140200BG5', 'EBDSN140200BG6',
    'EBDSN160000BG3', 'EBDSN160000BG4', 'EBDSN160200BG1', 'EBDSN160200BG2', 'EBDSN160200BG5', 'EBDSN160200BG6',
    'EBDSN180000BG3', 'EBDSN180000BG4', 'EBDSN180200BG1', 'EBDSN180200BG2', 'EBDSN180200BG5', 'EBDSN180200BG6',
    'EBDSN180210BG1', 'EBDSN180210BG2', 'EBDSN180210BG5', 'EBDSN180210BG6',
    'EBDSN200000BG3', 'EBDSN200000BG4', 'EBDSN200200BG1', 'EBDSN200200BG2', 'EBDSN200200BG5', 'EBDSN200200BG6',
  ]);
  const FENN_SUPPLIERS = new Set(['FENN_EE', 'FEN1_EE']);

  const prio4ByLane = {};
  for (const row of (prio4Rows || [])) {
    // For FENN_EE / FEN1_EE skip SKUs not in the allowed list
    if (FENN_SUPPLIERS.has(row.originLocationCode) && !FENN_PRIO4_ALLOWED_SKUS.has(row.sku)) continue;
    if (!prio4ByLane[row.lane]) prio4ByLane[row.lane] = [];
    prio4ByLane[row.lane].push(row);
  }

  // ── Step 1: Build trucks for each lane+pgrdWeek group ──────────────
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

  // additionalCutLines are prio 4 rounding remainders — excluded from cut output
  // (only prio 1-3 cuts are reported to the user)

  // Cut lines from explicitly cut trucks (cost > €20/piece)
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
        transportUnitType: getTransportUnitType(line.loadingUnit),
        fallbackUnit: calcFallbackUnit(line.qty, line.pallets, line.palletData),
        rootCause: null,
        costPerPiece: truck.costPerPiece ?? null,
        fillPct: truck.usedFraction != null ? truck.usedFraction : null,
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
 * Finalize results after user decisions on borderline and cut trucks.
 *
 * Called after the Review step. The user has made decisions on all
 * borderline + auto-cut trucks. Each decision has shape:
 *   { action: 'cut'|'keep'|'van'|'20ft', luReason: string|null, rootCause: string|null }
 *
 * @param {Object} roundingResults - Result from runRounding()
 * @param {Object} userDecisions - Map of vendorShipmentNumber → decision
 * @param {Array} _forceKeptVSNs - Unused (legacy param, decisions now in userDecisions)
 * @param {Object} transportModeDecisions - Map of vsn → { mode: 'sea'|'rail', railReason }
 * @param {Object} cutLineNotes - Map of lineKey → { note: string } from ReviewStep
 * @param {Array} unmatchedRows - Rows with no Airtable match, included in cut lines output
 * @returns {{ finalConfirmed, finalCutLines }}
 */
export function finalizeResults(roundingResults, userDecisions, _forceKeptVSNs, transportModeDecisions, cutLineNotes = {}, unmatchedRows = [], truckAdditions = {}) {
  const { confirmedTrucks, borderlineTrucks, cutTrucks, cutLines } = roundingResults;

  const finalConfirmed = [...confirmedTrucks];

  // Start with cut lines that do NOT belong to auto-cut trucks (pallet remainders, unmatched, etc.)
  // Cut truck lines were added to cutLines in runRounding; we re-add them below only if still cut.
  const cutTruckVSNs = new Set(cutTrucks.map(t => t.vendorShipmentNumber));
  const finalCutLines = cutLines.filter(cl => {
    // Keep remainder/unmatched lines; exclude truck-level cuts (re-processed below)
    if (!cl.lane) return true;
    return !cutTrucks.some(t => t.lane === cl.lane && cl.cutReason === t.cutReason);
  });

  // Helper: move a truck to confirmed with appropriate decision label
  const keepTruck = (truck, action, luReason, label) => {
    const skuAdditions = truckAdditions[truck.vendorShipmentNumber] || {};
    const linesWithNotes = truck.lines.map(line => {
      const add = skuAdditions[line.sku];
      if (!add) return line;
      const isLoose = line.palletData?.loading_type?.toLowerCase().includes('loose');
      let note = null;
      if (!isLoose && add.pallets > 0) {
        const addedPcs = add.pallets * (line.palletData?.pcs_per_pallet || 0);
        note = `Manual addition: +${add.pallets} pallet${add.pallets !== 1 ? 's' : ''} (+${addedPcs.toLocaleString()} pcs)`;
      } else if (isLoose && add.pcs > 0) {
        note = `Manual addition: +${add.pcs.toLocaleString()} pcs`;
      }
      return note ? { ...line, manualAdditionNote: note } : line;
    });
    // Build VSN with LU reason for low-usage shipments (keep, van, 20ft)
    const minPrio = truck.minPrio === 9 ? 1 : truck.minPrio;
    const pgrdSuffix = truck.pgrdWeek ? `_PW${truck.pgrdWeek}` : '';
    const luSuffix = luReason ? `_LU${luReason}` : '_LU';
    let newVSN = truck.vendorShipmentNumber;
    if (action === '20ft') {
      newVSN = `S20FT${luSuffix}_P${minPrio}${pgrdSuffix}`;
    } else if (action === 'van') {
      newVSN = `V${luSuffix}_P${minPrio}${pgrdSuffix}`;
    } else if (action === 'keep') {
      // Force-kept (low usage) — prefix existing type with LU reason
      const typeCode = truck.vendorShipmentNumber.startsWith('S40FT') ? 'S40FT' : 'FTL';
      newVSN = `${typeCode}${luSuffix}_P${minPrio}${pgrdSuffix}`;
    }
    finalConfirmed.push({
      ...truck,
      vendorShipmentNumber: newVSN,
      lines: linesWithNotes,
      decision: label,
      luReason: luReason || null,
      transportUnitOverride: action === '20ft' ? '20ft Container' : null,
    });
  };

  // Helper: add truck's lines to cut output
  const cutTruck = (truck, cutReasonOverride, rootCause) => {
    for (const line of truck.lines) {
      finalCutLines.push({
        originLocationCode: line.originLocationCode,
        supplierName: line.supplierName,
        destinationLocation: line.destinationLocation,
        sku: line.sku,
        originalQty: line.qty,
        priority: line.priority,
        lane: truck.lane,
        cutReason: cutReasonOverride || truck.cutReason || 'Cut by algorithm',
        transportUnitType: getTransportUnitType(line.loadingUnit),
        fallbackUnit: calcFallbackUnit(line.qty, line.pallets, line.palletData),
        rootCause: rootCause || null,
        costPerPiece: truck.costPerPiece ?? null,
        fillPct: truck.usedFraction != null ? truck.usedFraction : null,
      });
    }
  };

  // Process borderline trucks
  for (const truck of borderlineTrucks) {
    const d = userDecisions[truck.vendorShipmentNumber] || { action: 'cut' };
    const costLabel = truck.costPerPiece != null ? ` (€${truck.costPerPiece.toFixed(2)}/piece)` : '';

    if (d.action === 'keep') {
      keepTruck(truck, 'keep', d.luReason, `User confirmed — borderline${costLabel}`);
    } else if (d.action === 'van') {
      keepTruck(truck, 'van', d.luReason, `Booked Van — borderline${costLabel}`);
    } else if (d.action === '20ft') {
      keepTruck(truck, '20ft', d.luReason, `Booked 20ft Container — borderline${costLabel}`);
    } else {
      // 'cut' or default
      cutTruck(truck, `User rejected — borderline${costLabel}`, d.rootCause);
    }
  }

  // Process auto-cut trucks
  for (const truck of cutTrucks) {
    const d = userDecisions[truck.vendorShipmentNumber] || { action: 'cut' };

    if (d.action === 'keep') {
      keepTruck(truck, 'keep', d.luReason, `User force-kept — ${truck.cutReason || 'algorithm cut'}`);
    } else if (d.action === 'van') {
      keepTruck(truck, 'van', d.luReason, `Booked Van — ${truck.cutReason || 'algorithm cut'}`);
    } else if (d.action === '20ft') {
      keepTruck(truck, '20ft', d.luReason, `Booked 20ft Container — ${truck.cutReason || 'algorithm cut'}`);
    } else {
      // 'cut' — add lines to cut output (they were filtered out above, re-add them here)
      cutTruck(truck, truck.cutReason, d.rootCause);
    }
  }

  // Apply transport mode decisions (rail overwrites VSN type code)
  if (transportModeDecisions) {
    for (const truck of finalConfirmed) {
      const decision = transportModeDecisions[truck.vendorShipmentNumber];
      if (decision?.mode === 'rail' && decision.railReason) {
        // Rail container: S40FT_P1_PW15 → R-{reason}_P1_PW15
        truck.vendorShipmentNumber = truck.vendorShipmentNumber.replace(/^S40FT_/, `R-${decision.railReason}_`);
        truck.transportMode = 'rail';
        truck.railReason = decision.railReason;
      } else {
        // default: 'sea' for containers, 'road' for FTL
        const isContainer = truck.lines?.[0]?.loadingUnit === 'CONTAINER 40FT' ||
          truck.lines?.[0]?.palletData?.loading_unit === 'CONTAINER 40FT';
        truck.transportMode = decision?.mode || (isContainer ? 'sea' : 'road');
      }
    }
  }

  // ── Apply reviewer notes to individual cut lines ─────────────────
  const clKey = (line) =>
    `${line.sku}|${line.originLocationCode}|${line.destinationLocation}|${String(line.priority)}|${String(line.cutReason).slice(0, 30)}`;

  for (const line of finalCutLines) {
    const note = cutLineNotes[clKey(line)];
    if (note?.note) line.rootCause = note.note;
  }

  // ── Add unmatched rows to the cut lines export ────────────────────
  const UNMATCHED_REASON = 'No Airtable match — SKU not in palletization table';
  for (const row of unmatchedRows) {
    const priority = (row.prio1 || 0) > 0 ? 1 : (row.prio2 || 0) > 0 ? 2 : (row.prio3 || 0) > 0 ? 3 : 4;
    const totalQty = (row.prio1 || 0) + (row.prio2 || 0) + (row.prio3 || 0) + (row.prio4 || 0);
    const rowKey = `${row.sku}|${row.originLocationCode}|${row.destinationLocation}|${String(priority)}|${UNMATCHED_REASON.slice(0, 30)}`;
    const note = cutLineNotes[rowKey];
    finalCutLines.push({
      originLocationCode: row.originLocationCode,
      supplierName: row.supplierName || '',
      destinationLocation: row.destinationLocation,
      sku: row.sku,
      originalQty: totalQty,
      priority,
      lane: row.lane || '',
      cutReason: UNMATCHED_REASON,
      transportUnitType: '—',
      fallbackUnit: null,
      rootCause: note?.note || null,
    });
  }

  return {
    finalConfirmed,
    finalCutLines,
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
