/**
 * app/api/airtable/route.js — Server-side Airtable proxy
 *
 * This API route runs on Vercel's serverless infrastructure (Node.js).
 * The AIRTABLE_API_KEY environment variable is ONLY accessible here,
 * never in the browser. The frontend calls this route, which then
 * calls Airtable, keeping the key secure.
 */

import { NextResponse } from 'next/server';
import { fetchPalletizationTable, fetchCostTable, fetchLocationLookupTable } from '../../../lib/airtable';

export const dynamic = 'force-dynamic'; // don't pre-render at build time

export async function GET() {
  try {
    // Fetch all tables in parallel
    const [palletization, costs, locationLookup] = await Promise.all([
      fetchPalletizationTable(),
      fetchCostTable(),
      fetchLocationLookupTable().catch(() => ({})), // non-fatal if unavailable
    ]);

    // Build costMap keyed by lane for easy lookup
    const costMap = {};
    costs.forEach(c => { if (c.lane && !costMap[c.lane]) costMap[c.lane] = c; });

    return NextResponse.json(
      {
        palletization,
        costs,
        costMap,
        locationLookup,
        lastSynced: new Date().toISOString(),
        meta: {
          palletizationCount: palletization.length,
          costCount: costs.length,
          uniqueSuppliers: new Set(palletization.map(p => p.origin_location_record)).size,
          // Debug: field names from first record so we can see what Airtable actually has
          palletizationFields: palletization[0]?._debugFieldNames || [],
        },
      },
    );
  } catch (error) {
    console.error('Airtable fetch error:', error);
    return NextResponse.json(
      {
        error: error.message || 'Failed to fetch data from Airtable',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
