/**
 * app/api/airtable/route.js — Server-side Airtable proxy
 *
 * This API route runs on Vercel's serverless infrastructure (Node.js).
 * The AIRTABLE_API_KEY environment variable is ONLY accessible here,
 * never in the browser. The frontend calls this route, which then
 * calls Airtable, keeping the key secure.
 */

import { NextResponse } from 'next/server';
import { fetchPalletizationTable, fetchCostTable } from '../../../lib/airtable';

// Never pre-render this route at build time — it calls the live Airtable API
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Fetch both tables in parallel for speed
    const [palletization, costs] = await Promise.all([
      fetchPalletizationTable(),
      fetchCostTable(),
    ]);

    return NextResponse.json({
      palletization,
      costs,
      lastSynced: new Date().toISOString(),
      meta: {
        palletizationCount: palletization.length,
        costCount: costs.length,
        uniqueSuppliers: new Set(palletization.map(p => p.origin_location_record)).size,
      },
    });
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
