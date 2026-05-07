'use client';

import { useState, useEffect } from 'react';
import { LU_REASON_CODES } from '../lib/rounding';

const HEALTHY_FILL = 0.80;
const CONTAINER_20FT_FRACTION = 0.45;

function FillBar({ fraction, className = '' }) {
  const pct = Math.min(Math.round(fraction * 100), 100);
  const barColor = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400';
  const textColor = pct >= 80 ? 'text-green-600' : pct >= 50 ? 'text-amber-500' : 'text-red-500';
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className={`text-sm font-semibold tabular-nums w-10 shrink-0 ${textColor}`}>{pct}%</span>
      <div className="flex-1 h-1.5 bg-[#f0ebe8] rounded-full overflow-hidden">
        <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StopBadge({ stop, isCut, onToggleCut, allowCut }) {
  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-colors ${
      isCut ? 'border-red-200 bg-red-50' : 'border-[#e8e0db] bg-[#fafaf8]'
    }`}>
      <div className="min-w-0">
        <span className="text-sm font-semibold text-[#403833]">{stop.destination}</span>
        <span className="text-xs text-[#8a7e78] ml-2">{stop.lines?.length} SKU{stop.lines?.length !== 1 ? 's' : ''}</span>
        <span className={`text-xs ml-2 font-medium ${Math.round(stop.fillFraction*100) >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
          {Math.round(stop.fillFraction * 100)}% fill
        </span>
      </div>
      {allowCut && (
        <button
          onClick={onToggleCut}
          className={`text-xs px-2 py-0.5 rounded font-medium border transition-colors shrink-0 ml-3 ${
            isCut
              ? 'bg-red-500 text-white border-red-500'
              : 'text-red-500 border-red-200 hover:bg-red-50'
          }`}
        >
          {isCut ? 'Undo cut' : 'Cut stop'}
        </button>
      )}
    </div>
  );
}

export default function MilkRunStep({ milkRunCandidates = [], weekNum, onConfirm, onBack }) {
  const [decisions, setDecisions] = useState({});
  const [expandedRuns, setExpandedRuns] = useState({});

  // Auto-advance if no candidates
  useEffect(() => {
    if (milkRunCandidates.length === 0) {
      const t = setTimeout(() => onConfirm({}), 600);
      return () => clearTimeout(t);
    }
  }, [milkRunCandidates.length, onConfirm]);

  const getDecision = (id) => decisions[id] || { action: null, luReason: '', freeText: '', stopsToCut: [] };

  const setField = (id, field, value) =>
    setDecisions(prev => ({ ...prev, [id]: { ...getDecision(id), [field]: value } }));

  const toggleStopCut = (id, dest) => {
    const d = getDecision(id);
    const cuts = d.stopsToCut || [];
    const next = cuts.includes(dest) ? cuts.filter(x => x !== dest) : [...cuts, dest];
    setField(id, 'stopsToCut', next);
  };

  const isRunDone = (id, mr) => {
    const d = getDecision(id);
    if (!d.action) return false;
    if (d.action === 'cut') return true;
    if (d.action === 'approve') {
      // Clean approve only valid at ≥80%; low-fill runs require approve_lu
      return mr.totalFillFraction >= HEALTHY_FILL;
    }
    if (d.action === 'approve_lu') return !!d.luReason && !!d.freeText?.trim();
    if (d.action === '20ft') return !!d.luReason && !!d.freeText?.trim();
    return false;
  };

  const allDone = milkRunCandidates.every(mr => isRunDone(mr.milkRunId, mr));
  const doneCount = milkRunCandidates.filter(mr => isRunDone(mr.milkRunId, mr)).length;

  if (milkRunCandidates.length === 0) {
    return (
      <div className="max-w-lg py-10">
        <div className="w-12 h-12 bg-green-50 border border-green-200 rounded-full flex items-center justify-center mb-4">
          <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
          </svg>
        </div>
        <h2 className="text-xl font-bold text-[#403833] mb-2">No milk run candidates</h2>
        <p className="text-[#8a7e78]">Advancing to transport mode…</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#403833]">Milk Run Approval</h1>
          <p className="text-[#8a7e78] mt-1 text-sm">
            {milkRunCandidates.length} milk run candidate{milkRunCandidates.length !== 1 ? 's' : ''} · {doneCount}/{milkRunCandidates.length} decided
          </p>
        </div>
        <div className="text-xs text-[#8a7e78] bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 max-w-sm">
          Each milk run loads from one origin and delivers to two warehouses in the same country. Every run requires an explicit decision before proceeding.
        </div>
      </div>

      <div className="space-y-4">
        {milkRunCandidates.map(mr => {
          const id = mr.milkRunId;
          const d = getDecision(id);
          const done = isRunDone(id, mr);
          const isLowFill = mr.totalFillFraction < HEALTHY_FILL;
          const fillPct20ft = Math.min(mr.totalFillFraction / CONTAINER_20FT_FRACTION, 1);
          const isExpanded = expandedRuns[id] !== false; // default expanded
          const allStopsCut = (d.stopsToCut || []).length === mr.stops.length;

          return (
            <div key={id} className={`bg-white border rounded-xl shadow-sm overflow-hidden transition-colors ${
              !done ? 'border-amber-200' : d.action === 'cut' ? 'border-red-200' : 'border-green-200'
            }`}>
              {/* Header */}
              <div
                className={`px-5 py-4 cursor-pointer ${!done ? 'bg-amber-50/40' : d.action === 'cut' ? 'bg-red-50/30' : 'bg-green-50/30'}`}
                onClick={() => setExpandedRuns(prev => ({ ...prev, [id]: !isExpanded }))}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold text-[#403833]">{id}</span>
                  <span className="text-sm text-[#8a7e78]">
                    {mr.origin} → {mr.stops.map(s => s.destination).join(' + ')}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
                    {mr.typeCode === 'S40FT' ? '40ft Container' : 'FTL'} · W{mr.pgrdWeek || weekNum}
                  </span>
                  {mr.isUpgrade && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                      ⚠ Upgraded
                    </span>
                  )}
                  {done && (
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      d.action === 'cut' ? 'bg-red-100 text-red-600'
                      : d.action === '20ft' ? 'bg-blue-100 text-blue-600'
                      : 'bg-green-100 text-green-600'
                    }`}>
                      {d.action === 'cut' ? 'Cut' : d.action === '20ft' ? 'Rebooked 20ft' : 'Approved'}
                    </span>
                  )}
                  <svg
                    className={`w-3.5 h-3.5 text-[#8a7e78] ml-auto transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                  >
                    <path d="M4 2l4 4-4 4"/>
                  </svg>
                </div>

                {/* Route summary */}
                <div className="mt-2 flex items-center gap-4 text-xs">
                  <FillBar
                    fraction={d.action === '20ft' ? fillPct20ft : mr.totalFillFraction}
                    className="flex-1 max-w-[200px]"
                  />
                  {mr.costPerPiece != null && (
                    <span className="text-[#8a7e78]">€{mr.costPerPiece.toFixed(2)}/pc</span>
                  )}
                  {mr.totalPieces > 0 && (
                    <span className="text-[#8a7e78]">{mr.totalPieces.toLocaleString()} pcs total</span>
                  )}
                </div>
              </div>

              {/* Expanded body */}
              {isExpanded && (
                <div className="px-5 pb-5 pt-3 border-t border-[#f0ebe8]">
                  {/* Upgrade warning */}
                  {mr.isUpgrade && (
                    <div className="mb-3 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                      ⚠ Originally confirmed as single-destination truck to <strong>{mr.stops[0].destination}</strong> — proposed upgrade to milk run by adding <strong>{mr.stops[1].destination}</strong>.
                    </div>
                  )}

                  {/* Stops */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                    {mr.stops.map(stop => (
                      <StopBadge
                        key={stop.destination}
                        stop={stop}
                        isCut={(d.stopsToCut || []).includes(stop.destination)}
                        onToggleCut={() => toggleStopCut(id, stop.destination)}
                        allowCut={d.action !== 'cut' && d.action !== null}
                      />
                    ))}
                  </div>

                  {allStopsCut && d.action !== 'cut' && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mb-3">
                      Both stops are cut — equivalent to cutting the whole milk run.
                    </p>
                  )}

                  {/* SKU detail */}
                  <details className="mb-4">
                    <summary className="text-xs text-[#8a7e78] cursor-pointer hover:text-[#403833] transition-colors select-none">
                      Show all {mr.stops.reduce((s, st) => s + (st.lines?.length || 0), 0)} SKU lines
                    </summary>
                    <div className="mt-2 border border-[#e8e0db] rounded-lg overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-[#fafaf8] border-b border-[#e8e0db]">
                            <th className="text-left px-3 py-1.5 font-semibold text-[#8a7e78]">Dest</th>
                            <th className="text-left px-3 py-1.5 font-semibold text-[#8a7e78]">SKU</th>
                            <th className="text-right px-3 py-1.5 font-semibold text-[#8a7e78]">Qty</th>
                            <th className="text-center px-3 py-1.5 font-semibold text-[#8a7e78]">P</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mr.stops.flatMap((stop, si) =>
                            (stop.lines || []).map((line, li) => (
                              <tr key={`${si}-${li}`} className={`border-t border-[#f0ebe8] ${(si + li) % 2 !== 0 ? 'bg-[#fafaf8]' : 'bg-white'}`}>
                                <td className="px-3 py-1.5 text-[#8a7e78] font-mono text-[11px]">{stop.destination}</td>
                                <td className="px-3 py-1.5 font-mono text-[#403833]">{line.sku}</td>
                                <td className="px-3 py-1.5 text-right text-[#403833]">{line.qty?.toLocaleString()}</td>
                                <td className="px-3 py-1.5 text-center text-[#8a7e78] font-semibold">P{line.priority}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </details>

                  {/* 20ft fill preview */}
                  {d.action === '20ft' && (
                    <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-xs font-medium text-blue-800 mb-1">Fill on 20ft container:</p>
                      <FillBar fraction={fillPct20ft} />
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {/* Approve — only clean if ≥80% */}
                    <button
                      onClick={() => setField(id, 'action', 'approve')}
                      disabled={isLowFill}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        d.action === 'approve'
                          ? 'bg-green-600 text-white border-green-600'
                          : isLowFill
                          ? 'opacity-30 cursor-not-allowed bg-white text-[#403833] border-[#e8e0db]'
                          : 'bg-white text-green-700 border-green-300 hover:border-green-500'
                      }`}
                    >
                      Approve
                    </button>
                    {/* Approve with LU — required for low-fill */}
                    <button
                      onClick={() => setField(id, 'action', 'approve_lu')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        d.action === 'approve_lu'
                          ? 'bg-[#403833] text-white border-[#403833]'
                          : 'bg-white text-[#403833] border-[#e8e0db] hover:border-[#403833]'
                      }`}
                    >
                      Approve with LU code{isLowFill ? ' *' : ''}
                    </button>
                    {/* Rebook 20ft */}
                    <button
                      onClick={() => setField(id, 'action', '20ft')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        d.action === '20ft'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-blue-600 border-blue-200 hover:border-blue-500'
                      }`}
                    >
                      Rebook 20ft
                    </button>
                    {/* Cut */}
                    <button
                      onClick={() => setField(id, 'action', 'cut')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        d.action === 'cut'
                          ? 'bg-red-500 text-white border-red-500'
                          : 'bg-white text-red-500 border-red-200 hover:border-red-400'
                      }`}
                    >
                      Cut
                    </button>
                  </div>

                  {/* Warnings */}
                  {(d.action === 'approve_lu' || (d.action === 'approve' && isLowFill)) && (
                    <div className="mb-3 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                      ⚠ This milk run is below acceptable fill levels. Approving low-fill milk runs significantly reduces route efficiency and increases cost per piece. This should be an exception, not a standard practice.
                    </div>
                  )}
                  {d.action === '20ft' && (
                    <div className="mb-3 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                      ⚠ Rebooking to a 20ft container on a multi-stop route is highly inefficient. This decision should only be made when no better option exists.
                    </div>
                  )}

                  {/* LU reason + free text (required for approve_lu and 20ft) */}
                  {(d.action === 'approve_lu' || d.action === '20ft') && (
                    <div className="space-y-2">
                      <select
                        value={d.luReason || ''}
                        onChange={e => setField(id, 'luReason', e.target.value)}
                        className="w-full border border-[#e8e0db] rounded-lg px-3 py-2 text-sm text-[#403833] focus:outline-none focus:ring-2 focus:ring-[#ffa236] bg-white"
                      >
                        <option value="">LU reason code (required)</option>
                        {LU_REASON_CODES.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
                      </select>
                      <textarea
                        value={d.freeText || ''}
                        onChange={e => setField(id, 'freeText', e.target.value)}
                        placeholder="Free-text justification (required)…"
                        rows={2}
                        className="w-full border border-[#e8e0db] rounded-lg px-3 py-2 text-sm text-[#403833] focus:outline-none focus:ring-2 focus:ring-[#ffa236] bg-white resize-none"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-[#e8e0db]">
        <button
          onClick={onBack}
          className="px-4 py-2 text-[#403833] border border-[#e8e0db] rounded-lg text-sm font-medium hover:bg-[#fafaf8] transition-colors"
        >
          ← Back
        </button>
        <div className="flex items-center gap-3">
          {!allDone && (
            <span className="text-xs text-amber-600">
              {milkRunCandidates.length - doneCount} run{milkRunCandidates.length - doneCount !== 1 ? 's' : ''} still need a decision
            </span>
          )}
          <button
            onClick={() => onConfirm(decisions)}
            disabled={!allDone}
            className="px-6 py-2.5 bg-[#ffa236] text-white font-semibold text-sm rounded-lg hover:bg-[#e8922e] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Confirm Milk Runs →
          </button>
        </div>
      </div>
    </div>
  );
}
