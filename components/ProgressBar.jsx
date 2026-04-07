'use client';

const STEPS = [
  { id: 1, label: 'Setup' },
  { id: 2, label: 'Upload' },
  { id: 3, label: 'Review' },
  { id: 4, label: 'Override' },
  { id: 5, label: 'Results' },
];

export default function ProgressBar({ currentStep }) {
  return (
    <div className="w-full py-4 px-6">
      <div className="flex items-center justify-center gap-0">
        {STEPS.map((step, idx) => {
          const isCompleted = currentStep > step.id;
          const isActive = currentStep === step.id;
          const isLast = idx === STEPS.length - 1;

          return (
            <div key={step.id} className="flex items-center">
              {/* Step circle + label */}
              <div className="flex flex-col items-center">
                <div
                  className={`
                    w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold
                    transition-all duration-200
                    ${isCompleted
                      ? 'bg-[#4caf50] text-white'
                      : isActive
                        ? 'bg-[#ffa236] text-white shadow-md'
                        : 'bg-[#e8e0db] text-[#8a7e78]'
                    }
                  `}
                >
                  {isCompleted ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    step.id
                  )}
                </div>
                <span
                  className={`
                    mt-1.5 text-xs font-medium
                    ${isActive ? 'text-[#ffa236]' : isCompleted ? 'text-[#4caf50]' : 'text-[#8a7e78]'}
                  `}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {!isLast && (
                <div
                  className={`
                    h-0.5 w-16 mx-2 mt-[-16px] transition-all duration-200
                    ${isCompleted ? 'bg-[#4caf50]' : 'bg-[#e8e0db]'}
                  `}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
