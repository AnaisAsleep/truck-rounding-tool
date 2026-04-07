'use client';

import { useEffect, useState } from 'react';
import { exportConfirmedLoads, exportCutLines, generateBase64Blobs, downloadBase64Blob } from '../lib/excelExporter';
import { calcSummaryStats } from '../lib/rounding';

const HISTORY_KEY = 'truck_rounding_history';

export default function ResultsStep({ finalConfirmed, finalCutLines, weekNum, year, onStartOver }) {
  const [history, setHistory] = useState([]);

  const stats = calcSummaryStats(finalConfirmed, finalCutLines);
  const ww = String(weekNum).padStart(2, '0');

  // Save run to history on mount
  useEffect(() => {
    if (!finalConfirmed) return;

    try {
      const { confirmedBase64, cutBase64 } = generateBase64Blobs(finalConfirmed, finalCutLines, weekNum);

      const run = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        weekNum,
        year,
        trucksConfirmed: stats.totalTrucksConfirmed,
        trucksCut: stats.totalTrucksCut,
        piecesShipped: stats.totalPiecesShipped,
        piecesCut: stats.totalPiecesCut,
        confirmedBase64,
        cutBase64,
      };

      const existing = loadHistory();
      const updated = [run, ...existing].slice(0, 20); // Keep last 20 runs
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
      setHistory(updated);
    } catch (err) {
      console.warn('Could not save run history:', err);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load history on mount
  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-[#403833] mb-1">Results</h2>
      <p className="text-[#8a7e78] mb-6">Week {weekNum}, {year} — rounding complete.</p>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <StatCard
          label="Trucks Confirmed"
          value={stats.totalTrucksConfirmed}
          color="success"
          icon="🚛"
        />
        <StatCard
          label="Trucks Cut"
          value={stats.totalTrucksCut}
          color={stats.totalTrucksCut > 0 ? 'danger' : 'neutral'}
          icon="✂️"
        />
        <StatCard
          label="Pieces Shipped"
          value={stats.totalPiecesShipped.toLocaleString()}
          color="neutral"
          icon="📦"
        />
        <StatCard
          label="Pieces Cut"
          value={stats.totalPiecesCut.toLocaleString()}
          color={stats.totalPiecesCut > 0 ? 'warning' : 'neutral'}
          icon="🔻"
        />
        <StatCard
          label="Avg Utilization"
          value={`${(stats.avgUtilization * 100).toFixed(1)}%`}
          color={stats.avgUtilization >= 0.8 ? 'success' : stats.avgUtilization >= 0.5 ? 'warning' : 'danger'}
          icon="📊"
        />
        <StatCard
          label="Total Transport Cost"
          value={stats.totalTransportCost > 0 ? `€${stats.totalTransportCost.toFixed(0)}` : '—'}
          color="neutral"
          icon="💶"
        />
      </div>

      {/* Download buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <DownloadButton
          label="Download Confirmed Loads"
          filename={`Confirmed_Loads_W${ww}.xlsx`}
          color="success"
          onClick={() => exportConfirmedLoads(finalConfirmed, weekNum)}
          count={`${stats.totalTrucksConfirmed} trucks, ${stats.totalPiecesShipped.toLocaleString()} pieces`}
        />
        <DownloadButton
          label="Download Cut Lines"
          filename={`Cut_Lines_W${ww}.xlsx`}
          color="danger"
          onClick={() => exportCutLines(finalCutLines, weekNum)}
          count={`${finalCutLines.length} lines, ${stats.totalPiecesCut.toLocaleString()} pieces`}
        />
      </div>

      {/* Start over */}
      <div className="flex justify-center mb-8">
        <button
          onClick={onStartOver}
          className="px-5 py-2 border border-[#e8e0db] rounded-btn text-sm text-[#8a7e78] font-medium hover:bg-[#fafafa] hover:text-[#403833] transition-colors"
        >
          ↩ Start New Rounding Run
        </button>
      </div>

      {/* Run history */}
      {history.length > 0 && (
        <div>
          <h3 className="text-base font-semibold text-[#403833] mb-3">Run History</h3>
          <p className="text-xs text-[#8a7e78] mb-3">
            Saved in your browser. History is personal to this device.
          </p>
          <div className="bg-white border border-[#e8e0db] rounded-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#403833] text-white text-xs">
                  <th className="text-left p-3">Date & Time</th>
                  <th className="text-center p-3">Week</th>
                  <th className="text-right p-3">Confirmed</th>
                  <th className="text-right p-3">Cut</th>
                  <th className="text-right p-3">Pieces</th>
                  <th className="text-center p-3">Download</th>
                </tr>
              </thead>
              <tbody>
                {history.map((run, i) => (
                  <tr key={run.id} className={`border-t border-[#e8e0db] ${i % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'}`}>
                    <td className="p-3 text-[#403833]">
                      {new Date(run.timestamp).toLocaleString(undefined, {
                        month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="p-3 text-center font-mono text-[#403833]">
                      W{String(run.weekNum).padStart(2, '0')} {run.year}
                    </td>
                    <td className="p-3 text-right text-[#4caf50] font-semibold">{run.trucksConfirmed}</td>
                    <td className="p-3 text-right text-[#f44336] font-semibold">{run.trucksCut}</td>
                    <td className="p-3 text-right text-[#403833]">{run.piecesShipped.toLocaleString()}</td>
                    <td className="p-3 text-center">
                      <div className="flex gap-1.5 justify-center">
                        <button
                          onClick={() => downloadBase64Blob(run.confirmedBase64, `Confirmed_Loads_W${String(run.weekNum).padStart(2,'0')}.xlsx`)}
                          className="px-2 py-1 bg-green-50 border border-[#4caf50] text-[#4caf50] rounded text-xs font-medium hover:bg-[#4caf50] hover:text-white transition-colors"
                        >
                          ✓ Loads
                        </button>
                        <button
                          onClick={() => downloadBase64Blob(run.cutBase64, `Cut_Lines_W${String(run.weekNum).padStart(2,'0')}.xlsx`)}
                          className="px-2 py-1 bg-red-50 border border-[#f44336] text-[#f44336] rounded text-xs font-medium hover:bg-[#f44336] hover:text-white transition-colors"
                        >
                          ✂ Cuts
                        </button>
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

function StatCard({ label, value, color, icon }) {
  const bg = { success: 'bg-green-50 border-green-200', danger: 'bg-red-50 border-red-200', warning: 'bg-orange-50 border-orange-200', neutral: 'bg-white border-[#e8e0db]' };
  const textColor = { success: 'text-[#4caf50]', danger: 'text-[#f44336]', warning: 'text-[#ff9800]', neutral: 'text-[#403833]' };

  return (
    <div className={`border rounded-card p-4 ${bg[color] || bg.neutral}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{icon}</span>
        <p className="text-xs text-[#8a7e78]">{label}</p>
      </div>
      <p className={`text-xl font-bold ${textColor[color] || textColor.neutral}`}>{value}</p>
    </div>
  );
}

function DownloadButton({ label, filename, color, onClick, count }) {
  const styles = {
    success: 'bg-[#4caf50] hover:bg-[#43a047] border-[#4caf50]',
    danger: 'bg-[#f44336] hover:bg-[#e53935] border-[#f44336]',
  };

  return (
    <button
      onClick={onClick}
      className={`
        w-full py-4 px-5 rounded-card text-white font-semibold
        flex flex-col items-center justify-center gap-1
        transition-colors shadow-card
        ${styles[color] || styles.success}
      `}
    >
      <div className="flex items-center gap-2 text-base">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        {label}
      </div>
      <span className="text-xs opacity-80">{filename}</span>
      <span className="text-xs opacity-70">{count}</span>
    </button>
  );
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
