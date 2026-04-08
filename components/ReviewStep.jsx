'use client';

import { useState, useEffect } from 'react';
import TruckCard from './TruckCard';

/**
 * ReviewStep — User reviews borderline trucks (€10-20/piece cost).
 *
 * Decisions are now shaped as: { action: 'keep'|'cut', rootCause: string|null }
 * A cut decision is only considered "complete" once a root cause is selected.
 * The "Confirm Decisions" button stays disabled until all trucks have a complete decision.
 */
export default function ReviewStep({ borderlineTrucks, onConfirm, onBack }) {
  // decisions: { [vsn]: { action: 'keep'|'cut', rootCause: string|null } }
  const [decisions, setDecisions] = useState({});

  // Auto-advance if no borderline trucks
  useEffect(() => {
    if (borderlineTrucks && borderlineTrucks.length === 0) {
      const timer = setTimeout(() => onConfirm({}), 1200);
      return () => clearTimeout(timer);
    }
  }, [borderlineTrucks, onConfirm]);

  const handleKeep = (vsn) => {
    setDecisions(d => ({ ...d, [vsn]: { action: 'keep', rootCause: null } }));
  };

  // Called from TruckCard once the user selects a root cause
  const handleCut = (vsn, rootCause) => {
    setDecisions(d => ({ ...d, [vsn]: { action: 'cut', rootCause } }));
  };

  // A decision is "complete" if:
  //   - action is 'keep' (no root cause needed), OR
  //   - action is 'cut' AND rootCause is set
  const isComplete = (d) => d && (d.action === 'keep' || (d.action === 'cut' && d.rootCause));

  const allDecided = borderlineTrucks?.every(t => isComplete(decisions[t.vendorShipmentNumber]));
  const decidedCount = borderlineTrucks?.filter(t => isComplete(decisions[t.vendorShipmentNumber])).length ?? 0;

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
        These trucks have a cost per piece between €10 and €20. Keep or cut each one.
        If you cut, select a root cause — it will appear in the Cut Lines report.
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
        <div className="flex items-center gap-3">
          {!allDecided && (
            <p className="text-xs text-[#8a7e78]">
              {borderlineTrucks.length - decidedCount} truck{borderlineTrucks.length - decidedCount !== 1 ? 's' : ''} still need a decision
            </p>
          )}
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
    </div>
  );
}
