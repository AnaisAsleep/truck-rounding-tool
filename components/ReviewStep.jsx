'use client';

import { useState } from 'react';
import { LU_REASON_CODES, ROOT_CAUSE_OPTIONS, calcFallbackUnit } from '../lib/rounding';

const ACTIONS = [
  { value: 'cut',  label: 'Accept Cut' },
  { value: 'keep', label: 'Force Keep' },
  { value: 'van',  label: 'Book Van' },
  { value: '20ft', label: 'Book 20ft' },
];

function cutLineKey(line) {
  return `${line.sku}|${line.originLocationCode}|${line.destinationLocation}|${String(line.priority)}|${String(line.cutReason).slice(0, 30)}`;
}

export default function ReviewStep({ roundingResults, unmatchedRows = [], onConfirm, onBack }) {
  const { borderlineTrucks = [], cutTrucks = [], cutLines = [] } = roundingResults;

  const [truckDecisions, setTruckDecisions] = useState({});
  const [lineNotes, setLineNotes] = useState({});

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

  const UNMATCHED_REASON = 'No Airtable match — SKU not in palletization table';
  const nonTruckCutLines = cutLines.filter(cl =>
    !cutTrucks.some(t => t.lane === cl.lane && cl.cutReason === t.cutReason)
  );
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

  if (reviewTrucks.length === 0 && allCutLines.length === 0) {
    return (
      <div className="max-w-xl py-12">
        <p className="text-sm font-medium text-stone-800 mb-1">No cuts to review</p>
        <p className="text-sm text-stone-400 mb-6">All trucks were confirmed automatically.</p>
        <button
          onClick={() => onConfirm({}, {})}
          className="px-5 py-2 bg-orange-500 text-white text-sm font-medium rounded hover:bg-orange-600 transition-colors"
        >
          Continue to Results →
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-8">

      <div className="border-b border-stone-200 pb-4">
        <h1 className="text-xl font-semibold text-stone-900">Review Cuts</h1>
        <p className="text-sm text-stone-400 mt-0.5">
          {reviewTrucks.length > 0 && `${reviewTrucks.length} truck decision${reviewTrucks.length !== 1 ? 's' : ''}`}
          {reviewTrucks.length > 0 && allCutLines.length > 0 && ' · '}
          {allCutLines.length > 0 && `${allCutLines.length} cut line${allCutLines.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* ── Truck decisions ──────────────────────────────────────────── */}
      {reviewTrucks.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-stone-400">Truck Decisions</p>
            <p className="text-xs text-stone-400">{trucksDecided}/{reviewTrucks.length} decided</p>
          </div>

          <div className="border border-stone-200 rounded-lg overflow-hidden divide-y divide-stone-100">
            {reviewTrucks.map(truck => {
              const d      = getTruck(truck.vendorShipmentNumber);
              const fill   = Math.round(truck.usedFraction * 100);
              const done   = isTruckDone(truck.vendorShipmentNumber);
              const sampleLine = truck.lines?.[0];
              const fallback   = sampleLine
                ? calcFallbackUnit(sampleLine.qty, sampleLine.pallets, sampleLine.palletData)
                : null;

              return (
                <div key={truck.vendorShipmentNumber} className={`px-4 py-3.5 bg-white ${!done ? 'border-l-2 border-l-amber-400' : ''}`}>
                  {/* Header row */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mb-2 text-xs">
                    <span className="font-mono font-semibold text-stone-800 text-sm">{truck.vendorShipmentNumber}</span>
                    <span className="text-stone-400">{truck.origin} → {truck.destination}</span>
                    <span className="text-stone-400">{truck.lines?.length} SKU{truck.lines?.length !== 1 ? 's' : ''}</span>
                    <span className={fill >= 80 ? 'text-green-600 font-medium' : fill >= 50 ? 'text-amber-500 font-medium' : 'text-red-500 font-medium'}>
                      {fill}%
                    </span>
                    {truck.costPerPiece != null && (
                      <span className="text-stone-400">€{truck.costPerPiece.toFixed(2)}/pc</span>
                    )}
                    <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                      truck.reviewType === 'borderline' ? 'text-amber-500' : 'text-red-400'
                    }`}>
                      {truck.reviewType === 'borderline' ? 'Borderline' : 'Auto-cut'}
                    </span>
                  </div>

                  {truck.cutReason && (
                    <p className="text-xs text-stone-400 mb-2.5">{truck.cutReason}</p>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-1.5 mb-2.5">
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
                              ? 'bg-red-500 text-white border-red-500'
                              : 'bg-stone-800 text-white border-stone-800'
                            : 'bg-white text-stone-600 border-stone-200 hover:border-stone-500'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {(d.action === 'keep' || d.action === 'van' || d.action === '20ft') && (
                    <select
                      value={d.luReason || ''}
                      onChange={e => setTruckField(truck.vendorShipmentNumber, 'luReason', e.target.value)}
                      className="w-full border border-stone-200 rounded px-3 py-1.5 text-xs text-stone-800 focus:outline-none focus:ring-1 focus:ring-orange-400 bg-white"
                    >
                      <option value="">Low Usage reason code *</option>
                      {LU_REASON_CODES.map(r => (
                        <option key={r.code} value={r.code}>{r.label}</option>
                      ))}
                    </select>
                  )}

                  {d.action === 'cut' && truck.reviewType === 'borderline' && (
                    <select
                      value={d.rootCause || ''}
                      onChange={e => setTruckField(truck.vendorShipmentNumber, 'rootCause', e.target.value)}
                      className="w-full border border-stone-200 rounded px-3 py-1.5 text-xs text-stone-800 focus:outline-none focus:ring-1 focus:ring-orange-400 bg-white mt-1.5"
                    >
                      <option value="">Cut reason (optional)</option>
                      {ROOT_CAUSE_OPTIONS.map((r, i) => <option key={i} value={r}>{r}</option>)}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Cut lines ─────────────────────────────────────────────────── */}
      {allCutLines.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-stone-400">
              Cut Lines ({allCutLines.length})
            </p>
            <p className="text-xs text-stone-400">Notes exported to Cut Lines file</p>
          </div>

          <div className="border border-stone-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200">
                  <th className="text-left px-3 py-2 font-medium text-stone-500">SKU</th>
                  <th className="text-left px-3 py-2 font-medium text-stone-500">Route</th>
                  <th className="text-right px-3 py-2 font-medium text-stone-500">Qty</th>
                  <th className="text-center px-3 py-2 font-medium text-stone-500">P</th>
                  <th className="text-left px-3 py-2 font-medium text-stone-500">Reason</th>
                  <th className="text-left px-3 py-2 font-medium text-stone-500 w-44">Note</th>
                </tr>
              </thead>
              <tbody>
                {allCutLines.map((line, idx) => (
                  <tr key={idx} className={`border-t border-stone-100 ${idx % 2 !== 0 ? 'bg-stone-50/50' : 'bg-white'}`}>
                    <td className="px-3 py-2 font-mono text-stone-800">{line.sku}</td>
                    <td className="px-3 py-2 text-stone-500 whitespace-nowrap">{line.originLocationCode} → {line.destinationLocation}</td>
                    <td className="px-3 py-2 text-right text-stone-700">{line.originalQty?.toLocaleString()}</td>
                    <td className="px-3 py-2 text-center text-stone-500">P{line.priority}</td>
                    <td className="px-3 py-2 text-stone-400 max-w-[200px]">
                      <span className="block truncate" title={line.cutReason}>{line.cutReason}</span>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={getLineNote(line)}
                        onChange={e => updateLineNote(line, e.target.value)}
                        placeholder="Add note…"
                        className="w-full border border-stone-200 rounded px-2 py-1 text-xs text-stone-800 placeholder-stone-300 focus:outline-none focus:ring-1 focus:ring-orange-400 bg-white"
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
      <div className="flex items-center justify-between pt-2 border-t border-stone-200">
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm text-stone-600 border border-stone-200 rounded hover:bg-stone-50 transition-colors"
        >
          ← Back
        </button>
        <div className="flex items-center gap-3">
          {!allTrucksDone && (
            <span className="text-xs text-amber-500">
              {reviewTrucks.length - trucksDecided} truck{reviewTrucks.length - trucksDecided !== 1 ? 's' : ''} need a decision
            </span>
          )}
          <button
            onClick={handleConfirm}
            disabled={!allTrucksDone}
            className="px-5 py-2 bg-orange-500 text-white text-sm font-medium rounded hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Confirm & Generate Results →
          </button>
        </div>
      </div>
    </div>
  );
}
