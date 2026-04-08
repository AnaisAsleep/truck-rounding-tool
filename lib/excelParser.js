/**
 * lib/excelParser.js — Client-side Excel file parser
 *
 * Imported only by 'use client' components — never runs server-side.
 */
import * as XLSX from 'xlsx';

// Column header names to look for in the upload file
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
};

/**
 * Parse a Needs Excel file (Main Prio 1-3 or Prio 4 file).
 *
 * @param {ArrayBuffer} arrayBuffer - Raw file bytes from FileReader
 * @param {boolean} isPrio4 - If true, all quantities are treated as Prio 4
 * @returns {{ rows: Array, errors: Array, missingOriginCode: boolean }}
 *   rows: parsed and normalized data rows
 *   errors: array of { message, details } for display in validation panel
 *   missingOriginCode: true if the origin_location_code column is entirely missing
 */
export function parseNeedsFile(arrayBuffer, isPrio4 = false) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });

  // Use the first sheet
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Convert to array of arrays (raw, with header row)
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (rawData.length < 2) {
    return {
      rows: [],
      errors: [{ message: 'File appears to be empty or has no data rows.' }],
      missingOriginCode: false,
    };
  }

  // Find the header row — search up to the first 10 rows for the row
  // that contains "Item Code" (a reliable anchor column)
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(10, rawData.length); i++) {
    const row = rawData[i];
    if (row.some(cell => String(cell).trim() === 'Item Code')) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    return {
      rows: [],
      errors: [{ message: 'Could not find header row. Make sure the file contains an "Item Code" column.' }],
      missingOriginCode: false,
    };
  }

  // Build a map of column name → column index
  const headerRow = rawData[headerRowIndex].map(cell => String(cell).trim());
  const colIndex = {};
  headerRow.forEach((header, idx) => {
    colIndex[header] = idx;
  });

  // Check if origin_location_code column exists
  const hasOriginCode = colIndex[REQUIRED_HEADERS.originLocationCode] !== undefined;

  if (!hasOriginCode) {
    return {
      rows: [],
      errors: [{
        message: "Missing 'origin_location_code' column",
        details: "Please add the 'origin_location_code' column to your file before uploading. " +
          "This column should contain the pickup location code (e.g. MI_PT, RF_DE, ADAN_HU) " +
          "for each line. It is typically added as the last column manually.",
      }],
      missingOriginCode: true,
    };
  }

  // Helper to get a value from a data row by column name
  const getCell = (row, headerName) => {
    const idx = colIndex[headerName];
    if (idx === undefined) return '';
    const val = row[idx];
    return val === null || val === undefined ? '' : val;
  };

  // Parse data rows (everything after the header row)
  const rows = [];
  const parseErrors = [];

  for (let i = headerRowIndex + 1; i < rawData.length; i++) {
    const row = rawData[i];

    // Skip completely empty rows
    if (row.every(cell => cell === '' || cell === null || cell === undefined)) {
      continue;
    }

    const sku = String(getCell(row, REQUIRED_HEADERS.itemCode)).trim();
    const destinationLocation = String(getCell(row, REQUIRED_HEADERS.destinationLocation)).trim();
    const originLocationCode = String(getCell(row, REQUIRED_HEADERS.originLocationCode)).trim();

    // Skip rows with missing critical fields
    if (!sku || !destinationLocation) {
      continue;
    }

    if (!originLocationCode) {
      parseErrors.push({
        message: `Row ${i + 1}: missing origin_location_code for SKU ${sku}`,
        sku,
        destinationLocation,
        reason: 'Missing origin_location_code — line skipped',
      });
      continue;
    }

    // Parse quantities — treat empty/non-numeric as 0
    const prio1 = isPrio4 ? 0 : parseNum(getCell(row, REQUIRED_HEADERS.prio1));
    const prio2 = isPrio4 ? 0 : parseNum(getCell(row, REQUIRED_HEADERS.prio2));
    const prio3 = isPrio4 ? 0 : parseNum(getCell(row, REQUIRED_HEADERS.prio3));
    const prio4 = isPrio4 ? parseNum(getCell(row, REQUIRED_HEADERS.prio1)) +
                            parseNum(getCell(row, REQUIRED_HEADERS.prio2)) +
                            parseNum(getCell(row, REQUIRED_HEADERS.prio3)) : 0;
    const moq = parseNum(getCell(row, REQUIRED_HEADERS.minimumSupplyLot));

    // Skip rows where all relevant quantities are 0
    const totalQty = isPrio4 ? prio4 : (prio1 + prio2 + prio3);
    if (totalQty === 0) continue;

    const supplierName = String(getCell(row, REQUIRED_HEADERS.supplierName)).trim();
    const fromWhouse = String(getCell(row, REQUIRED_HEADERS.fromWhouse)).trim();

    // Build the composite keys used for Airtable lookups
    const pkey = `${originLocationCode}-${sku}-${destinationLocation}`;
    const lane = `${originLocationCode}|${destinationLocation}`;

    rows.push({
      rowIndex: i + 1,
      sku,
      destinationLocation,
      originLocationCode,
      supplierName,
      fromWhouse,
      prio1,
      prio2,
      prio3,
      prio4,
      moq,
      pkey,
      lane,
    });
  }

  return { rows, errors: parseErrors, missingOriginCode: false };
}

/**
 * Validate parsed rows against Airtable data.
 * Returns enriched rows (with palletization data attached) and validation summary.
 *
 * @param {Array} rows - Parsed rows from parseNeedsFile
 * @param {Array} palletizationData - Palletization records from Airtable
 * @param {Array} costData - Cost records from Airtable
 * @returns {{ validRows, unmatchedRows, noCostRows, summary }}
 */
export function validateRows(rows, palletizationData, costData) {
  // Build lookup maps for fast access
  const palletMap = {};
  palletizationData.forEach(p => {
    palletMap[p.pkey] = p;
  });

  const costMap = {};
  costData.forEach(c => {
    // If multiple active records for same lane, use the first one
    if (!costMap[c.lane]) {
      costMap[c.lane] = c;
    }
  });

  const validRows = [];
  const unmatchedRows = []; // No Airtable palletization match
  const noCostRows = [];    // No Airtable cost match

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
    if (!costData_) {
      noCostRows.push({ ...row, palletData });
      // Still include in valid rows — cost check will be skipped
    }

    validRows.push({
      ...row,
      palletData,
      costData: costData_ || null,
      supplierName: row.supplierName || palletData.origin_location_name,
    });

    suppliers.add(row.originLocationCode);
    lanes.add(row.lane);
    totalPrio1 += row.prio1;
    totalPrio2 += row.prio2;
    totalPrio3 += row.prio3;
    totalPrio4 += row.prio4;
  }

  return {
    validRows,
    unmatchedRows,
    noCostRows,
    palletMap,
    costMap,
    summary: {
      totalLines: rows.length,
      matchedLines: validRows.length,
      unmatchedCount: unmatchedRows.length,
      noCostCount: noCostRows.length,
      supplierCount: suppliers.size,
      laneCount: lanes.size,
      totalPrio1,
      totalPrio2,
      totalPrio3,
      totalPrio4,
    },
  };
}

/** Parse a cell value to a number, defaulting to 0 for empty/invalid */
function parseNum(val) {
  if (val === '' || val === null || val === undefined) return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : Math.max(0, Math.round(n)); // round to avoid float issues
}
