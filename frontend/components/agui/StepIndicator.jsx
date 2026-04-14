/**
 * StepIndicator — AG-UI 步骤进度指示器
 * 展示 Agent 的多步骤执行过程
 */
export default function StepIndicator({ steps }) {
  if (!steps.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-1 py-2 text-xs">
      {steps.map((step, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {step.status === "running" ? (
            <svg className="h-3.5 w-3.5 animate-spin text-primary" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="h-3.5 w-3.5 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
          <span className={step.status === "running" ? "font-medium text-primary" : "text-gray-400 dark:text-gray-500"}>
            {step.name}
          </span>
          {i < steps.length - 1 && (
            <svg className="h-3 w-3 text-gray-300 dark:text-gray-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          )}
        </span>
      ))}
    </div>
  );
}
