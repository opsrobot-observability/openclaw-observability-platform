/**
 * SreReportTabContent — SRE 阶段报告富组件渲染器
 *
 * 将 Markdown 仅按二级标题 ## 切分为若干 section（每个 ## 一节一块卡片；### 留在正文内），
 * 对每个 section body 做启发式检测并渲染对应 UI 组件：
 *   - MetricCards + BarChart（指标数值）
 *   - DataTable（Markdown 表格）
 *   - Checklist（操作建议清单）
 *   - Terminal（代码/命令块）
 *   - XMarkdown prose（其他）
 *
 * 不展示顶部阶段信息卡；正文从首个「## 数字…」章节起算，去掉重复标题与状态段。
 * 仅整段隐藏标题含「核心结论」的章节；其余 ## 章节标题在卡片顶正常展示。
 * 正文内 Markdown 一级标题（# → h1）不展示。
 * 环境感知 Tab：若正文含 metrics_trend.json / logs_distribution.json 路径，则在最前拉取并展示图表卡片。
 * 异常分析 Tab：若正文含 trace_call_chain.json 路径，则在最前拉取并展示调用链图表卡片。
 * 根因推理 Tab：若正文含 topology_map.json / anomaly_pattern.json 路径，则在最前拉取并展示两块图表卡片。
 */
import { useMemo, useState } from "react";
import XMarkdown from "@ant-design/x-markdown";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { normalizeMarkdownForDisplay, stripMarkdownBoldAndCodeForPlainText } from "../../pages/sre-agent/messageDisplayUtils.js";
import { SreVizMetricsTrend } from "./sre-viz/SreVizMetricsTrend.jsx";
import { SreVizLogsDistribution } from "./sre-viz/SreVizLogsDistribution.jsx";
import { SreVizTraceCallChain } from "./sre-viz/SreVizTraceCallChain.jsx";
import { SreVizTopologyMap } from "./sre-viz/SreVizTopologyMap.jsx";
import { SreVizAnomalyPattern } from "./sre-viz/SreVizAnomalyPattern.jsx";
import { Stage1AttachmentVizCards } from "./Stage1AttachmentVizCards.jsx";
import { Stage2AttachmentVizCards } from "./Stage2AttachmentVizCards.jsx";
import { Stage3AttachmentVizCards } from "./Stage3AttachmentVizCards.jsx";

// ─── 阶段 header 配色 ────────────────────────────────────────────
const STAGE_HEADER = {
  stage1: { accent: "blue",    desc: "采集当前环境状态：服务健康、资源占用、告警概览" },
  stage2: { accent: "amber",   desc: "识别系统中的异常现象，定位异常指标与日志特征" },
  stage3: { accent: "rose",    desc: "基于异常现象推断根因，建立因果关系链路" },
  stage4: { accent: "emerald", desc: "提出具体可执行的修复操作与优先级建议" },
  final:  { accent: "violet",  desc: "汇总各阶段分析结果，形成完整 SRE 诊断报告" },
};

const ACCENT_STYLES = {
  blue:    { badge: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",    title: "text-blue-700 dark:text-blue-300" },
  amber:   { badge: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",  title: "text-amber-700 dark:text-amber-300" },
  rose:    { badge: "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",    title: "text-rose-700 dark:text-rose-300" },
  emerald: { badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300", title: "text-emerald-700 dark:text-emerald-300" },
  violet:  { badge: "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",  title: "text-violet-700 dark:text-violet-300" },
};

const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"];

// ─── Markdown → Section 解析 ─────────────────────────────────────

function splitIntoSections(markdown) {
  const lines = String(markdown ?? "").split(/\r?\n/);
  const sections = [];
  let currentHeading = null;
  let currentLevel = 0;
  let bodyLines = [];

  const flush = () => {
    if (currentHeading !== null || bodyLines.some((l) => l.trim())) {
      sections.push({ heading: currentHeading, level: currentLevel, body: bodyLines.join("\n") });
    }
    bodyLines = [];
  };

  for (const line of lines) {
    // 只按 ## 划分卡片；### 及以上保留在 body 中由 Markdown 渲染
    const h2 = line.match(/^##\s+(.+)/);
    if (h2 && !/^###/.test(line)) {
      flush();
      currentHeading = h2[1].trim();
      currentLevel = 2;
    } else {
      bodyLines.push(line);
    }
  }
  flush();
  return sections;
}

/**
 * 去掉报告开头的重复标题与状态说明（# SRE Stage…、## …完成、⚠️ Orchestrator 等），
 * 从首个「## 数字章节」（如 ## 1. 事件时间线）起保留正文。
 */
function stripSreReportLeadingBoilerplate(markdown) {
  const src = String(markdown ?? "");
  const m = /^##\s*\d/m.exec(src);
  if (!m) return src.trim();
  return src.slice(m.index).trimStart();
}

/** 仅跳过「核心结论」整段（标题中含该关键词即视为该节） */
function isSkippedReportSectionHeading(heading) {
  const t = stripMarkdownBoldAndCodeForPlainText(heading);
  if (!t) return false;
  return /核心结论/.test(t);
}

/** 环境感知（stage1）章节的 Markdown 标题（去格式后） */
function getPlainSectionTitle(heading) {
  return stripMarkdownBoldAndCodeForPlainText(heading || "").trim();
}

/** 时间线：用时间轴，不用表格 */
function isStage1TimelineSectionTitle(plain) {
  return /时间线/.test(plain);
}

/** 受影响节点 / 指标摘要：用指标卡片，不用表格行 */
function isStage1MetricTableSectionTitle(plain) {
  return /受影响|指标摘要/.test(plain);
}

/** 环境感知：这些清单不显示复选框与「参考」等优先级标签（时间线节走时间轴/表格逻辑，不由此匹配） */
function isStage1PlainChecklistTitle(plain) {
  return /日志摘要|受影响|指标摘要/.test(plain);
}

// ─── SRE Viz JSON 解析 ───────────────────────────────────────────

const SRE_VIZ_TYPE_SET = new Set([
  "metrics_trend", "logs_distribution", "trace_call_chain", "topology_map", "anomaly_pattern",
]);

/** 尝试将代码块原始内容解析为 SRE viz 对象；不是则返回 null */
function tryParseSreVizObject(rawFenceContent) {
  const t = String(rawFenceContent ?? "").trim();
  if (!t.startsWith("{")) return null;
  try {
    const o = JSON.parse(t);
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    const ty = String(o.type || "").toLowerCase();
    if (!SRE_VIZ_TYPE_SET.has(ty)) return null;
    return { type: ty, payload: o };
  } catch {
    return null;
  }
}

/**
 * 将 section body 拆分为有序渲染部分：
 *   { kind: "sre_viz", type, payload }  — SRE viz JSON 代码块
 *   { kind: "code", lang, code }        — 非 viz 代码块（terminal）
 *   { kind: "text", content }           — 普通文本/prose
 */
function splitBodyIntoParts(body) {
  const parts = [];
  let cursor = 0;
  const src = String(body ?? "");
  const fenceRe = /```(\w*)\n?([\s\S]*?)```/g;
  let m;
  while ((m = fenceRe.exec(src)) !== null) {
    if (m.index > cursor) {
      const txt = src.slice(cursor, m.index).trim();
      if (txt) parts.push({ kind: "text", content: txt });
    }
    const lang = m[1] || "";
    const rawContent = m[2];
    const viz = tryParseSreVizObject(rawContent);
    if (viz) {
      parts.push({ kind: "sre_viz", type: viz.type, payload: viz.payload });
    } else {
      parts.push({ kind: "code", lang: lang || "text", code: rawContent.trim() });
    }
    cursor = m.index + m[0].length;
  }
  if (cursor < src.length) {
    const txt = src.slice(cursor).trim();
    if (txt) parts.push({ kind: "text", content: txt });
  }
  return parts;
}

/** 检查 body 是否含至少一个合法 SRE viz JSON 代码块 */
function bodyHasSreViz(body) {
  const fenceRe = /```(\w*)\n?([\s\S]*?)```/g;
  let m;
  while ((m = fenceRe.exec(body)) !== null) {
    if (tryParseSreVizObject(m[2])) return true;
  }
  return false;
}

// ─── 类型检测 ────────────────────────────────────────────────────

function detectSectionType(body) {
  const text = String(body ?? "").trim();
  if (!text) return "empty";

  // SRE viz JSON 代码块（优先级最高）
  if (/```/m.test(text) && bodyHasSreViz(text)) return "sre_viz";

  // 普通代码块
  if (/^```/m.test(text)) return "code";

  // Markdown 表格
  const tableLines = text.split("\n").filter((l) => l.includes("|"));
  if (tableLines.length >= 2 && tableLines.some((l) => /^\s*\|[-\s:|]+\|\s*$/.test(l))) return "table";

  // 操作项清单：含 [ ] 或 [x] 或含关键动词的列表
  const actionKw = /建议|操作|执行|修复|重启|回滚|扩容|优化|降级|恢复|检查|验证|告警|步骤|action|step|fix|restart/i;
  const listLines = text.split("\n").filter((l) => /^\s*[-*+]\s+/.test(l) || /^\s*\d+\.\s+/.test(l));
  if (listLines.length >= 2 && listLines.some((l) => actionKw.test(l))) return "checklist";

  // 指标数值：多行 key: value% 或 key: 数值
  const metricLines = text.split("\n").filter((l) =>
    /[：:]\s*[\d.]+\s*%/.test(l) ||
    /[：:]\s*[\d.]+\s*(ms|MB|GB|KB|s|m|次|个|条)?$/.test(l.trim()),
  );
  if (metricLines.length >= 2) return "metrics";

  return "markdown";
}

// ─── 表格解析 ────────────────────────────────────────────────────

function parseMarkdownTable(body) {
  const lines = body.split("\n").filter((l) => l.includes("|"));
  if (lines.length < 2) return null;

  const parseRow = (l) => l.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const isSep = (l) => /^[\|\s\-:]+$/.test(l);

  const dataLines = lines.filter((l) => !isSep(l));
  if (dataLines.length < 2) return null;

  const columns = parseRow(dataLines[0]).map((c) => stripMarkdownBoldAndCodeForPlainText(c));
  const rows = dataLines.slice(1).map((line) =>
    parseRow(line).map((c) => stripMarkdownBoldAndCodeForPlainText(c)),
  );
  return { columns, rows };
}

function isNumericColumn(rows, colIdx) {
  const values = rows.map((r) => r[colIdx]).filter(Boolean);
  const numericCount = values.filter((v) => /^[\d.,]+\s*(%|ms|MB|GB|KB|s)?$/.test(v.trim())).length;
  return values.length > 0 && numericCount / values.length > 0.6;
}

function parseNumericValue(v) {
  const m = String(v).match(/^([\d.,]+)/);
  return m ? parseFloat(m[1].replace(/,/g, "")) : NaN;
}

// ─── 指标解析 ────────────────────────────────────────────────────

function parseMetrics(body) {
  const lines = body.split("\n");
  const metrics = [];
  for (const line of lines) {
    const m = line.match(/(.+?)[：:]\s*([\d.]+)\s*(%|ms|MB|GB|KB|s|m|次|个|条)?/);
    if (!m) continue;
    const label = stripMarkdownBoldAndCodeForPlainText(m[1].trim().replace(/^[-*+]\s+/, "").trim());
    const value = parseFloat(m[2]);
    const unit = m[3] || "";
    if (!label || isNaN(value)) continue;
    const pct = unit === "%" ? value : null;
    const status = pct !== null ? (pct > 85 ? "danger" : pct > 70 ? "warning" : "normal") : "normal";
    metrics.push({ label, value, unit, display: `${m[2]}${unit}`, status });
  }
  return metrics;
}

// ─── 清单解析 ────────────────────────────────────────────────────

function parseChecklist(body) {
  const lines = body.split("\n");
  const items = [];
  for (const line of lines) {
    const m = line.match(/^\s*[-*+]\s+\[([xX ]?)\]\s*(.+)/) || line.match(/^\s*[-*+]\s+(.+)/) || line.match(/^\s*\d+\.\s+(.+)/);
    if (!m) continue;
    const done = m.length === 3 && /[xX]/.test(m[1]);
    const text = stripMarkdownBoldAndCodeForPlainText((m.length === 3 ? m[2] : m[1]).trim());
    if (!text) continue;
    const priority = /紧急|高优|立即|critical|urgent/i.test(text) ? "high"
      : /中等|建议|medium/i.test(text) ? "medium"
      : "low";
    items.push({ text, done, priority });
  }
  return items;
}

/**
 * 时间线行：在「时间」与「事件」之间常见 ` - `、全角/长破折号 `—` `–` 等，取首次匹配处切开。
 */
function splitTimelineTimeAndDescription(rawLine) {
  const rest = String(rawLine ?? "").trim();
  if (!rest) return null;
  /** 从长到短，避免先匹配到半个字符 */
  const delimiters = [" — ", " - ", " – ", "—", "–"];
  for (const sep of delimiters) {
    const i = rest.indexOf(sep);
    if (i < 0) continue;
    const timeRaw = rest.slice(0, i).trim();
    const descRaw = rest.slice(i + sep.length).trim();
    if (timeRaw && descRaw) return { timeRaw, descRaw };
  }
  return null;
}

/**
 * 时间线节：无序/有序列表或纯行文本
 * - ` - **10:00:05** - 事件`、`- 10:00:05 — 事件`（与模型/排版常用的 `—` 一致）
 * - 无列表符时：整行 `10:00:05 — 事件` 也识别
 */
function parseStage1TimelineListBody(body) {
  const withoutFences = String(body ?? "").replace(/```[\s\S]*?```/g, "").trim();
  const lines = withoutFences.split(/\r?\n/);
  const items = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || /^#+\s/.test(t)) continue;
    const listMatch = t.match(/^\s*[-*+]\s+(.+)$/) || t.match(/^\s*\d+\.\s+(.+)$/);
    const rest = listMatch ? listMatch[1].trim() : t;
    const split = splitTimelineTimeAndDescription(rest);
    if (!split) continue;
    const time = stripMarkdownBoldAndCodeForPlainText(split.timeRaw);
    const description = stripMarkdownBoldAndCodeForPlainText(split.descRaw);
    if (!time) continue;
    items.push({ time, description: description || "—" });
  }
  return items.length > 0 ? items : null;
}

// ─── 代码块提取（仅用于纯 code section） ─────────────────────────

function extractCodeBlocks(body) {
  const blocks = [];
  const re = /```(\w*)\n?([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    blocks.push({ lang: m[1] || "text", code: m[2].trim() });
  }
  return blocks.length ? blocks : [{ lang: "text", code: body.replace(/```\w*/g, "").replace(/```/g, "").trim() }];
}

// ─── SRE Viz 组件分发 ─────────────────────────────────────────────

function SreVizItem({ type, payload }) {
  const panel = { type, payload };
  switch (type) {
    case "metrics_trend":     return <SreVizMetricsTrend panel={panel} />;
    case "logs_distribution": return <SreVizLogsDistribution panel={panel} />;
    case "trace_call_chain":  return <SreVizTraceCallChain panel={panel} />;
    case "topology_map":      return <SreVizTopologyMap panel={panel} />;
    case "anomaly_pattern":   return <SreVizAnomalyPattern panel={panel} />;
    default:                  return null;
  }
}

/**
 * 混合内容渲染：按顺序渲染 prose / viz / code 各部分。
 * 用于 sre_viz 类型的 section（可能含 prose + viz + 非 viz 代码块的混合）。
 */
function MixedBodyRenderer({ parts }) {
  return (
    <div className="space-y-3">
      {parts.map((part, i) => {
        if (part.kind === "sre_viz") {
          return <SreVizItem key={i} type={part.type} payload={part.payload} />;
        }
        if (part.kind === "code") {
          return <CodeSection key={i} blocks={[{ lang: part.lang, code: part.code }]} />;
        }
        return part.content.trim() ? <MarkdownSection key={i} body={part.content} /> : null;
      })}
    </div>
  );
}

// ─── 渲染组件 ────────────────────────────────────────────────────

function MetricCard({ metric }) {
  const statusCls = {
    normal:  "border-emerald-200 dark:border-emerald-800",
    warning: "border-amber-300 dark:border-amber-700",
    danger:  "border-rose-300 dark:border-rose-700",
  };
  const dotCls = {
    normal:  "bg-emerald-500",
    warning: "bg-amber-500 animate-pulse",
    danger:  "bg-rose-500 sre-blink",
  };
  const valueCls = {
    normal:  "text-gray-800 dark:text-gray-100",
    warning: "text-amber-700 dark:text-amber-300",
    danger:  "text-rose-700 dark:text-rose-400",
  };
  return (
    <div className={`rounded-xl border bg-white p-3 dark:bg-gray-900 ${statusCls[metric.status]}`}>
      <div className="flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${dotCls[metric.status]}`} />
        <span className="truncate text-xs text-gray-500 dark:text-gray-400">{metric.label}</span>
      </div>
      <p className={`mt-1 text-xl font-bold ${valueCls[metric.status]}`}>{metric.display}</p>
    </div>
  );
}

function MetricsSection({ metrics, heading }) {
  const chartData = metrics.map((m) => ({ name: m.label, value: m.value }));
  const hasChart = metrics.length >= 2 && metrics.some((m) => m.unit === "%");

  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-2 xl:grid-cols-3">
        {metrics.map((m, i) => <MetricCard key={i} metric={m} />)}
      </div>
      {hasChart && (
        <div className="mt-3 rounded-xl border border-gray-100 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
          <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">指标对比</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "rgba(100,116,139,0.8)" }} interval={0} />
              <YAxis tick={{ fontSize: 10, fill: "rgba(100,116,139,0.8)" }} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 6, border: "1px solid rgba(148,163,184,0.2)" }}
                formatter={(v) => [`${v}%`, ""]}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/** 环境感知「时间线」：纵向时间轴，不用表格 */
function TimelineSection({ tableData }) {
  const { columns, rows } = tableData;
  if (!rows.length) return null;
  const timeIdx = columns.findIndex((c) => /时间|time/i.test(c));
  const ti = timeIdx >= 0 ? timeIdx : 0;
  return (
    <ol className="m-0 list-none space-y-0 p-0">
      {rows.map((row, ri) => {
        const tCell = String(row[ti] ?? "").trim();
        const restIdx = row.map((_, i) => i).filter((i) => i !== ti);
        return (
          <li key={ri} className="flex gap-3">
            <div
              className="flex w-[7.5rem] shrink-0 flex-col items-end pr-3 pt-0.5 text-right"
              style={{ minHeight: "2.5rem" }}
            >
              <span className="text-[11px] font-mono text-primary/90 dark:text-primary/80">{tCell || "—"}</span>
            </div>
            <div className="relative min-w-0 flex-1 border-l border-dashed border-primary/35 pb-4 pl-3">
              <span className="absolute left-0 top-1.5 h-2.5 w-2.5 -translate-x-1/2 rounded-full border-2 border-primary bg-white shadow-sm dark:border-primary dark:bg-gray-900" />
              {restIdx.length === 0 ? (
                <p className="text-xs text-gray-600 dark:text-gray-300">—</p>
              ) : (
                <div className="space-y-1 ml-2">
                  {restIdx.map((ci) => {
                    const lab = columns[ci] ?? "";
                    const val = String(row[ci] ?? "").trim();
                    if (!val) return null;
                    return (
                      <p key={ci} className="text-xs leading-relaxed text-gray-700 dark:text-gray-200">
                        {lab ? <span className="font-medium text-gray-500 dark:text-gray-400">{lab} </span> : null}
                        <span className="break-words">{val}</span>
                      </p>
                    );
                  })}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** 时间线节：无序列表解析后的 { time, description }，与表格时间轴视觉一致 */
function TimelineListSection({ items }) {
  if (!items?.length) return null;
  return (
    <ol className="m-0 list-none space-y-0 p-0">
      {items.map((it, ri) => (
        <li key={ri} className="flex gap-3">
          <div
            className="flex w-[7.5rem] shrink-0 flex-col items-end pr-3 pt-0.5 text-right"
            style={{ minHeight: "2.5rem" }}
          >
            <span className="text-[11px] font-mono text-primary/90 dark:text-primary/80">{it.time || "—"}</span>
          </div>
          <div className="relative min-w-0 flex-1 border-l border-dashed border-primary/35 pb-4 pl-3">
            <span className="absolute left-0 top-1.5 h-2.5 w-2.5 -translate-x-1/2 rounded-full border-2 border-primary bg-white shadow-sm dark:border-primary dark:bg-gray-900" />
            <p className="ml-2 text-xs leading-relaxed break-words text-gray-700 dark:text-gray-200">{it.description}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * 环境感知「受影响节点 / 指标摘要」等：多列表格用指标风卡片，不用 `<table/>`。
 * 2 列时按 key / value 卡片；多列时首列作标题、其余为行内说明。
 */
function KeyValueTableAsMetricCards({ tableData }) {
  const { columns, rows } = tableData;
  if (!rows.length) return null;
  if (columns.length === 2) {
    return (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row, ri) => {
          const k = String(row[0] ?? "").trim();
          const v = String(row[1] ?? "").trim();
          if (!k && !v) return null;
          return (
            <div
              key={ri}
              className="rounded-xl border border-gray-200 bg-gradient-to-b from-white to-gray-50/80 p-3 dark:border-gray-600 dark:from-gray-900 dark:to-gray-900/50"
            >
              <p className="line-clamp-2 text-xs font-medium text-gray-500 dark:text-gray-400">{k || "—"}</p>
              <p className="mt-1 break-words text-sm font-semibold text-gray-800 dark:text-gray-100">{v || "—"}</p>
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {rows.map((row, ri) => {
        const title = String(row[0] ?? "").trim();
        const rest = row.slice(1);
        return (
          <div
            key={ri}
            className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-900/80"
          >
            {title ? <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</p> : null}
            <div className="mt-2 space-y-1">
              {rest.map((cell, j) => {
                const cj = j + 1;
                const lab = columns[cj] ?? "";
                const val = String(cell ?? "").trim();
                if (!val) return null;
                return (
                  <p key={cj} className="text-xs text-gray-600 dark:text-gray-300">
                    {lab ? <span className="text-gray-500 dark:text-gray-400">{lab}: </span> : null}
                    {val}
                  </p>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TableSection({ tableData }) {
  const { columns, rows } = tableData;
  // 检测数值列用于图表
  const numericColIdx = columns.map((_, i) => i).filter((i) => isNumericColumn(rows, i));
  const hasChart = numericColIdx.length > 0 && rows.length >= 2 && columns[0];

  const chartData = hasChart
    ? rows.map((r) => {
        const obj = { name: r[0] ?? "" };
        numericColIdx.forEach((ci) => {
          obj[columns[ci]] = parseNumericValue(r[ci]);
        });
        return obj;
      })
    : [];

  const statusCls = (v) => {
    const low = String(v).toLowerCase();
    if (/error|异常|告警|critical|down|failed|故障/.test(low)) return "text-rose-600 dark:text-rose-400 font-medium";
    if (/warning|warn|pending|degraded|慢|高/.test(low)) return "text-amber-600 dark:text-amber-400";
    if (/ok|healthy|normal|running|正常|通过/.test(low)) return "text-emerald-600 dark:text-emerald-400";
    return "";
  };

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-700">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-800/50">
              {columns.map((col, i) => (
                <th key={i} className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
            {rows.map((row, ri) => (
              <tr key={ri} className="bg-white transition hover:bg-gray-50/50 dark:bg-gray-900 dark:hover:bg-gray-800/30">
                {row.map((cell, ci) => (
                  <td key={ci} className={`px-3 py-2 text-gray-700 dark:text-gray-300`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChecklistSection({ items, plain = false }) {
  const [checked, setChecked] = useState({});
  const priorityBadge = {
    high:   "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
    medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    low:    "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  };
  const priorityLabel = { high: "紧急", medium: "建议", low: "参考" };

  if (plain) {
    return (
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div
            key={i}
            className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/30"
          >
            <p className="text-xs leading-relaxed text-gray-800 dark:text-gray-200">{item.text}</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {items.map((item, i) => {
        const isDone = checked[i] ?? item.done;
        return (
          <label
            key={i}
            className="flex cursor-pointer items-start gap-2 rounded-lg p-2 transition hover:bg-gray-50 dark:hover:bg-gray-800/50"
          >
            <span className={`flex-1 text-xs leading-relaxed ${isDone ? "text-gray-400 line-through" : "text-gray-700 dark:text-gray-200"}`}>
              {item.text}
            </span>
          </label>
        );
      })}
    </div>
  );
}

function CodeSection({ blocks }) {
  const [copied, setCopied] = useState({});

  const handleCopy = (code, i) => {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopied((p) => ({ ...p, [i]: true }));
    setTimeout(() => setCopied((p) => ({ ...p, [i]: false })), 1500);
  };

  return (
    <div className="space-y-2">
      {blocks.map((b, i) => (
        <div key={i} className="group relative rounded-lg bg-gray-950 p-3 font-mono text-xs leading-relaxed">
          {b.lang && b.lang !== "text" && (
            <span className="absolute right-8 top-2 text-[10px] text-gray-600">{b.lang}</span>
          )}
          <button
            onClick={() => handleCopy(b.code, i)}
            className="absolute right-2 top-2 rounded p-0.5 text-gray-600 opacity-0 transition hover:text-gray-300 group-hover:opacity-100"
            title="复制"
          >
            {copied[i] ? (
              <svg className="h-3.5 w-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
              </svg>
            )}
          </button>
          <pre className="overflow-x-auto whitespace-pre text-gray-300">{b.code}</pre>
        </div>
      ))}
    </div>
  );
}

function MarkdownSection({ body }) {
  return (
    <div className="sre-markdown prose prose-sm max-w-none dark:prose-invert [&_h1]:hidden">
      <XMarkdown
        content={normalizeMarkdownForDisplay(body)}
        streaming={{ hasNextChunk: false }}
      />
    </div>
  );
}

// ─── 行动建议「候选方案对比」卡片解析 / 展示 ─────────────────────

/** 去掉行首 Markdown 列表 / 有序前缀，便于识别「风险：」等字段行 */
function stripMarkdownListPrefix(line) {
  return String(line ?? "")
    .trim()
    .replace(/^(?:[-*+]\s+|\d+\.\s+)/, "")
    .trim();
}

/**
 * 从单行提取方案标题（`###`、`**SOL-B:**`、`- **…**`、`方案一：` 等）。
 * 用于前言块扫描，也用于「风险」与「理由」之间的内联标题行。
 */
function extractSchemeTitleFromLine(line) {
  const hSmall = line.match(/^#{3,4}\s+(.+)/);
  if (hSmall) {
    const ht = stripMarkdownBoldAndCodeForPlainText(hSmall[1]);
    if (/候选方案对比|备选方案对比|多方案对比|方案对比\s*$|推荐方案(\s*对比|\s*列表)?$/.test(ht)) return "";
    return ht;
  }
  const boldBullet = line.match(/^\s*[-*+]\s+\*\*(.+?)\s*\*\*\s*$/);
  if (boldBullet) {
    const t = stripMarkdownBoldAndCodeForPlainText(boldBullet[1]).trim();
    if (t) return t;
  }
  /** 允许 `**标题 **` 闭合前多余空格 */
  const boldLine = line.match(/^\*\*(.+?)\s*\*\*\s*$/);
  if (boldLine) {
    const t = stripMarkdownBoldAndCodeForPlainText(boldLine[1]).trim();
    if (t && !/候选方案对比|备选方案对比|多方案对比/.test(t)) return t;
  }
  const num = line.match(/^\d+\.\s+(.+)/);
  if (num) return stripMarkdownBoldAndCodeForPlainText(num[1]).trim();
  const bulletPlain = line.match(/^\s*[-*+]\s+(.+)$/);
  if (bulletPlain && !/^\s*[-*+]\s+\*\*/.test(line)) {
    const t = stripMarkdownBoldAndCodeForPlainText(bulletPlain[1]).trim();
    if (
      t &&
      !/^风险\s*[：:]/.test(t) &&
      !/^理由\s*[：:]/.test(t) &&
      !/^适用条件\s*[：:]/.test(t) &&
      !/^复杂度\s*[：:]/.test(t) &&
      (/^[A-Z]{2,}(?:-[A-Z0-9]+)+\s*[：:]/.test(t) || /^[A-Z][A-Z0-9]{1,12}\s*[：:]/.test(t))
    ) {
      return t;
    }
  }
  const cnPlan = line.match(
    /^方案[一二三四五六七八九十两〇零\d]+(?:\s*[（(]([^）)]+)[）)])?\s*[：:]\s*(.+)$/,
  );
  if (cnPlan) {
    const rest = (cnPlan[2] || "").trim();
    return stripMarkdownBoldAndCodeForPlainText(rest || cnPlan[1] || line).trim();
  }
  const plain = stripMarkdownBoldAndCodeForPlainText(line);
  const cnPlanOnly = plain.match(/^(方案[一二三四五六七八九十两〇零\d]+)(?:\s*[（(]([^）)]+)[）)])?$/);
  if (cnPlanOnly) {
    const sub = (cnPlanOnly[2] || "").trim();
    return sub ? `${cnPlanOnly[1]}（${sub}）` : cnPlanOnly[1];
  }
  return "";
}

/** 从多行前言块提取第一个有效方案名 */
function extractCandidateSchemeTitleFromPreamble(p) {
  const lines = String(p ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    const t = extractSchemeTitleFromLine(line);
    if (t) return t;
  }
  return "";
}

function candidateOptionRiskTier(riskRaw) {
  const s = stripMarkdownBoldAndCodeForPlainText(riskRaw).trim();
  if (!s) return "medium";
  if (/中[-－—]高|中高|^高|极高|严重/.test(s)) return "high";
  if (/低|无风险|极低|none/i.test(s)) return "low";
  if (/^中|中风险/.test(s)) return "medium";
  if (/高/.test(s)) return "high";
  return "medium";
}

function candidateOptionComplexityTier(cxRaw) {
  const s = stripMarkdownBoldAndCodeForPlainText(cxRaw).trim();
  if (!s) return "medium";
  if (/^(无|不适用|n\/?a|—|-|N\/A)$/i.test(s)) return "none";
  if (/无风险|不涉及|无需改造/i.test(s)) return "none";
  if (/中[-－—]高|中高|^高/.test(s)) return "high";
  if (/^中/.test(s)) return "medium";
  if (/低|简单|易/i.test(s)) return "low";
  if (/高|复杂/.test(s)) return "high";
  return "medium";
}

function parseRiskComplexityLine(line) {
  const t = stripMarkdownListPrefix(stripMarkdownBoldAndCodeForPlainText(line).trim());
  let riskValue = "";
  let complexityValue = "";
  if (t.includes("|")) {
    for (const part of t.split("|").map((s) => s.trim())) {
      const mr = part.match(/^风险\s*[：:]\s*(.+)$/);
      const mc = part.match(/^复杂度\s*[：:]\s*(.+)$/);
      if (mr) riskValue = mr[1].trim();
      if (mc) complexityValue = mc[1].trim();
    }
  } else {
    const mr = t.match(/^风险\s*[：:]\s*(.+)$/);
    if (mr) riskValue = mr[1].trim();
  }
  return { riskValue, complexityValue };
}

/**
 * 将「候选方案对比」正文拆成若干卡片（按行首 `风险：` 分块，并承接上一块的 ### / 列表标题）。
 */
function parseCandidateOptionCards(body) {
  const raw = String(body ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/```[\s\S]*?```/g, "")
    .trim();
  if (!raw) return [];

  const parts = raw.split(/\n(?=\s*(?:[-*+]\s+|\d+\.\s+)?风险\s*[：:])/);
  const cards = [];
  let pendingTitle = "";

  const lineStartsRisk = (line) =>
    /^风险\s*[：:]/.test(stripMarkdownListPrefix(stripMarkdownBoldAndCodeForPlainText(String(line ?? "").trim())));
  const lineStartsReason = (line) =>
    /^理由\s*[：:]/.test(stripMarkdownListPrefix(stripMarkdownBoldAndCodeForPlainText(String(line ?? "").trim())));
  const lineStartsConditions = (line) =>
    /^适用条件\s*[：:]/.test(stripMarkdownListPrefix(stripMarkdownBoldAndCodeForPlainText(String(line ?? "").trim())));

  for (const part of parts) {
    const chunk = part.trim();
    if (!chunk) continue;
    const lines = chunk.split("\n").map((l) => l.trimEnd());
    const firstLineRaw = (lines[0] || "").trim();

    if (!lineStartsRisk(firstLineRaw)) {
      const t = extractCandidateSchemeTitleFromPreamble(chunk);
      if (t) pendingTitle = t;
      continue;
    }

    /**
     * 同一 split 段内常含多张卡：`- **SOL-A**`…适用条件…空行…`- **SOL-B**`…`风险:`…
     * 须在「理由/适用条件」续行中遇到下一标题或下一 `风险:` 即停止，并在段内循环解析。
     */
    let i = 0;
    while (i < lines.length) {
      let nextPendingTitle = "";
      while (i < lines.length && !lineStartsRisk(lines[i])) {
        const th = extractSchemeTitleFromLine((lines[i] || "").trim());
        if (th) pendingTitle = th;
        i++;
      }
      if (i >= lines.length) break;

      const first = (lines[i] || "").trim();
      let { riskValue, complexityValue } = parseRiskComplexityLine(first);
      i++;
      while (i < lines.length) {
        const t = lines[i].trim();
        if (!t) {
          i++;
          continue;
        }
        const inner = stripMarkdownListPrefix(stripMarkdownBoldAndCodeForPlainText(t));
        const mc = inner.match(/^复杂度\s*[：:]\s*(.+)$/);
        if (mc && !complexityValue) {
          complexityValue = mc[1].trim();
          i++;
          continue;
        }
        break;
      }

      let inlineTitle = "";
      for (let j = i; j < lines.length; j++) {
        const raw = lines[j].trim();
        if (!raw) continue;
        const inner = stripMarkdownListPrefix(stripMarkdownBoldAndCodeForPlainText(raw));
        if (/^理由\s*[：:]/.test(inner) || /^适用条件\s*[：:]/.test(inner)) break;
        if (/^风险\s*[：:]/.test(inner)) break;
        if (/^复杂度\s*[：:]/.test(inner)) continue;
        const hit = extractSchemeTitleFromLine((lines[j] || "").trim());
        if (hit) {
          inlineTitle = hit;
          break;
        }
      }

      let reason = "";
      let conditions = "";
      while (i < lines.length) {
        const t = lines[i].trim();
        if (!t) {
          i++;
          continue;
        }
        const inner = stripMarkdownListPrefix(stripMarkdownBoldAndCodeForPlainText(t));
        let m = inner.match(/^理由\s*[：:]\s*(.*)$/);
        if (m) {
          const bits = [m[1]].filter(Boolean);
          i++;
          while (i < lines.length) {
            const u = lines[i].trim();
            if (!u) {
              i++;
              continue;
            }
            if (lineStartsConditions(u) || lineStartsRisk(u)) break;
            const titleHit = extractSchemeTitleFromLine((lines[i] || "").trim());
            if (titleHit) {
              nextPendingTitle = titleHit;
              i++;
              break;
            }
            bits.push(u);
            i++;
          }
          reason = stripMarkdownBoldAndCodeForPlainText(bits.join(" ").trim());
          continue;
        }
        m = inner.match(/^适用条件\s*[：:]\s*(.*)$/);
        if (m) {
          const bits = [m[1]].filter(Boolean);
          i++;
          while (i < lines.length) {
            const u = lines[i].trim();
            if (!u) {
              i++;
              continue;
            }
            if (lineStartsReason(u) || lineStartsRisk(u)) break;
            const titleHit = extractSchemeTitleFromLine((lines[i] || "").trim());
            if (titleHit) {
              nextPendingTitle = titleHit;
              i++;
              break;
            }
            bits.push(u);
            i++;
          }
          conditions = stripMarkdownBoldAndCodeForPlainText(bits.join(" ").trim());
          continue;
        }
        if (lineStartsRisk(lines[i])) break;
        const orphanTitle = extractSchemeTitleFromLine((lines[i] || "").trim());
        if (orphanTitle) {
          nextPendingTitle = orphanTitle;
          i++;
          continue;
        }
        i++;
      }

      const schemeTitle =
        (pendingTitle || inlineTitle || "").trim() || `候选方案 ${cards.length + 1}`;
      pendingTitle = nextPendingTitle;
      const rv = stripMarkdownBoldAndCodeForPlainText(riskValue).trim();
      const cv = stripMarkdownBoldAndCodeForPlainText(complexityValue).trim();
      if (!rv && !reason && !conditions) continue;

      cards.push({
        schemeTitle,
        riskValue: rv || "—",
        complexityValue: cv || "—",
        reason: reason || "—",
        conditions: conditions || "—",
        riskTier: candidateOptionRiskTier(rv),
        complexityTier: candidateOptionComplexityTier(cv),
      });
    }
  }

  return cards;
}

/** 章节标题命中「候选 / 多方案对比」类表述时走卡片 */
function isCandidateOptionsComparisonHeading(heading) {
  const plain = getPlainSectionTitle(heading);
  if (!plain) return false;
  if (/候选方案对比|备选方案对比/.test(plain)) return true;
  if (/候选\s*方案/.test(plain) && /对比|评估|取舍/.test(plain)) return true;
  if (/方案对比/.test(plain) && /候选|备选|可选|多方案/.test(plain)) return true;
  if (/(处置|修复|缓解)?方案/.test(plain) && /对比|评估|权衡/.test(plain)) return true;
  if (/推荐方案/.test(plain) && /对比|列表|评估/.test(plain)) return true;
  return false;
}

/**
 * 无明确小节标题时：行动建议/终稿中若正文含多套「风险 + 理由 + 适用条件」，也用卡片（需至少 2 套，降低误伤）。
 */
function isCandidateOptionsBodyHeuristic(body, stage) {
  if (stage !== "stage4" && stage !== "final") return false;
  const raw = String(body ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/```[\s\S]*?```/g, "");
  const riskLines = raw.match(/^\s*(?:[-*+]\s+|\d+\.\s+)?风险\s*[：:]/gm);
  if (!riskLines || riskLines.length < 2) return false;
  if (!/理由\s*[：:]/.test(raw) || !/适用条件\s*[：:]/.test(raw)) return false;
  return true;
}

const CANDIDATE_RISK_TAG = {
  low:    "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200/80 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-800/60",
  medium: "bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-200/90 dark:bg-amber-950/45 dark:text-amber-200 dark:ring-amber-800/50",
  high:   "bg-rose-100 text-rose-800 ring-1 ring-inset ring-rose-200/90 dark:bg-rose-950/50 dark:text-rose-200 dark:ring-rose-800/55",
};

const CANDIDATE_COMPLEXITY_TAG = {
  none:   "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200/80 dark:bg-slate-800/80 dark:text-slate-200 dark:ring-slate-600/50",
  low:    "bg-sky-100 text-sky-900 ring-1 ring-inset ring-sky-200/80 dark:bg-sky-950/40 dark:text-sky-200 dark:ring-sky-800/45",
  medium: "bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-200/90 dark:bg-amber-950/45 dark:text-amber-200 dark:ring-amber-800/50",
  high:   "bg-rose-100 text-rose-800 ring-1 ring-inset ring-rose-200/90 dark:bg-rose-950/50 dark:text-rose-200 dark:ring-rose-800/55",
};

function CandidateSchemeIcon() {
  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-s bg-gradient-to-br from-emerald-500/15 to-teal-500/10 text-emerald-700 shadow-inner dark:from-emerald-400/20 dark:to-teal-500/10 dark:text-emerald-300"
      aria-hidden
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2Z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="17" x2="14" y2="17" />
      </svg>
    </span>
  );
}

/** 候选方案对比：卡片式（标题行 / 理由 / 适用条件 + 风险与复杂度标签） */
function CandidateComparisonCards({ rows }) {
  if (!rows?.length) return null;
  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <article
          key={i}
          className="overflow-hidden rounded-2xl border border-gray-200/90 bg-gradient-to-b from-white to-slate-50/90 shadow-sm ring-1 ring-black/[0.02] dark:border-gray-600 dark:from-gray-900 dark:to-gray-950/80 dark:ring-white/[0.04]"
        >
          <div className="border-b border-gray-100/90 bg-white/80 px-4 py-3 dark:border-gray-700/80 dark:bg-gray-900/60">
            <div className="flex min-w-0 items-start gap-3">
              <CandidateSchemeIcon />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-2">
                  <div className="text-[12px] font-bold leading-snug text-gray-900 dark:text-gray-50">
                    {row.schemeTitle?.trim() ? row.schemeTitle : `候选方案 ${i + 1}`}
                  </div>
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-tight ${CANDIDATE_RISK_TAG[row.riskTier] ?? CANDIDATE_RISK_TAG.medium}`}>
                    风险：{row.riskValue}
                  </span>
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-tight ${CANDIDATE_COMPLEXITY_TAG[row.complexityTier] ?? CANDIDATE_COMPLEXITY_TAG.medium}`}>
                    复杂度：{row.complexityValue}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-1 px-4 py-3">
            <div>
              <span className="text-[12px] font-bold uppercase tracking-wider text-emerald-700/80 dark:text-emerald-400/90 mr-1">
                理由:
              </span>
              <span className="text-[12px] font-semibold leading-relaxed text-gray-900 dark:text-gray-100">
                {row.reason}
              </span>
            </div>
            <div>
              <span className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mr-1">
                适用条件: 
              </span>
              <span className="text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                {row.conditions}
              </span>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

// ─── 「推荐方案」卡片（带执行 → 当前会话发送方案名称）────────────────

function isRecommendedPlansSectionHeading(heading) {
  const p = getPlainSectionTitle(heading).trim();
  if (!p) return false;
  if (!/^推荐方案/.test(p)) return false;
  if (/推荐方案\s*(对比|列表|评估)/.test(p)) return false;
  return true;
}

/** 从正文拆出若干条推荐（支持 `-`/`1.` 列表或每行一条短句） */
function parseRecommendedPlanLines(body) {
  const raw = String(body ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/```[\s\S]*?```/g, "")
    .trim();
  if (!raw) return [];
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const filtered = lines.filter((l) => !/^#{1,6}\s/.test(l));
  if (!filtered.length) return [];
  const hasListMarkers = filtered.some((l) => /^\d+\.\s/.test(l) || /^[-*+]\s/.test(l));
  if (hasListMarkers) {
    const items = [];
    for (const l of filtered) {
      const m = l.match(/^\d+\.\s+(.+)$/) || l.match(/^[-*+]\s+(.+)$/);
      if (!m) continue;
      const text = stripMarkdownBoldAndCodeForPlainText(m[1].trim());
      if (text) items.push(text);
    }
    return items;
  }
  return filtered.map((l) => stripMarkdownBoldAndCodeForPlainText(l)).filter(Boolean);
}

function recommendCardTitleFromBody(full, index1Based) {
  const t = stripMarkdownBoldAndCodeForPlainText(String(full ?? "").trim())
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return `推荐项 ${index1Based}`;
  const seg = (t.split(/[，,。；;]/)[0] || t).trim();
  if (seg.length >= 6 && seg.length <= 52) return seg;
  if (seg.length > 52) return `${seg.slice(0, 50)}…`;
  return `推荐项 ${index1Based}`;
}

function RecommendedPlansCards({ items, onExecute, disabled }) {
  if (!items?.length) return null;
  const btnCls =
    "shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-emerald-700 dark:hover:bg-emerald-600";
  return (
    <div className="space-y-2.5">
      {items.map((text, i) => {
        const title = recommendCardTitleFromBody(text, i + 1);
        return (
          <article
            key={i}
            className="flex flex-col gap-2 rounded-xl border border-gray-200/90 bg-white px-3.5 py-3 shadow-sm dark:border-gray-600 dark:bg-gray-900/90 sm:flex-row sm:items-stretch sm:justify-between sm:gap-3"
          >
            <div className="min-w-0 flex-1">
              <p className="mt-1.5 text-xs leading-relaxed text-gray-600 dark:text-gray-300">{text}</p>
            </div>
            {typeof onExecute === "function" ? (
              <div className="flex shrink-0 items-center justify-end sm:flex-col sm:justify-center">
                <button type="button" className={btnCls} disabled={Boolean(disabled)} onClick={() => onExecute(text)}>
                  执行
                </button>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

// ─── Section Shell ────────────────────────────────────────────────

function SectionShell({ heading, level, accent, children }) {
  const styles = ACCENT_STYLES[accent] ?? ACCENT_STYLES.blue;
  if (!heading) {
    return <div>{children}</div>;
  }
  const titlePlain = stripMarkdownBoldAndCodeForPlainText(heading);
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <h3 className={`mb-3 text-${level === 2 ? "sm" : "xs"} font-semibold ${styles.title}`}>{titlePlain}</h3>
      {children}
    </div>
  );
}

// ─── 主组件 ──────────────────────────────────────────────────────

export function SreReportTabContent({ tab, onExecuteRecommendation, reportActionsDisabled = false }) {
  const meta = STAGE_HEADER[tab.stage] ?? STAGE_HEADER.stage1;
  const accent = meta.accent;

  const sections = useMemo(() => {
    const cleaned = stripSreReportLeadingBoilerplate(tab.markdown || "");
    return splitIntoSections(cleaned);
  }, [tab.markdown]);

  return (
    <div className="space-y-3">
      {tab.stage === "stage1" && tab.markdown ? (
        <Stage1AttachmentVizCards markdown={tab.markdown} />
      ) : null}
      {tab.stage === "stage2" && tab.markdown ? (
        <Stage2AttachmentVizCards markdown={tab.markdown} />
      ) : null}
      {tab.stage === "stage3" && tab.markdown ? (
        <Stage3AttachmentVizCards markdown={tab.markdown} />
      ) : null}
      {sections.map((section, idx) => {
        if (isSkippedReportSectionHeading(section.heading)) return null;

        const type = detectSectionType(section.body);

        if (type === "empty") {
          return section.heading ? (
            <SectionShell key={idx} heading={section.heading} level={section.level} accent={accent}>
              <p className="text-xs text-gray-400">（暂无内容）</p>
            </SectionShell>
          ) : null;
        }

        {
          const candRows = parseCandidateOptionCards(section.body);
          const useCandidateCards =
            candRows.length > 0 &&
            (isCandidateOptionsComparisonHeading(section.heading) ||
              (isCandidateOptionsBodyHeuristic(section.body, tab.stage) && candRows.length >= 2));
          if (useCandidateCards) {
            return (
              <SectionShell key={idx} heading={section.heading} level={section.level} accent={accent}>
                <CandidateComparisonCards rows={candRows} />
              </SectionShell>
            );
          }
        }

        if (isRecommendedPlansSectionHeading(section.heading)) {
          const recItems = parseRecommendedPlanLines(section.body);
          if (recItems.length > 0) {
            return (
              <SectionShell key={idx} heading={section.heading} level={section.level} accent={accent}>
                <RecommendedPlansCards
                  items={recItems}
                  onExecute={onExecuteRecommendation}
                  disabled={reportActionsDisabled}
                />
              </SectionShell>
            );
          }
        }

        {
          const plainTl = getPlainSectionTitle(section.heading);
          if (tab.stage === "stage1" && isStage1TimelineSectionTitle(plainTl)) {
            const fromList = parseStage1TimelineListBody(section.body);
            if (fromList?.length) {
              return (
                <SectionShell key={idx} heading={section.heading} level={section.level} accent={accent}>
                  <TimelineListSection items={fromList} />
                </SectionShell>
              );
            }
          }
        }

        if (type === "metrics") {
          const metrics = parseMetrics(section.body);
          return metrics.length > 0 ? (
            <SectionShell key={idx} heading={section.heading} level={section.level} accent={accent}>
              <MetricsSection metrics={metrics} heading={section.heading} />
            </SectionShell>
          ) : null;
        }

        if (type === "table") {
          const tableData = parseMarkdownTable(section.body);
          if (!tableData) return null;
          const plainTitle = getPlainSectionTitle(section.heading);
          const isStage1 = tab.stage === "stage1";
          if (isStage1 && isStage1TimelineSectionTitle(plainTitle)) {
            return (
              <SectionShell key={idx} heading={section.heading} level={section.level} accent={accent}>
                <TimelineSection tableData={tableData} />
              </SectionShell>
            );
          }
          if (isStage1 && isStage1MetricTableSectionTitle(plainTitle)) {
            return (
              <SectionShell key={idx} heading={section.heading} level={section.level} accent={accent}>
                <KeyValueTableAsMetricCards tableData={tableData} />
              </SectionShell>
            );
          }
          return (
            <SectionShell key={idx} heading={section.heading} level={section.level} accent={accent}>
              <TableSection tableData={tableData} />
            </SectionShell>
          );
        }

        if (type === "checklist") {
          const items = parseChecklist(section.body);
          if (items.length === 0) return null;
          const plainChecklist = tab.stage === "stage1" && isStage1PlainChecklistTitle(getPlainSectionTitle(section.heading));
          return (
            <SectionShell key={idx} heading={section.heading} level={section.level} accent={accent}>
              <ChecklistSection items={items} plain={plainChecklist} />
            </SectionShell>
          );
        }

        if (type === "sre_viz") {
          const parts = splitBodyIntoParts(section.body);
          return parts.length > 0 ? (
            <SectionShell key={idx} heading={section.heading} level={section.level} accent={accent}>
              <MixedBodyRenderer parts={parts} />
            </SectionShell>
          ) : null;
        }

        if (type === "code") {
          const blocks = extractCodeBlocks(section.body);
          return (
            <SectionShell key={idx} heading={section.heading} level={section.level} accent={accent}>
              <CodeSection blocks={blocks} />
            </SectionShell>
          );
        }

        // markdown prose
        return (
          <SectionShell key={idx} heading={section.heading} level={section.level} accent={accent}>
            <MarkdownSection body={section.body} />
          </SectionShell>
        );
      })}
    </div>
  );
}
