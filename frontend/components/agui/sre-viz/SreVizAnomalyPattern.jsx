/**
 * 异常模式面板：根因链路、模式关联、识别到的模式列表（含证据链等）。
 */

import { useMemo } from "react";
import { Shell } from "./SreVizShell.jsx";
import {
  ANOMALY_PATTERN_SEV,
  ANOMALY_SEV_BADGE,
  ANOMALY_SEV_LABEL,
  anomalyPatternSeverityKey,
  mergeAnomalyPatternChartColors,
} from "./sreVizAnomalyPatternModel.js";

export function SreVizAnomalyPattern({ panel }) {
  const model = panel.payload;
  const patterns = model.detected_patterns || [];
  const rels = Array.isArray(model.pattern_relationship) ? model.pattern_relationship : [];
  const rcc = model.root_cause_chain && typeof model.root_cause_chain === "object" ? model.root_cause_chain : null;
  const colors = useMemo(() => mergeAnomalyPatternChartColors(model.chart_config), [model.chart_config]);
  const patternById = useMemo(() => new Map(patterns.map((p) => [p.id, p])), [patterns]);

  return (
    <Shell title={model.title || "异常模式"} accent="rose">
      <div className="space-y-4">
        {rcc && (rcc.trigger || rcc.direct_cause || (Array.isArray(rcc.symptom) && rcc.symptom.length > 0)) ? (
          <div className="rounded-xl border border-gray-200/90 bg-white px-3 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-950/40">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">根因链路</p>
            <div className="mt-2.5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-stretch">
              {rcc.trigger ? (
                <div
                  className="min-w-0 flex-1 rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900/60"
                  style={{ borderLeftWidth: 3, borderLeftColor: colors.root_cause }}
                >
                  <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400">触发</p>
                  <p className="mt-0.5 text-[13px] font-semibold leading-snug text-gray-900 dark:text-gray-100">{rcc.trigger.name || rcc.trigger.id}</p>
                  <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[10px] text-gray-600 dark:text-gray-400">
                    {rcc.trigger.time ? <span>{rcc.trigger.time}</span> : null}
                    {rcc.trigger.type ? <span className="text-gray-400">{rcc.trigger.type}</span> : null}
                    {rcc.trigger.id ? (
                      <span className="truncate text-gray-400" title={rcc.trigger.id}>
                        {rcc.trigger.id}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {rcc.trigger && rcc.direct_cause ? (
                <div className="hidden shrink-0 items-center self-center px-1 text-gray-300 sm:flex dark:text-gray-600" aria-hidden>
                  →
                </div>
              ) : null}
              {rcc.direct_cause ? (
                <div
                  className="min-w-0 flex-1 rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900/60"
                  style={{ borderLeftWidth: 3, borderLeftColor: colors.root_cause }}
                >
                  <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400">直接原因</p>
                  <p className="mt-0.5 text-[13px] font-semibold leading-snug text-gray-900 dark:text-gray-100">
                    {rcc.direct_cause.name || rcc.direct_cause.id}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-2 font-mono text-[10px] text-gray-500 dark:text-gray-400">
                    {rcc.direct_cause.type ? <span>{rcc.direct_cause.type}</span> : null}
                    {rcc.direct_cause.id ? <span className="truncate">{rcc.direct_cause.id}</span> : null}
                  </div>
                </div>
              ) : null}
            </div>
            {Array.isArray(rcc.symptom) && rcc.symptom.length > 0 ? (
              <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
                <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">症状 / 表征</p>
                <div className="flex flex-wrap gap-1.5">
                  {rcc.symptom.map((s, i) => (
                    <span
                      key={i}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-gray-100 bg-white py-1 pl-2 pr-2 text-[11px] text-gray-800 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                      style={{ borderLeftWidth: 3, borderLeftColor: colors.symptom }}
                      title={s.service ? `${s.name} · ${s.service}` : s.name}
                    >
                      <span className="min-w-0 truncate font-medium">{s.name}</span>
                      {s.service ? <span className="shrink-0 font-mono text-[10px] text-gray-500 dark:text-gray-400">{s.service}</span> : null}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {rels.length > 0 ? (
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">模式关联</p>
            <div className="space-y-2">
              {rels.map((rel, i) => {
                const fromP = patternById.get(rel.from);
                const toP = patternById.get(rel.to);
                return (
                  <div
                    key={`${rel.from}-${rel.to}-${i}`}
                    className="flex flex-col gap-2 rounded-lg border border-gray-200/90 bg-white px-3 py-2.5 text-[11px] shadow-sm dark:border-gray-700 dark:bg-gray-950/50 sm:flex-row sm:items-center sm:gap-3"
                  >
                    <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
                      <span
                        className="rounded-md border border-gray-200 bg-violet-50/90 px-2 py-0.5 font-semibold text-violet-900 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-200"
                        style={{ borderColor: `${colors.pattern}55` }}
                      >
                        {rel.from}
                      </span>
                      <span className="text-gray-400">→</span>
                      <span
                        className="rounded-md border border-gray-200 bg-violet-50/90 px-2 py-0.5 font-semibold text-violet-900 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-200"
                        style={{ borderColor: `${colors.pattern}55` }}
                      >
                        {rel.to}
                      </span>
                      <span className="hidden text-gray-400 sm:inline" aria-hidden>
                        ·
                      </span>
                      <span className="text-gray-600 dark:text-gray-300">
                        {fromP?.name || rel.from} → {toP?.name || rel.to}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1 text-[11px] leading-snug text-gray-700 dark:text-gray-200">
                      {rel.relationship}
                      {rel.time_gap_seconds != null ? (
                        <span className="ml-1.5 whitespace-nowrap font-mono text-[10px] text-gray-500 dark:text-gray-400">
                          （间隔 {rel.time_gap_seconds}s）
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {patterns.length > 0 ? (
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">识别到的模式</p>
            <div className="space-y-3">
              {patterns.map((p) => {
                const sevKey = anomalyPatternSeverityKey(p.severity);
                return (
                  <div key={p.id || p.name} className={`rounded-xl border p-3.5 shadow-sm ${ANOMALY_PATTERN_SEV[sevKey]}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2 gap-y-1">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${ANOMALY_SEV_BADGE[sevKey]}`}>
                            {ANOMALY_SEV_LABEL[sevKey]}
                          </span>
                          <span className="text-[13px] font-semibold leading-snug text-gray-900 dark:text-gray-100">{p.name}</span>
                        </div>
                        {p.category ? <p className="mt-1 text-[11px] text-gray-600 dark:text-gray-400">{p.category}</p> : null}
                      </div>
                      <div className="shrink-0 text-right font-mono text-[10px] leading-tight text-gray-500 dark:text-gray-400">
                        {p.id ? <span className="block">{p.id}</span> : null}
                        {typeof p.confidence === "number" ? (
                          <span className="mt-0.5 block text-[11px] font-semibold text-gray-800 dark:text-gray-200">
                            置信度 {(p.confidence * 100).toFixed(0)}%
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {p.description ? <p className="mt-2.5 text-[12px] leading-relaxed text-gray-800 dark:text-gray-200">{p.description}</p> : null}
                    {Array.isArray(p.nodes) && p.nodes.length > 0 ? (
                      <div className="mt-2.5">
                        <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">涉及节点</p>
                        <div className="flex flex-wrap gap-1">
                          {p.nodes.map((id) => (
                            <code
                              key={id}
                              className="rounded-md border border-gray-200/90 bg-white/90 px-1.5 py-0.5 font-mono text-[10px] text-gray-800 dark:border-gray-600 dark:bg-gray-900/80 dark:text-gray-200"
                            >
                              {id}
                            </code>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {Array.isArray(p.evidence) && p.evidence.length > 0 ? (
                      <div className="mt-2.5 border-t border-gray-200/60 pt-2.5 dark:border-gray-700/80">
                        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">证据链</p>
                        <ol className="list-decimal space-y-1.5 pl-4 text-[11px] leading-relaxed text-gray-700 marker:text-gray-400 dark:text-gray-300 dark:marker:text-gray-500">
                          {p.evidence.map((ev, idx) => (
                            <li key={idx} className="pl-0.5">
                              {ev}
                            </li>
                          ))}
                        </ol>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400">暂无 detected_patterns 数据</p>
        )}
      </div>
    </Shell>
  );
}
