/**
 * lib/excelParser.js — Client-side Excel file parser
 *
 * xlsx is loaded dynamically inside each function so it is never
 * imported at module level — this prevents any server-side build errors.
 */

const REQUIRED_HEADERS = {
  supplierName: 'Description (Production Plant or External Supplier)',
  fromWhouse: 'From Whouse',
  destinationLocation: 'Destination Location',
  itemCode: 'Item Code',
  prio1: 'Prio 1',
  prio2: 'Prio 2',
  prio3: 'Prio 3',
  minimumSupplyLot: 'Minimum Supply Lot',
  originLocationCode: 'origin_location_code',
  shippingWeek: 'Shipping week',
  shippingYear: 'Shipping Year',
  pgrdYear: 'PGRD Year',
  pgrdWeek: 'PGRD Week',
  pgrd: 'Planned goods ready date',
  constraint: 'P',
};

// Accepted column names for the constraint cap
const CONSTRAINT_ALIASES = [
  // Explicit "constrained" variants
  'Constrained quantity', 'constrained quantity', 'CONSTRAINED QUANTITY',
  'Constrained Quantity', 'Constrained qty', 'constrained qty', 'CONSTRAINED QTY',
  'Constrained Qty', 'Constrained', 'constrained', 'CONSTRAINED',
  // Generic cap / max variants
  'Constraint', 'constraint', 'CONSTRAINT',
  'Max Qty', 'max qty', 'MAX QTY', 'Max', 'max', 'MAX',
  'Cap', 'cap', 'CAP',
  // Single-letter column "P" (as referenced in original spec)
  'P', 'p',
];

// Accepted column names for unconstrained quantity (Prio 4 / Index 1 file)
const UNCONSTRAINED_ALIASES = [
  'Unconstrained quantity', 'unconstrained quantity', 'UNCONSTRAINED QUANTITY',
  'Unconstrained Quantity', 'Unconstrained qty', 'unconstrained qty',
  'Unconstrained', 'unconstrained', 'UNCONSTRAINED',
  'Uncons qty', 'uncons qty',
];

export async function parseNeedsFile(arrayBuffer, isPrio4 = false, applyConstraint = true) {
  const XLSX = await import('xlsx').then(m => m.default || m);

  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (rawData.length < 2) {
    return {
      rows: [],
      errors: [{ message: 'File appears to be empty or has no data rows.' }],
      missingOriginCode: false,
    };
  }

  const HEADER_ANCHORS = ['Item Code', 'item code', 'ITEM CODE', 'SKU', 'sku', 'ITEM', 'item'];
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(10, rawData.length); i++) {
    if (rawData[i].some(cell => HEADER_ANCHORS.includes(String(cell).trim()))) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    return {
      rows: [],
      errors: [{ message: 'Could not find header row. Make sure the file contains an "Item Code" or "SKU" column.' }],
      missingOriginCode: false,
    };
  }

  // Build case-insensitive column index: lowercase header → column index
  const headerRow = rawData[headerRowIndex].map(cell => String(cell).trim());
  const colIndex = {};
  headerRow.forEach((header, idx) => {
    colIndex[header] = idx;                  // exact match
    colIndex[header.toLowerCase()] = idx;    // case-insensitive fallback
  });

  // Look up a required header, trying exact then lowercase
  const findCol = (name) => {
    if (colIndex[name] !== undefined) return colIndex[name];
    return colIndex[name.toLowerCase()];
  };

  // Accept any of these as the origin location code column
  const ORIGIN_CODE_ALIASES = [
    'origin_location_code',
    'origin location code',
    'location code',
    'locationcode',
    'origin code',
    'origincode',
    'pickup location code',
    'pickup code',
    'vendor code',
    'Vendor Code',
    'VENDOR CODE',
    'vendor_code',
  ];

  // Accept any of these as the SKU / item code column
  const SKU_ALIASES = [
    'Item Code', 'item code', 'ITEM CODE',
    'SKU', 'sku', 'Sku',
    'ITEM', 'Item', 'item',
    'Material', 'material', 'MATERIAL',
  ];

  // Accept any of these as the supplier name column
  const SUPPLIER_ALIASES = [
    'Description (Production Plant or External Supplier)',
    'SUPPLIER', 'Supplier', 'supplier',
    'Supplier Name', 'supplier name', 'SUPPLIER NAME',
    'Vendor', 'vendor', 'VENDOR',
    'Vendor Name', 'vendor name',
  ];

  const findOriginCol = () => {
    for (const alias of ORIGIN_CODE_ALIASES) {
      const idx = colIndex[alias] ?? colIndex[alias.toLowerCase()];
      if (idx !== undefined) return idx;
    }
    return undefined;
  };

  const findAlias = (aliases) => {
    for (const alias of aliases) {
      const idx = colIndex[alias] ?? colIndex[alias.toLowerCase()];
      if (idx !== undefined) return idx;
    }
    return undefined;
  };

  const originColIdx        = findAlias(ORIGIN_CODE_ALIASES);
  const skuColIdx           = findAlias(SKU_ALIASES);
  const supplierColIdx      = findAlias(SUPPLIER_ALIASES);
  const constraintColIdx    = findAlias(CONSTRAINT_ALIASES);
  const unconstrainedColIdx = findAlias(UNCONSTRAINED_ALIASES);

  const hasOriginCode = originColIdx !== undefined;

  // Override findCol for flexible columns
  const findColFinal = (name) => {
    if (name === REQUIRED_HEADERS.originLocationCode) return originColIdx;
    if (name === REQUIRED_HEADERS.itemCode)           return skuColIdx ?? findCol(name);
    if (name === REQUIRED_HEADERS.supplierName)       return supplierColIdx ?? findCol(name);
    if (name === REQUIRED_HEADERS.constraint)         return constraintColIdx;
    return findCol(name);
  };

  if (!hasOriginCode) {
    const found = headerRow.filter(Boolean).join(', ');
    return {
      rows: [],
      errors: [{
        message: "Missing origin location code column",
        details: `Add a column named 'origin_location_code', 'origin location code', or 'location code' with the pickup location code (e.g. MI_PT, RF_DE). ` +
          `Columns found: ${found || '(none)'}`,
      }],
      missingOriginCode: true,
    };
  }

  // SKU column is required
  if (skuColIdx === undefined) {
    const found = headerRow.filter(Boolean).join(', ');
    return {
      rows: [],
      errors: [{
        message: "Missing SKU / item code column",
        details: `Add a column named 'Item Code', 'SKU', or 'ITEM'. Columns found: ${found || '(none)'}`,
      }],
      missingOriginCode: false,
    };
  }

  const getCell = (row, headerName) => {
    const idx = findColFinal(headerName);
    if (idx === undefined) return '';
    const val = row[idx];
    return val === null || val === undefined ? '' : val;
  };

  const rows = [];
  const parseErrors = [];

  for (let i = headerRowIndex + 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (row.every(cell => cell === '' || cell === null || cell === undefined)) continue;

    const sku = String(getCell(row, REQUIRED_HEADERS.itemCode)).trim();
    const destinationLocation = String(getCell(row, REQUIRED_HEADERS.destinationLocation)).trim();
    const originLocationCode = String(getCell(row, REQUIRED_HEADERS.originLocationCode)).trim();

    if (!sku || !destinationLocation) continue;

    if (!originLocationCode) {
      parseErrors.push({
        message: `Row ${i + 1}: missing origin_location_code for SKU ${sku}`,
        sku, destinationLocation,
        reason: 'Missing origin_location_code — line skipped',
      });
      continue;
    }

    const rawPrio1 = parseNum(getCell(row, REQUIRED_HEADERS.prio1));
    const rawPrio2 = parseNum(getCell(row, REQUIRED_HEADERS.prio2));
    const rawPrio3 = parseNum(getCell(row, REQUIRED_HEADERS.prio3));

    // Read raw constraint cell — distinguish blank (no cap) from 0 (cap to zero)
    const rawConstraintCell = constraintColIdx !== undefined
      ? row[constraintColIdx]
      : undefined;
    const hasConstraint = constraintColIdx !== undefined &&
      rawConstraintCell !== '' && rawConstraintCell !== null && rawConstraintCell !== undefined;
    const constraint = hasConstraint ? parseNum(rawConstraintCell) : null;

    // Apply constraint cap: fill P1 first, then P2, then P3
    // applyConstraint=false → ignore cap entirely (unconstrained mode)
    // constraint=null → no cap (column absent or blank); constraint=0 → cap to 0
    let prio1, prio2, prio3, prio4;
    if (isPrio4) {
      prio1 = 0; prio2 = 0; prio3 = 0;
      // Prefer "Unconstrained quantity" column; fall back to summing Prio 1+2+3
      if (unconstrainedColIdx !== undefined) {
        const rawVal = row[unconstrainedColIdx];
        prio4 = parseNum(rawVal === null || rawVal === undefined ? '' : rawVal);
      } else {
        prio4 = rawPrio1 + rawPrio2 + rawPrio3;
      }
    } else if (applyConstraint && constraint !== null) {
      // Constrained mode: cap at constrained quantity column
      let remaining = constraint;
      prio1 = Math.min(rawPrio1, remaining); remaining = Math.max(0, remaining - prio1);
      prio2 = Math.min(rawPrio2, remaining); remaining = Math.max(0, remaining - prio2);
      prio3 = Math.min(rawPrio3, remaining);
      prio4 = 0;
    } else if (!applyConstraint && unconstrainedColIdx !== undefined) {
      // Unconstrained mode: cap at unconstrained quantity column
      const rawUncons = row[unconstrainedColIdx];
      const unconsCap = parseNum(rawUncons === null || rawUncons === undefined ? '' : rawUncons);
      let remaining = unconsCap;
      prio1 = Math.min(rawPrio1, remaining); remaining = Math.max(0, remaining - prio1);
      prio2 = Math.min(rawPrio2, remaining); remaining = Math.max(0, remaining - prio2);
      prio3 = Math.min(rawPrio3, remaining);
      prio4 = 0;
    } else {
      prio1 = rawPrio1; prio2 = rawPrio2; prio3 = rawPrio3; prio4 = 0;
    }

    const moq = parseNum(getCell(row, REQUIRED_HEADERS.minimumSupplyLot));

    const totalQty = isPrio4 ? prio4 : (prio1 + prio2 + prio3);
    if (totalQty === 0) continue;

    const supplierName = String(getCell(row, REQUIRED_HEADERS.supplierName)).trim();
    const fromWhouse = String(getCell(row, REQUIRED_HEADERS.fromWhouse)).trim();
    // Airtable pkey format: {origin_location_code}-{sku}-{receiving_destination_code}
    const pkey = `${originLocationCode}-${sku}-${destinationLocation}`;
    const lane = `${originLocationCode}|${destinationLocation}`;

    rows.push({
      rowIndex: i + 1, sku, destinationLocation, originLocationCode,
      supplierName, fromWhouse, prio1, prio2, prio3, prio4, moq, constraint, pkey, lane,
      shippingWeek: String(getCell(row, REQUIRED_HEADERS.shippingWeek)).trim(),
      shippingYear: String(getCell(row, REQUIRED_HEADERS.shippingYear)).trim(),
      pgrdYear: String(getCell(row, REQUIRED_HEADERS.pgrdYear)).trim(),
      pgrdWeek: String(getCell(row, REQUIRED_HEADERS.pgrdWeek)).trim(),
      pgrd: String(getCell(row, REQUIRED_HEADERS.pgrd)).trim(),
    });
  }

  if (!isPrio4 && applyConstraint && constraintColIdx === undefined) {
    parseErrors.unshift({
      message: 'No constrained quantity column found — quantities are uncapped',
      details: `Add a column named "Constrained quantity" (or "Constraint", "P") to cap ordered quantities.`,
      severity: 'warning',
    });
  }
  if (!isPrio4 && !applyConstraint && unconstrainedColIdx === undefined) {
    parseErrors.unshift({
      message: 'No unconstrained quantity column found — using raw Prio 1+2+3 sum',
      details: `Add a column named "Unconstrained quantity" to cap ordered quantities in unconstrained mode.`,
      severity: 'warning',
    });
  }

  return { rows, errors: parseErrors, missingOriginCode: false };
}

export function validateRows(rows, palletizationData, costData) {
  const palletMap = {};
  palletizationData.forEach(p => { palletMap[p.pkey] = p; });

  // Debug: expose a few sample Airtable pkeys so mismatches are visible in the UI
  const sampleAirtablePkeys = Object.keys(palletMap).slice(0, 5);

  const costMap = {};
  costData.forEach(c => { if (!costMap[c.lane]) costMap[c.lane] = c; });

  const validRows = [];
  const unmatchedRows = [];
  const noCostRows = [];
  const suppliers = new Set();
  const lanes = new Set();
  let totalPrio1 = 0, totalPrio2 = 0, totalPrio3 = 0, totalPrio4 = 0;

  for (const row of rows) {
    const palletData = palletMap[row.pkey];
    if (!palletData) {
      unmatchedRows.push({
        ...row,
        cutReason: `No Airtable match — SKU+lane combo '${row.pkey}' not found in palletization table`,
      });
      continue;
    }

    const costData_ = costMap[row.lane];
    if (!costData_) noCostRows.push({ ...row, palletData });

    validRows.push({
      ...row,
      palletData,
      costData: costData_ || null,
      supplierName: row.supplierName || palletData.origin_location_name || palletData.origin_location_code,
    });

    suppliers.add(row.originLocationCode);
    lanes.add(row.lane);
    totalPrio1 += row.prio1;
    totalPrio2 += row.prio2;
    totalPrio3 += row.prio3;
    totalPrio4 += row.prio4;
  }

  return {
    validRows, unmatchedRows, noCostRows, palletMap, costMap, sampleAirtablePkeys,
    summary: {
      totalLines: rows.length, matchedLines: validRows.length,
      unmatchedCount: unmatchedRows.length, noCostCount: noCostRows.length,
      supplierCount: suppliers.size, laneCount: lanes.size,
      totalPrio1, totalPrio2, totalPrio3, totalPrio4,
    },
  };
}

function parseNum(val) {
  if (val === '' || val === null || val === undefined) return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : Math.max(0, Math.round(n));
}
