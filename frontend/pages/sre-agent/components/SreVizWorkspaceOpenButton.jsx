import { memo, useState } from "react";
import { inferSreVizDisplayTitleFromQueueItem } from "../../../lib/sreMessageVizExtract.js";

const SreVizWorkspaceOpenButton = memo(function SreVizWorkspaceOpenButton({ item, onOpen }) {
  const [busy, setBusy] = useState(false);
  const leftTitle = inferSreVizDisplayTitleFromQueueItem(item);
  const hint =
    item?.kind === "path"
      ? `${leftTitle}\n${String(item.path || "")}`
      : item?.kind === "inline"
        ? `${leftTitle}${item.model?.type ? ` · ${item.model.type}` : ""}`
        : leftTitle;

  const run = async () => {
    setBusy(true);
    try {
      await onOpen(item);
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
      className="flex w-full min-w-0 items-center justify-between gap-3 rounded-lg border bg-gray-50 px-3 py-2.5 text-left shadow-sm transition hover:bg-primary/12 disabled:opacity-60 dark:border-primary/35 dark:bg-primary/10 dark:hover:bg-primary/18 hover:text-primary dark:hover:text-primary"
    >
      <span className="min-w-0 flex-1 truncate text-[13px] text-gray-900 dark:text-gray-100">{leftTitle}</span>
      <span className="shrink-0 text-[12px]">查看</span>
    </button>
  );
});

export default SreVizWorkspaceOpenButton;
