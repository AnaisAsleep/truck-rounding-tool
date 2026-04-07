'use client';

import { useState, useEffect } from 'react';
import TruckCard from './TruckCard';

export default function OverrideStep({ cutTrucks, onFinalize, onBack }) {
  const [forceKept, setForceKept] = useState(new Set());

  // Auto-advance if no cut trucks
  useEffect(() => {
    if (cutTrucks && cutTrucks.length === 0) {
      const timer = setTimeout(() => onFinalize([]), 1000);
      return () => clearTimeout(timer);
    }
  }, [cutTrucks, onFinalize]);

  const handleForceKeep = (vsn) => {
    setForceKept(prev => {
      const next = new Set(prev);
      if (next.has(vsn)) {
        next.delete(vsn);
      } else {
        next.add(vsn);
      }
      return next;
    });
  };

  if (!cutTrucks || cutTrucks.length === 0) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-green-50 border border-[#4caf50] rounded-card p-6 text-center">
          <svg className="w-10 h-10 text-[#4caf50] mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-base font-semibold text-[#4caf50]">No cut trucks</p>
          <p className="text-sm text-[#4caf50] opacity-80 mt-1">Advancing to results...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-[#403833] mb-1">Override Cut Trucks</h2>
      <p className="text-[#8a7e78] mb-2">
        These trucks were cut by the algorithm. If any are urgently needed for stock, you can force-keep them.
      </p>
      <div className="flex items-center gap-3 mb-6">
        <span className="inline-flex items-center px-2.5 py-1 bg-red-50 border border-[#f44336] rounded-btn text-sm font-semibold text-[#f44336]">
          {cutTrucks.length} trucks cut
        </span>
        {forceKept.size > 0 && (
          <span className="inline-flex items-center px-2.5 py-1 bg-[#fff3e0] border border-[#ffa236] rounded-btn text-sm font-semibold text-[#ffa236]">
            {forceKept.size} force-kept
          </span>
        )}
      </div>

      <div className="space-y-4 mb-6">
        {cutTrucks.map(truck => (
          <div
            key={truck.vendorShipmentNumber}
            className={forceKept.has(truck.vendorShipmentNumber) ? 'opacity-60 ring-2 ring-[#ffa236] rounded-card' : ''}
          >
            <TruckCard
              truck={truck}
              mode="override"
              onForceKeep={handleForceKeep}
            />
            {forceKept.has(truck.vendorShipmentNumber) && (
              <div className="mt-1 px-3 py-1.5 bg-[#fff3e0] border border-[#ffa236] rounded-btn text-xs text-[#ffa236] font-medium flex items-center justify-between">
                <span>⚡ Force-kept — will appear in Confirmed Loads as &quot;Manually kept — user override (urgent stock)&quot;</span>
                <button
                  onClick={() => handleForceKeep(truck.vendorShipmentNumber)}
                  className="ml-2 underline"
                >
                  Undo
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="px-4 py-2 text-[#403833] border border-[#e8e0db] rounded-btn text-sm font-medium hover:bg-[#fafafa] transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={() => onFinalize(Array.from(forceKept))}
          className="
            px-6 py-2.5 bg-[#ffa236] text-white font-semibold rounded-btn
            hover:bg-[#e8922e] active:bg-[#d4842a]
            transition-colors flex items-center gap-2
          "
        >
          Finalize & Generate Output →
        </button>
      </div>
    </div>
  );
}
