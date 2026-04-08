'use client';

import { useState, useEffect } from 'react';

/** Get current ISO week number */
function getCurrentISOWeek() {
  const now = new Date();
  const jan4 = new Date(now.getFullYear(), 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const diff = now - startOfWeek1;
  return Math.ceil(diff / (7 * 24 * 60 * 60 * 1000));
}

export default function SetupStep({ weekNum, year, onWeekChange, onYearChange, airtableData, onDataRefresh, onNext }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastSynced, setLastSynced] = useState(airtableData?.lastSynced || null);

  // Auto-load on mount if data not yet fetched
  useEffect(() => {
    if (!airtableData) handleRefresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = async (bustCache = false) => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/airtable?t=${Date.now()}`;
      const res = await fetch(url, { cache: 'no-store' });
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
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-[#403833] mb-1">Setup</h2>
      <p className="text-[#8a7e78] mb-6">Configure the week and load master data from Airtable.</p>

      {/* Week & Year inputs */}
      <div className="bg-white rounded-card shadow-card p-6 mb-4 border border-[#e8e0db]">
        <h3 className="text-base font-semibold text-[#403833] mb-4">Rounding Week</h3>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-[#403833] mb-1">
              Week Number
            </label>
            <input
              type="number"
              min="1"
              max="53"
              value={weekNum}
              onChange={e => onWeekChange(Number(e.target.value))}
              className="w-full border border-[#e8e0db] rounded-btn px-3 py-2 text-[#403833] focus:outline-none focus:ring-2 focus:ring-[#ffa236] focus:border-transparent"
            />
            <p className="text-xs text-[#8a7e78] mt-1">ISO week 1–53</p>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-[#403833] mb-1">
              Year
            </label>
            <input
              type="number"
              min="2024"
              max="2030"
              value={year}
              onChange={e => onYearChange(Number(e.target.value))}
              className="w-full border border-[#e8e0db] rounded-btn px-3 py-2 text-[#403833] focus:outline-none focus:ring-2 focus:ring-[#ffa236] focus:border-transparent"
            />
          </div>
        </div>
        <p className="text-xs text-[#8a7e78] mt-2">
          Vendor Shipment Numbers will include this week: <span className="font-mono font-medium text-[#403833]">{String(year).slice(-2)}{String(weekNum).padStart(2, '0')}...</span>
        </p>
      </div>

      {/* Airtable connection */}
      <div className="bg-white rounded-card shadow-card p-6 mb-4 border border-[#e8e0db]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-[#403833]">Airtable Data</h3>
          <div className="flex items-center gap-2">
            {lastSynced && (
              <span className="text-xs text-[#8a7e78]">
                Last synced: {new Date(lastSynced).toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => handleRefresh(true)}
              disabled={loading}
              className="
                px-4 py-2 bg-[#ffa236] text-white font-medium text-sm rounded-btn
                hover:bg-[#e8922e] active:bg-[#d4842a]
                disabled:opacity-60 disabled:cursor-not-allowed
                transition-colors flex items-center gap-2
              "
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Loading...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh Airtable Data
                </>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-[#f44336] rounded-btn text-sm text-[#f44336]">
            <strong>Connection error:</strong> {error}
            <button
              onClick={() => handleRefresh(true)}
              className="ml-2 underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Status cards */}
        <div className="grid grid-cols-2 gap-3">
          <StatusCard
            label="Connection"
            value={isConnected ? 'Connected' : error ? 'Error' : 'Not loaded'}
            color={isConnected ? 'success' : error ? 'danger' : 'neutral'}
            dot
          />
          <StatusCard
            label="Palletization Records"
            value={loading ? '...' : meta.palletizationCount ?? '—'}
            color="neutral"
          />
          <StatusCard
            label="Cost Lanes"
            value={loading ? '...' : meta.costCount ?? '—'}
            color="neutral"
          />
          <StatusCard
            label="Unique Suppliers"
            value={loading ? '...' : meta.uniqueSuppliers ?? '—'}
            color="neutral"
          />
        </div>
      </div>

      {/* Next button */}
      <div className="flex justify-end">
        <button
          onClick={onNext}
          disabled={!canProceed}
          className="
            px-6 py-2.5 bg-[#403833] text-white font-semibold rounded-btn
            hover:bg-[#2d2721] active:bg-[#1e1a17]
            disabled:opacity-40 disabled:cursor-not-allowed
            transition-colors flex items-center gap-2
          "
        >
          Next
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function StatusCard({ label, value, color, dot }) {
  const colorMap = {
    success: 'text-[#4caf50]',
    danger: 'text-[#f44336]',
    warning: 'text-[#ff9800]',
    neutral: 'text-[#403833]',
  };
  const dotColorMap = {
    success: 'bg-[#4caf50]',
    danger: 'bg-[#f44336]',
    neutral: 'bg-[#8a7e78]',
  };

  return (
    <div className="bg-[#fafafa] border border-[#e8e0db] rounded-btn p-3">
      <p className="text-xs text-[#8a7e78] mb-0.5">{label}</p>
      <div className="flex items-center gap-1.5">
        {dot && (
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColorMap[color] || dotColorMap.neutral}`} />
        )}
        <p className={`text-sm font-semibold ${colorMap[color] || colorMap.neutral}`}>
          {String(value)}
        </p>
      </div>
    </div>
  );
}
