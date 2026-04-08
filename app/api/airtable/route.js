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

// Edge runtime: no cold starts, 30s timeout (vs 10s for serverless on hobby tier)
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Fetch both tables in parallel for speed
    const [palletization, costs] = await Promise.all([
      fetchPalletizationTable(),
      fetchCostTable(),
    ]);

    return NextResponse.json(
      {
        palletization,
        costs,
        lastSynced: new Date().toISOString(),
        meta: {
          palletizationCount: palletization.length,
          costCount: costs.length,
          uniqueSuppliers: new Set(palletization.map(p => p.origin_location_record)).size,
          // Debug: field names from first record so we can see what Airtable actually has
          palletizationFields: palletization[0]?._debugFieldNames || [],
        },
      },
      {
        headers: {
          // Cache at Vercel's CDN for 1 hour; serve stale for another hour while revalidating
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=3600',
        },
      }
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
