'use client';

import { useEffect, useState } from 'react';
import { exportConfirmedLoads, exportCutLines, exportCombined, generateBase64Blobs, downloadBase64Blob } from '../lib/excelExporter';
import { calcSummaryStats } from '../lib/rounding';

const HISTORY_KEY = 'truck_rounding_history';

function modeLabel(truck) {
  if (truck.transportMode === 'rail') return 'Rail';
  if (truck.transportMode === 'sea') return 'Sea';
  return 'Road';
}

function modeStyle(truck) {
  if (truck.transportMode === 'rail') return 'bg-blue-100 text-blue-700';
  if (truck.transportMode === 'sea') return 'bg-sky-100 text-sky-700';
  return 'bg-[#f0ebe8] text-[#8a7e78]';
}

function unitLabel(truck) {
  if (truck.transportUnitOverride) return truck.transportUnitOverride;
  const lu = truck.lines?.[0]?.loadingUnit || truck.lines?.[0]?.palletData?.loading_unit;
  if (lu === 'CONTAINER 40FT') return '40ft Container';
  return 'FTL';
}

export default function ResultsStep({ finalConfirmed, finalCutLines, weekNum, year, onStartOver }) {
  const [history, setHistory] = useState([]);
  const [expandedVSNs, setExpandedVSNs] = useState({});
  const stats = calcSummaryStats(finalConfirmed, finalCutLines);
  const ww = String(weekNum).padStart(2, '0');

  const toggleVSN = (vsn) => setExpandedVSNs(prev => ({ ...prev, [vsn]: !prev[vsn] }));

  useEffect(() => {
    if (!finalConfirmed) return;
    (async () => {
      try {
        const { confirmedBase64, cutBase64 } = await generateBase64Blobs(finalConfirmed, finalCutLines, weekNum);
        const run = {
          id: Date.now(),
          timestamp: new Date().toISOString(),
          weekNum, year,
          trucksConfirmed: stats.totalTrucksConfirmed,
          trucksCut: stats.totalTrucksCut,
          piecesShipped: stats.totalPiecesShipped,
          piecesCut: stats.totalPiecesCut,
          confirmedBase64, cutBase64,
        };
        const existing = loadHistory();
        const updated = [run, ...existing].slice(0, 20);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
        setHistory(updated);
      } catch (err) {
        console.warn('Could not save run history:', err);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setHistory(loadHistory()); }, []);

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#403833]">Results</h1>
        <p className="text-sm text-[#8a7e78] mt-1">Week {ww}, {year}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-px bg-[#e8e0db] rounded-xl overflow-hidden mb-6 shadow-card">
        <StatCell label="Trucks confirmed" value={stats.totalTrucksConfirmed} highlight />
        <StatCell label="Trucks cut" value={stats.totalTrucksCut} dimIfZero />
        <StatCell label="Avg utilisation" value={`${(stats.avgUtilization * 100).toFixed(1)}%`} />
        <StatCell label="Pieces shipped" value={stats.totalPiecesShipped.toLocaleString()} />
        <StatCell label="Pieces cut" value={stats.totalPiecesCut.toLocaleString()} dimIfZero />
        <StatCell label="Transport cost" value={stats.totalTransportCost > 0 ? `€${stats.totalTransportCost.toFixed(0)}` : '—'} />
      </div>

      {/* Shipments overview */}
      {finalConfirmed.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[#8a7e78] mb-3">Confirmed Shipments</h2>
          <div className="bg-white border border-[#e8e0db] rounded-xl shadow-card overflow-hidden divide-y divide-[#f0ebe8]">
            {finalConfirmed.map(truck => {
              const vsn = truck.vendorShipmentNumber;
              const fill = Math.round(truck.usedFraction * 100);
              const fillColor = fill >= 80 ? 'text-green-600' : fill >= 50 ? 'text-amber-500' : 'text-red-500';
              const fillBarColor = fill >= 80 ? 'bg-green-500' : fill >= 50 ? 'bg-amber-400' : 'bg-red-400';
              const isExpanded = expandedVSNs[vsn];
              const totalQty = truck.lines.reduce((s, l) => s + (l.qty || 0), 0);
              const p4Count = truck.lines.filter(l => l.priority === 4).length;

              return (
                <div key={vsn}>
                  <button
                    onClick={() => toggleVSN(vsn)}
                    className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-[#fafaf8] transition-colors"
                  >
                    {/* Expand chevron */}
                    <svg className={`w-3 h-3 shrink-0 text-[#c4b8b0] transition-transform ${isExpanded ? 'rotate-90' : ''}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 2l4 4-4 4"/>
                    </svg>

                    {/* VSN + route */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-mono font-semibold text-[#403833] text-sm">{vsn}</span>
                        <span className="text-xs text-[#8a7e78]">{truck.origin} → {truck.destination}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0 mt-0.5 text-xs text-[#8a7e78]">
                        <span>{truck.lines.length} SKU{truck.lines.length !== 1 ? 's' : ''}</span>
                        <span>{totalQty.toLocaleString()} pcs</span>
                        {truck.costPerPiece != null && <span>€{truck.costPerPiece.toFixed(2)}/pc</span>}
                        {p4Count > 0 && (
                          <span className="text-purple-600 font-medium">+{p4Count} P4</span>
                        )}
                      </div>
                    </div>

                    {/* Fill bar */}
                    <div className="hidden sm:flex flex-col items-end gap-1 shrink-0 w-24">
                      <span className={`text-xs font-semibold ${fillColor}`}>{fill}%</span>
                      <div className="w-full h-1.5 rounded-full bg-[#f0ebe8] overflow-hidden">
                        <div className={`h-full rounded-full ${fillBarColor}`} style={{ width: `${Math.min(fill, 100)}%` }} />
                      </div>
                    </div>

                    {/* Mode + unit badges */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${modeStyle(truck)}`}>
                        {modeLabel(truck)}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#f0ebe8] text-[#8a7e78]">
                        {unitLabel(truck)}
                      </span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-3 pt-0">
                      <table className="w-full text-xs border border-[#e8e0db] rounded-lg overflow-hidden">
                        <thead>
                          <tr className="bg-[#fafaf8] border-b border-[#e8e0db]">
                            <th className="text-left px-3 py-1.5 font-semibold text-[#8a7e78]">SKU</th>
                            <th className="text-left px-3 py-1.5 font-semibold text-[#8a7e78]">Supplier</th>
                            <th className="text-right px-3 py-1.5 font-semibold text-[#8a7e78]">Qty</th>
                            <th className="text-right px-3 py-1.5 font-semibold text-[#8a7e78]">Pallets</th>
                            <th className="text-center px-3 py-1.5 font-semibold text-[#8a7e78]">P</th>
                            {truck.lines.some(l => l.manualAdditionNote) && (
                              <th className="text-left px-3 py-1.5 font-semibold text-[#8a7e78]">Note</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {truck.lines.map((line, li) => (
                            <tr key={li} className={`border-t border-[#f0ebe8] ${li % 2 !== 0 ? 'bg-[#fafaf8]' : 'bg-white'}`}>
                              <td className="px-3 py-1.5 font-mono text-[#403833]">{line.sku}</td>
                              <td className="px-3 py-1.5 text-[#8a7e78] truncate max-w-[160px]">{line.supplierName || '—'}</td>
                              <td className="px-3 py-1.5 text-right text-[#403833]">{line.qty?.toLocaleString()}</td>
                              <td className="px-3 py-1.5 text-right text-[#8a7e78]">{line.pallets > 0 ? line.pallets.toFixed(1) : '—'}</td>
                              <td className="px-3 py-1.5 text-center">
                                <span className={`font-semibold ${line.priority === 4 ? 'text-purple-600' : 'text-[#8a7e78]'}`}>
                                  P{line.priority}
                                </span>
                              </td>
                              {truck.lines.some(l => l.manualAdditionNote) && (
                                <td className="px-3 py-1.5 text-green-700 text-[11px]">{line.manualAdditionNote || ''}</td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {truck.railReason && (
                        <p className="text-xs text-blue-600 mt-1.5 pl-1">Rail reason: {truck.railReason}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Downloads */}
      <div className="flex gap-3 mb-3">
        <button
          onClick={() => exportConfirmedLoads(finalConfirmed, weekNum).catch(console.error)}
          className="flex-1 flex items-center justify-between px-4 py-3.5 bg-white border border-[#e8e0db] rounded-xl text-sm hover:border-[#ffa236] hover:shadow-card transition-all shadow-card"
        >
          <div className="text-left">
            <p className="font-semibold text-[#403833]">Confirmed Loads</p>
            <p className="text-xs text-[#8a7e78] mt-0.5">
              {stats.totalTrucksConfirmed} trucks · {stats.totalPiecesShipped.toLocaleString()} pcs · W{ww}.xlsx
            </p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-[#fff8f0] flex items-center justify-center shrink-0 ml-3">
            <svg className="w-4 h-4 text-[#ffa236]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
          </div>
        </button>
        <button
          onClick={() => exportCutLines(finalCutLines, weekNum).catch(console.error)}
          className="flex-1 flex items-center justify-between px-4 py-3.5 bg-white border border-[#e8e0db] rounded-xl text-sm hover:border-[#403833] hover:shadow-card transition-all shadow-card"
        >
          <div className="text-left">
            <p className="font-semibold text-[#403833]">Cut Lines</p>
            <p className="text-xs text-[#8a7e78] mt-0.5">
              {finalCutLines.length} lines · {stats.totalPiecesCut.toLocaleString()} pcs · W{ww}.xlsx
            </p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-[#fafaf8] flex items-center justify-center shrink-0 ml-3">
            <svg className="w-4 h-4 text-[#8a7e78]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
          </div>
        </button>
      </div>

      {/* Combined file */}
      <button
        onClick={() => exportCombined(finalConfirmed, finalCutLines, weekNum).catch(console.error)}
        className="w-full flex items-center justify-between px-4 py-3.5 bg-white border border-[#e8e0db] rounded-xl text-sm hover:border-[#403833] hover:shadow-card transition-all shadow-card mb-8"
      >
        <div className="text-left">
          <p className="font-semibold text-[#403833]">All Lines (Combined)</p>
          <p className="text-xs text-[#8a7e78] mt-0.5">
            Confirmed + cut · fill % · cost/piece · W{ww}.xlsx
          </p>
        </div>
        <div className="w-8 h-8 rounded-lg bg-[#fafaf8] flex items-center justify-center shrink-0 ml-3">
          <svg className="w-4 h-4 text-[#8a7e78]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
          </svg>
        </div>
      </button>

      {/* Start over */}
      <div className="mb-8">
        <button
          onClick={onStartOver}
          className="text-xs text-[#8a7e78] hover:text-[#403833] transition-colors"
        >
          ↩ Start new run
        </button>
      </div>

      {/* Run history */}
      {history.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[#8a7e78] mb-3">Run History</h2>
          <div className="bg-white border border-[#e8e0db] rounded-xl shadow-card overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#fafaf8] border-b border-[#e8e0db]">
                  <th className="text-left px-3 py-2.5 font-semibold text-[#8a7e78]">Date</th>
                  <th className="text-center px-3 py-2.5 font-semibold text-[#8a7e78]">Week</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-[#8a7e78]">Confirmed</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-[#8a7e78]">Cut</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-[#8a7e78]">Pieces</th>
                  <th className="text-center px-3 py-2.5 font-semibold text-[#8a7e78]">Files</th>
                </tr>
              </thead>
              <tbody>
                {history.map((run, i) => (
                  <tr key={run.id} className={`border-t border-[#f0ebe8] ${i % 2 !== 0 ? 'bg-[#fafaf8]' : 'bg-white'}`}>
                    <td className="px-3 py-2 text-[#403833]">
                      {new Date(run.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      {' '}
                      <span className="text-[#c4b8b0]">{new Date(run.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-[#403833]">W{String(run.weekNum).padStart(2,'0')}</td>
                    <td className="px-3 py-2 text-right text-[#403833] font-semibold">{run.trucksConfirmed}</td>
                    <td className="px-3 py-2 text-right text-[#8a7e78]">{run.trucksCut}</td>
                    <td className="px-3 py-2 text-right text-[#403833]">{run.piecesShipped.toLocaleString()}</td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex gap-1.5 justify-center">
                        <button
                          onClick={() => downloadBase64Blob(run.confirmedBase64, `Confirmed_Loads_W${String(run.weekNum).padStart(2,'0')}.xlsx`)}
                          className="px-2 py-0.5 border border-[#e8e0db] rounded text-[#403833] hover:bg-[#fff8f0] hover:border-[#ffa236] transition-colors"
                        >Loads</button>
                        <button
                          onClick={() => downloadBase64Blob(run.cutBase64, `Cut_Lines_W${String(run.weekNum).padStart(2,'0')}.xlsx`)}
                          className="px-2 py-0.5 border border-[#e8e0db] rounded text-[#403833] hover:bg-[#fafaf8] transition-colors"
                        >Cuts</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCell({ label, value, dimIfZero, highlight }) {
  const isDim = dimIfZero && (value === 0 || value === '0');
  return (
    <div className="bg-white px-4 py-3.5">
      <p className="text-xs text-[#8a7e78] mb-1">{label}</p>
      <p className={`text-lg font-bold ${isDim ? 'text-[#c4b8b0]' : highlight ? 'text-[#ffa236]' : 'text-[#403833]'}`}>{value}</p>
    </div>
  );
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
