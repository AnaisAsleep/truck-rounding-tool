'use client';

export default function ProgressBar({ currentStep, steps }) {
  const stepList = steps
    ? steps.map((label, idx) => ({ id: idx, label }))
    : [
        { id: 0, label: 'Setup' },
        { id: 1, label: 'Upload' },
        { id: 2, label: 'Transport' },
        { id: 3, label: 'Review' },
        { id: 4, label: 'Results' },
      ];

  return (
    <div className="w-full py-5 px-6 bg-white border-b border-[#e8e0db]">
      <div className="max-w-5xl mx-auto flex items-center">
        {stepList.map((step, idx) => {
          const completed = currentStep > step.id;
          const active    = currentStep === step.id;
          const isLast    = idx === stepList.length - 1;

          return (
            <div key={step.id} className="flex items-center" style={{ flex: isLast ? '0 0 auto' : '1 1 0' }}>
              {/* Circle + label */}
              <div className="flex flex-col items-center gap-1.5">
                <div className={`
                  w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold
                  transition-all duration-200 shrink-0
                  ${completed ? 'bg-[#403833] text-white'
                    : active   ? 'bg-[#ffa236] text-white ring-4 ring-[#ffa236]/20'
                    :            'bg-white text-[#8a7e78] border border-[#e8e0db]'}
                `}>
                  {completed ? (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    step.id + 1
                  )}
                </div>
                <span className={`text-[10px] font-medium whitespace-nowrap ${
                  active    ? 'text-[#ffa236]'
                  : completed ? 'text-[#403833]'
                  :             'text-[#c4b8b0]'
                }`}>
                  {step.label}
                </span>
              </div>

              {/* Connector */}
              {!isLast && (
                <div className={`flex-1 h-px mx-2 mb-4 transition-colors duration-200 ${
                  completed ? 'bg-[#403833]' : 'bg-[#e8e0db]'
                }`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
