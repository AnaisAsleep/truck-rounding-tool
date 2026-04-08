'use client';

import { useState } from 'react';

export default function ValidationPanel({ validation }) {
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [showNoCost, setShowNoCost] = useState(false);

  if (!validation) return null;

  const { summary, unmatchedRows, noCostRows, errors, sampleAirtablePkeys } = validation;

  return (
    <div className="border border-[#e8e0db] rounded-card bg-white p-5 mt-4">
      <h4 className="text-sm font-semibold text-[#403833] mb-3">Validation Summary</h4>

      {/* Error messages (e.g. missing origin_location_code column) */}
      {errors && errors.length > 0 && errors.map((err, i) => (
        <div key={i} className="mb-3 p-3 bg-red-50 border border-[#f44336] rounded-btn">
          <p className="text-sm font-semibold text-[#f44336]">{err.message}</p>
          {err.details && <p className="text-xs text-[#f44336] mt-1">{err.details}</p>}
        </div>
      ))}

      {/* Summary grid */}
      {summary && (
        <>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <SummaryChip
              label="Lines matched"
              value={summary.matchedLines}
              total={summary.totalLines}
              color="success"
            />
            <SummaryChip
              label="No Airtable match"
              value={summary.unmatchedCount}
              color={summary.unmatchedCount > 0 ? 'danger' : 'success'}
            />
            <SummaryChip
              label="No cost data"
              value={summary.noCostCount}
              color={summary.noCostCount > 0 ? 'warning' : 'success'}
            />
            <SummaryChip label="Suppliers" value={summary.supplierCount} color="neutral" />
            <SummaryChip label="Lanes" value={summary.laneCount} color="neutral" />
            <SummaryChip label="Lines" value={summary.totalLines} color="neutral" />
          </div>

          {/* Quantities by priority */}
          <div className="bg-[#fafafa] border border-[#e8e0db] rounded-btn p-3 mb-3">
            <p className="text-xs font-semibold text-[#8a7e78] mb-2">Quantities by Priority</p>
            <div className="flex gap-4 flex-wrap">
              <PrioChip label="Prio 1" value={summary.totalPrio1} color="#4caf50" />
              <PrioChip label="Prio 2" value={summary.totalPrio2} color="#ffa236" />
              <PrioChip label="Prio 3" value={summary.totalPrio3} color="#ff9800" />
              {summary.totalPrio4 > 0 && (
                <PrioChip label="Prio 4" value={summary.totalPrio4} color="#8a7e78" />
              )}
            </div>
          </div>

          {/* Expandable: unmatched rows */}
          {unmatchedRows && unmatchedRows.length > 0 && (
            <div className="mb-2">
              <button
                onClick={() => setShowUnmatched(!showUnmatched)}
                className="flex items-center gap-1.5 text-sm text-[#f44336] font-medium hover:underline"
              >
                <svg className={`w-4 h-4 transition-transform ${showUnmatched ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                {unmatchedRows.length} lines with no Airtable palletization match (will be cut)
              </button>
              {showUnmatched && (
                <div className="mt-2">
                  {sampleAirtablePkeys && sampleAirtablePkeys.length > 0 && (
                    <div className="mb-2 p-2 bg-yellow-50 border border-yellow-300 rounded-btn text-xs text-[#403833]">
                      <strong>Sample Airtable pkeys (first 5):</strong>
                      <div className="font-mono mt-1 space-y-0.5">
                        {sampleAirtablePkeys.map((k, i) => <div key={i}>{k}</div>)}
                      </div>
                      <div className="mt-1"><strong>Your file builds pkeys as:</strong> <span className="font-mono">{unmatchedRows[0] ? unmatchedRows[0].pkey : '—'}</span></div>
                    </div>
                  )}
                  <div className="max-h-40 overflow-y-auto border border-[#e8e0db] rounded-btn">
                    <table className="w-full text-xs">
                      <thead className="bg-[#fafafa] sticky top-0">
                        <tr>
                          <th className="text-left p-2 text-[#8a7e78]">SKU</th>
                          <th className="text-left p-2 text-[#8a7e78]">Lane</th>
                          <th className="text-left p-2 text-[#8a7e78]">Pkey used</th>
                        </tr>
                      </thead>
                      <tbody>
                        {unmatchedRows.map((r, i) => (
                          <tr key={i} className="border-t border-[#e8e0db]">
                            <td className="p-2 font-mono text-[#403833]">{r.sku}</td>
                            <td className="p-2 text-[#8a7e78]">{r.lane}</td>
                            <td className="p-2 font-mono text-[#8a7e78] text-xs">{r.pkey}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Expandable: no cost data */}
          {noCostRows && noCostRows.length > 0 && (
            <div>
              <button
                onClick={() => setShowNoCost(!showNoCost)}
                className="flex items-center gap-1.5 text-sm text-[#ff9800] font-medium hover:underline"
              >
                <svg className={`w-4 h-4 transition-transform ${showNoCost ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                {noCostRows.length} lines with no transport cost data (cost check will be skipped)
              </button>
              {showNoCost && (
                <div className="mt-2 max-h-40 overflow-y-auto border border-[#e8e0db] rounded-btn">
                  <table className="w-full text-xs">
                    <thead className="bg-[#fafafa] sticky top-0">
                      <tr>
                        <th className="text-left p-2 text-[#8a7e78]">SKU</th>
                        <th className="text-left p-2 text-[#8a7e78]">Lane</th>
                      </tr>
                    </thead>
                    <tbody>
                      {noCostRows.map((r, i) => (
                        <tr key={i} className="border-t border-[#e8e0db]">
                          <td className="p-2 font-mono text-[#403833]">{r.sku}</td>
                          <td className="p-2 text-[#8a7e78]">{r.lane}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SummaryChip({ label, value, total, color }) {
  const colorMap = {
    success: 'text-[#4caf50] bg-green-50 border-green-200',
    danger: 'text-[#f44336] bg-red-50 border-red-200',
    warning: 'text-[#ff9800] bg-orange-50 border-orange-200',
    neutral: 'text-[#403833] bg-[#fafafa] border-[#e8e0db]',
  };
  return (
    <div className={`border rounded-btn p-2 ${colorMap[color] || colorMap.neutral}`}>
      <p className="text-xs opacity-70">{label}</p>
      <p className="text-sm font-bold">
        {value}{total !== undefined ? `/${total}` : ''}
      </p>
    </div>
  );
}

function PrioChip({ label, value, color }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <span className="text-xs text-[#8a7e78]">{label}:</span>
      <span className="text-xs font-semibold text-[#403833]">{value.toLocaleString()} pcs</span>
    </div>
  );
}
