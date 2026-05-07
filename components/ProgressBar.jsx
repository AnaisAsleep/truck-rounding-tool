'use client';

export default function ProgressBar({ currentStep, steps, helpButton }) {
  const stepList = (steps || ['Setup', 'Upload', 'Transport', 'Review', 'Results'])
    .map((label, id) => ({ id, label }));

  return (
    <div className="bg-white border-b border-[#e8e0db]">
      <div className="max-w-5xl mx-auto px-6 py-3 flex items-center gap-3">
        <div className="flex flex-1 items-center">
        {stepList.map((step, idx) => {
          const done   = currentStep > step.id;
          const active = currentStep === step.id;
          const isLast = idx === stepList.length - 1;

          return (
            <div key={step.id} className="flex items-center" style={{ flex: isLast ? '0 0 auto' : '1 1 0' }}>
              <div className="flex items-center gap-2">
                <div className={`
                  w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 transition-all
                  ${done   ? 'bg-[#403833] text-white'
                  : active ? 'bg-[#ffa236] text-white shadow-orange ring-2 ring-[#ffa236]/25 ring-offset-1'
                  :          'bg-[#f0ebe8] text-[#c4b8b0]'}
                `}>
                  {done
                    ? <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M2 6l3 3 5-5"/></svg>
                    : step.id + 1}
                </div>
                <span className={`text-xs font-medium hidden sm:inline ${active ? 'text-[#ffa236]' : done ? 'text-[#403833]' : 'text-[#c4b8b0]'}`}>
                  {step.label}
                </span>
              </div>
              {!isLast && (
                <div className={`flex-1 h-0.5 mx-3 rounded-full transition-colors ${done ? 'bg-[#403833]' : 'bg-[#e8e0db]'}`} />
              )}
            </div>
          );
        })}
        </div>
        {helpButton && <div className="shrink-0">{helpButton}</div>}
      </div>
    </div>
  );
}
