'use client';

import { useState, useEffect } from 'react';

function getCurrentISOWeek() {
  const now = new Date();
  const jan4 = new Date(now.getFullYear(), 0, 4);
  const start = new Date(jan4);
  start.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  return Math.ceil((now - start) / (7 * 24 * 60 * 60 * 1000));
}

export default function SetupStep({ weekNum, year, onWeekChange, onYearChange, airtableData, onDataRefresh, onNext }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastSynced, setLastSynced] = useState(airtableData?.lastSynced || null);

  useEffect(() => {
    if (!airtableData) handleRefresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/airtable?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) {
        const text = await res.text();
        let msg;
        try { msg = JSON.parse(text).error; } catch { msg = text.slice(0, 120); }
        throw new Error(msg || `HTTP ${res.status}`);
      }
      const data = await res.json();
      onDataRefresh(data);
      setLastSynced(data.lastSynced);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const meta = airtableData?.meta || {};
  const isConnected = !!airtableData && !error;
  const canProceed = isConnected && !loading;

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-stone-900 mb-6">Setup</h1>

      {/* Week & Year */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-400 mb-3">Rounding Week</h2>
        <div className="flex gap-3">
          <div>
            <label className="block text-xs text-stone-500 mb-1">Week</label>
            <input
              type="number" min="1" max="53"
              value={weekNum}
              onChange={e => onWeekChange(Number(e.target.value))}
              className="w-24 border border-stone-200 rounded px-3 py-1.5 text-sm text-stone-900 focus:outline-none focus:ring-1 focus:ring-orange-400 focus:border-orange-400 bg-white"
            />
          </div>
          <div>
            <label className="block text-xs text-stone-500 mb-1">Year</label>
            <input
              type="number" min="2024" max="2030"
              value={year}
              onChange={e => onYearChange(Number(e.target.value))}
              className="w-28 border border-stone-200 rounded px-3 py-1.5 text-sm text-stone-900 focus:outline-none focus:ring-1 focus:ring-orange-400 focus:border-orange-400 bg-white"
            />
          </div>
        </div>
        <p className="text-xs text-stone-400 mt-2">
          VSN prefix: <span className="font-mono text-stone-600">{String(year).slice(-2)}{String(weekNum).padStart(2, '0')}-…</span>
        </p>
      </section>

      {/* Airtable */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-400">Airtable Data</h2>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-900 disabled:opacity-50 transition-colors"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4.55 9A8 8 0 1120 15.45" />
            </svg>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {error && (
          <p className="text-xs text-red-500 mb-3">
            {error} —{' '}
            <button onClick={handleRefresh} className="underline">retry</button>
          </p>
        )}

        {loading && !airtableData && (
          <p className="text-sm text-stone-400">Connecting to Airtable…</p>
        )}

        {isConnected && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
              <span className="text-stone-700 font-medium">Connected</span>
              {lastSynced && (
                <span className="text-stone-400 text-xs">· synced {new Date(lastSynced).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              )}
            </div>
            <p className="text-xs text-stone-400 pl-3.5">
              {meta.palletizationCount ?? '—'} palletization rules
              · {meta.costCount ?? '—'} cost lanes
              · {meta.uniqueSuppliers ?? '—'} suppliers
            </p>
          </div>
        )}
      </section>

      {/* Next */}
      <button
        onClick={onNext}
        disabled={!canProceed}
        className="px-5 py-2 bg-orange-500 text-white text-sm font-medium rounded hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Next →
      </button>
    </div>
  );
}
