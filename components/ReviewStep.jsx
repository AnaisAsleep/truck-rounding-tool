'use client';

import { useState } from 'react';
import { LU_REASON_CODES, ROOT_CAUSE_OPTIONS, calcFallbackUnit } from '../lib/rounding';

const DECISION_OPTIONS = [
  { value: 'cut', label: 'Accept Cut' },
  { value: 'keep', label: 'Force Keep' },
  { value: 'van', label: 'Book Van' },
  { value: '20ft', label: 'Book 20ft Container' },
];

export default function ReviewStep({ roundingResults, unmatchedRows, onConfirm, onBack }) {
  const { borderlineTrucks = [], cutTrucks = [], cutLines = [] } = roundingResults;
  const [decisions, setDecisions] = useState({});

  // Combine all reviewable cuts: borderline trucks + auto-cut trucks
  const reviewTrucks = [
    ...borderlineTrucks.map(t => ({ ...t, reviewType: 'borderline' })),
    ...cutTrucks.map(t => ({ ...t, reviewType: 'autocut' })),
  ];

  // Cut lines from pallet remainders (not from cut trucks — those are already in reviewTrucks)
  const remainderLines = cutLines.filter(cl =>
    !cl.cutReason?.includes('No Airtable match') &&
    !cutTrucks.some(t => t.lane === cl.lane && !cl.cutReason?.includes('pallet rounding'))
  );

  const setTruckDecision = (vsn, field, value) => {
    setDecisions(prev => ({
      ...prev,
      [vsn]: { ...prev[vsn], [field]: value },
    }));
  };

  const getTruckDecision = (vsn) => decisions[vsn] || { action: 'cut', luReason: null, rootCause: null };

  const isTruckComplete = (vsn) => {
    const d = getTruckDecision(vsn);
    if (d.action === 'cut') return true;
    if (d.action === 'keep') return !!d.luReason;
    if (d.action === 'van' || d.action === '20ft') return !!d.luReason;
    return false;
  };

  const allComplete = reviewTrucks.every(t => isTruckComplete(t.vendorShipmentNumber));
  const decidedCount = reviewTrucks.filter(t => isTruckComplete(t.vendorShipmentNumber)).length;

  const handleConfirm = () => {
    const truckDecisions = {};
    for (const truck of reviewTrucks) {
      truckDecisions[truck.vendorShipmentNumber] = getTruckDecision(truck.vendorShipmentNumber);
    }
    onConfirm(truckDecisions, remainderLines);
  };

  if (reviewTrucks.length === 0) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-[#403833] mb-2">No cuts to review</h2>
        <p className="text-[#8a7e78] mb-6">All trucks were confirmed automatically.</p>
        <button onClick={() => onConfirm({}, [])} className="px-6 py-2.5 bg-[#ffa236] text-white font-semibold rounded-lg hover:bg-[#e8922e] transition-colors">
          Continue to Results →
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-[#403833] mb-1">Review Cuts</h2>
        <p className="text-[#8a7e78]">Review all algorithmic cut decisions. You can accept, force-keep, or reroute to a smaller transport unit.</p>
      </div>

      <div className="flex items-center gap-3 mb-5">
        <span className="px-3 py-1 bg-[#403833] text-white rounded-full text-xs font-semibold">{reviewTrucks.length} trucks to review</span>
        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${decidedCount === reviewTrucks.length ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
          {decidedCount}/{reviewTrucks.length} decided
        </span>
      </div>

      <div className="space-y-3 mb-6">
        {reviewTrucks.map(truck => {
          const d = getTruckDecision(truck.vendorShipmentNumber);
          const fill = Math.round(truck.usedFraction * 100);
          const complete = isTruckComplete(truck.vendorShipmentNumber);
          const sampleLine = truck.lines?.[0];
          const fallback = sampleLine ? calcFallbackUnit(sampleLine.qty, sampleLine.pallets, sampleLine.palletData) : null;

          return (
            <div key={truck.vendorShipmentNumber} className={`bg-white border rounded-lg p-4 transition-colors ${!complete ? 'border-orange-200' : 'border-[#e8e0db]'}`}>
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="font-mono text-sm font-semibold text-[#403833]">{truck.vendorShipmentNumber}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${truck.reviewType === 'borderline' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>
                      {truck.reviewType === 'borderline' ? 'Borderline' : 'Auto-cut'}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${fill >= 80 ? 'bg-green-100 text-green-700' : fill >= 50 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>
                      {fill}% fill
                    </span>
                    {truck.costPerPiece != null && (
                      <span className="text-xs text-[#8a7e78]">€{truck.costPerPiece.toFixed(2)}/piece</span>
                    )}
                  </div>
                  <p className="text-sm text-[#8a7e78]">{truck.origin} → {truck.destination} · {truck.lines?.length} SKU{truck.lines?.length !== 1 ? 's' : ''}</p>
                  {truck.cutReason && <p className="text-xs text-red-500 mt-0.5">{truck.cutReason}</p>}
                </div>
              </div>

              {/* Decision selector */}
              <div className="flex flex-wrap gap-2 mb-3">
                {DECISION_OPTIONS.filter(opt => {
                  if (opt.value === 'van' && fallback !== 'Van') return false;
                  if (opt.value === '20ft' && fallback !== '20ft Container') return false;
                  return true;
                }).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setTruckDecision(truck.vendorShipmentNumber, 'action', opt.value)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
                      d.action === opt.value
                        ? opt.value === 'cut' ? 'bg-red-500 text-white border-red-500'
                        : opt.value === 'keep' ? 'bg-[#403833] text-white border-[#403833]'
                        : 'bg-orange-500 text-white border-orange-500'
                        : 'bg-white text-[#403833] border-[#e8e0db] hover:border-[#403833]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* LU Reason required for keep / van / 20ft */}
              {(d.action === 'keep' || d.action === 'van' || d.action === '20ft') && (
                <div className="mt-2">
                  <label className="block text-xs font-semibold text-[#403833] mb-1">
                    Low Usage reason code <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={d.luReason || ''}
                    onChange={e => setTruckDecision(truck.vendorShipmentNumber, 'luReason', e.target.value)}
                    className="w-full border border-[#e8e0db] rounded-md px-3 py-2 text-sm text-[#403833] focus:outline-none focus:ring-2 focus:ring-[#ffa236] bg-white"
                  >
                    <option value="">Select LU reason…</option>
                    {LU_REASON_CODES.map(r => (
                      <option key={r.code} value={r.code}>{r.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Root cause for cut decisions on borderline trucks */}
              {d.action === 'cut' && truck.reviewType === 'borderline' && (
                <div className="mt-2">
                  <label className="block text-xs font-semibold text-[#403833] mb-1">Cut reason (optional)</label>
                  <select
                    value={d.rootCause || ''}
                    onChange={e => setTruckDecision(truck.vendorShipmentNumber, 'rootCause', e.target.value)}
                    className="w-full border border-[#e8e0db] rounded-md px-3 py-2 text-sm text-[#403833] focus:outline-none focus:ring-2 focus:ring-[#ffa236] bg-white"
                  >
                    <option value="">Select reason…</option>
                    {ROOT_CAUSE_OPTIONS.map((r, i) => (
                      <option key={i} value={r}>{r}</option>
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
        <div className="flex items-center gap-3">
          {!allComplete && (
            <span className="text-sm text-orange-600">{reviewTrucks.length - decidedCount} truck{reviewTrucks.length - decidedCount !== 1 ? 's' : ''} pending decision</span>
          )}
          <button
            onClick={handleConfirm}
            disabled={!allComplete}
            className="px-6 py-2.5 bg-[#ffa236] text-white font-semibold rounded-lg hover:bg-[#e8922e] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Confirm Decisions →
          </button>
        </div>
      </div>
    </div>
  );
}
