import { useState } from "react";

/**
 * ToolCallCard — AG-UI Tool Call 渲染卡片
 * 展示工具调用的名称、参数和执行结果
 */
export default function ToolCallCard({ toolCall }) {
  const [expanded, setExpanded] = useState(false);

  const statusColors = {
    running: "border-blue-300 bg-blue-50/50 dark:border-blue-700 dark:bg-blue-950/30",
    completed: "border-gray-200 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-800/50",
  };

  let parsedArgs = null;
  try {
    parsedArgs = JSON.parse(toolCall.args);
  } catch {
    // keep raw string
  }

  return (
    <div className={`rounded-lg border text-xs ${statusColors[toolCall.status] ?? statusColors.completed}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        {toolCall.status === "running" ? (
          <svg className="h-3.5 w-3.5 animate-spin text-primary shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg className="h-3.5 w-3.5 text-emerald-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        )}
        <span className="font-mono font-semibold text-gray-700 dark:text-gray-200">
          {toolCall.name}
        </span>
        {parsedArgs?.command && (
          <code className="truncate text-gray-500 dark:text-gray-400">
            {parsedArgs.command}
          </code>
        )}
        <svg
          className={`ml-auto h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          viewBox="0 0 20 20" fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-gray-200/60 dark:border-gray-700/60">
          {toolCall.args && (
            <div className="px-3 py-2">
              <p className="mb-1 font-semibold text-gray-500 dark:text-gray-400">参数</p>
              <pre className="whitespace-pre-wrap break-all font-mono text-gray-600 dark:text-gray-300">
                {parsedArgs ? JSON.stringify(parsedArgs, null, 2) : toolCall.args}
              </pre>
            </div>
          )}
          {toolCall.result && (
            <div className="border-t border-gray-200/60 px-3 py-2 dark:border-gray-700/60">
              <p className="mb-1 font-semibold text-gray-500 dark:text-gray-400">执行结果</p>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-gray-600 dark:text-gray-300">
                {toolCall.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
