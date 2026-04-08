'use client';

import { useState } from 'react';
import { LU_REASON_CODES, ROOT_CAUSE_OPTIONS, calcFallbackUnit } from '../lib/rounding';

const ACTIONS = [
  { value: 'cut',  label: 'Accept Cut' },
  { value: 'keep', label: 'Force Keep' },
  { value: 'van',  label: 'Book Van' },
  { value: '20ft', label: 'Book 20ft' },
];

/** Stable key used to match a cut line in both ReviewStep and finalizeResults */
function cutLineKey(line) {
  return `${line.sku}|${line.originLocationCode}|${line.destinationLocation}|${String(line.priority)}|${String(line.cutReason).slice(0, 30)}`;
}

export default function ReviewStep({ roundingResults, unmatchedRows = [], onConfirm, onBack }) {
  const { borderlineTrucks = [], cutTrucks = [], cutLines = [] } = roundingResults;

  // ─── Truck decisions ──────────────────────────────────────────────────
  const [truckDecisions, setTruckDecisions] = useState({});

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

  // ─── Cut line notes ───────────────────────────────────────────────────
  const [lineNotes, setLineNotes] = useState({});

  // Remainder/eliminated lines that aren't part of a cut truck
  const nonTruckCutLines = cutLines.filter(cl =>
    !cutTrucks.some(t => t.lane === cl.lane && cl.cutReason === t.cutReason)
  );

  // Unmatched rows normalised to cut-line shape
  const UNMATCHED_REASON = 'No Airtable match — SKU not in palletization table';
  const unmatchedLines = unmatchedRows.map(r => ({
    originLocationCode: r.originLocationCode,
    supplierName: r.supplierName || '',
    destinationLocation: r.destinationLocation,
    sku: r.sku,
    originalQty: (r.prio1 || 0) + (r.prio2 || 0) + (r.prio3 || 0) + (r.prio4 || 0),
    priority: r.prio1 > 0 ? 1 : r.prio2 > 0 ? 2 : r.prio3 > 0 ? 3 : 4,
    lane: r.lane || '',
    cutReason: UNMATCHED_REASON,
    fallbackUnit: null,
  }));

  const allCutLines = [...nonTruckCutLines, ...unmatchedLines];

  const getLineNote = (line) => lineNotes[cutLineKey(line)]?.note || '';
  const updateLineNote = (line, note) =>
    setLineNotes(prev => ({ ...prev, [cutLineKey(line)]: { note } }));

  const handleConfirm = () => onConfirm(truckDecisions, lineNotes);

  // Auto-skip if nothing to review
  if (reviewTrucks.length === 0 && allCutLines.length === 0) {
    return (
      <div className="max-w-xl mx-auto text-center py-16">
        <div className="w-10 h-10 bg-green-50 border border-green-200 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-sm font-medium text-[#403833] mb-1">All trucks confirmed</p>
        <p className="text-sm text-[#8a7e78] mb-6">No cuts to review — rounding went cleanly.</p>
        <button
          onClick={() => onConfirm({}, {})}
          className="px-5 py-2 bg-[#ffa236] text-white text-sm font-semibold rounded-md hover:bg-[#e8922e] transition-colors"
        >
          Continue to Results →
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">

      {/* Page header */}
      <div className="border-b border-[#e8e0db] pb-4">
        <h2 className="text-lg font-semibold text-[#403833]">Review Cuts</h2>
        <p className="text-sm text-[#8a7e78] mt-0.5">
          {reviewTrucks.length > 0 && `${reviewTrucks.length} truck decision${reviewTrucks.length !== 1 ? 's' : ''}`}
          {reviewTrucks.length > 0 && allCutLines.length > 0 && ' · '}
          {allCutLines.length > 0 && `${allCutLines.length} individual cut line${allCutLines.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* ── Section 1: Truck decisions ──────────────────────────────── */}
      {reviewTrucks.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#8a7e78]">Truck Decisions</p>
            <p className="text-xs text-[#8a7e78]">{trucksDecided}/{reviewTrucks.length} decided</p>
          </div>

          <div className="space-y-2">
            {reviewTrucks.map(truck => {
              const d = getTruck(truck.vendorShipmentNumber);
              const fill = Math.round(truck.usedFraction * 100);
              const done = isTruckDone(truck.vendorShipmentNumber);
              const sampleLine = truck.lines?.[0];
              const fallback = sampleLine
                ? calcFallbackUnit(sampleLine.qty, sampleLine.pallets, sampleLine.palletData)
                : null;

              return (
                <div
                  key={truck.vendorShipmentNumber}
                  className={`bg-white border rounded-lg p-4 ${!done ? 'border-orange-200' : 'border-[#e8e0db]'}`}
                >
                  {/* Truck summary row */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2.5 text-xs">
                    <span className="font-mono font-medium text-[#403833] text-sm">
                      {truck.vendorShipmentNumber}
                    </span>
                    <span className="text-[#8a7e78]">{truck.origin} → {truck.destination}</span>
                    <span className="text-[#8a7e78]">{truck.lines?.length} SKU{truck.lines?.length !== 1 ? 's' : ''}</span>
                    <span className={
                      fill >= 80 ? 'text-green-600 font-medium' :
                      fill >= 50 ? 'text-orange-500 font-medium' :
                      'text-red-500 font-medium'
                    }>{fill}% fill</span>
                    {truck.costPerPiece != null && (
                      <span className="text-[#8a7e78]">€{truck.costPerPiece.toFixed(2)}/pc</span>
                    )}
                    <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wide ${
                      truck.reviewType === 'borderline'
                        ? 'bg-orange-50 text-orange-600 border-orange-200'
                        : 'bg-red-50 text-red-500 border-red-200'
                    }`}>
                      {truck.reviewType === 'borderline' ? 'Borderline' : 'Auto-cut'}
                    </span>
                  </div>

                  {truck.cutReason && (
                    <p className="text-xs text-[#8a7e78] mb-3">{truck.cutReason}</p>
                  )}

                  {/* Decision buttons */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {ACTIONS.filter(opt => {
                      if (opt.value === 'van' && fallback !== 'Van') return false;
                      if (opt.value === '20ft' && fallback !== '20ft Container') return false;
                      return true;
                    }).map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setTruckField(truck.vendorShipmentNumber, 'action', opt.value)}
                        className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                          d.action === opt.value
                            ? opt.value === 'cut'
                              ? 'bg-[#f44336] text-white border-[#f44336]'
                              : 'bg-[#403833] text-white border-[#403833]'
                            : 'bg-white text-[#403833] border-[#e8e0db] hover:border-[#403833]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {/* LU reason (required for keep / van / 20ft) */}
                  {(d.action === 'keep' || d.action === 'van' || d.action === '20ft') && (
                    <select
                      value={d.luReason || ''}
                      onChange={e => setTruckField(truck.vendorShipmentNumber, 'luReason', e.target.value)}
                      className="w-full border border-[#e8e0db] rounded px-3 py-1.5 text-sm text-[#403833] focus:outline-none focus:ring-1 focus:ring-[#ffa236] bg-white"
                    >
                      <option value="">Low Usage reason code *</option>
                      {LU_REASON_CODES.map(r => (
                        <option key={r.code} value={r.code}>{r.label}</option>
                      ))}
                    </select>
                  )}

                  {/* Optional root cause for borderline cuts */}
                  {d.action === 'cut' && truck.reviewType === 'borderline' && (
                    <select
                      value={d.rootCause || ''}
                      onChange={e => setTruckField(truck.vendorShipmentNumber, 'rootCause', e.target.value)}
                      className="w-full border border-[#e8e0db] rounded px-3 py-1.5 text-sm text-[#403833] focus:outline-none focus:ring-1 focus:ring-[#ffa236] bg-white mt-1.5"
                    >
                      <option value="">Cut reason (optional)</option>
                      {ROOT_CAUSE_OPTIONS.map((r, i) => (
                        <option key={i} value={r}>{r}</option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Section 2: Individual cut lines ─────────────────────────── */}
      {allCutLines.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#8a7e78]">
              Cut Lines <span className="font-normal normal-case tracking-normal">({allCutLines.length})</span>
            </p>
            <p className="text-xs text-[#8a7e78]">Notes are exported to the Cut Lines file</p>
          </div>

          <div className="bg-white border border-[#e8e0db] rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#e8e0db]">
                  <th className="text-left px-3 py-2.5 font-medium text-[#8a7e78] bg-[#fafafa]">SKU</th>
                  <th className="text-left px-3 py-2.5 font-medium text-[#8a7e78] bg-[#fafafa]">Route</th>
                  <th className="text-right px-3 py-2.5 font-medium text-[#8a7e78] bg-[#fafafa]">Qty</th>
                  <th className="text-center px-3 py-2.5 font-medium text-[#8a7e78] bg-[#fafafa]">P</th>
                  <th className="text-left px-3 py-2.5 font-medium text-[#8a7e78] bg-[#fafafa]">Reason</th>
                  <th className="text-left px-3 py-2.5 font-medium text-[#8a7e78] bg-[#fafafa] w-48">Note</th>
                </tr>
              </thead>
              <tbody>
                {allCutLines.map((line, idx) => (
                  <tr
                    key={idx}
                    className={`border-b border-[#e8e0db] last:border-0 ${idx % 2 !== 0 ? 'bg-[#fafafa]' : 'bg-white'}`}
                  >
                    <td className="px-3 py-2 font-mono text-[#403833]">{line.sku}</td>
                    <td className="px-3 py-2 text-[#8a7e78] whitespace-nowrap">
                      {line.originLocationCode} → {line.destinationLocation}
                    </td>
                    <td className="px-3 py-2 text-right text-[#403833]">
                      {line.originalQty?.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-center text-[#8a7e78]">P{line.priority}</td>
                    <td className="px-3 py-2 text-[#8a7e78] max-w-[220px]">
                      <span className="block truncate" title={line.cutReason}>{line.cutReason}</span>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={getLineNote(line)}
                        onChange={e => updateLineNote(line, e.target.value)}
                        placeholder="Add note…"
                        className="w-full border border-[#e8e0db] rounded px-2 py-1 text-xs text-[#403833] placeholder-[#c4b8b0] focus:outline-none focus:ring-1 focus:ring-[#ffa236] bg-white"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-[#e8e0db]">
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm text-[#403833] border border-[#e8e0db] rounded-md hover:bg-[#fafafa] transition-colors"
        >
          ← Back
        </button>
        <div className="flex items-center gap-3">
          {!allTrucksDone && (
            <span className="text-xs text-orange-500">
              {reviewTrucks.length - trucksDecided} truck{reviewTrucks.length - trucksDecided !== 1 ? 's' : ''} still need a decision
            </span>
          )}
          <button
            onClick={handleConfirm}
            disabled={!allTrucksDone}
            className="px-5 py-2 bg-[#ffa236] text-white text-sm font-semibold rounded-md hover:bg-[#e8922e] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Confirm & Generate Results →
          </button>
        </div>
      </div>
    </div>
  );
}
