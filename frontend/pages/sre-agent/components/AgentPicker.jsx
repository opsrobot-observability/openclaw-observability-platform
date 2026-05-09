import { Dropdown } from "antd";
import { memo, useCallback, useState } from "react";

/** Agent 入口：靶心 / 准星图标 */
function AgentTargetIcon({ className }) {
  return (
    <svg
      viewBox="0 0 1024 1024"
      xmlns="http://www.w3.org/2000/svg"
      width={16}
      height={16}
      className={["icon", className].filter(Boolean).join(" ")}
      aria-hidden
    >
      <path
        d="M675.474286 146.285714c134.144 0 242.834286 117.540571 242.834285 262.582857 0 22.381714-16.822857 40.521143-37.449142 40.521143-20.772571 0-37.595429-18.139429-37.595429-40.521143a189.001143 189.001143 0 0 0-64.219429-142.848 144.018286 144.018286 0 0 0-16.822857-12.434285 157.622857 157.622857 0 0 0-41.545143-19.309715 159.817143 159.817143 0 0 0-45.202285-6.802285H315.977143c-92.672 0-167.789714 81.188571-167.789714 181.394285v221.988572c0 100.205714 75.117714 181.394286 167.789714 181.394286h359.424c20.699429 0 37.522286 18.139429 37.522286 40.521142 0 22.381714-16.822857 40.594286-37.522286 40.594286H315.977143C181.833143 893.366857 73.142857 775.826286 73.142857 630.784V408.868571C73.142857 263.753143 181.979429 146.285714 315.977143 146.285714h359.497143z m163.766857 320.219429c13.385143 0 25.014857 10.459429 28.525714 25.6l23.771429 101.888a27.136 27.136 0 0 0 1.536 5.339428 48.054857 48.054857 0 0 0 2.925714 5.851429 25.380571 25.380571 0 0 0 3.218286 4.461714 25.453714 25.453714 0 0 0 3.876571 3.876572 25.161143 25.161143 0 0 0 1.755429 1.316571l0.877714 0.658286a33.426286 33.426286 0 0 0 7.826286 3.949714l88.868571 27.574857c12.8 4.169143 21.650286 17.627429 21.577143 32.914286 0 15.36-8.777143 28.745143-21.577143 32.914286l-88.868571 27.428571a24.429714 24.429714 0 0 0-1.024 0.365714l-1.024 0.438858-1.024 0.438857a20.553143 20.553143 0 0 0-2.925715 1.536 32.109714 32.109714 0 0 0-1.828571 1.170285l-0.877714 0.658286-0.877715 0.658286-0.877714 0.731428a38.692571 38.692571 0 0 0-1.609143 1.462858l-0.731428 0.731428a38.765714 38.765714 0 0 0-3.584 4.169143l-0.585143 0.950857-0.585143 0.877714a24.502857 24.502857 0 0 0-1.097143 1.974858l-0.512 0.950857a41.398857 41.398857 0 0 0-0.512 1.024l-0.365714 1.024a24.795429 24.795429 0 0 0-0.804572 2.048l-0.365714 1.024-0.292571 1.097143a28.745143 28.745143 0 0 0-0.219429 1.024l-0.292571 1.097142-23.771429 102.180572c-3.437714 14.921143-15.213714 25.453714-28.598857 25.453714-13.458286 0-25.161143-10.459429-28.525714-25.453714l-23.844572-102.180572-0.219428-1.097142-0.292572-1.024-0.292571-1.097143-0.365714-1.024a43.300571 43.300571 0 0 0-0.365715-1.024l-0.365714-1.024a30.134857 30.134857 0 0 0-1.462857-2.998857l-0.512-1.024a24.941714 24.941714 0 0 0-3.072-4.534858 19.602286 19.602286 0 0 0-1.462857-1.609142l-0.731429-0.804572-0.804571-0.731428a40.96 40.96 0 0 0-6.144-4.681143l-0.950857-0.512a24.502857 24.502857 0 0 0-4.022858-1.828572l-1.024-0.365714-88.868571-27.501714c-12.8-4.022857-21.650286-17.554286-21.650286-32.914286 0-15.506286 8.923429-28.964571 21.723429-32.914286l88.868571-27.501714a31.378286 31.378286 0 0 0 11.264-6.582857l0.731429-0.731429 0.877714-0.804571a33.645714 33.645714 0 0 0 5.266286-7.021714l0.512-0.950858a26.843429 26.843429 0 0 0 2.194286-5.12 26.916571 26.916571 0 0 0 1.170285-4.169142l23.771429-102.034286c3.364571-15.067429 15.140571-25.6 28.525714-25.6h0.146286z m-475.574857-53.394286a77.458286 77.458286 0 0 1 40.740571 11.410286 79.872 79.872 0 0 1 35.108572 91.867428 79.798857 79.798857 0 0 1-87.478858 55.954286 78.262857 78.262857 0 0 1-51.931428-31.451428 81.188571 81.188571 0 0 1-14.774857-59.465143 80.457143 80.457143 0 0 1 55.369143-64.877715 78.409143 78.409143 0 0 1 22.966857-3.437714z m264.118857 0a77.531429 77.531429 0 0 1 44.032 13.458286 78.628571 78.628571 0 0 1 29.257143 35.986286 80.018286 80.018286 0 0 1 1.316571 57.563428 80.018286 80.018286 0 0 1-62.902857 52.224 78.628571 78.628571 0 0 1-84.845714-48.566857 80.969143 80.969143 0 0 1 17.115428-87.186286 78.116571 78.116571 0 0 1 40.594286-21.942857 77.238857 77.238857 0 0 1 15.433143-1.536z"
        fill="currentColor"
      />
    </svg>
  );
}

const AgentPicker = memo(function AgentPicker({ value, onChange, disabled, className = "", catalog, loading, error, compact, embedded }) {
  const [open, setOpen] = useState(false);

  const handlePick = useCallback(
    (id) => {
      onChange(id);
      setOpen(false);
    },
    [onChange],
  );

  if (embedded) {
    const mergedDisabled = disabled || loading;
    const current = !loading && catalog?.find((a) => a.id === value);

    const panel = (
      <div
        className={`max-h-72 min-w-[220px] overflow-y-auto rounded-2xl border border-gray-100 bg-white p-1.5 shadow-xl dark:border-gray-700 dark:bg-gray-900 dark:shadow-black/40 ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="px-3 py-2.5 text-xs text-gray-400">加载中…</div>
        ) : (
          catalog.map((a) => {
            const active = a.id === value;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => handlePick(a.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-1 text-left text-sm transition ${active
                    ? "bg-primary/10 font-medium text-primary dark:bg-primary/15 dark:text-primary"
                    : "text-gray-800 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-white/[0.06]"
                  }`}
              >
                <span className="min-w-0 flex-1 truncate">{a.label}</span>
              </button>
            );
          })
        )}
      </div>
    );

    return (
      <div className="relative shrink-0">
        <Dropdown
          open={mergedDisabled ? false : open}
          onOpenChange={(next) => !mergedDisabled && setOpen(next)}
          trigger={["click"]}
          placement="bottomLeft"
          disabled={mergedDisabled}
          popupRender={() => panel}
        >
          <button
            type="button"
            disabled={mergedDisabled}
            title="选择 Agent"
            aria-haspopup="listbox"
            aria-expanded={open}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-2.5 py-0 text-xs font-medium text-gray-700 outline-none transition hover:bg-gray-50/80 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800/90 dark:text-gray-100 dark:hover:bg-gray-800 ${loading ? "opacity-60" : ""}`}
          >
            <AgentTargetIcon className="h-3.5 w-3.5 shrink-0 text-gray-500 dark:text-gray-400" />
            <span className="max-w-[8rem] truncate">{current?.label ?? "Agent"}</span>
            <svg className="h-3 w-3 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
        </Dropdown>
        {error && !loading && (
          <span
            className="absolute -right-1 -top-1 flex h-3 w-3 cursor-help items-center justify-center rounded-full bg-amber-400 text-[8px] font-bold text-white"
            title={`同步异常: ${error}`}
          >
            !
          </span>
        )}
      </div>
    );
  }

  if (compact) {
    return (
      <div className="relative shrink-0">
        <select
          value={value}
          disabled={disabled || loading}
          onChange={(e) => onChange(e.target.value)}
          title="切换 Agent"
          className={`h-9 w-[110px] cursor-pointer appearance-none rounded-xl border border-gray-300 bg-white py-0 pl-2.5 pr-7 text-xs font-medium text-gray-700 outline-none transition hover:border-primary focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-primary ${loading ? "opacity-50" : ""}`}
        >
          {loading && <option value="">加载…</option>}
          {!loading && catalog.map((a) => (
            <option key={a.id} value={a.id} title={a.description || a.id}>
              {a.label}
            </option>
          ))}
        </select>
        <svg className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
        </svg>
        {error && !loading && (
          <span
            className="absolute -right-1 -top-1 flex h-3 w-3 cursor-help items-center justify-center rounded-full bg-amber-400 text-[8px] font-bold text-white"
            title={`同步异常: ${error}`}
          >!</span>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <select
        value={value}
        disabled={disabled || loading}
        onChange={(e) => onChange(e.target.value)}
        title="选择要对话的 Agent（对应 OpenClaw agent_id）"
        className={`app-input min-w-0 flex-1 py-1.5 pr-8 text-xs ${loading ? "opacity-50" : ""}`}
      >
        {loading && <option value="">加载中…</option>}
        {!loading && catalog.map((a) => (
          <option key={a.id} value={a.id} title={[a.description, a.status ? `状态: ${a.status}` : ""].filter(Boolean).join(" · ") || a.id}>
            {a.label}{a.status && a.status !== "unknown" ? ` (${a.status})` : ""}
          </option>
        ))}
      </select>
      {error && !loading && (
        <span
          className="shrink-0 cursor-help text-amber-500"
          title={`Agent 列表同步异常: ${error}`}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </span>
      )}
    </div>
  );
});

export default AgentPicker;
