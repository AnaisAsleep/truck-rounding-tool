/**
 * lib/airtable.js — Server-side Airtable data fetching
 *
 * THIS FILE RUNS ONLY ON THE SERVER (Next.js API routes).
 * It reads process.env variables which are never sent to the browser.
 * Do NOT import this file in any client component.
 */

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const PALLETIZATION_TABLE_ID = process.env.PALLETIZATION_TABLE_ID || 'tblY2PxdLq84p8Erc';
const COST_TABLE_ID = process.env.COST_TABLE_ID || 'tbl6Vr4XwyNhLVsMX';

const BASE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`;

/**
 * Fetch all records from an Airtable table, handling pagination automatically.
 * Airtable returns max 100 records per request; we loop until no more offset.
 *
 * @param {string} tableId - Airtable table ID
 * @param {Object} params - Optional query params (filterByFormula, fields, etc.)
 * @returns {Promise<Array>} All records as plain objects { id, fields }
 */
async function fetchAllRecords(tableId, params = {}) {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error('Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID environment variables');
  }

  const records = [];
  let offset = null;

  do {
    // Build query string
    const query = new URLSearchParams();
    if (offset) query.set('offset', offset);
    if (params.filterByFormula) query.set('filterByFormula', params.filterByFormula);
    if (params.fields) {
      params.fields.forEach(f => query.append('fields[]', f));
    }
    query.set('pageSize', '100');

    const url = `${BASE_URL}/${tableId}?${query.toString()}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Airtable API error ${response.status}: ${error}`);
    }

    const data = await response.json();
    records.push(...(data.records || []));
    offset = data.offset || null;

  } while (offset);

  return records;
}

/**
 * Fetch all palletization rules from "Item Palletization Table".
 * Filters to only FTL and CONTAINER 40FT rows (ignores PALLET rows).
 *
 * Returns an array of normalized palletization rule objects, keyed by pkey.
 * The pkey format is: {origin_location_record}-{sku}-{receiving_destination_record}
 */
export async function fetchPalletizationTable() {
  // No fields restriction — fetch all columns so we can discover the real field names
  const records = await fetchAllRecords(PALLETIZATION_TABLE_ID);

  const filtered = records.filter(record => {
    const cat = (record.fields['category'] || '').trim();
    const unit = (record.fields['loading_unit'] || '').trim();
    return cat === 'PO' && (unit === 'FTL' || unit === 'CONTAINER 40FT');
  });

  // Expose raw field names of first record for debugging key mismatches
  const _debugFieldNames = filtered.length > 0 ? Object.keys(filtered[0].fields) : [];

  return filtered.map(record => {
    const f = record.fields;
    const origin = String(f['origin_location_record'] || '').trim();
    const whouse = String(f['from_whouse'] || f['From Whouse'] || f['warehouse'] || f['origin_warehouse'] || '').trim();
    const sku = String(f['sku'] || '').trim();
    // Build pkey from origin + warehouse + sku (warehouse field name TBD — shown in debug)
    const pkey = whouse ? `${origin}-${whouse}-${sku}` : `${origin}-${sku}`;

    return {
      id: record.id,
      pkey,
      _debugFieldNames,
      category: f['category'] || '',
      origin_location_record: origin,
      origin_location_name: String(f['origin_location_name'] || '').trim(),
      loading_unit: f['loading_unit'] || '',
      sku,
      pcs_per_ftl_container: Number(f['pcs_per_ftl_container']) || 0,
      pcs_per_pallet: Number(f['pcs_per_pallet']) || 0,
      pallets_per_truck: Number(f['pallets_per_truck']) || 0,
      loading_type: f['loading_type'] || '',
      receiving_destination_record: String(f['receiving_destination_record'] || '').trim(),
      lane: f['lane'] || '',
    };
  });
}

/**
 * Fetch all active transport costs from "P2W view".
 * Filters to only Active rows.
 *
 * Returns an array of cost objects. The lane field is the join key
 * with the palletization table: {origin}|{destination}
 */
export async function fetchCostTable() {
  // No fields restriction — fetch all columns to avoid 422 on unknown field names
  const records = await fetchAllRecords(COST_TABLE_ID);

  return records
    .filter(record => (record.fields['active_status'] || '').trim() === 'Active')
    .map(record => {
    const rawCost = record.fields['transport_cost_total_eur'];
    return {
      id: record.id,
      lane_type: record.fields['lane_type'] || '',
      mode_of_transportation: record.fields['mode_of_transportation'] || '',
      origin_location: record.fields['origin_location'] || '',
      origin_supplier_name: record.fields['origin_supplier_name'] || '',
      destination_location: record.fields['destination_location'] || '',
      carrier_code: record.fields['carrier_code'] || '',
      transport_cost_total_eur: parseTransportCost(rawCost),
      active_status: record.fields['active_status'] || '',
      start_date: record.fields['start_date'] || '',
      end_date: record.fields['end_date'] || '',
      lane: record.fields['lane'] || '',
    };
  });
}

/**
 * Parse transport cost from Airtable's formatted string to a number.
 * Handles formats like: "€ 200.00", "€200", "200.00", "1,234.56"
 *
 * @param {string|number|null} raw
 * @returns {number|null}
 */
function parseTransportCost(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return raw;
  // Remove €, spaces, and thousands separators (commas)
  const cleaned = String(raw).replace(/[€\s]/g, '').replace(/,/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}
