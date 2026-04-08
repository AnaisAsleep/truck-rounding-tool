/**
 * lib/excelExporter.js — Client-side Excel file generation
 *
 * Imported only by 'use client' components — never runs server-side.
 * xlsx is loaded dynamically inside each function to prevent server-side
 * build errors (xlsx is a CommonJS module that pulls in Node.js built-ins).
 */

// ─── Confirmed Loads Export ──────────────────────────────────────────────────

/**
 * Generate and download the Confirmed_Loads_W{XX}.xlsx file.
 */
export async function exportConfirmedLoads(confirmedTrucks, weekNum) {
  const XLSX = await import('xlsx').then(m => m.default || m);

  const rows = [];

  for (const truck of confirmedTrucks) {
    const truckFillPct = (truck.usedFraction * 100).toFixed(1) + '%';
    const transportCost = truck.transportCost != null
      ? `€${truck.transportCost.toFixed(2)}`
      : '';
    const costPerPiece = truck.costPerPiece != null
      ? `€${truck.costPerPiece.toFixed(2)}`
      : '';

    for (const line of truck.lines) {
      const transportUnitType = line.loadingUnit === 'CONTAINER 40FT'
        ? '40ft Container'
        : 'FTL';

      rows.push({
        'Vendor Shipment Number': truck.vendorShipmentNumber,
        'Origin Location Code': line.originLocationCode,
        'Supplier Name': line.supplierName,
        'Destination Location': line.destinationLocation,
        'SKU': line.sku,
        'Quantity (pieces)': line.qty,
        'Pallets': line.pallets > 0 ? line.pallets : '',
        'Priority': line.priority,
        'Loading Type': line.loadingType,
        'Transport Unit Type': transportUnitType,
        'Line Fill %': (line.lineFraction * 100).toFixed(1) + '%',
        'Truck Total Fill %': truckFillPct,
        'Transport Cost (€)': transportCost,
        'Cost per Piece (€)': costPerPiece,
        'Decision': truck.decision || '',
      });
    }
  }

  if (rows.length === 0) {
    rows.push({
      'Vendor Shipment Number': 'No confirmed trucks',
      'Origin Location Code': '', 'Supplier Name': '', 'Destination Location': '',
      'SKU': '', 'Quantity (pieces)': '', 'Pallets': '', 'Priority': '',
      'Loading Type': '', 'Transport Unit Type': '', 'Line Fill %': '',
      'Truck Total Fill %': '', 'Transport Cost (€)': '', 'Cost per Piece (€)': '',
      'Decision': '',
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

  const rows = cutLines.map(line => ({
    'Origin Location Code': line.originLocationCode,
    'Supplier Name': line.supplierName || '',
    'Destination Location': line.destinationLocation,
    'SKU': line.sku,
    'Original Quantity': line.originalQty,
    'Priority': line.priority,
    'Transport Unit Type': line.transportUnitType || 'FTL',
    'Cut Reason': line.cutReason || '',
    'Root Cause': line.rootCause || '',
    'Suggested Fallback Unit': line.fallbackUnit || '',
  }));

  if (rows.length === 0) {
    rows.push({
      'Origin Location Code': 'No cut lines',
      'Supplier Name': '', 'Destination Location': '', 'SKU': '',
      'Original Quantity': '', 'Priority': '', 'Transport Unit Type': '',
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

// ─── History Blob Generation ─────────────────────────────────────────────────

/**
 * Generate Excel files as base64 strings for storage in localStorage run history.
 */
export async function generateBase64Blobs(confirmedTrucks, cutLines, weekNum) {
  const XLSX = await import('xlsx').then(m => m.default || m);

  const confirmedRows = [];
  for (const truck of confirmedTrucks) {
    const truckFillPct = (truck.usedFraction * 100).toFixed(1) + '%';
    const transportCost = truck.transportCost != null ? `€${truck.transportCost.toFixed(2)}` : '';
    const costPerPiece = truck.costPerPiece != null ? `€${truck.costPerPiece.toFixed(2)}` : '';
    for (const line of truck.lines) {
      const transportUnitType = line.loadingUnit === 'CONTAINER 40FT' ? '40ft Container' : 'FTL';
      confirmedRows.push({
        'Vendor Shipment Number': truck.vendorShipmentNumber,
        'Origin Location Code': line.originLocationCode,
        'Supplier Name': line.supplierName,
        'Destination Location': line.destinationLocation,
        'SKU': line.sku,
        'Quantity (pieces)': line.qty,
        'Pallets': line.pallets > 0 ? line.pallets : '',
        'Priority': line.priority,
        'Loading Type': line.loadingType,
        'Transport Unit Type': transportUnitType,
        'Line Fill %': (line.lineFraction * 100).toFixed(1) + '%',
        'Truck Total Fill %': truckFillPct,
        'Transport Cost (€)': transportCost,
        'Cost per Piece (€)': costPerPiece,
        'Decision': truck.decision || '',
      });
    }
  }

  const cutRows = cutLines.map(line => ({
    'Origin Location Code': line.originLocationCode,
    'Supplier Name': line.supplierName || '',
    'Destination Location': line.destinationLocation,
    'SKU': line.sku,
    'Original Quantity': line.originalQty,
    'Priority': line.priority,
    'Transport Unit Type': line.transportUnitType || 'FTL',
    'Cut Reason': line.cutReason || '',
    'Root Cause': line.rootCause || '',
    'Suggested Fallback Unit': line.fallbackUnit || '',
  }));

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
