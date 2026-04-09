/**
 * lib/airtable.js — Server-side Airtable data fetching
 *
 * THIS FILE RUNS ONLY ON THE SERVER (Next.js API routes).
 * It reads process.env variables which are never sent to the browser.
 * Do NOT import this file in any client component.
 *
 * Table IDs (confirmed from field inspection):
 *   tbl6Vr4XwyNhLVsMX = Palletization table (has pkey, sku, loading_unit, pcs_per_ftl_container...)
 *   tblY2PxdLq84p8Erc = Cost table (has transport_cost_total_eur, active_status, lane...)
 */

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

// Hardcoded — env vars in Vercel have these swapped so we ignore them.
// tbl6Vr4XwyNhLVsMX = palletization (has pkey, sku, loading_unit...)
// tblY2PxdLq84p8Erc = cost (has transport_cost_total_eur, active_status, lane...)
const PALLETIZATION_TABLE_ID = 'tbl6Vr4XwyNhLVsMX';
const COST_TABLE_ID = 'tblY2PxdLq84p8Erc';

const BASE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`;

async function fetchAllRecords(tableId, fields = []) {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error('Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID environment variables');
  }

  const records = [];
  let offset = null;

  do {
    const query = new URLSearchParams();
    if (offset) query.set('offset', offset);
    if (fields.length) fields.forEach(f => query.append('fields[]', f));
    query.set('pageSize', '100');

    const url = `${BASE_URL}/${tableId}?${query.toString()}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
      next: { revalidate: 1800 },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Airtable API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    records.push(...(data.records || []));
    offset = data.offset || null;
  } while (offset);

  return records;
}

/**
 * Fetch palletization rules.
 * Fields confirmed: pkey, category, origin_location_code, receiving_destination_code,
 * origin_location_name, receiving_destination_name, loading_unit, sku,
 * pcs_per_ftl_container, pcs_per_pallet, loading_type, lane, completeness
 */
export async function fetchPalletizationTable() {
  const records = await fetchAllRecords(PALLETIZATION_TABLE_ID, [
    'pkey', 'category', 'loading_unit', 'sku',
    'origin_location_code', 'origin_location_name',
    'receiving_destination_code', 'receiving_destination_name',
    'pcs_per_ftl_container', 'pcs_per_pallet', 'loading_type',
    'lane', 'completeness',
  ]);

  return records
    .filter(record => {
      const f = record.fields;
      return f['category'] === 'PO' &&
        (f['loading_unit'] === 'FTL' || f['loading_unit'] === 'CONTAINER 40FT');
    })
    .map(record => {
      const f = record.fields;
      return {
        id: record.id,
        pkey: String(f['pkey'] || '').trim(),
        category: f['category'] || '',
        origin_location_code: String(f['origin_location_code'] || '').trim(),
        origin_location_name: String(f['origin_location_name'] || '').trim(),
        receiving_destination_code: String(f['receiving_destination_code'] || '').trim(),
        receiving_destination_name: String(f['receiving_destination_name'] || '').trim(),
        loading_unit: f['loading_unit'] || '',
        sku: String(f['sku'] || '').trim(),
        pcs_per_ftl_container: Number(f['pcs_per_ftl_container']) || 0,
        pcs_per_pallet: Number(f['pcs_per_pallet']) || 0,
        pallets_per_truck: f['pcs_per_ftl_container'] && f['pcs_per_pallet']
          ? Math.floor(Number(f['pcs_per_ftl_container']) / Number(f['pcs_per_pallet']))
          : 0,
        loading_type: f['loading_type'] || '',
        lane: f['lane'] || '',
        completeness: f['completeness'] || '',
      };
    });
}

/**
 * Fetch active transport costs.
 * Fields confirmed: active_status, transport_cost_total_eur, lane,
 * origin_location_code, destination_location_code, origin_supplier_name,
 * carrier_code, lane_type, mode_of_transportation, start_date, end_date
 */
export async function fetchCostTable() {
  const records = await fetchAllRecords(COST_TABLE_ID, [
    'active_status', 'transport_cost_total_eur', 'lane',
    'origin_location_code', 'destination_location_code',
    'origin_location', 'destination_location',
    'origin_supplier_name', 'carrier_code',
    'lane_type', 'mode_of_transportation',
    'start_date', 'end_date',
    'price_rail_freight_rate_eur',
    'price_sea_freight_total_eur',
    'road_transport_cost_latest',
  ]);

  return records
    .filter(record => record.fields['active_status'] === 'Active')
    .map(record => {
      const f = record.fields;
      return {
        id: record.id,
        lane: String(f['lane'] || '').trim(),
        lane_type: f['lane_type'] || '',
        mode_of_transportation: f['mode_of_transportation'] || '',
        origin_location: f['origin_location'] || '',
        origin_location_code: String(f['origin_location_code'] || '').trim(),
        destination_location: f['destination_location'] || '',
        destination_location_code: String(f['destination_location_code'] || '').trim(),
        origin_supplier_name: f['origin_supplier_name'] || '',
        carrier_code: f['carrier_code'] || '',
        transport_cost_total_eur: parseTransportCost(f['transport_cost_total_eur']),
        active_status: f['active_status'] || '',
        start_date: f['start_date'] || '',
        end_date: f['end_date'] || '',
        price_rail_freight_rate_eur: parseTransportCost(f['price_rail_freight_rate_eur']),
        price_sea_freight_total_eur: parseTransportCost(f['price_sea_freight_total_eur']),
        road_transport_cost_latest: parseTransportCost(f['road_transport_cost_latest']),
      };
    });
}

function parseTransportCost(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return raw;
  const cleaned = String(raw).replace(/[€\s]/g, '').replace(/,/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}
