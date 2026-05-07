'use client';

import { useState } from 'react';
import { RAIL_REASON_CODES } from '../lib/rounding';

export default function TransportModeStep({ confirmedTrucks, costMap, onConfirm, onBack }) {
  const [decisions, setDecisions] = useState({});
  const [expandedTrucks, setExpandedTrucks] = useState({});
  const toggleExpand = (vsn) => setExpandedTrucks(prev => ({ ...prev, [vsn]: !prev[vsn] }));

  const containerTrucks = confirmedTrucks.filter(t =>
    t.lines?.[0]?.loadingUnit === 'CONTAINER 40FT' ||
    t.lines?.[0]?.palletData?.loading_unit === 'CONTAINER 40FT'
  );
  const ftlCount = confirmedTrucks.length - containerTrucks.length;

  const setMode = (vsn, mode) =>
    setDecisions(prev => ({ ...prev, [vsn]: { mode, railReason: null } }));
  const setRailReason = (vsn, railReason) =>
    setDecisions(prev => ({ ...prev, [vsn]: { ...prev[vsn], railReason } }));
  const getDecision = (vsn) => decisions[vsn] || { mode: 'sea', railReason: null };

  const setAllSea = () => {
    const next = {};
    containerTrucks.forEach(t => { next[t.vendorShipmentNumber] = { mode: 'sea', railReason: null }; });
    setDecisions(next);
  };

  const allComplete = containerTrucks.every(t => {
    const d = getDecision(t.vendorShipmentNumber);
    return d.mode === 'sea' || (d.mode === 'rail' && d.railReason);
  });

  const railCount = containerTrucks.filter(t => getDecision(t.vendorShipmentNumber).mode === 'rail').length;

  // Running total of selected transport costs
  const { totalCost, knownCount } = containerTrucks.reduce((acc, truck) => {
    const d = getDecision(truck.vendorShipmentNumber);
    const costData = costMap[truck.lane];
    const cost = d.mode === 'rail'
      ? (costData?.price_rail_freight_rate_eur ?? null)
      : (costData?.price_sea_freight_total_eur ?? truck.transportCost ?? null);
    if (cost != null) { acc.totalCost += cost; acc.knownCount++; }
    return acc;
  }, { totalCost: 0, knownCount: 0 });

  if (containerTrucks.length === 0) {
    return (
      <div className="max-w-lg">
        <h1 className="text-2xl font-bold text-[#403833] mb-2">Container Transport Mode</h1>
        <p className="text-[#8a7e78] mb-6">
          No 40ft containers in this run — all accepted shipments travel by road.
        </p>
        <button
          onClick={() => onConfirm({})}
          className="px-6 py-2.5 bg-[#ffa236] text-white font-semibold text-sm rounded-lg hover:bg-[#e8922e] transition-colors"
        >
          Continue to Results →
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-[#403833] mb-1">Container Transport Mode</h1>
          <p className="text-[#8a7e78] text-sm">
            Choose Sea or Rail for each 40ft container. Rail requires a justification code.
            {ftlCount > 0 && <span className="text-[#8a7e78]"> · {ftlCount} FTL truck{ftlCount !== 1 ? 's' : ''} travel by road.</span>}
          </p>
        </div>

        {/* Running cost total */}
        {knownCount > 0 && (
          <div className="bg-white border border-[#e8e0db] rounded-xl px-4 py-3 shadow-card shrink-0">
            <p className="text-xs text-[#8a7e78] mb-0.5">Total transport cost</p>
            <p className="text-xl font-bold text-[#403833]">€{totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            {knownCount < containerTrucks.length && (
              <p className="text-[11px] text-[#8a7e78]">{containerTrucks.length - knownCount} lane{containerTrucks.length - knownCount !== 1 ? 's' : ''} without cost data</p>
            )}
          </div>
        )}
      </div>

      {/* Bulk action + info strip */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          onClick={setAllSea}
          className="text-xs px-3 py-1.5 border border-[#e8e0db] rounded-lg text-[#403833] hover:bg-[#fafaf8] hover:border-[#403833] transition-colors font-medium"
        >
          Set all Sea
        </button>
        {railCount > 0 && (
          <p className="text-xs text-[#8a7e78] pl-3 border-l border-[#e8e0db]">
            {railCount} rail container{railCount > 1 ? 's' : ''} — VSNs will update to <span className="font-mono text-[#403833]">R_Rx_…</span>
          </p>
        )}
        {ftlCount > 0 && (
          <p className="text-xs text-[#8a7e78] pl-3 border-l border-amber-200">
            Rail is only for 40ft containers — 20ft rebooking from Review travels by sea.
          </p>
        )}
      </div>

      <div className="bg-white border border-[#e8e0db] rounded-xl shadow-card overflow-hidden mb-4 divide-y divide-[#f0ebe8]">
        {containerTrucks.map(truck => {
          const d = getDecision(truck.vendorShipmentNumber);
          const costData = costMap[truck.lane];
          const seaCost  = costData?.price_sea_freight_total_eur ?? truck.transportCost;
          const railCost = costData?.price_rail_freight_rate_eur ?? null;
          const fill     = Math.round(truck.usedFraction * 100);

          return (
            <div key={truck.vendorShipmentNumber} className={`px-5 py-4 ${d.mode === 'rail' ? 'bg-blue-50/30' : 'bg-white'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mb-1">
                    <span className="font-mono font-semibold text-[#403833]">{truck.vendorShipmentNumber}</span>
                    <span className="text-xs text-[#8a7e78]">{truck.origin} → {truck.destination}</span>
                    <span className={`text-xs font-medium ${fill >= 80 ? 'text-green-600' : fill >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                      {fill}%
                    </span>
                  </div>
                  <div className="flex gap-4 text-xs">
                    {seaCost != null && (
                      <span className={d.mode === 'sea' ? 'text-[#403833] font-semibold' : 'text-[#8a7e78]'}>
                        Sea €{seaCost.toFixed(0)}
                      </span>
                    )}
                    {railCost != null && (
                      <span className={d.mode === 'rail' ? 'text-blue-700 font-semibold' : 'text-[#8a7e78]'}>
                        Rail €{railCost.toFixed(0)}
                        {seaCost != null && railCost > seaCost && (
                          <span className="text-amber-500 ml-1">+€{(railCost - seaCost).toFixed(0)}</span>
                        )}
                        {seaCost != null && railCost <= seaCost && (
                          <span className="text-green-600 ml-1">-€{(seaCost - railCost).toFixed(0)}</span>
                        )}
                      </span>
                    )}
                    <button
                      onClick={() => toggleExpand(truck.vendorShipmentNumber)}
                      className="flex items-center gap-1 text-[#8a7e78] hover:text-[#403833] transition-colors"
                    >
                      <svg className={`w-3 h-3 transition-transform ${expandedTrucks[truck.vendorShipmentNumber] ? 'rotate-90' : ''}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 2l4 4-4 4"/>
                      </svg>
                      {truck.lines.length} SKU{truck.lines.length !== 1 ? 's' : ''} · P{truck.minPrio === 9 ? 1 : truck.minPrio}
                      {truck.lines.some(l => l.priority === 4) && (
                        <span className="ml-1 px-1 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-600">+P4</span>
                      )}
                    </button>
                  </div>

                  {expandedTrucks[truck.vendorShipmentNumber] && truck.lines?.length > 0 && (
                    <div className="mt-3 border border-[#e8e0db] rounded-lg overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-[#fafaf8] border-b border-[#e8e0db]">
                            <th className="text-left px-3 py-1.5 font-semibold text-[#8a7e78]">SKU</th>
                            <th className="text-left px-3 py-1.5 font-semibold text-[#8a7e78]">Supplier</th>
                            <th className="text-right px-3 py-1.5 font-semibold text-[#8a7e78]">Qty</th>
                            <th className="text-right px-3 py-1.5 font-semibold text-[#8a7e78]">Pallets</th>
                            <th className="text-center px-3 py-1.5 font-semibold text-[#8a7e78]">P</th>
                          </tr>
                        </thead>
                        <tbody>
                          {truck.lines.map((line, li) => (
                            <tr key={li} className={`border-t border-[#f0ebe8] ${li % 2 !== 0 ? 'bg-[#fafaf8]' : 'bg-white'}`}>
                              <td className="px-3 py-1.5 font-mono text-[#403833]">{line.sku}</td>
                              <td className="px-3 py-1.5 text-[#8a7e78] truncate max-w-[140px]">{line.supplierName || '—'}</td>
                              <td className="px-3 py-1.5 text-right text-[#403833]">{line.qty?.toLocaleString()}</td>
                              <td className="px-3 py-1.5 text-right text-[#8a7e78]">{line.pallets?.toFixed(1)}</td>
                              <td className="px-3 py-1.5 text-center">
                                <span className={`text-xs font-semibold ${line.priority === 4 ? 'text-purple-600' : 'text-[#8a7e78]'}`}>
                                  P{line.priority}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => setMode(truck.vendorShipmentNumber, 'sea')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      d.mode === 'sea'
                        ? 'bg-[#403833] text-white border-[#403833]'
                        : 'bg-white text-[#403833] border-[#e8e0db] hover:border-[#403833]'
                    }`}
                  >Sea</button>
                  <button
                    onClick={() => setMode(truck.vendorShipmentNumber, 'rail')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      d.mode === 'rail'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-blue-600 border-blue-200 hover:border-blue-500'
                    }`}
                  >Rail</button>
                </div>
              </div>

              {d.mode === 'rail' && (
                <div className="mt-3">
                  <select
                    value={d.railReason || ''}
                    onChange={e => setRailReason(truck.vendorShipmentNumber, e.target.value)}
                    className="w-full border border-[#e8e0db] rounded-lg px-3 py-2 text-sm text-[#403833] focus:outline-none focus:ring-2 focus:ring-[#ffa236] bg-white"
                  >
                    <option value="">Rail justification code *</option>
                    {RAIL_REASON_CODES.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
                  </select>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sticky bottom nav */}
      <div className="sticky bottom-0 z-10 bg-white/95 backdrop-blur-sm border-t border-[#e8e0db] py-3 flex items-center justify-between">
        <button onClick={onBack} className="px-4 py-2 text-[#403833] border border-[#e8e0db] rounded-lg text-sm font-medium hover:bg-[#fafaf8] transition-colors">
          ← Back
        </button>
        <button
          onClick={() => onConfirm(decisions)}
          disabled={!allComplete}
          className="px-6 py-2.5 bg-[#ffa236] text-white font-semibold text-sm rounded-lg hover:bg-[#e8922e] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Confirm & Generate Results →
        </button>
      </div>
    </div>
  );
}
