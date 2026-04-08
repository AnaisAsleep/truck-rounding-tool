'use client';

import { useState } from 'react';

export default function ValidationPanel({ validation }) {
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [showNoCost, setShowNoCost] = useState(false);

  if (!validation) return null;

  const { summary, unmatchedRows, noCostRows, errors, sampleAirtablePkeys } = validation;

  return (
    <div className="mt-4 border border-stone-200 rounded-lg bg-white overflow-hidden">

      {/* Errors */}
      {errors?.length > 0 && (
        <div className="px-4 py-3 border-b border-red-100 bg-red-50">
          {errors.map((err, i) => (
            <div key={i}>
              <p className="text-sm font-medium text-red-700">{err.message}</p>
              {err.details && <p className="text-xs text-red-500 mt-0.5">{err.details}</p>}
            </div>
          ))}
        </div>
      )}

      {summary && (
        <>
          {/* Stat row */}
          <div className="px-4 py-3 flex flex-wrap gap-x-5 gap-y-1 text-xs border-b border-stone-100">
            <Stat label="matched" value={summary.matchedLines} of={summary.totalLines} ok={summary.matchedLines === summary.totalLines} />
            <Stat label="unmatched" value={summary.unmatchedCount} warn={summary.unmatchedCount > 0} />
            <Stat label="no cost" value={summary.noCostCount} warn={summary.noCostCount > 0} />
            <Stat label="suppliers" value={summary.supplierCount} />
            <Stat label="lanes" value={summary.laneCount} />
          </div>

          {/* Priority quantities */}
          <div className="px-4 py-2.5 flex flex-wrap gap-x-5 text-xs text-stone-500 border-b border-stone-100">
            <span>P1 <strong className="text-stone-800">{summary.totalPrio1.toLocaleString()}</strong></span>
            <span>P2 <strong className="text-stone-800">{summary.totalPrio2.toLocaleString()}</strong></span>
            <span>P3 <strong className="text-stone-800">{summary.totalPrio3.toLocaleString()}</strong></span>
            {summary.totalPrio4 > 0 && (
              <span>P4 <strong className="text-stone-800">{summary.totalPrio4.toLocaleString()}</strong></span>
            )}
          </div>

          {/* Expandable: unmatched */}
          {unmatchedRows?.length > 0 && (
            <div className="border-b border-stone-100 last:border-0">
              <button
                onClick={() => setShowUnmatched(v => !v)}
                className="w-full text-left px-4 py-2.5 text-xs text-red-600 flex items-center gap-1.5 hover:bg-red-50 transition-colors"
              >
                <svg className={`w-3 h-3 transition-transform shrink-0 ${showUnmatched ? 'rotate-90' : ''}`} viewBox="0 0 12 12" fill="currentColor">
                  <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {unmatchedRows.length} unmatched SKU{unmatchedRows.length !== 1 ? 's' : ''} — will be cut
              </button>
              {showUnmatched && (
                <div className="px-4 pb-3">
                  {sampleAirtablePkeys?.length > 0 && (
                    <div className="mb-2 text-xs text-stone-500">
                      Sample Airtable key: <span className="font-mono text-stone-700">{sampleAirtablePkeys[0]}</span>
                      {' · '}Your file: <span className="font-mono text-stone-700">{unmatchedRows[0]?.pkey}</span>
                    </div>
                  )}
                  <div className="border border-stone-100 rounded overflow-auto max-h-36">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-stone-50">
                          <th className="text-left px-2.5 py-1.5 font-medium text-stone-500">SKU</th>
                          <th className="text-left px-2.5 py-1.5 font-medium text-stone-500">Lane</th>
                          <th className="text-left px-2.5 py-1.5 font-medium text-stone-500">Pkey</th>
                        </tr>
                      </thead>
                      <tbody>
                        {unmatchedRows.map((r, i) => (
                          <tr key={i} className="border-t border-stone-100">
                            <td className="px-2.5 py-1.5 font-mono text-stone-800">{r.sku}</td>
                            <td className="px-2.5 py-1.5 text-stone-500">{r.lane}</td>
                            <td className="px-2.5 py-1.5 font-mono text-stone-400 text-[10px]">{r.pkey}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Expandable: no cost */}
          {noCostRows?.length > 0 && (
            <div>
              <button
                onClick={() => setShowNoCost(v => !v)}
                className="w-full text-left px-4 py-2.5 text-xs text-amber-600 flex items-center gap-1.5 hover:bg-amber-50 transition-colors"
              >
                <svg className={`w-3 h-3 transition-transform shrink-0 ${showNoCost ? 'rotate-90' : ''}`} viewBox="0 0 12 12" fill="currentColor">
                  <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {noCostRows.length} lane{noCostRows.length !== 1 ? 's' : ''} without cost data — cost check skipped
              </button>
              {showNoCost && (
                <div className="px-4 pb-3 border-t border-stone-100">
                  <div className="border border-stone-100 rounded overflow-auto max-h-36 mt-2">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-stone-50">
                          <th className="text-left px-2.5 py-1.5 font-medium text-stone-500">SKU</th>
                          <th className="text-left px-2.5 py-1.5 font-medium text-stone-500">Lane</th>
                        </tr>
                      </thead>
                      <tbody>
                        {noCostRows.map((r, i) => (
                          <tr key={i} className="border-t border-stone-100">
                            <td className="px-2.5 py-1.5 font-mono text-stone-800">{r.sku}</td>
                            <td className="px-2.5 py-1.5 text-stone-500">{r.lane}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, of: total, ok, warn }) {
  const color = warn ? 'text-red-600' : ok ? 'text-green-600' : 'text-stone-800';
  return (
    <span className="text-stone-500">
      <strong className={color}>{value}{total !== undefined ? `/${total}` : ''}</strong> {label}
    </span>
  );
}
