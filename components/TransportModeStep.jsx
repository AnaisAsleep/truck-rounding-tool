'use client';

import { useState } from 'react';
import { RAIL_REASON_CODES } from '../lib/rounding';

/**
 * TransportModeStep — only shown for 40ft container shipments.
 * FTL trucks always travel by road and are skipped here.
 *
 * For each container the user chooses Sea (default) or Rail.
 * Rail is more expensive and requires a justification code (R1–R7).
 * VSN of rail containers will be rewritten: S40FT → R_{reason}
 */
export default function TransportModeStep({ confirmedTrucks, costMap, onConfirm, onBack }) {
  const [decisions, setDecisions] = useState({});

  // Only 40ft containers get a sea/rail choice
  const containerTrucks = confirmedTrucks.filter(t =>
    t.lines?.[0]?.loadingUnit === 'CONTAINER 40FT'
  );

  const setMode = (vsn, mode) => {
    setDecisions(prev => ({ ...prev, [vsn]: { mode, railReason: null } }));
  };

  const setRailReason = (vsn, railReason) => {
    setDecisions(prev => ({ ...prev, [vsn]: { ...prev[vsn], railReason } }));
  };

  const getDecision = (vsn) => decisions[vsn] || { mode: 'sea', railReason: null };

  const allComplete = containerTrucks.every(truck => {
    const d = getDecision(truck.vendorShipmentNumber);
    return d.mode === 'sea' || (d.mode === 'rail' && d.railReason);
  });

  const railCount = containerTrucks.filter(t => getDecision(t.vendorShipmentNumber).mode === 'rail').length;
  const ftlCount = confirmedTrucks.length - containerTrucks.length;

  // If no containers at all, auto-skip
  if (containerTrucks.length === 0) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <div className="w-16 h-16 bg-[#fff3e0] rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-[#ffa236]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-[#403833] mb-2">No containers to configure</h2>
        <p className="text-[#8a7e78] mb-6">All {ftlCount} confirmed shipment{ftlCount !== 1 ? 's' : ''} are FTL — transport mode is road only.</p>
        <button onClick={() => onConfirm({})} className="px-6 py-2.5 bg-[#ffa236] text-white font-semibold rounded-lg hover:bg-[#e8922e] transition-colors">
          Continue to Review →
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-[#403833] mb-1">Container Transport Mode</h2>
        <p className="text-[#8a7e78]">
          Choose <strong>Sea</strong> or <strong>Rail</strong> for each 40ft container shipment.
          Rail is more expensive and requires a justification code.
          {ftlCount > 0 && <span className="ml-1">({ftlCount} FTL truck{ftlCount !== 1 ? 's' : ''} travel by road — not shown here.)</span>}
        </p>
      </div>

      {railCount > 0 && (
        <div className="mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 flex items-center gap-2">
          <span className="font-semibold">{railCount} rail container{railCount > 1 ? 's' : ''}</span>
          <span>— VSNs will be updated to <code className="bg-white px-1 rounded font-mono">R_Rx_…</code></span>
        </div>
      )}

      <div className="space-y-3 mb-6">
        {containerTrucks.map(truck => {
          const d = getDecision(truck.vendorShipmentNumber);
          const costData = costMap[truck.lane];
          const seaCost = costData?.price_sea_freight_total_eur ?? truck.transportCost;
          const railCost = costData?.price_rail_freight_rate_eur ?? null;
          const fill = Math.round(truck.usedFraction * 100);

          return (
            <div
              key={truck.vendorShipmentNumber}
              className={`bg-white border rounded-lg p-4 transition-colors ${d.mode === 'rail' ? 'border-blue-300 shadow-sm' : 'border-[#e8e0db]'}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-mono text-sm font-semibold text-[#403833]">{truck.vendorShipmentNumber}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">40ft Container</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${fill >= 80 ? 'bg-green-100 text-green-700' : fill >= 50 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>
                      {fill}% fill
                    </span>
                  </div>
                  <p className="text-sm text-[#8a7e78]">
                    {truck.origin} → {truck.destination} · {truck.lines.length} SKU{truck.lines.length !== 1 ? 's' : ''} · P{truck.minPrio === 9 ? 1 : truck.minPrio}
                  </p>
                  <div className="flex gap-4 mt-1.5 text-xs">
                    {seaCost != null && (
                      <span className={d.mode === 'sea' ? 'text-[#403833] font-semibold' : 'text-[#8a7e78]'}>
                        Sea: <strong>€{seaCost.toFixed(0)}</strong>
                      </span>
                    )}
                    {railCost != null && (
                      <span className={d.mode === 'rail' ? 'text-blue-700 font-semibold' : 'text-[#8a7e78]'}>
                        Rail: <strong>€{railCost.toFixed(0)}</strong>
                        {seaCost != null && railCost > seaCost && (
                          <span className="text-orange-500 ml-1">+€{(railCost - seaCost).toFixed(0)}</span>
                        )}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => setMode(truck.vendorShipmentNumber, 'sea')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${d.mode === 'sea' ? 'bg-[#403833] text-white border-[#403833]' : 'bg-white text-[#403833] border-[#e8e0db] hover:border-[#403833]'}`}
                  >
                    Sea
                  </button>
                  <button
                    onClick={() => setMode(truck.vendorShipmentNumber, 'rail')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${d.mode === 'rail' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-600 border-blue-200 hover:border-blue-400'}`}
                  >
                    Rail
                  </button>
                </div>
              </div>

              {d.mode === 'rail' && (
                <div className="mt-3 pt-3 border-t border-blue-100">
                  <label className="block text-xs font-semibold text-blue-700 mb-1.5">
                    Rail justification code <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={d.railReason || ''}
                    onChange={e => setRailReason(truck.vendorShipmentNumber, e.target.value)}
                    className="w-full border border-blue-200 rounded-md px-3 py-2 text-sm text-[#403833] focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                  >
                    <option value="">Select reason code…</option>
                    {RAIL_REASON_CODES.map(r => (
                      <option key={r.code} value={r.code}>{r.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <button onClick={onBack} className="px-4 py-2 text-[#403833] border border-[#e8e0db] rounded-lg text-sm font-medium hover:bg-[#fafafa] transition-colors">
          ← Back
        </button>
        <button
          onClick={() => onConfirm(decisions)}
          disabled={!allComplete}
          className="px-6 py-2.5 bg-[#ffa236] text-white font-semibold rounded-lg hover:bg-[#e8922e] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Confirm & Review Cuts →
        </button>
      </div>
    </div>
  );
}
