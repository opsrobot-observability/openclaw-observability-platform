import * as echarts from "echarts";

export function getDailyTokenOption() {
  return {
    grid: { top: 20, right: 10, bottom: 20, left: 35 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: [
        "03-15",
        "03-16",
        "03-17",
        "03-18",
        "03-19",
        "03-20",
        "03-21",
        "03-22",
        "03-23",
        "03-24",
        "03-25",
        "03-26",
        "03-27",
        "03-28",
      ],
      axisLine: { lineStyle: { color: "#16436e" } },
      axisLabel: { color: "#6b93a7", fontSize: 10, interval: 1 },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: "#16436e", type: "dashed" } },
      axisLabel: { color: "#6b93a7", fontSize: 10, formatter: "{value}M" },
      min: 0,
      max: 280,
      interval: 70,
    },
    series: [
      {
        data: [180, 140, 160, 130, 200, 190, 210, 205, 170, 220, 215, 230, 200, 190],
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

export function getTopAgentOption() {
  return {
    grid: { top: 10, right: 20, bottom: 10, left: 70 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "value",
      splitLine: { show: false },
      axisLabel: { show: false },
    },
    yAxis: {
      type: "category",
      data: ["销售复盘灵", "数据分析师", "客服助手-小云", "研发助手-Co..."],
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: "#8fb1c6", fontSize: 11 },
    },
    series: [
      {
        type: "bar",
        barWidth: 6,
        data: [35, 60, 85, 100],
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
    tooltip: { trigger: "item" },
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

/** @param {{ dateLabel: string; sessions: number }[]} series */
export function getSessionTrendOptionFromSeries(series) {
  if (!series?.length) return getTrendOption();
  const max = Math.max(...series.map((x) => Number(x.sessions) || 0), 1);
  return {
    grid: { top: 30, right: 10, bottom: 20, left: 35 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: series.map((x) => x.dateLabel),
      axisLine: { lineStyle: { color: "#16436e" } },
      axisLabel: { color: "#6b93a7", fontSize: 10 },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: "#16436e", type: "dashed" } },
      axisLabel: { color: "#6b93a7", fontSize: 10 },
      min: 0,
      max: Math.ceil(max * 1.1),
    },
    series: [
      {
        data: series.map((x) => Number(x.sessions) || 0),
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

/** @param {{ valueMillions: number; dateLabel: string }[]} daily */
export function getDailyTokenOptionFromSeries(daily) {
  if (!daily?.length) return getDailyTokenOption();
  const vals = daily.map((x) => (Number(x.valueMillions) != null ? Number(x.valueMillions) : (Number(x.value) || 0) / 1e6));
  const max = Math.max(...vals, 0.001);
  const pad = max * 0.1;
  return {
    grid: { top: 20, right: 10, bottom: 20, left: 35 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: daily.map((x) => x.dateLabel),
      axisLine: { lineStyle: { color: "#16436e" } },
      axisLabel: { color: "#6b93a7", fontSize: 10, interval: 1 },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: "#16436e", type: "dashed" } },
      axisLabel: { color: "#6b93a7", fontSize: 10, formatter: "{value}M" },
      min: 0,
      max: Math.ceil((max + pad) * 1.05),
    },
    series: [
      {
        data: vals,
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

/** @param {{ categories: string[]; values: number[] }} bar */
export function getTopAgentOptionFromBar(bar) {
  if (!bar?.categories?.length) return getTopAgentOption();
  return {
    grid: { top: 10, right: 20, bottom: 10, left: 70 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "value",
      splitLine: { show: false },
      axisLabel: { show: false },
    },
    yAxis: {
      type: "category",
      data: bar.categories,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: "#8fb1c6", fontSize: 11 },
    },
    series: [
      {
        type: "bar",
        barWidth: 6,
        data: bar.values,
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

export function getTrendOption() {
  return {
    grid: { top: 30, right: 10, bottom: 20, left: 35 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: ["03-21", "03-22", "03-23", "03-24", "03-25", "03-26", "03-27", "03-28"],
      axisLine: { lineStyle: { color: "#16436e" } },
      axisLabel: { color: "#6b93a7", fontSize: 10 },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: "#16436e", type: "dashed" } },
      axisLabel: { color: "#6b93a7", fontSize: 10, formatter: "{value}k" },
      min: 0,
      max: 10,
      interval: 3,
    },
    series: [
      {
        data: [3, 4, 3.5, 5, 4.5, 6, 8, 8.098],
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
