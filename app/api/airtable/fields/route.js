/**
 * app/api/airtable/fields/route.js
 *
 * Debug endpoint: fetches exactly 1 record from each table and returns
 * all field names. Fast single request — no pagination, no timeout risk.
 * Used to identify correct field names for the pkey matching logic.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const PALLETIZATION_TABLE_ID = process.env.PALLETIZATION_TABLE_ID || 'tblY2PxdLq84p8Erc';
const COST_TABLE_ID = process.env.COST_TABLE_ID || 'tbl6Vr4XwyNhLVsMX';

async function fetchOneRecord(tableId) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableId}?pageSize=1`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
  });
  if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const record = data.records?.[0];
  if (!record) return { fieldNames: [], sample: {} };
  return {
    fieldNames: Object.keys(record.fields),
    sample: record.fields,
  };
}

export async function GET() {
  try {
    const [palletization, costs] = await Promise.all([
      fetchOneRecord(PALLETIZATION_TABLE_ID),
      fetchOneRecord(COST_TABLE_ID),
    ]);
    return NextResponse.json({ palletization, costs });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
