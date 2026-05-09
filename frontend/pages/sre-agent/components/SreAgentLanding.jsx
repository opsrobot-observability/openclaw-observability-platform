import { SKILLS, USE_MOCK } from "../constants.js";
import InputBar from "./InputBar.jsx";
import { RobotIcon, SkillIcon } from "./SreAgentIcons.jsx";

export default function SreAgentLanding({
  sessionOpenError,
  handleSend,
  agentPickerSlot,
  input,
  setInput,
  isRunning,
  cancel,
  inputRef,
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-8 overflow-y-auto px-6 py-8">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 dark:bg-primary/20">
          <RobotIcon className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">opsRobot Agent</h2>
        <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
          智能运维助手 — 左侧下达指令，右侧实时展示执行结果。
          基于 <span className="font-medium text-primary">OpenClaw</span> +
          <span className="font-medium text-primary"> AG-UI 协议</span>驱动。
        </p>
        {USE_MOCK && (
          <span className="mt-1 inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            Demo 模式
          </span>
        )}
      </div>

      {sessionOpenError && (
        <div className="w-full max-w-lg rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-center text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
          {sessionOpenError}
        </div>
      )}

      <div className="grid w-full max-w-lg grid-cols-2 gap-3">
        {SKILLS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => handleSend(s.prompt)}
            className="group flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 text-left transition hover:border-primary/40 hover:shadow-lg dark:border-gray-700 dark:bg-gray-900 dark:hover:border-primary/40"
          >
            <SkillIcon name={s.icon} />
            <div>
              <p className="text-sm font-semibold text-gray-800 group-hover:text-primary dark:text-gray-100">{s.label}</p>
              <p className="mt-0.5 text-xs text-gray-400 line-clamp-2 break-all" title={s.prompt}>{s.prompt}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="w-full max-w-lg">
        <InputBar
          input={input}
          setInput={setInput}
          onSend={handleSend}
          isRunning={isRunning}
          onCancel={cancel}
          inputRef={inputRef}
          agentPickerSlot={agentPickerSlot}
        />
      </div>
    </div>
  );
}
