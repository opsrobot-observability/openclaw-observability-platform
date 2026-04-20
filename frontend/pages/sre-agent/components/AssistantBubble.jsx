import { memo, useMemo } from "react";
import XMarkdown from "@ant-design/x-markdown";
import MarkdownPreWithCopy from "./MarkdownPreWithCopy.jsx";

const AssistantBubble = memo(function AssistantBubble({ text, streaming }) {
  const markdownComponents = useMemo(
    () => ({
      pre: MarkdownPreWithCopy,
    }),
    [],
  );

  return (
    <div className="flex justify-start">
      <div className="sre-markdown max-w-[95%] rounded-2xl rounded-tl-sm bg-white px-3.5 py-2.5 text-[13px] leading-relaxed text-gray-800 shadow-sm dark:bg-gray-800 dark:text-gray-100">
        <XMarkdown
          content={text || ""}
          components={markdownComponents}
          streaming={streaming ? { hasNextChunk: true } : { hasNextChunk: false }}
        />
        {streaming && <span className="ml-0.5 inline-block h-3.5 w-1 animate-pulse rounded-sm bg-primary/60 align-middle" />}
      </div>
    </div>
  );
});

export default AssistantBubble;
