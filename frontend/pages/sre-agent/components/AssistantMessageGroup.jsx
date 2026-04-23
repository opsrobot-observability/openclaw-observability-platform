import { memo, useMemo } from "react";
import XMarkdown from "@ant-design/x-markdown";
import {
  extractSreVizWorkQueue,
  splitAssistantMessageOnFinalReportPaths,
  splitAssistantMessageOnVizFences,
  splitMessageAroundSreVizPathList,
  stripSrePathVizBoilerplateMarkdown,
} from "../../../lib/sreMessageVizExtract.js";
import { extractParenChoiceGroups, stripParenChoiceBlocks } from "../choiceParsing.js";
import { normalizeMarkdownForDisplay, stripOpenClawHiddenBlocks } from "../messageDisplayUtils.js";
import AssistantBubble from "./AssistantBubble.jsx";
import ChoiceCards from "./ChoiceCards.jsx";
import MarkdownPreWithCopy from "./MarkdownPreWithCopy.jsx";
import ParenChoiceSelectors from "./ParenChoiceSelectors.jsx";
import SreVizWorkspaceOpenButton from "./SreVizWorkspaceOpenButton.jsx";
import FinalReportWorkspaceOpenButton from "./FinalReportWorkspaceOpenButton.jsx";

const mdComponents = { pre: MarkdownPreWithCopy };

const bubbleShellClass =
  "sre-markdown min-w-0 w-full max-w-[95%] rounded-2xl rounded-tl-sm bg-white px-3.5 py-2.5 leading-relaxed text-gray-800 shadow-sm dark:bg-gray-800 dark:text-gray-100";

/** 将正文中的 final_report.md 路径替换为「报告预览」按钮，其余走 XMarkdown */
const AssistantMdWithFinalReportButtons = memo(function AssistantMdWithFinalReportButtons({ text, onOpenItem }) {
  const segments = useMemo(() => {
    const raw = String(text ?? "");
    const sp = splitAssistantMessageOnFinalReportPaths(raw);
    return sp ? sp.parts : [{ type: "markdown", text: raw }];
  }, [text]);

  return (
    <>
      {segments.map((p, i) =>
        p.type === "markdown" ? (
          p.text.trim() ? (
            <XMarkdown
              key={i}
              content={normalizeMarkdownForDisplay(p.text)}
              components={mdComponents}
              streaming={{ hasNextChunk: false }}
            />
          ) : null
        ) : (
          <FinalReportWorkspaceOpenButton key={i} path={p.path} onOpen={onOpenItem} />
        ),
      )}
    </>
  );
});

const AssistantMessageGroup = memo(function AssistantMessageGroup({
  msg,
  isLast,
  isRunning,
  onSelect,
  setInput,
  inputRef,
  onOpenSreVizItem,
}) {
  const visibleContent = stripOpenClawHiddenBlocks(msg.content);
  const parenGroups = extractParenChoiceGroups(visibleContent);
  const bubbleText =
    msg.streaming || parenGroups.length === 0 ? visibleContent : stripParenChoiceBlocks(visibleContent);
  const excludeParenNums = new Set(parenGroups.map((g) => g.num));

  const vizSplit = useMemo(() => {
    if (msg.streaming) return null;
    return splitAssistantMessageOnVizFences(bubbleText);
  }, [msg.streaming, bubbleText]);

  const pathOnlyItems = useMemo(() => {
    if (msg.streaming || vizSplit) return [];
    const q = extractSreVizWorkQueue(bubbleText);
    if (!q.length || q.some((i) => i.kind !== "path")) return [];
    return q;
  }, [msg.streaming, bubbleText, vizSplit]);

  const pathOnlySplit = useMemo(() => {
    if (!pathOnlyItems.length) return { before: "", after: "", hasListBlock: false };
    return splitMessageAroundSreVizPathList(
      bubbleText,
      pathOnlyItems.map((i) => i.path),
    );
  }, [bubbleText, pathOnlyItems]);

  // 流式但尚无可见正文时不渲染气泡，由 ChatMessageList 内三跳点占位，避免双占位
  const showBubble =
    (msg.streaming ? Boolean(bubbleText.trim()) : Boolean(bubbleText.trim()) || pathOnlyItems.length > 0);

  return (
    <div className="space-y-2">
      {showBubble &&
        (msg.streaming ? (
          <AssistantBubble messageId={msg.id} text={bubbleText} streaming />
        ) : vizSplit ? (
          <div className="flex w-full min-w-0 justify-start">
            <div className={`${bubbleShellClass} flex flex-col gap-2`}>
              {vizSplit.parts.map((p, i) =>
                p.type === "markdown" ? (() => {
                  const cleaned = stripSrePathVizBoilerplateMarkdown(p.text, []);
                  return cleaned.trim() ? (
                    <AssistantMdWithFinalReportButtons key={i} text={cleaned} onOpenItem={onOpenSreVizItem} />
                  ) : null;
                })() : (
                  <SreVizWorkspaceOpenButton key={i} item={{ kind: "inline", model: p.model }} onOpen={onOpenSreVizItem} />
                ),
              )}
            </div>
          </div>
        ) : pathOnlyItems.length > 0 ? (
          <div className="flex w-full min-w-0 justify-start">
            <div className={`${bubbleShellClass} flex flex-col gap-2`}>
              {pathOnlySplit.before.trim() ? (
                <AssistantMdWithFinalReportButtons text={pathOnlySplit.before} onOpenItem={onOpenSreVizItem} />
              ) : null}
              <div className="flex w-full min-w-0 flex-col gap-2">
                {pathOnlyItems.map((item, i) => (
                  <SreVizWorkspaceOpenButton key={i} item={item} onOpen={onOpenSreVizItem} />
                ))}
              </div>
              {pathOnlySplit.after.trim() ? (
                <AssistantMdWithFinalReportButtons text={pathOnlySplit.after} onOpenItem={onOpenSreVizItem} />
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex w-full min-w-0 justify-start">
            <div className={`${bubbleShellClass} flex flex-col gap-2`}>
              <AssistantMdWithFinalReportButtons text={bubbleText} onOpenItem={onOpenSreVizItem} />
            </div>
          </div>
        ))}

      {!msg.streaming && parenGroups.length > 0 && <ParenChoiceSelectors groups={parenGroups} onSelect={onSelect} />}
      {!msg.streaming && !isRunning && isLast && (
        <ChoiceCards
          text={visibleContent}
          onSelect={onSelect}
          setInput={setInput}
          inputRef={inputRef}
          excludeNums={excludeParenNums}
        />
      )}
    </div>
  );
});

export default AssistantMessageGroup;
