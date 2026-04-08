'use client';

import { useEffect, useState } from 'react';
import { exportConfirmedLoads, exportCutLines, generateBase64Blobs, downloadBase64Blob } from '../lib/excelExporter';
import { calcSummaryStats } from '../lib/rounding';

const HISTORY_KEY = 'truck_rounding_history';

export default function ResultsStep({ finalConfirmed, finalCutLines, weekNum, year, onStartOver }) {
  const [history, setHistory] = useState([]);
  const stats = calcSummaryStats(finalConfirmed, finalCutLines);
  const ww = String(weekNum).padStart(2, '0');

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
    <div className="max-w-2xl">
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

      {/* Downloads */}
      <div className="flex gap-3 mb-8">
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
