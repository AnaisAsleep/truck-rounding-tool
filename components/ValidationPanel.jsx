'use client';

import { useState } from 'react';

export default function ValidationPanel({ validation }) {
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [showNoCost, setShowNoCost] = useState(false);

  if (!validation) return null;

  const { summary, unmatchedRows, noCostRows, errors, sampleAirtablePkeys } = validation;

  return (
    <div className="border border-[#e8e0db] rounded-xl bg-white overflow-hidden mt-4">

      {errors?.length > 0 && (
        <div className="px-4 py-3 border-b border-[#e8e0db] space-y-2">
          {errors.map((err, i) => {
            const isWarning = err.severity === 'warning';
            return (
              <div key={i} className={`rounded-lg px-3 py-2 ${isWarning ? 'bg-amber-50' : 'bg-red-50'}`}>
                <p className={`text-sm font-semibold ${isWarning ? 'text-amber-700' : 'text-red-700'}`}>{err.message}</p>
                {err.details && <p className={`text-xs mt-0.5 ${isWarning ? 'text-amber-600' : 'text-red-500'}`}>{err.details}</p>}
              </div>
            );
          })}
        </div>
      )}

      {summary && (
        <>
          <div className="px-4 py-3 flex flex-wrap gap-x-5 gap-y-1 text-xs border-b border-[#e8e0db]">
            <StatItem
              label="matched"
              value={`${summary.matchedLines}/${summary.totalLines}`}
              color={summary.matchedLines === summary.totalLines ? 'green' : 'red'}
            />
            {summary.unmatchedCount > 0 && (
              <StatItem label="unmatched" value={summary.unmatchedCount} color="red" />
            )}
            {summary.noCostCount > 0 && (
              <StatItem label="no cost data" value={summary.noCostCount} color="amber" />
            )}
            <StatItem label="suppliers" value={summary.supplierCount} />
            <StatItem label="lanes" value={summary.laneCount} />
          </div>

          <div className="px-4 py-2.5 flex flex-wrap gap-x-5 text-xs text-[#8a7e78] border-b border-[#e8e0db] last:border-0">
            <span>P1 <strong className="text-[#403833]">{summary.totalPrio1.toLocaleString()}</strong></span>
            <span>P2 <strong className="text-[#403833]">{summary.totalPrio2.toLocaleString()}</strong></span>
            <span>P3 <strong className="text-[#403833]">{summary.totalPrio3.toLocaleString()}</strong></span>
            {summary.totalPrio4 > 0 && (
              <span>P4 <strong className="text-[#403833]">{summary.totalPrio4.toLocaleString()}</strong></span>
            )}
          </div>

          {unmatchedRows?.length > 0 && (
            <div className="border-b border-[#e8e0db] last:border-0">
              <button
                onClick={() => setShowUnmatched(v => !v)}
                className="w-full text-left px-4 py-2.5 text-xs text-red-600 flex items-center gap-1.5 hover:bg-red-50/50 transition-colors"
              >
                <svg className={`w-3 h-3 transition-transform shrink-0 ${showUnmatched ? 'rotate-90' : ''}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 2l4 4-4 4"/>
                </svg>
                {unmatchedRows.length} unmatched SKU{unmatchedRows.length !== 1 ? 's' : ''} — will be cut
              </button>
              {showUnmatched && (
                <div className="px-4 pb-3">
                  {sampleAirtablePkeys?.length > 0 && (
                    <p className="text-xs text-[#8a7e78] mb-2">
                      Sample Airtable key: <span className="font-mono text-[#403833]">{sampleAirtablePkeys[0]}</span>
                      {' · '}Your file: <span className="font-mono text-[#403833]">{unmatchedRows[0]?.pkey}</span>
                    </p>
                  )}
                  <div className="border border-[#e8e0db] rounded-lg overflow-auto max-h-36">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[#fafaf8]">
                          <th className="text-left px-2.5 py-1.5 font-medium text-[#8a7e78]">SKU</th>
                          <th className="text-left px-2.5 py-1.5 font-medium text-[#8a7e78]">Lane</th>
                          <th className="text-left px-2.5 py-1.5 font-medium text-[#8a7e78]">Pkey used</th>
                        </tr>
                      </thead>
                      <tbody>
                        {unmatchedRows.map((r, i) => (
                          <tr key={i} className="border-t border-[#e8e0db]">
                            <td className="px-2.5 py-1.5 font-mono text-[#403833]">{r.sku}</td>
                            <td className="px-2.5 py-1.5 text-[#8a7e78]">{r.lane}</td>
                            <td className="px-2.5 py-1.5 font-mono text-[#8a7e78] text-[10px]">{r.pkey}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {noCostRows?.length > 0 && (
            <div>
              <button
                onClick={() => setShowNoCost(v => !v)}
                className="w-full text-left px-4 py-2.5 text-xs text-amber-600 flex items-center gap-1.5 hover:bg-amber-50/50 transition-colors"
              >
                <svg className={`w-3 h-3 transition-transform shrink-0 ${showNoCost ? 'rotate-90' : ''}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 2l4 4-4 4"/>
                </svg>
                {noCostRows.length} lane{noCostRows.length !== 1 ? 's' : ''} without cost data — cost check skipped
              </button>
              {showNoCost && (
                <div className="px-4 pb-3">
                  <div className="border border-[#e8e0db] rounded-lg overflow-auto max-h-36 mt-1">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[#fafaf8]">
                          <th className="text-left px-2.5 py-1.5 font-medium text-[#8a7e78]">SKU</th>
                          <th className="text-left px-2.5 py-1.5 font-medium text-[#8a7e78]">Lane</th>
                        </tr>
                      </thead>
                      <tbody>
                        {noCostRows.map((r, i) => (
                          <tr key={i} className="border-t border-[#e8e0db]">
                            <td className="px-2.5 py-1.5 font-mono text-[#403833]">{r.sku}</td>
                            <td className="px-2.5 py-1.5 text-[#8a7e78]">{r.lane}</td>
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

function StatItem({ label, value, color }) {
  const textColor = color === 'red' ? 'text-red-600' : color === 'amber' ? 'text-amber-600' : color === 'green' ? 'text-green-600' : 'text-[#403833]';
  return (
    <span className="text-[#8a7e78]">
      <strong className={textColor}>{value}</strong> {label}
    </span>
  );
}
