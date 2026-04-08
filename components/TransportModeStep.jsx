'use client';

import { useState } from 'react';
import { RAIL_REASON_CODES } from '../lib/rounding';

export default function TransportModeStep({ confirmedTrucks, costMap, onConfirm, onBack }) {
  const [decisions, setDecisions] = useState({});

  const containerTrucks = confirmedTrucks.filter(t =>
    t.lines?.[0]?.loadingUnit === 'CONTAINER 40FT'
  );

  const setMode = (vsn, mode) =>
    setDecisions(prev => ({ ...prev, [vsn]: { mode, railReason: null } }));

  const setRailReason = (vsn, railReason) =>
    setDecisions(prev => ({ ...prev, [vsn]: { ...prev[vsn], railReason } }));

  const getDecision = (vsn) => decisions[vsn] || { mode: 'sea', railReason: null };

  const allComplete = containerTrucks.every(truck => {
    const d = getDecision(truck.vendorShipmentNumber);
    return d.mode === 'sea' || (d.mode === 'rail' && d.railReason);
  });

  const railCount = containerTrucks.filter(t => getDecision(t.vendorShipmentNumber).mode === 'rail').length;
  const ftlCount  = confirmedTrucks.length - containerTrucks.length;

  if (containerTrucks.length === 0) {
    return (
      <div className="max-w-lg">
        <h1 className="text-xl font-semibold text-stone-900 mb-4">Container Transport Mode</h1>
        <p className="text-sm text-stone-500 mb-6">
          All {ftlCount} confirmed shipment{ftlCount !== 1 ? 's' : ''} are FTL — transport mode is road only.
        </p>
        <button
          onClick={() => onConfirm({})}
          className="px-5 py-2 bg-orange-500 text-white text-sm font-medium rounded hover:bg-orange-600 transition-colors"
        >
          Continue to Review →
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-stone-900 mb-1">Container Transport Mode</h1>
      <p className="text-sm text-stone-500 mb-6">
        Choose Sea or Rail for each 40ft container.
        Rail requires a justification code.
        {ftlCount > 0 && <span className="text-stone-400"> · {ftlCount} FTL truck{ftlCount !== 1 ? 's' : ''} travel by road (not shown).</span>}
      </p>

      {railCount > 0 && (
        <p className="text-xs text-stone-400 mb-4 border-l-2 border-stone-200 pl-3">
          {railCount} rail container{railCount > 1 ? 's' : ''} — VSNs will be updated to <span className="font-mono text-stone-600">R_Rx_…</span>
        </p>
      )}

      <div className="border border-stone-200 rounded-lg overflow-hidden mb-6">
        {containerTrucks.map((truck, idx) => {
          const d = getDecision(truck.vendorShipmentNumber);
          const costData = costMap[truck.lane];
          const seaCost  = costData?.price_sea_freight_total_eur ?? truck.transportCost;
          const railCost = costData?.price_rail_freight_rate_eur ?? null;
          const fill     = Math.round(truck.usedFraction * 100);
          const isRail   = d.mode === 'rail';

          return (
            <div
              key={truck.vendorShipmentNumber}
              className={`px-4 py-3.5 ${idx !== 0 ? 'border-t border-stone-100' : ''} ${isRail ? 'bg-blue-50/40' : 'bg-white'}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mb-1 text-xs">
                    <span className="font-mono font-semibold text-stone-800 text-sm">{truck.vendorShipmentNumber}</span>
                    <span className="text-stone-400">{truck.origin} → {truck.destination}</span>
                    <span className={fill >= 80 ? 'text-green-600' : fill >= 50 ? 'text-amber-500' : 'text-red-500'}>{fill}%</span>
                    {seaCost != null && (
                      <span className={d.mode === 'sea' ? 'text-stone-700 font-medium' : 'text-stone-400'}>
                        Sea €{seaCost.toFixed(0)}
                      </span>
                    )}
                    {railCost != null && (
                      <span className={d.mode === 'rail' ? 'text-blue-700 font-medium' : 'text-stone-400'}>
                        Rail €{railCost.toFixed(0)}
                        {seaCost != null && railCost > seaCost && (
                          <span className="text-amber-500 ml-1">+€{(railCost - seaCost).toFixed(0)}</span>
                        )}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-stone-400">
                    {truck.lines.length} SKU{truck.lines.length !== 1 ? 's' : ''} · P{truck.minPrio === 9 ? 1 : truck.minPrio}
                  </p>
                </div>

                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => setMode(truck.vendorShipmentNumber, 'sea')}
                    className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                      d.mode === 'sea'
                        ? 'bg-stone-800 text-white border-stone-800'
                        : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'
                    }`}
                  >Sea</button>
                  <button
                    onClick={() => setMode(truck.vendorShipmentNumber, 'rail')}
                    className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                      d.mode === 'rail'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-blue-600 border-blue-200 hover:border-blue-400'
                    }`}
                  >Rail</button>
                </div>
              </div>

              {isRail && (
                <div className="mt-2.5">
                  <select
                    value={d.railReason || ''}
                    onChange={e => setRailReason(truck.vendorShipmentNumber, e.target.value)}
                    className="w-full border border-stone-200 rounded px-3 py-1.5 text-xs text-stone-800 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                  >
                    <option value="">Rail justification code *</option>
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
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm text-stone-600 border border-stone-200 rounded hover:bg-stone-50 transition-colors"
        >← Back</button>
        <button
          onClick={() => onConfirm(decisions)}
          disabled={!allComplete}
          className="px-5 py-2 bg-orange-500 text-white text-sm font-medium rounded hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Confirm & Review Cuts →
        </button>
      </div>
    </div>
  );
}
