'use client';

import { useState, useEffect } from 'react';

export default function SetupStep({ airtableData, onDataRefresh, onNext }) {
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

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-[#403833] mb-1">Setup</h1>
      <p className="text-[#8a7e78] mb-8">Connect to Airtable to load palletization rules and transport costs.</p>

      <div className="bg-white border border-[#e8e0db] rounded-xl shadow-card p-6 mb-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-[#403833]">Airtable Data</h2>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-[#8a7e78] hover:text-[#403833] disabled:opacity-50 transition-colors"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4.55 9A8 8 0 1120 15.45" />
            </svg>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-600 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
            {error}
            <button onClick={handleRefresh} className="underline ml-1">Retry</button>
          </div>
        )}

        {loading && !airtableData ? (
          <div className="flex items-center gap-2 text-sm text-[#8a7e78]">
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            Connecting…
          </div>
        ) : isConnected ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
              <span className="text-sm font-medium text-[#403833]">Connected</span>
              {lastSynced && (
                <span className="text-xs text-[#8a7e78]">
                  · synced {new Date(lastSynced).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Palletization rules', value: meta.palletizationCount },
                { label: 'Cost lanes', value: meta.costCount },
                { label: 'Suppliers', value: meta.uniqueSuppliers },
              ].map(({ label, value }) => (
                <div key={label} className="bg-[#fafaf8] border border-[#e8e0db] rounded-lg p-3">
                  <p className="text-xs text-[#8a7e78] mb-0.5">{label}</p>
                  <p className="text-lg font-bold text-[#403833]">{value ?? '—'}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <button
        onClick={onNext}
        disabled={!isConnected || loading}
        className="px-6 py-2.5 bg-[#ffa236] text-white font-semibold text-sm rounded-lg hover:bg-[#e8922e] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Next →
      </button>
    </div>
  );
}
