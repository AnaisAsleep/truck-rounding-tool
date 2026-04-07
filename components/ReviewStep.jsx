'use client';

import { useState, useEffect } from 'react';
import TruckCard from './TruckCard';

export default function ReviewStep({ borderlineTrucks, onConfirm, onBack }) {
  const [decisions, setDecisions] = useState({});

  // Auto-advance if no borderline trucks
  useEffect(() => {
    if (borderlineTrucks && borderlineTrucks.length === 0) {
      const timer = setTimeout(() => onConfirm({}), 1200);
      return () => clearTimeout(timer);
    }
  }, [borderlineTrucks, onConfirm]);

  const handleKeep = (vsn) => setDecisions(d => ({ ...d, [vsn]: 'keep' }));
  const handleCut = (vsn) => setDecisions(d => ({ ...d, [vsn]: 'cut' }));

  const allDecided = borderlineTrucks?.every(t => decisions[t.vendorShipmentNumber]);
  const decidedCount = Object.keys(decisions).length;

  if (!borderlineTrucks || borderlineTrucks.length === 0) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-green-50 border border-[#4caf50] rounded-card p-6 text-center">
          <svg className="w-10 h-10 text-[#4caf50] mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-base font-semibold text-[#4caf50]">No borderline trucks</p>
          <p className="text-sm text-[#4caf50] opacity-80 mt-1">All decisions were automatic. Advancing...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-[#403833] mb-1">Review Borderline Trucks</h2>
      <p className="text-[#8a7e78] mb-2">
        These trucks have a cost per piece between €10 and €20. Review each one and decide whether to keep or cut.
      </p>
      <div className="flex items-center gap-3 mb-6">
        <span className="inline-flex items-center px-2.5 py-1 bg-[#fff3e0] border border-[#ffa236] rounded-btn text-sm font-semibold text-[#ffa236]">
          {borderlineTrucks.length} trucks to review
        </span>
        <span className="text-sm text-[#8a7e78]">{decidedCount} / {borderlineTrucks.length} decided</span>
      </div>

      <div className="space-y-4 mb-6">
        {borderlineTrucks.map(truck => (
          <TruckCard
            key={truck.vendorShipmentNumber}
            truck={truck}
            mode="review"
            onKeep={handleKeep}
            onCut={handleCut}
            userDecision={decisions[truck.vendorShipmentNumber]}
          />
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
          onClick={() => onConfirm(decisions)}
          disabled={!allDecided}
          className="
            px-6 py-2.5 bg-[#403833] text-white font-semibold rounded-btn
            hover:bg-[#2d2721] disabled:opacity-40 disabled:cursor-not-allowed
            transition-colors
          "
        >
          Confirm Decisions →
        </button>
      </div>
    </div>
  );
}
