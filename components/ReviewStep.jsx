'use client';

import { useState } from 'react';
import { LU_REASON_CODES, ROOT_CAUSE_OPTIONS, calcFallbackUnit } from '../lib/rounding';

const ACTIONS = [
  { value: 'cut',  label: 'Accept Cut' },
  { value: 'keep', label: 'Force Keep' },
  { value: '20ft', label: 'Book 20ft Container' },
];

function getAdjustedFill(truck, action, skuAdditions) {
  const palletData = truck.lines?.[0]?.palletData;
  const palletsPerTruck = palletData?.pallets_per_truck || 0;
  const pcsPerFtl = palletData?.pcs_per_ftl_container || 0;
  const isLoose = palletData?.loading_type?.toLowerCase().includes('loose');

  let totalAddedPallets = 0;
  let totalAddedPcs = 0;
  for (const add of Object.values(skuAdditions)) {
    totalAddedPallets += add.pallets || 0;
    totalAddedPcs += add.pcs || 0;
  }

  let fill = truck.usedFraction || 0;
  if (!isLoose && totalAddedPallets > 0 && palletsPerTruck > 0) {
    fill = Math.min(fill + totalAddedPallets / palletsPerTruck, 1);
  } else if (isLoose && totalAddedPcs > 0 && pcsPerFtl > 0) {
    fill = Math.min(fill + totalAddedPcs / pcsPerFtl, 1);
  }
  if (action === '20ft') fill = Math.min(fill / CONTAINER_20FT_RATIO, 1);
  return fill;
}

const CONTAINER_20FT_RATIO = 0.45;

export default function ReviewStep({ roundingResults, unmatchedRows = [], onConfirm, onBack }) {
  const { borderlineTrucks = [], cutTrucks = [], confirmedTrucks = [] } = roundingResults;

  const [truckDecisions, setTruckDecisions] = useState({});
  const [truckAdditions, setTruckAdditions] = useState({});  // { [vsn]: { [sku]: { pallets, pcs, inputValue } } }
  const [expandedTrucks, setExpandedTrucks] = useState({});

  const reviewTrucks = [
    ...borderlineTrucks.map(t => ({ ...t, reviewType: 'borderline' })),
    ...cutTrucks.map(t => ({ ...t, reviewType: 'autocut' })),
  ];

  const setTruckField = (vsn, field, value) =>
    setTruckDecisions(prev => ({ ...prev, [vsn]: { ...prev[vsn], [field]: value } }));
  const getTruck = (vsn) => truckDecisions[vsn] || { action: 'cut', luReason: null, rootCause: null };
  const isTruckDone = (vsn) => { const d = getTruck(vsn); return d.action === 'cut' || !!d.luReason; };
  const allTrucksDone = reviewTrucks.every(t => isTruckDone(t.vendorShipmentNumber));
  const trucksDecided = reviewTrucks.filter(t => isTruckDone(t.vendorShipmentNumber)).length;

  const toggleExpand = (vsn) =>
    setExpandedTrucks(prev => ({ ...prev, [vsn]: !prev[vsn] }));

  const getSkuAdd = (vsn, sku) => truckAdditions[vsn]?.[sku] || { pallets: 0, pcs: 0, inputValue: '' };

  const setSkuAdd = (vsn, sku, patch) =>
    setTruckAdditions(prev => ({
      ...prev,
      [vsn]: { ...prev[vsn], [sku]: { ...getSkuAdd(vsn, sku), ...patch } },
    }));

  const handleConfirm = () => onConfirm(truckDecisions, {}, truckAdditions);

  // Live avg fill: auto-confirmed trucks + review trucks with keep/20ft decisions
  const avgFillStats = (() => {
    let fillSum = confirmedTrucks.reduce((s, t) => s + (t.usedFraction || 0), 0);
    let count = confirmedTrucks.length;
    for (const t of reviewTrucks) {
      const d = getTruck(t.vendorShipmentNumber);
      if (d.action === 'keep' || d.action === '20ft') {
        fillSum += getAdjustedFill(t, d.action, truckAdditions[t.vendorShipmentNumber] || {});
        count++;
      }
    }
    return { avg: count > 0 ? fillSum / count : 0, total: count };
  })();

  if (reviewTrucks.length === 0) {
    return (
      <div className="max-w-xl py-12">
        <div className="w-12 h-12 bg-green-50 border border-green-200 rounded-full flex items-center justify-center mb-4">
          <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
          </svg>
        </div>
        <h2 className="text-xl font-bold text-[#403833] mb-2">All trucks confirmed</h2>
        <p className="text-[#8a7e78] mb-6">No cuts to review — rounding went cleanly.</p>
        <button onClick={() => onConfirm({}, {}, {})} className="px-6 py-2.5 bg-[#ffa236] text-white font-semibold text-sm rounded-lg hover:bg-[#e8922e] transition-colors">
          Continue to Results →
        </button>
      </div>
    );
  }

  const avgFillPct = Math.round(avgFillStats.avg * 100);
  const avgFillColor = avgFillPct >= 80 ? 'text-green-600' : avgFillPct >= 50 ? 'text-amber-500' : 'text-red-500';
  const avgFillBarColor = avgFillPct >= 80 ? 'bg-green-500' : avgFillPct >= 50 ? 'bg-amber-400' : 'bg-red-400';

  return (
    <div className="max-w-4xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#403833]">Review Cuts</h1>
          <p className="text-[#8a7e78] mt-1 text-sm">
            {reviewTrucks.length} truck decision{reviewTrucks.length !== 1 ? 's' : ''} · {trucksDecided}/{reviewTrucks.length} decided
          </p>
        </div>
        {/* Live avg fill stat */}
        <div className="bg-white border border-[#e8e0db] rounded-xl px-5 py-3 shadow-card min-w-[200px]">
          <p className="text-xs text-[#8a7e78] mb-1">Avg fill rate · {avgFillStats.total} trucks kept</p>
          <div className="flex items-center gap-3">
            <span className={`text-2xl font-bold tabular-nums ${avgFillColor}`}>{avgFillPct}%</span>
            <div className="flex-1 h-2 bg-[#f0ebe8] rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-300 ${avgFillBarColor}`} style={{ width: `${Math.min(avgFillPct, 100)}%` }} />
            </div>
          </div>
          <p className="text-xs text-[#c4b8b0] mt-1">Updates as you keep or cut trucks</p>
        </div>
      </div>

      <div className="bg-white border border-[#e8e0db] rounded-xl shadow-card overflow-hidden divide-y divide-[#f0ebe8]">
        {reviewTrucks.map(truck => {
          const vsn = truck.vendorShipmentNumber;
          const d = getTruck(vsn);
          const done = isTruckDone(vsn);
          const skuAdditions = truckAdditions[vsn] || {};
          const sampleLine = truck.lines?.[0];
          const fallback = sampleLine ? calcFallbackUnit(sampleLine.qty, sampleLine.pallets, sampleLine.palletData) : null;
          const isAutocut = truck.reviewType === 'autocut';
          const isExpanded = expandedTrucks[vsn];

          const adjustedFill = getAdjustedFill(truck, d.action, skuAdditions);
          const fillPct = Math.round(adjustedFill * 100);
          const fillColor = fillPct >= 80 ? 'text-green-600' : fillPct >= 50 ? 'text-amber-500' : 'text-red-500';
          const fillBarColor = fillPct >= 80 ? 'bg-green-500' : fillPct >= 50 ? 'bg-amber-400' : 'bg-red-400';

          return (
            <div key={vsn} className={`px-5 py-4 transition-colors ${!done ? 'bg-amber-50/30' : 'bg-white'}`}>

              {/* Header */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2 text-xs">
                <span className="font-mono font-semibold text-[#403833] text-sm">{vsn}</span>
                <span className="text-[#8a7e78]">{truck.origin} → {truck.destination}</span>
                <button
                  onClick={() => toggleExpand(vsn)}
                  className="flex items-center gap-1 text-[#8a7e78] hover:text-[#403833] transition-colors"
                >
                  <svg className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 2l4 4-4 4"/>
                  </svg>
                  {truck.lines?.length} SKU{truck.lines?.length !== 1 ? 's' : ''}
                  {truck.lines?.some(l => l.priority === 4) && (
                    <span className="ml-1 px-1 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-600">
                      +P4
                    </span>
                  )}
                </button>
                <span className={`font-semibold ${fillColor}`}>
                  {fillPct}%{d.action === '20ft' ? ' of 20ft' : ' fill'}
                </span>
                {truck.costPerPiece != null && d.action !== '20ft' && (
                  <span className="text-[#8a7e78]">€{truck.costPerPiece.toFixed(2)}/pc</span>
                )}
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${isAutocut ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>
                  {isAutocut ? 'Auto-cut' : 'Borderline'}
                </span>
              </div>

              {/* Fill bar */}
              <div className="w-full h-1.5 bg-[#f0ebe8] rounded-full mb-3">
                <div className={`h-1.5 rounded-full transition-all ${fillBarColor}`} style={{ width: `${Math.min(fillPct, 100)}%` }} />
              </div>

              {/* Reason + recommendation badge */}
              <div className="flex items-start justify-between gap-4 mb-3">
                <p className="text-xs text-[#8a7e78] flex-1">{truck.cutReason}</p>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded shrink-0 ${isAutocut ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>
                  ↳ {isAutocut ? 'Recommended: Accept Cut' : 'Review needed'}
                </span>
              </div>

              {/* Expandable SKU table with per-SKU quantity addition */}
              {isExpanded && truck.lines?.length > 0 && (
                <div className="mb-3 border border-[#e8e0db] rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-[#fafaf8] border-b border-[#e8e0db]">
                        <th className="text-left px-3 py-1.5 font-semibold text-[#8a7e78]">SKU</th>
                        <th className="text-left px-3 py-1.5 font-semibold text-[#8a7e78]">Supplier</th>
                        <th className="text-right px-3 py-1.5 font-semibold text-[#8a7e78]">Qty</th>
                        <th className="text-right px-3 py-1.5 font-semibold text-[#8a7e78]">Pallets</th>
                        <th className="text-center px-3 py-1.5 font-semibold text-[#8a7e78]">P</th>
                        <th className="text-center px-3 py-1.5 font-semibold text-[#8a7e78]">Add to truck</th>
                      </tr>
                    </thead>
                    <tbody>
                      {truck.lines.map((line, li) => {
                        const lineIsLoose = line.palletData?.loading_type?.toLowerCase().includes('loose');
                        const pcsPerPallet = line.palletData?.pcs_per_pallet || 0;
                        const add = getSkuAdd(vsn, line.sku);
                        const addedPcs = lineIsLoose ? add.pcs : add.pallets * pcsPerPallet;
                        const addedPallets = lineIsLoose ? 0 : add.pallets;

                        return (
                          <tr key={li} className={`border-t border-[#f0ebe8] ${li % 2 !== 0 ? 'bg-[#fafaf8]' : 'bg-white'}`}>
                            <td className="px-3 py-2 font-mono text-[#403833]">{line.sku}</td>
                            <td className="px-3 py-2 text-[#8a7e78] truncate max-w-[120px]">{line.supplierName || '—'}</td>
                            <td className="px-3 py-2 text-right text-[#403833]">
                              {line.qty?.toLocaleString()}
                              {addedPcs > 0 && (
                                <span className="text-green-600 ml-1">+{addedPcs.toLocaleString()}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right text-[#8a7e78]">
                              {line.pallets?.toFixed(1)}
                              {addedPallets > 0 && (
                                <span className="text-green-600 ml-1">+{addedPallets}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className={`text-xs font-semibold ${line.priority === 4 ? 'text-purple-600' : 'text-[#8a7e78]'}`}>
                                P{line.priority}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              {lineIsLoose ? (
                                <div className="flex items-center gap-1.5 justify-center">
                                  <input
                                    type="number"
                                    min="0"
                                    value={add.inputValue}
                                    onChange={e => {
                                      const pcs = parseInt(e.target.value) || 0;
                                      setSkuAdd(vsn, line.sku, { pcs, inputValue: e.target.value });
                                    }}
                                    placeholder="0"
                                    className="w-20 border border-[#e8e0db] rounded px-2 py-1 text-xs text-[#403833] focus:outline-none focus:ring-1 focus:ring-[#ffa236] bg-white text-right"
                                  />
                                  <span className="text-[#8a7e78]">pcs</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-0 justify-center border border-[#e8e0db] rounded-lg overflow-hidden w-fit mx-auto">
                                  <button
                                    onClick={() => setSkuAdd(vsn, line.sku, { pallets: Math.max(0, add.pallets - 1) })}
                                    disabled={add.pallets === 0}
                                    className="px-2 py-1 text-[#8a7e78] hover:bg-[#fafal8] disabled:opacity-30 transition-colors font-medium"
                                  >−</button>
                                  <span className="px-2.5 text-xs font-semibold text-[#403833] min-w-[1.5rem] text-center">{add.pallets}</span>
                                  <button
                                    onClick={() => setSkuAdd(vsn, line.sku, { pallets: add.pallets + 1 })}
                                    className="px-2 py-1 text-[#8a7e78] hover:bg-[#fafal8] transition-colors font-medium"
                                  >＋</button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {ACTIONS.filter(opt => {
                  if (opt.value === '20ft' && fallback !== '20ft Container') return false;
                  return true;
                }).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setTruckField(vsn, 'action', opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      d.action === opt.value
                        ? opt.value === 'cut' ? 'bg-red-500 text-white border-red-500' : 'bg-[#403833] text-white border-[#403833]'
                        : 'bg-white text-[#403833] border-[#e8e0db] hover:border-[#403833]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* LU reason */}
              {(d.action === 'keep' || d.action === '20ft') && (
                <select
                  value={d.luReason || ''}
                  onChange={e => setTruckField(vsn, 'luReason', e.target.value)}
                  className="w-full border border-[#e8e0db] rounded-lg px-3 py-2 text-sm text-[#403833] focus:outline-none focus:ring-2 focus:ring-[#ffa236] bg-white mb-2"
                >
                  <option value="">Low Usage reason code *</option>
                  {LU_REASON_CODES.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
                </select>
              )}

              {/* Root cause (borderline cuts) */}
              {d.action === 'cut' && !isAutocut && (
                <select
                  value={d.rootCause || ''}
                  onChange={e => setTruckField(vsn, 'rootCause', e.target.value)}
                  className="w-full border border-[#e8e0db] rounded-lg px-3 py-2 text-sm text-[#403833] focus:outline-none focus:ring-2 focus:ring-[#ffa236] bg-white"
                >
                  <option value="">Cut reason (optional)</option>
                  {ROOT_CAUSE_OPTIONS.map((r, i) => <option key={i} value={r}>{r}</option>)}
                </select>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-[#e8e0db]">
        <button onClick={onBack} className="px-4 py-2 text-[#403833] border border-[#e8e0db] rounded-lg text-sm font-medium hover:bg-[#fafal8] transition-colors">
          ← Back
        </button>
        <div className="flex items-center gap-3">
          {!allTrucksDone && (
            <span className="text-xs text-amber-600">
              {reviewTrucks.length - trucksDecided} truck{reviewTrucks.length - trucksDecided !== 1 ? 's' : ''} still need a decision
            </span>
          )}
          <button
            onClick={handleConfirm}
            disabled={!allTrucksDone}
            className="px-6 py-2.5 bg-[#ffa236] text-white font-semibold text-sm rounded-lg hover:bg-[#e8922e] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Confirm & Generate Results →
          </button>
        </div>
      </div>
    </div>
  );
}
