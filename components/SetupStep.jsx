'use client';

import { useState, useEffect } from 'react';

const CACHE_KEY = 'airtable_data_cache';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, savedAt } = JSON.parse(raw);
    if (Date.now() - savedAt > CACHE_TTL_MS) return null;
    return data;
  } catch { return null; }
}

function saveCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, savedAt: Date.now() }));
  } catch {}
}

export default function SetupStep({ airtableData, onDataRefresh, onNext }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fromCache, setFromCache] = useState(false);
  const [lastSynced, setLastSynced] = useState(airtableData?.lastSynced || null);
  const [isBedsAndAcc, setIsBedsAndAcc] = useState(true);

  useEffect(() => {
    if (airtableData) return;
    const cached = loadCache();
    if (cached) {
      onDataRefresh(cached);
      setLastSynced(cached.lastSynced);
      setFromCache(true);
    } else {
      handleRefresh();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = async () => {
    setLoading(true);
    setError(null);
    setFromCache(false);
    try {
      const res = await fetch(`/api/airtable?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) {
        const text = await res.text();
        let msg;
        try { msg = JSON.parse(text).error; } catch { msg = text.slice(0, 120); }
        throw new Error(msg || `HTTP ${res.status}`);
      }
      const data = await res.json();
      saveCache(data);
      onDataRefresh(data);
      setLastSynced(data.lastSynced);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const isConnected = !!airtableData && !error;

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-[#403833] mb-1">Setup</h1>
      <p className="text-[#8a7e78] mb-8">Connect to Airtable before running the rounding.</p>

      <div className="bg-white border border-[#e8e0db] rounded-xl shadow-card p-5 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {loading ? (
              <svg className="animate-spin w-4 h-4 text-[#ffa236]" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            ) : (
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isConnected ? 'bg-green-500' : error ? 'bg-red-400' : 'bg-[#e8e0db]'}`} />
            )}
            <div>
              <p className="text-sm font-medium text-[#403833]">
                {loading ? 'Connecting…' : isConnected ? 'Connected' : error ? 'Connection failed' : 'Not connected'}
              </p>
              {lastSynced && !loading && (
                <p className="text-xs text-[#8a7e78]">
                  {fromCache ? 'Cached · ' : ''}Last sync {new Date(lastSynced).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
              {airtableData && !loading && (
                <p className="text-xs text-[#8a7e78] mt-0.5">
                  {airtableData.palletization?.length ?? 0} SKUs · {airtableData.costs?.length ?? 0} cost lanes
                </p>
              )}
            </div>
          </div>

          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-[#8a7e78] hover:text-[#403833] disabled:opacity-40 transition-colors"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4.55 9A8 8 0 1120 15.45" />
            </svg>
            Refresh
          </button>
        </div>

        {error && (
          <p className="mt-3 text-xs text-red-600">{error} — <button onClick={handleRefresh} className="underline">retry</button></p>
        )}
      </div>

      {/* Round type */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-[#403833] mb-2">Round type</p>
        <div className="inline-flex rounded-lg border border-[#e8e0db] overflow-hidden text-sm">
          <button
            onClick={() => setIsBedsAndAcc(true)}
            className={`px-4 py-2 font-medium transition-colors ${isBedsAndAcc ? 'bg-[#403833] text-white' : 'bg-white text-[#8a7e78] hover:bg-[#fafaf8]'}`}
          >
            Beds &amp; Accessories
          </button>
          <button
            onClick={() => setIsBedsAndAcc(false)}
            className={`px-4 py-2 font-medium border-l border-[#e8e0db] transition-colors ${!isBedsAndAcc ? 'bg-[#403833] text-white' : 'bg-white text-[#8a7e78] hover:bg-[#fafaf8]'}`}
          >
            Mattress
          </button>
        </div>
        <p className="text-xs text-[#8a7e78] mt-1.5">
          {isBedsAndAcc
            ? 'Milk run detection is enabled — multi-stop routes will be proposed where eligible.'
            : 'Milk run detection is disabled for this round type.'}
        </p>
      </div>

      <button
        onClick={() => onNext(isBedsAndAcc)}
        disabled={!isConnected || loading}
        className="btn-primary"
      >
        Ready to round →
      </button>
    </div>
  );
}
