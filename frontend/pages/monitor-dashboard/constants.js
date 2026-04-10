/**
 * 大屏无痕循环列表动画时长（秒）：每 10 秒经过 3 条等效高度。
 * 与 `translateY(-50%)` 无缝循环配合，整份列表滚完一圈 = N 条，故周期 = (10/3)*N。
 * @param {number} itemCount 单份列表条数
 */
export function getAutoScrollDurationSec(itemCount) {
  const n = Math.max(1, Number(itemCount) || 0);
  return (10 * n) / 3;
}

export const DIGITAL_EMPLOYEE_ROWS = [
  { name: "研发助手", role: "研发", status: "在线", sessions: "128", token: "3.1M", color: "#00f0ff" },
  { name: "数据分析员", role: "分析", status: "离线", sessions: "358", token: "9.8M", color: "#4a72ff" },
  { name: "安全审计员", role: "安全", status: "在线", sessions: "89", token: "2.4M", color: "#00f0ff" },
  {
    name: "研发助手-CodeBuddy",
    role: "研发",
    status: "在线",
    sessions: "890",
    token: "21.4M",
    color: "#00f0ff",
    active: true,
  },
  { name: "销售复盘员", role: "销售", status: "离线", sessions: "2,104", token: "6.2M", color: "#4a72ff" },
  { name: "客服助手-小云", role: "客服", status: "在线", sessions: "476", token: "7.8M", color: "#00f0ff" },
  { name: "法务问答官", role: "法务", status: "在线", sessions: "142", token: "4.6M", color: "#00f0ff" },
  { name: "运维巡检员", role: "运维", status: "离线", sessions: "214", token: "5.9M", color: "#4a72ff" },
  { name: "内容审核官", role: "审核", status: "在线", sessions: "631", token: "11.3M", color: "#00f0ff" },
  { name: "财务对账助手", role: "财务", status: "在线", sessions: "287", token: "8.4M", color: "#00f0ff" },
  { name: "工单分派员", role: "调度", status: "离线", sessions: "519", token: "6.8M", color: "#4a72ff" },
  { name: "招聘筛选助手", role: "HR", status: "在线", sessions: "173", token: "3.9M", color: "#00f0ff" },
  { name: "知识库管家", role: "知识", status: "在线", sessions: "744", token: "12.6M", color: "#00f0ff" },
  { name: "产品需求助理", role: "产品", status: "离线", sessions: "265", token: "5.1M", color: "#4a72ff" },
  { name: "营销投放官", role: "营销", status: "在线", sessions: "408", token: "9.2M", color: "#00f0ff" },
];

export const ECOSYSTEM_APPS = ["Discord", "Telegram", "Slack", "Web", "飞书", "钉钉"];

export const ECOSYSTEM_DOT_CLASSES = [
  "bg-indigo-500",
  "bg-blue-400",
  "bg-green-500",
  "bg-purple-500",
  "bg-cyan-400",
  "bg-blue-600",
];

export const MODEL_DONUT_DATA = [
  { value: 38.5, name: "GPT-4o 38.5%" },
  { value: 29.2, name: "Claude-3.5 29.2%" },
  { value: 18.6, name: "GPT-4.5 18.6%" },
  { value: 9.1, name: "GPT-4o-mini 9.1%" },
  { value: 4.6, name: "其他模型 4.6%" },
];

export const MODEL_DONUT_COLORS = ["#00f0ff", "#0077ff", "#0044aa", "#a8d2ff", "#16436e"];

export const IO_DONUT_DATA = [
  { value: 41.3, name: "Input Token 41.3%" },
  { value: 58.7, name: "Output Token 58.7%" },
];

export const IO_DONUT_COLORS = ["#0066ff", "#00f0ff"];
