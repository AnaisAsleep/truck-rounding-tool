'use client';

export default function ProgressBar({ currentStep, steps }) {
  const stepList = (steps || ['Setup', 'Upload', 'Transport', 'Review', 'Results'])
    .map((label, id) => ({ id, label }));

  return (
    <div className="border-b border-stone-200 bg-white">
      <div className="max-w-5xl mx-auto px-6 py-3 flex items-center gap-1">
        {stepList.map((step, idx) => {
          const completed = currentStep > step.id;
          const active    = currentStep === step.id;
          const isLast    = idx === stepList.length - 1;

          return (
            <div key={step.id} className="flex items-center gap-1">
              <div className="flex items-center gap-1.5">
                <span className={`
                  w-5 h-5 rounded-full text-[10px] font-semibold flex items-center justify-center shrink-0
                  ${completed ? 'bg-stone-800 text-white'
                    : active   ? 'bg-orange-500 text-white'
                    :            'bg-stone-100 text-stone-400'}
                `}>
                  {completed
                    ? <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="currentColor"><path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    : step.id + 1}
                </span>
                <span className={`text-xs ${active ? 'text-orange-500 font-medium' : completed ? 'text-stone-600' : 'text-stone-300'}`}>
                  {step.label}
                </span>
              </div>
              {!isLast && <span className="text-stone-200 mx-1 text-xs select-none">/</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
