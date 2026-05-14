/**
 * lib/excelExporter.js — Client-side Excel file generation
 *
 * Imported only by 'use client' components — never runs server-side.
 * xlsx is loaded dynamically inside each function to prevent server-side
 * build errors (xlsx is a CommonJS module that pulls in Node.js built-ins).
 */

import { getMtoMtsLabel as _getMtoMtsLabel } from './rounding';

/** Return 'MTO', 'MTS', or '' depending on supplier and SKU */
function getMtoMtsLabel(originLocationCode, sku) {
  return _getMtoMtsLabel(originLocationCode, sku) || '';
}

// ─── Shared row builders ─────────────────────────────────────────────────────

/** Build the standard confirmed-loads row array from a truck list. */
function buildConfirmedExportRows(confirmedTrucks) {
  const rows = [];
  for (const truck of confirmedTrucks) {
    const truckFillPct = (truck.usedFraction * 100).toFixed(1) + '%';
    const transportCost = truck.transportCost != null ? `€${truck.transportCost.toFixed(2)}` : '';
    const costPerPiece = truck.costPerPiece != null ? `€${truck.costPerPiece.toFixed(2)}` : '';
    const transportMode = truck.transportMode === 'rail' ? 'Rail'
      : truck.transportMode === 'sea' ? 'Sea' : 'Road';

    for (const line of truck.lines) {
      const baseTransportUnit = line.loadingUnit === 'CONTAINER 40FT' ? '40ft Container' : 'FTL';
      const transportUnitType = truck.transportUnitOverride || baseTransportUnit;
      rows.push({
        'Vendor Shipment Number': truck.vendorShipmentNumber,
        'Milk Run ID': truck.milkRunGroupId || '',
        'Milk Run Stop': truck.milkRunStop || '',
        'Origin Location Code': line.originLocationCode,
        'Supplier Name': line.supplierName,
        'Destination Location': line.destinationLocation,
        'SKU': line.sku,
        'MTO/MTS': getMtoMtsLabel(line.originLocationCode, line.sku),
        'Quantity (pieces)': line.qty,
        'Pallets': line.pallets > 0 ? line.pallets : '',
        'Priority': line.priority,
        'Loading Type': line.loadingType,
        'Transport Unit Type': transportUnitType,
        'Transport Mode': transportMode,
        'Rail Reason': truck.railReason || '',
        'LU Reason': truck.luReason || '',
        'LU Notes': truck.luNote || '',
        'Line Fill %': line.lineFraction > 0 ? (line.lineFraction * 100).toFixed(1) + '%' : '',
        'Truck Total Fill %': truckFillPct,
        'Transport Cost (€)': transportCost,
        'Cost per Piece (€)': costPerPiece,
        'Decision': truck.decision || '',
        'Notes': line.manualAdditionNote || '',
      });
    }
  }
  return rows;
}

/** Build the standard cut-lines row array from a cut line list. */
function buildCutExportRows(cutLines) {
  return cutLines.map(line => ({
    'Origin Location Code': line.originLocationCode,
    'Supplier Name': line.supplierName || '',
    'Destination Location': line.destinationLocation,
    'SKU': line.sku,
    'Original Quantity': line.originalQty,
    'Priority': line.priority,
    'Transport Unit Type': line.transportUnitType || 'FTL',
    'Fill %': line.fillPct != null ? (line.fillPct * 100).toFixed(1) + '%' : '',
    'Cost per Piece (€)': line.costPerPiece != null ? `€${line.costPerPiece.toFixed(2)}` : '',
    'Cut Reason': line.cutReason || '',
    'Root Cause': line.rootCause || '',
    'Suggested Fallback Unit': line.fallbackUnit || '',
  }));
}

// ─── Confirmed Loads Export ──────────────────────────────────────────────────

/**
 * Generate and download the Confirmed_Loads_W{XX}.xlsx file.
 */
export async function exportConfirmedLoads(confirmedTrucks, weekNum) {
  const XLSX = await import('xlsx').then(m => m.default || m);

  const rows = buildConfirmedExportRows(confirmedTrucks);

  if (rows.length === 0) {
    rows.push({
      'Vendor Shipment Number': 'No confirmed trucks',
      'Milk Run ID': '', 'Milk Run Stop': '',
      'Origin Location Code': '', 'Supplier Name': '', 'Destination Location': '',
      'SKU': '', 'MTO/MTS': '', 'Quantity (pieces)': '', 'Pallets': '', 'Priority': '',
      'Loading Type': '', 'Transport Unit Type': '', 'Transport Mode': '',
      'Rail Reason': '', 'LU Reason': '', 'LU Notes': '',
      'Line Fill %': '', 'Truck Total Fill %': '',
      'Transport Cost (€)': '', 'Cost per Piece (€)': '',
      'Decision': '', 'Notes': '',
    });
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  applyHeaderStyle(ws, Object.keys(rows[0]));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Confirmed Loads');

  const ww = String(weekNum).padStart(2, '0');
  XLSX.writeFile(wb, `Confirmed_Loads_W${ww}.xlsx`);
}

// ─── Cut Lines Export ────────────────────────────────────────────────────────

/**
 * Generate and download the Cut_Lines_W{XX}.xlsx file.
 */
export async function exportCutLines(cutLines, weekNum) {
  const XLSX = await import('xlsx').then(m => m.default || m);

  const rows = buildCutExportRows(cutLines);

  if (rows.length === 0) {
    rows.push({
      'Origin Location Code': 'No cut lines',
      'Supplier Name': '', 'Destination Location': '', 'SKU': '',
      'Original Quantity': '', 'Priority': '', 'Transport Unit Type': '',
      'Fill %': '', 'Cost per Piece (€)': '',
      'Cut Reason': '', 'Root Cause': '', 'Suggested Fallback Unit': '',
    });
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  applyHeaderStyle(ws, Object.keys(rows[0]));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cut Lines');

  const ww = String(weekNum).padStart(2, '0');
  XLSX.writeFile(wb, `Cut_Lines_W${ww}.xlsx`);
}

// ─── Combined Export ─────────────────────────────────────────────────────────

/**
 * Generate and download a single file with both Confirmed and Cut lines.
 */
export async function exportCombined(confirmedTrucks, cutLines, weekNum) {
  const XLSX = await import('xlsx').then(m => m.default || m);

  const confirmedRows = [];
  for (const truck of confirmedTrucks) {
    const truckFillPct = (truck.usedFraction * 100).toFixed(1) + '%';
    const costPerPiece = truck.costPerPiece != null ? `€${truck.costPerPiece.toFixed(2)}` : '';
    const transportMode = truck.transportMode === 'rail' ? 'Rail'
      : truck.transportMode === 'sea' ? 'Sea' : 'Road';
    for (const line of truck.lines) {
      const baseUnit = line.loadingUnit === 'CONTAINER 40FT' ? '40ft Container' : 'FTL';
      confirmedRows.push({
        'Status': truck.isMilkRun ? 'Confirmed (Milk Run)' : 'Confirmed',
        'Vendor Shipment Number': truck.vendorShipmentNumber,
        'Milk Run ID': truck.milkRunGroupId || '',
        'Milk Run Stop': truck.milkRunStop || '',
        'Origin Location Code': line.originLocationCode,
        'Supplier Name': line.supplierName,
        'Destination Location': line.destinationLocation,
        'SKU': line.sku,
        'MTO/MTS': getMtoMtsLabel(line.originLocationCode, line.sku),
        'Quantity (pieces)': line.qty,
        'Pallets': line.pallets > 0 ? line.pallets : '',
        'Priority': line.priority,
        'Loading Type': line.loadingType,
        'Transport Unit Type': truck.transportUnitOverride || baseUnit,
        'Transport Mode': transportMode,
        'Fill %': truckFillPct,
        'Cost per Piece (€)': costPerPiece,
        'Decision': truck.decision || '',
        'Notes': line.manualAdditionNote || '',
        'Cut Reason': '',
      });
    }
  }

  const cutRows = cutLines.map(line => ({
    'Status': line.isMilkRunCut ? 'Cut (Milk Run)' : 'Cut',
    'Vendor Shipment Number': '',
    'Milk Run ID': '',
    'Milk Run Stop': '',
    'Origin Location Code': line.originLocationCode,
    'Supplier Name': line.supplierName || '',
    'Destination Location': line.destinationLocation,
    'SKU': line.sku,
    'MTO/MTS': getMtoMtsLabel(line.originLocationCode, line.sku),
    'Quantity (pieces)': line.originalQty,
    'Pallets': '',
    'Priority': line.priority,
    'Loading Type': '',
    'Transport Unit Type': line.transportUnitType || 'FTL',
    'Transport Mode': '',
    'Fill %': line.fillPct != null ? (line.fillPct * 100).toFixed(1) + '%' : '',
    'Cost per Piece (€)': line.costPerPiece != null ? `€${line.costPerPiece.toFixed(2)}` : '',
    'Decision': '',
    'Notes': line.rootCause || '',
    'Cut Reason': line.cutReason || '',
  }));

  const allRows = [...confirmedRows, ...cutRows];
  if (allRows.length === 0) allRows.push({ 'Status': 'No data' });

  const ws = XLSX.utils.json_to_sheet(allRows);
  applyHeaderStyle(ws, Object.keys(allRows[0]));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'All Lines');

  const ww = String(weekNum).padStart(2, '0');
  XLSX.writeFile(wb, `All_Lines_W${ww}.xlsx`);
}

// ─── History Blob Generation ─────────────────────────────────────────────────

/**
 * Generate Excel files as base64 strings for storage in localStorage run history.
 */
export async function generateBase64Blobs(confirmedTrucks, cutLines, weekNum) {
  const XLSX = await import('xlsx').then(m => m.default || m);

  const confirmedRows = buildConfirmedExportRows(confirmedTrucks);
  const cutRows = buildCutExportRows(cutLines);

  const wbConfirmed = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wbConfirmed,
    XLSX.utils.json_to_sheet(confirmedRows.length ? confirmedRows : [{ note: 'No confirmed trucks' }]),
    'Confirmed Loads'
  );

  const wbCut = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wbCut,
    XLSX.utils.json_to_sheet(cutRows.length ? cutRows : [{ note: 'No cut lines' }]),
    'Cut Lines'
  );

  const confirmedBase64 = XLSX.write(wbConfirmed, { bookType: 'xlsx', type: 'base64' });
  const cutBase64 = XLSX.write(wbCut, { bookType: 'xlsx', type: 'base64' });

  return { confirmedBase64, cutBase64 };
}

/**
 * Download a previously saved base64 blob.
 */
export function downloadBase64Blob(base64, filename) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function applyHeaderStyle(ws, headers) {
  const colWidths = headers.map(h => ({
    wch: Math.max(h.length + 2, 12),
  }));
  ws['!cols'] = colWidths;
}
