import { Sender } from "@ant-design/x";
import { memo, useCallback, useMemo } from "react";
import { useTheme } from "../../../context/ThemeContext.jsx";

const InputBar = memo(function InputBar({ input, setInput, onSend, isRunning, onCancel, inputRef, agentPickerSlot }) {
  const { resolved } = useTheme();
  const isDark = resolved === "dark";

  const senderStyles = useMemo(() => {
    const bg = isDark ? "rgb(17 24 39)" : "#ffffff";
    const border = isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)";
    return {
      root: {
        backgroundColor: bg,
        borderRadius: 16,
        overflow: "hidden",
        border: border,
        boxShadow: isDark ? "none" : "0 1px 2px rgba(0,0,0,0.04)",
      },
      content: {
        backgroundColor: bg,
        padding: "10px 14px 6px",
        alignItems: "flex-start",
      },
      input: {
        backgroundColor: "transparent",
        borderRadius: 10,
      },
      footer: {
        backgroundColor: bg,
        padding: 0,
        margin: 0,
      },
    };
  }, [isDark]);

  const mergeRef = useCallback(
    (instance) => {
      if (inputRef) {
        inputRef.current = instance;
      }
    },
    [inputRef],
  );

  const toolbarFooter = useCallback(
    (actionNode) => (
      <div
        className={`flex w-full min-h-[36px] items-center gap-3 px-3 pb-2
          ${agentPickerSlot ? "justify-between" : "justify-end"}`}
      >
        {agentPickerSlot ? <div className="flex min-w-0 flex-1 items-center">{agentPickerSlot}</div> : null}
        <div className="flex shrink-0 items-center">{actionNode}</div>
      </div>
    ),
    [agentPickerSlot, isDark],
  );

  return (
    <div className="w-full min-w-0">
      <Sender
        ref={mergeRef}
        value={input}
        onChange={(v) => setInput(v)}
        onSubmit={(msg) => {
          const t = String(msg ?? "").trim();
          if (t) onSend(t);
        }}
        loading={isRunning}
        onCancel={onCancel}
        placeholder="按 Enter 发送，Shift + Enter 换行"
        submitType="enter"
        autoSize={{ minRows: 1, maxRows: 8 }}
        styles={senderStyles}
        suffix={false}
        footer={toolbarFooter}
      />
    </div>
  );
});

export default InputBar;
