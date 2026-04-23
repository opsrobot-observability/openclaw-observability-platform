import { memo, useState } from "react";

const FinalReportWorkspaceOpenButton = memo(function FinalReportWorkspaceOpenButton({ path, onOpen }) {
  const [busy, setBusy] = useState(false);
  const hint = String(path || "");

  const run = async () => {
    setBusy(true);
    try {
      await onOpen({ kind: "final_report", path });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      disabled={busy}
      title={hint}
      onClick={run}
      className="flex w-full min-w-0 items-center justify-between gap-3 rounded-lg border border-violet-200/90 bg-violet-50/80 px-3 py-3 text-left shadow-sm transition hover:border-violet-400/50 hover:bg-violet-100/90 disabled:opacity-60 dark:border-violet-800/80 dark:bg-violet-950/40 dark:hover:border-violet-500/50 dark:hover:bg-violet-950/70"
    >
      <span className="min-w-0 flex-1 text-[13px] font-medium text-violet-950 dark:text-violet-100">报告预览</span>
      <span className="shrink-0 text-[12px] text-violet-700/90 dark:text-violet-300/90">在右侧打开</span>
    </button>
  );
});

export default FinalReportWorkspaceOpenButton;
