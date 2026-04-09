'use client';

import { useState } from 'react';
import { LU_REASON_CODES, ROOT_CAUSE_OPTIONS, calcFallbackUnit } from '../lib/rounding';

const ACTIONS = [
  { value: 'cut',  label: 'Accept Cut' },
  { value: 'keep', label: 'Force Keep' },
  { value: 'van',  label: 'Book Van' },
  { value: '20ft', label: 'Book 20ft Container' },
];

function cutLineKey(line) {
  return `${line.sku}|${line.originLocationCode}|${line.destinationLocation}|${String(line.priority)}|${String(line.cutReason).slice(0, 30)}`;
}

export default function ReviewStep({ roundingResults, unmatchedRows = [], onConfirm, onBack }) {
  const { borderlineTrucks = [], cutTrucks = [], cutLines = [] } = roundingResults;

  const [truckDecisions, setTruckDecisions] = useState({});
  const [lineNotes, setLineNotes] = useState({});
  const [expandedTrucks, setExpandedTrucks] = useState({});
  const toggleExpand = (vsn) => setExpandedTrucks(prev => ({ ...prev, [vsn]: !prev[vsn] }));

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
          {reviewTrucks.length > 0 && `${reviewTrucks.length} truck decision${reviewTrucks.length !== 1 ? 's' : ''}`}
          {reviewTrucks.length > 0 && allCutLines.length > 0 && ' · '}
          {allCutLines.length > 0 && `${allCutLines.length} individual cut line${allCutLines.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* ── Truck decisions ─────────────────────────────────────────── */}
      {reviewTrucks.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[#8a7e78]">Truck Decisions</h2>
            <span className="text-xs text-[#8a7e78]">{trucksDecided}/{reviewTrucks.length} decided</span>
          </div>

          <div className="bg-white border border-[#e8e0db] rounded-xl shadow-card overflow-hidden divide-y divide-[#f0ebe8]">
            {reviewTrucks.map(truck => {
              const d      = getTruck(truck.vendorShipmentNumber);
              const fill   = Math.round(truck.usedFraction * 100);
              const done   = isTruckDone(truck.vendorShipmentNumber);
              const sampleLine = truck.lines?.[0];
              const fallback   = sampleLine
                ? calcFallbackUnit(sampleLine.qty, sampleLine.pallets, sampleLine.palletData)
                : null;

              return (
                <div
                  key={truck.vendorShipmentNumber}
                  className={`px-5 py-4 transition-colors ${!done ? 'bg-amber-50/30' : 'bg-white'}`}
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1.5 text-xs">
                    <span className="font-mono font-semibold text-[#403833] text-sm">{truck.vendorShipmentNumber}</span>
                    <span className="text-[#8a7e78]">{truck.origin} → {truck.destination}</span>
                    <button
                      onClick={() => toggleExpand(truck.vendorShipmentNumber)}
                      className="flex items-center gap-1 text-[#8a7e78] hover:text-[#403833] transition-colors"
                    >
                      <svg
                        className={`w-3 h-3 transition-transform ${expandedTrucks[truck.vendorShipmentNumber] ? 'rotate-90' : ''}`}
                        viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                      >
                        <path d="M4 2l4 4-4 4"/>
                      </svg>
                      {truck.lines?.length} SKU{truck.lines?.length !== 1 ? 's' : ''}
                    </button>
                    <span className={`font-medium ${fill >= 80 ? 'text-green-600' : fill >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                      {fill}% fill
                    </span>
                    {truck.costPerPiece != null && (
                      <span className="text-[#8a7e78]">€{truck.costPerPiece.toFixed(2)}/pc</span>
                    )}
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${
                      truck.reviewType === 'borderline'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-red-100 text-red-600'
                    }`}>
                      {truck.reviewType === 'borderline' ? 'Borderline' : 'Auto-cut'}
                    </span>
                  </div>

                  {truck.cutReason && (
                    <p className="text-xs text-[#8a7e78] mb-3">{truck.cutReason}</p>
                  )}

                  {expandedTrucks[truck.vendorShipmentNumber] && truck.lines?.length > 0 && (
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

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {ACTIONS.filter(opt => {
                      if (opt.value === 'van' && fallback !== 'Van') return false;
                      if (opt.value === '20ft' && fallback !== '20ft Container') return false;
                      return true;
                    }).map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setTruckField(truck.vendorShipmentNumber, 'action', opt.value)}
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

                  {(d.action === 'keep' || d.action === 'van' || d.action === '20ft') && (
                    <select
                      value={d.luReason || ''}
                      onChange={e => setTruckField(truck.vendorShipmentNumber, 'luReason', e.target.value)}
                      className="w-full border border-[#e8e0db] rounded-lg px-3 py-2 text-sm text-[#403833] focus:outline-none focus:ring-2 focus:ring-[#ffa236] bg-white"
                    >
                      <option value="">Low Usage reason code *</option>
                      {LU_REASON_CODES.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
                    </select>
                  )}

                  {d.action === 'cut' && truck.reviewType === 'borderline' && (
                    <select
                      value={d.rootCause || ''}
                      onChange={e => setTruckField(truck.vendorShipmentNumber, 'rootCause', e.target.value)}
                      className="w-full border border-[#e8e0db] rounded-lg px-3 py-2 text-sm text-[#403833] focus:outline-none focus:ring-2 focus:ring-[#ffa236] bg-white mt-1.5"
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

      {/* ── Cut lines ─────────────────────────────────────────────── */}
      {allCutLines.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[#8a7e78]">
              Cut Lines ({allCutLines.length})
            </h2>
            <span className="text-xs text-[#8a7e78]">Notes are exported to the Cut Lines file</span>
          </div>

          <div className="bg-white border border-[#e8e0db] rounded-xl shadow-card overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#e8e0db] bg-[#fafaf8]">
                  <th className="text-left px-4 py-2.5 font-semibold text-[#8a7e78]">SKU</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-[#8a7e78]">Route</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-[#8a7e78]">Qty</th>
                  <th className="text-center px-4 py-2.5 font-semibold text-[#8a7e78]">P</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-[#8a7e78]">Reason</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-[#8a7e78] w-48">Note</th>
                </tr>
              </thead>
              <tbody>
                {allCutLines.map((line, idx) => (
                  <tr key={idx} className={`border-t border-[#f0ebe8] ${idx % 2 !== 0 ? 'bg-[#fafaf8]' : 'bg-white'}`}>
                    <td className="px-4 py-2 font-mono text-[#403833]">{line.sku}</td>
                    <td className="px-4 py-2 text-[#8a7e78] whitespace-nowrap">{line.originLocationCode} → {line.destinationLocation}</td>
                    <td className="px-4 py-2 text-right text-[#403833]">{line.originalQty?.toLocaleString()}</td>
                    <td className="px-4 py-2 text-center text-[#8a7e78]">P{line.priority}</td>
                    <td className="px-4 py-2 text-[#8a7e78] max-w-[200px]">
                      <span className="block truncate" title={line.cutReason}>{line.cutReason}</span>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={getLineNote(line)}
                        onChange={e => updateLineNote(line, e.target.value)}
                        placeholder="Add note…"
                        className="w-full border border-[#e8e0db] rounded-lg px-2.5 py-1 text-xs text-[#403833] placeholder-[#c4b8b0] focus:outline-none focus:ring-1 focus:ring-[#ffa236] bg-white"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-[#e8e0db]">
        <button
          onClick={onBack}
          className="px-4 py-2 text-[#403833] border border-[#e8e0db] rounded-lg text-sm font-medium hover:bg-[#fafaf8] transition-colors"
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
