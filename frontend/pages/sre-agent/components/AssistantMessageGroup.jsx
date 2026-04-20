import { memo, useMemo } from "react";
import XMarkdown from "@ant-design/x-markdown";
import {
  extractSreVizWorkQueue,
  splitAssistantMessageOnVizFences,
  stripSrePathVizBoilerplateMarkdown,
} from "../../../lib/sreMessageVizExtract.js";
import { extractParenChoiceGroups, stripParenChoiceBlocks } from "../choiceParsing.js";
import { stripOpenClawHiddenBlocks } from "../messageDisplayUtils.js";
import AssistantBubble from "./AssistantBubble.jsx";
import ChoiceCards from "./ChoiceCards.jsx";
import MarkdownPreWithCopy from "./MarkdownPreWithCopy.jsx";
import ParenChoiceSelectors from "./ParenChoiceSelectors.jsx";
import SreVizWorkspaceOpenButton from "./SreVizWorkspaceOpenButton.jsx";

const mdComponents = { pre: MarkdownPreWithCopy };

const bubbleShellClass =
  "sre-markdown min-w-0 w-full max-w-[95%] rounded-2xl rounded-tl-sm bg-white px-3.5 py-2.5 text-[13px] leading-relaxed text-gray-800 shadow-sm dark:bg-gray-800 dark:text-gray-100";

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

  const pathOnlyExtraMarkdown = useMemo(() => {
    if (!pathOnlyItems.length) return "";
    const paths = pathOnlyItems.map((i) => i.path);
    return stripSrePathVizBoilerplateMarkdown(bubbleText, paths);
  }, [bubbleText, pathOnlyItems]);

  const showBubble = msg.streaming || Boolean(bubbleText.trim()) || pathOnlyItems.length > 0;

  return (
    <div className="space-y-2">
      {showBubble &&
        (msg.streaming ? (
          <AssistantBubble text={bubbleText} streaming />
        ) : vizSplit ? (
          <div className="flex w-full min-w-0 justify-start">
            <div className={`${bubbleShellClass} flex flex-col gap-2`}>
              {vizSplit.parts.map((p, i) =>
                p.type === "markdown" ? (() => {
                  const cleaned = stripSrePathVizBoilerplateMarkdown(p.text, []);
                  return cleaned.trim() ? (
                    <XMarkdown
                      key={i}
                      content={cleaned}
                      components={mdComponents}
                      streaming={{ hasNextChunk: false }}
                    />
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
              {pathOnlyExtraMarkdown.length >= 16 ? (
                <XMarkdown
                  content={pathOnlyExtraMarkdown}
                  components={mdComponents}
                  streaming={{ hasNextChunk: false }}
                />
              ) : null}
              <div className="flex w-full min-w-0 flex-col gap-2">
                {pathOnlyItems.map((item, i) => (
                  <SreVizWorkspaceOpenButton key={i} item={item} onOpen={onOpenSreVizItem} />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <AssistantBubble text={bubbleText} streaming={false} />
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
