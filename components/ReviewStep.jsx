'use client';

import { useState } from 'react';
import { LU_REASON_CODES, ROOT_CAUSE_OPTIONS, calcFallbackUnit } from '../lib/rounding';

const ACTIONS = [
  { value: 'cut',  label: 'Accept Cut' },
  { value: 'keep', label: 'Force Keep' },
  { value: 'van',  label: 'Book Van' },
  { value: '20ft', label: 'Book 20ft Container' },
];

// Fill in a 20ft = fill in 40ft ÷ 0.45 (a 20ft holds ~45% of a 40ft)
const CONTAINER_20FT_RATIO = 0.45;

function getAdjustedFill(truck, action, additions) {
  const palletData = truck.lines?.[0]?.palletData;
  const palletsPerTruck = palletData?.pallets_per_truck || 0;
  const pcsPerFtl = palletData?.pcs_per_ftl_container || 0;
  const isLoose = palletData?.loading_type?.toLowerCase().includes('loose');

  let fill = truck.usedFraction || 0;

  if (additions?.pallets > 0 && palletsPerTruck > 0 && !isLoose) {
    fill = Math.min(fill + additions.pallets / palletsPerTruck, 1);
  } else if (additions?.loosePcs > 0 && pcsPerFtl > 0 && isLoose) {
    fill = Math.min(fill + additions.loosePcs / pcsPerFtl, 1);
  }

  if (action === '20ft') {
    fill = Math.min(fill / CONTAINER_20FT_RATIO, 1);
  }

  return fill;
}

export default function ReviewStep({ roundingResults, unmatchedRows = [], onConfirm, onBack }) {
  const { borderlineTrucks = [], cutTrucks = [] } = roundingResults;

  const [truckDecisions, setTruckDecisions] = useState({});
  const [truckAdditions, setTruckAdditions] = useState({});
  const [expandedTrucks, setExpandedTrucks] = useState({});

  const reviewTrucks = [
    ...borderlineTrucks.map(t => ({ ...t, reviewType: 'borderline' })),
    ...cutTrucks.map(t => ({ ...t, reviewType: 'autocut' })),
  ];

  const setTruckField = (vsn, field, value) =>
    setTruckDecisions(prev => ({ ...prev, [vsn]: { ...prev[vsn], [field]: value } }));
  const getTruck = (vsn) => truckDecisions[vsn] || { action: 'cut', luReason: null, rootCause: null };
  const isTruckDone = (vsn) => {
    const d = getTruck(vsn);
    return d.action === 'cut' || !!d.luReason;
  };
  const allTrucksDone = reviewTrucks.every(t => isTruckDone(t.vendorShipmentNumber));
  const trucksDecided = reviewTrucks.filter(t => isTruckDone(t.vendorShipmentNumber)).length;

  const toggleExpand = (vsn) =>
    setExpandedTrucks(prev => ({ ...prev, [vsn]: !prev[vsn] }));

  const getAdditions = (vsn) => truckAdditions[vsn] || { pallets: 0, loosePcs: 0, looseInput: '' };

  const addPallet = (vsn) => {
    setTruckAdditions(prev => {
      const curr = prev[vsn] || { pallets: 0, loosePcs: 0, looseInput: '' };
      return { ...prev, [vsn]: { ...curr, pallets: curr.pallets + 1 } };
    });
  };

  const removePallet = (vsn) => {
    setTruckAdditions(prev => {
      const curr = prev[vsn] || { pallets: 0, loosePcs: 0, looseInput: '' };
      const pallets = Math.max(0, curr.pallets - 1);
      return { ...prev, [vsn]: { ...curr, pallets } };
    });
  };

  const setLooseInput = (vsn, value) => {
    const loosePcs = parseInt(value) || 0;
    setTruckAdditions(prev => ({
      ...prev, [vsn]: { ...prev[vsn] || {}, loosePcs, looseInput: value }
    }));
  };

  const handleConfirm = () => onConfirm(truckDecisions, {});

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
        <button
          onClick={() => onConfirm({}, {})}
          className="px-6 py-2.5 bg-[#ffa236] text-white font-semibold text-sm rounded-lg hover:bg-[#e8922e] transition-colors"
        >
          Continue to Results →
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-8">

      <div>
        <h1 className="text-2xl font-bold text-[#403833]">Review Cuts</h1>
        <p className="text-[#8a7e78] mt-1 text-sm">
          {reviewTrucks.length} truck decision{reviewTrucks.length !== 1 ? 's' : ''} · {trucksDecided}/{reviewTrucks.length} decided
        </p>
      </div>

      <div className="bg-white border border-[#e8e0db] rounded-xl shadow-card overflow-hidden divide-y divide-[#f0ebe8]">
        {reviewTrucks.map(truck => {
          const vsn = truck.vendorShipmentNumber;
          const d = getTruck(vsn);
          const additions = getAdditions(vsn);
          const done = isTruckDone(vsn);
          const sampleLine = truck.lines?.[0];
          const palletData = sampleLine?.palletData;
          const isLoose = palletData?.loading_type?.toLowerCase().includes('loose');
          const pcsPerPallet = palletData?.pcs_per_pallet || 0;
          const palletsPerTruck = palletData?.pallets_per_truck || 0;
          const fallback = sampleLine ? calcFallbackUnit(sampleLine.qty, sampleLine.pallets, palletData) : null;

          const adjustedFill = getAdjustedFill(truck, d.action, additions);
          const fillPct = Math.round(adjustedFill * 100);
          const fillColor = fillPct >= 80 ? 'text-green-600' : fillPct >= 50 ? 'text-amber-500' : 'text-red-500';
          const fillBarColor = fillPct >= 80 ? 'bg-green-500' : fillPct >= 50 ? 'bg-amber-400' : 'bg-red-400';

          const isAutocut = truck.reviewType === 'autocut';
          const recommendation = isAutocut ? 'Accept Cut' : 'Review needed';

          return (
            <div
              key={vsn}
              className={`px-5 py-4 transition-colors ${!done ? 'bg-amber-50/30' : 'bg-white'}`}
            >
              {/* Header */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2 text-xs">
                <span className="font-mono font-semibold text-[#403833] text-sm">{vsn}</span>
                <span className="text-[#8a7e78]">{truck.origin} → {truck.destination}</span>
                <button
                  onClick={() => toggleExpand(vsn)}
                  className="flex items-center gap-1 text-[#8a7e78] hover:text-[#403833] transition-colors"
                >
                  <svg className={`w-3 h-3 transition-transform ${expandedTrucks[vsn] ? 'rotate-90' : ''}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 2l4 4-4 4"/>
                  </svg>
                  {truck.lines?.length} SKU{truck.lines?.length !== 1 ? 's' : ''}
                </button>
                <span className={`font-semibold ${fillColor}`}>
                  {fillPct}%{d.action === '20ft' ? ' of 20ft' : ' fill'}
                </span>
                {truck.costPerPiece != null && d.action !== '20ft' && (
                  <span className="text-[#8a7e78]">€{truck.costPerPiece.toFixed(2)}/pc</span>
                )}
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${
                  isAutocut ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'
                }`}>
                  {isAutocut ? 'Auto-cut' : 'Borderline'}
                </span>
              </div>

              {/* Fill bar */}
              <div className="w-full h-1.5 bg-[#f0ebe8] rounded-full mb-3">
                <div
                  className={`h-1.5 rounded-full transition-all ${fillBarColor}`}
                  style={{ width: `${Math.min(fillPct, 100)}%` }}
                />
              </div>

              {/* Reason + recommendation */}
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="text-xs text-[#8a7e78] flex-1">
                  {truck.cutReason && <p>{truck.cutReason}</p>}
                </div>
                <div className={`text-xs font-semibold px-2 py-0.5 rounded shrink-0 ${
                  isAutocut ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'
                }`}>
                  ↳ {recommendation}
                </div>
              </div>

              {/* Expandable SKU table */}
              {expandedTrucks[vsn] && truck.lines?.length > 0 && (
                <div className="mb-3 border border-[#e8e0db] rounded-lg overflow-hidden">
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
                          <td className="px-3 py-1.5 text-[#8a7e78] truncate max-w-[160px]">{line.supplierName || '—'}</td>
                          <td className="px-3 py-1.5 text-right text-[#403833]">{line.qty?.toLocaleString()}</td>
                          <td className="px-3 py-1.5 text-right text-[#8a7e78]">{line.pallets?.toFixed(1)}</td>
                          <td className="px-3 py-1.5 text-center text-[#8a7e78]">P{line.priority}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {ACTIONS.filter(opt => {
                  if (opt.value === 'van' && fallback !== 'Van') return false;
                  if (opt.value === '20ft' && fallback !== '20ft Container') return false;
                  return true;
                }).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setTruckField(vsn, 'action', opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      d.action === opt.value
                        ? opt.value === 'cut'
                          ? 'bg-red-500 text-white border-red-500'
                          : 'bg-[#403833] text-white border-[#403833]'
                        : 'bg-white text-[#403833] border-[#e8e0db] hover:border-[#403833]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* LU reason */}
              {(d.action === 'keep' || d.action === 'van' || d.action === '20ft') && (
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
                  className="w-full border border-[#e8e0db] rounded-lg px-3 py-2 text-sm text-[#403833] focus:outline-none focus:ring-2 focus:ring-[#ffa236] bg-white mb-2"
                >
                  <option value="">Cut reason (optional)</option>
                  {ROOT_CAUSE_OPTIONS.map((r, i) => <option key={i} value={r}>{r}</option>)}
                </select>
              )}

              {/* Add quantities */}
              <div className="pt-3 mt-1 border-t border-[#f0ebe8]">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#c4b8b0] mb-2">Add quantities to truck</p>
                {isLoose ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      value={additions.looseInput}
                      onChange={e => setLooseInput(vsn, e.target.value)}
                      placeholder="0"
                      className="w-28 border border-[#e8e0db] rounded-lg px-3 py-1.5 text-xs text-[#403833] focus:outline-none focus:ring-1 focus:ring-[#ffa236] bg-white"
                    />
                    <span className="text-xs text-[#8a7e78]">pieces (loose)</span>
                    {additions.loosePcs > 0 && (
                      <span className="text-xs text-green-600 font-medium">+{additions.loosePcs.toLocaleString()} pcs → {fillPct}% fill</span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center border border-[#e8e0db] rounded-lg overflow-hidden">
                      <button
                        onClick={() => removePallet(vsn)}
                        disabled={additions.pallets === 0}
                        className="px-2.5 py-1.5 text-[#8a7e78] hover:bg-[#fafaf8] disabled:opacity-30 transition-colors text-sm font-medium"
                      >−</button>
                      <span className="px-3 text-xs font-semibold text-[#403833] min-w-[2rem] text-center">
                        {additions.pallets}
                      </span>
                      <button
                        onClick={() => addPallet(vsn)}
                        className="px-2.5 py-1.5 text-[#8a7e78] hover:bg-[#fafal8] transition-colors text-sm font-medium"
                      >＋</button>
                    </div>
                    <span className="text-xs text-[#8a7e78]">
                      pallet{additions.pallets !== 1 ? 's' : ''}
                      {pcsPerPallet > 0 && ` · ${pcsPerPallet.toLocaleString()} pcs each`}
                    </span>
                    {additions.pallets > 0 && (
                      <span className="text-xs text-green-600 font-medium">
                        +{(additions.pallets * pcsPerPallet).toLocaleString()} pcs → {fillPct}%{d.action === '20ft' ? ' of 20ft' : ''}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-[#e8e0db]">
        <button
          onClick={onBack}
          className="px-4 py-2 text-[#403833] border border-[#e8e0db] rounded-lg text-sm font-medium hover:bg-[#fafal8] transition-colors"
        >
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
