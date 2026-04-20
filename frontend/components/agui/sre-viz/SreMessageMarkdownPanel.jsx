/**
 * 纯 Markdown 消息面板：用于 Agent 推送的长文本说明（`@ant-design/x-markdown` 渲染）。
 */

import XMarkdown from "@ant-design/x-markdown";
import { Shell } from "./SreVizShell.jsx";

export function SreMessageMarkdownPanel({ panel }) {
  return (
    <Shell title={panel.title || "消息"} accent="blue">
      <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-gray-100 bg-white px-3 py-2 text-[13px] dark:border-gray-700 dark:bg-gray-950/50">
        <div className="sre-markdown prose prose-sm max-w-none dark:prose-invert">
          <XMarkdown content={panel.markdown || ""} streaming={{ hasNextChunk: false }} />
        </div>
      </div>
    </Shell>
  );
}
