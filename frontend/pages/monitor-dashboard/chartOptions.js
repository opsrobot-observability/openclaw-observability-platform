import * as echarts from "echarts";
import intl from "react-intl-universal";

const MONITOR_TOOLTIP_STYLE = {
  backgroundColor: "rgba(6, 24, 43, 0.96)",
  borderColor: "#1f547f",
  borderWidth: 1,
  textStyle: { color: "#d7ecff", fontSize: 12 },
  padding: [8, 10],
  extraCssText: "box-shadow:0 4px 12px rgba(0,0,0,0.45);",
  confine: true,
  enterable: false,
  position: (point, _params, _dom, _rect, size) => {
    const [x, y] = point;
    const viewW = size?.viewSize?.[0] || 0;
    const viewH = size?.viewSize?.[1] || 0;
    const boxW = size?.contentSize?.[0] || 0;
    const boxH = size?.contentSize?.[1] || 0;
    const gap = 12;

    let left = x + gap;
    let top = y + gap;

    if (left + boxW > viewW - 4) left = x - boxW - gap;
    if (left < 4) left = 4;

    if (top + boxH > viewH - 4) top = y - boxH - gap;
    if (top < 4) top = 4;

    return [left, top];
  },
};

/**
 * 监控大屏 Token Tooltip：以 k（千 Token）为基准，大到自动进到 M。
 */
export function formatMonitorTokenK(raw) {
  const n = Math.abs(Number(raw)) || 0;
  const sign = Number(raw) < 0 ? "-" : "";
  if (n === 0) return "0";
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    const digits = m >= 100 ? 0 : m >= 10 ? 1 : 2;
    return `${sign}${parseFloat(m.toFixed(digits))}M`;
  }
  const k = n / 1000;
  if (k >= 1) {
    const digits = k >= 100 ? 0 : k >= 10 ? 1 : 2;
    return `${sign}${parseFloat(k.toFixed(digits))}k`;
  }
  return `${sign}${Math.round(n)}`;
}

export function getDailyTokenOption(dailyTokenData = []) {
  const list = Array.isArray(dailyTokenData) ? dailyTokenData : [];
  const xData = list.map((d) => d?.day || "");
  const yData = list.map((d) => Number(d?.total) || 0);
  const labelInterval = xData.length > 24 ? 2 : xData.length > 14 ? 1 : 0;
  const yMaxRaw = yData.length > 0 ? Math.max(...yData) : 0;
  const yMax = yMaxRaw > 0 ? Math.ceil(yMaxRaw * 1.2) : 10;
  const yInterval = Math.max(1, Math.ceil(yMax / 4));

  return {
    grid: { top: 20, right: 10, bottom: 20, left: 35 },
    tooltip: {
      ...MONITOR_TOOLTIP_STYLE,
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params) => {
        const p = Array.isArray(params) && params.length > 0 ? params[0] : null;
        if (!p) return "";
        const day = String(p.axisValueLabel ?? p.name ?? "");
        const raw = Number(p.value) || 0;
        const marker = String(p.marker || "");
        return `${day}<br/>${marker}${intl.get("monitorDashboard.chart.token")}: ${formatMonitorTokenK(raw)}`;
      },
    },
    xAxis: {
      type: "category",
      data: xData,
      axisLine: { lineStyle: { color: "#16436e" } },
      axisLabel: {
        color: "#6b93a7",
        fontSize: 10,
        interval: labelInterval,
        hideOverlap: true,
      },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: "#16436e", type: "dashed" } },
      axisLabel: {
        color: "#6b93a7",
        fontSize: 10,
        formatter: (v) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : String(v)),
      },
      min: 0,
      max: yMax,
      interval: yInterval,
    },
    series: [
      {
        data: yData,
        type: "bar",
        barWidth: "40%",
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: "#00f0ff" },
            { offset: 1, color: "#0055ff" },
          ]),
          borderRadius: [2, 2, 0, 0],
        },
      },
    ],
  };
}

export function getTopAgentOption(topInstances = []) {
  const list = Array.isArray(topInstances) ? topInstances : [];
  const ranked = [...list]
    .map((r) => ({
      name: String(r?.name || intl.get("monitorDashboard.chart.unnamed")),
      value: Number(r?.value) || 0,
    }))
    .sort((a, b) => a.value - b.value);
  const yData = ranked.map((r) => r.name);
  const xData = ranked.map((r) => r.value);

  return {
    grid: { top: 10, right: 20, bottom: 10, left: 70 },
    tooltip: {
      ...MONITOR_TOOLTIP_STYLE,
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params) => {
        const p = Array.isArray(params) && params.length > 0 ? params[0] : null;
        if (!p) return "";
        const fullName = String(p.name || "");
        const value = Number(p.value) || 0;
        const marker = String(p.marker || "");
        return `${fullName}<br/>${marker}${intl.get("monitorDashboard.chart.token")}: ${formatMonitorTokenK(value)}`;
      },
    },
    xAxis: {
      type: "value",
      splitLine: { show: false },
      axisLabel: { show: false },
    },
    yAxis: {
      type: "category",
      data: yData,
      triggerEvent: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: "#8fb1c6",
        fontSize: 11,
        width: 120,
        overflow: "truncate",
        ellipsis: "...",
      },
    },
    series: [
      {
        type: "bar",
        barWidth: 6,
        data: xData,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(1, 0, 0, 0, [
            { offset: 0, color: "#00f0ff" },
            { offset: 1, color: "#0033aa" },
          ]),
          borderRadius: [0, 3, 3, 0],
        },
        showBackground: true,
        backgroundStyle: { color: "#0a1d35", borderRadius: [0, 3, 3, 0] },
      },
    ],
  };
}

export function getDonutOption(data, colors) {
  return {
    tooltip: {
      ...MONITOR_TOOLTIP_STYLE,
      trigger: "item",
      formatter: (p) => {
        const name = String(p?.name ?? "");
        const value = Number(p?.value) || 0;
        const percent = Number(p?.percent) || 0;
        const marker = String(p?.marker || "");
        return `${name}<br/>${marker}${intl.get("monitorDashboard.chart.percentage")}: ${percent.toFixed(1)}%<br/>${marker}${intl.get("monitorDashboard.chart.value")}: ${formatMonitorTokenK(value)}`;
      },
    },
    series: [
      {
        type: "pie",
        radius: ["40%", "65%"],
        center: ["50%", "50%"],
        avoidLabelOverlap: true,
        label: {
          show: true,
          position: "outside",
          formatter: "{b}",
          color: "#8fb1c6",
          fontSize: 10,
        },
        labelLine: {
          show: true,
          length: 10,
          length2: 15,
          lineStyle: {
            color: "#16436e"
          }
        },
        data,
        itemStyle: {
          borderWidth: 2,
          borderColor: "#020b1a",
        },
      },
    ],
    color: colors,
  };
}

export function getTrendOption(trendData = []) {
  const list = Array.isArray(trendData) ? trendData : [];
  const xData = list.map((d) => d?.label || String(d?.day || "").slice(5, 10) || "");
  const yData = list.map((d) => Number(d?.value) || 0);
  const yMaxRaw = yData.length > 0 ? Math.max(...yData) : 0;
  const yMax = yMaxRaw > 0 ? Math.ceil(yMaxRaw * 1.2) : 10;
  const yInterval = Math.max(1, Math.ceil(yMax / 4));
  const xLabelInterval = xData.length > 24 ? 2 : xData.length > 14 ? 1 : 0;

  return {
    grid: { top: 30, right: 10, bottom: 20, left: 35 },
    tooltip: {
      ...MONITOR_TOOLTIP_STYLE,
      trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color: "#1f547f" } },
      formatter: (params) => {
        const p = Array.isArray(params) && params.length > 0 ? params[0] : null;
        if (!p) return "";
        const label = String(p.axisValueLabel || p.name || "");
        const value = Number(p.value) || 0;
        const marker = String(p.marker || "");
        const locale = intl.options.currentLocale || "zh-CN";
        return `${label}<br/>${marker}${intl.get("monitorDashboard.chart.sessionCount")}: ${value.toLocaleString(locale)}`;
      },
    },
    xAxis: {
      type: "category",
      data: xData,
      axisLine: { lineStyle: { color: "#16436e" } },
      axisLabel: {
        color: "#6b93a7",
        fontSize: 10,
        interval: xLabelInterval,
        hideOverlap: true,
      },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: "#16436e", type: "dashed" } },
      axisLabel: { color: "#6b93a7", fontSize: 10 },
      min: 0,
      max: yMax,
      interval: yInterval,
    },
    series: [
      {
        data: yData,
        type: "line",
        smooth: true,
        symbol: "none",
        lineStyle: {
          color: "#00f0ff",
          width: 2,
          shadowColor: "rgba(0, 240, 255, 0.5)",
          shadowBlur: 10,
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: "rgba(0, 240, 255, 0.3)" },
            { offset: 1, color: "rgba(0, 240, 255, 0)" },
          ]),
        },
      },
    ],
  };
}
