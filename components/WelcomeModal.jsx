'use client';

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'truck_rounding_welcomed';

const STEPS = [
  {
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    label: 'Setup',
    desc: 'Auto-connects to Airtable to pull palletization rules and transport costs. Runs once per session — cached for 6 hours.',
  },
  {
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
    ),
    label: 'Upload',
    desc: 'Drop your SO99+ Proposals export. Must include an origin_location_code column. Prio 4 / Index 1 file is optional for top-up.',
  },
  {
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2 20c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 6 0M12 3v11M5 14l7-4 7 4M9 8h6" />
      </svg>
    ),
    label: 'Milk Run',
    desc: 'Review proposed multi-stop routes combining cut/borderline trucks. Approve to consolidate, cut to keep them separate. Beds & Accessories only.',
  },
  {
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
    label: 'Review',
    desc: 'Decide on borderline and cut trucks one by one. Accept the cut, force keep with a justification, or book a 20ft container instead.',
  },
  {
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M1 3h15v13H1V3zm15 4h4l3 3v6h-7V7zM5 19a2 2 0 100-4 2 2 0 000 4zm14 0a2 2 0 100-4 2 2 0 000 4z" />
      </svg>
    ),
    label: 'Transport',
    desc: 'Set the transport mode (Road / Rail / Sea) for each 40ft container shipment. Rail and sea costs are compared automatically.',
  },
  {
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
    ),
    label: 'Results',
    desc: 'Download Confirmed Loads and Cut Lines as .xlsx files, ready to send. Past runs are saved locally for re-download.',
  },
];

export default function WelcomeModal({ forceOpen = false, onClose }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (forceOpen) { setVisible(true); return; }
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {}
  }, [forceOpen]);

  const dismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
    setVisible(false);
    onClose?.();
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-card-hover w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-b from-[#2e2219] to-[#403833] rounded-t-2xl px-6 pt-6 pb-5">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-lg bg-[#ffa236]/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-[#ffa236]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M1 3h15v13H1V3zm15 4h4l3 3v6h-7V7zM5 19a2 2 0 100-4 2 2 0 000 4zm14 0a2 2 0 100-4 2 2 0 000 4z" />
              </svg>
            </div>
            <span className="text-white font-bold text-lg tracking-tight">Truck Rounding</span>
          </div>
          <p className="text-white/70 text-sm leading-relaxed">
            Round your SO99+ purchase order quantities into full trucks and containers,
            review cut decisions, and export ready-to-send shipment files.
          </p>
        </div>

        {/* Steps */}
        <div className="px-6 pt-5 pb-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#8a7e78] mb-4">How it works</p>
          <div className="space-y-4">
            {STEPS.map((s, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center shrink-0">
                  <div className="w-7 h-7 rounded-full bg-[#f0ebe8] flex items-center justify-center text-[#403833]">
                    {s.icon}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="w-px flex-1 bg-[#e8e0db] mt-1.5 mb-0 min-h-[16px]" />
                  )}
                </div>
                <div className="pb-4">
                  <p className="text-sm font-semibold text-[#403833]">{s.label}</p>
                  <p className="text-xs text-[#8a7e78] mt-0.5 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex items-center justify-between gap-4">
          <p className="text-xs text-[#c4b8b0]">Emma Sleep · D2C Ops</p>
          <button onClick={dismiss} className="btn-primary">
            Got it, let's start →
          </button>
        </div>
      </div>
    </div>
  );
}
