/**
 * AG-UI Mock Scenarios — SRE Agent 事件流
 *
 * 每个 scenario 返回事件数组，驱动左侧聊天 + 右侧工作区。
 * CUSTOM(workspace) 事件推送右侧面板；TEXT_MESSAGE 推送左侧消息。
 */
import { EventType, uid } from "./agui.js";

const d = (ms) => ({ _delay: ms });
const evt = (type, payload, pause) => ({
  type, ...payload, ...(pause ? { _pause: pause } : {}),
});
const ws = (action, panel) => evt(EventType.CUSTOM, {
  name: "workspace", value: { action, panel },
});
const confirm = (payload) => evt(EventType.CUSTOM, {
  name: "confirm", value: payload,
});

export function matchScenario(userText) {
  const t = userText.toLowerCase();
  if (t.includes("巡检") || t.includes("inspect") || t.includes("集群")) return k8sInspectScenario;
  if (t.includes("cpu") || t.includes("内存") || t.includes("监控") || t.includes("指标") || t.includes("prom")) return promQueryScenario;
  if (t.includes("故障") || t.includes("诊断") || t.includes("慢") || t.includes("错误") || t.includes("5xx")) return diagnoseScenario;
  if (t.includes("报告") || t.includes("report")) return reportScenario;
  return defaultScenario;
}

// ─── K8s 集群巡检 ────────────────────────────────────────────────
export function k8sInspectScenario() {
  const runId = uid("run");
  const threadId = uid("thread");
  const tc1 = uid("tc"); const tc2 = uid("tc");
  const msgId = uid("msg");

  return [
    evt(EventType.RUN_STARTED, { threadId, runId }),
    d(200),

    // ── 思考：分析意图
    evt(EventType.STEP_STARTED, { stepName: "分析意图", detail: "识别到巡检指令，规划执行步骤：检查节点 → 扫描 Pod → 汇总报告" }),
    d(500),
    evt(EventType.STEP_FINISHED, { stepName: "分析意图" }),

    // ── 步骤1：kubectl get nodes
    evt(EventType.STEP_STARTED, { stepName: "检查节点状态", detail: "执行 kubectl get nodes -o wide" }),
    d(150),
    evt(EventType.TOOL_CALL_START, { toolCallId: tc1, toolCallName: "kubectl" }),
    d(60),
    evt(EventType.TOOL_CALL_ARGS, { toolCallId: tc1, delta: '{"command":"get nodes -o wide"}' }),
    d(80),
    evt(EventType.TOOL_CALL_END, { toolCallId: tc1 }),
    d(600),
    evt(EventType.TOOL_CALL_RESULT, {
      toolCallId: tc1, messageId: uid("tool"),
      content: `NAME            STATUS   ROLES           AGE   VERSION   INTERNAL-IP     OS-IMAGE
node-master-01  Ready    control-plane   42d   v1.28.4   10.0.1.10       Ubuntu 22.04
node-worker-01  Ready    <none>          42d   v1.28.4   10.0.1.11       Ubuntu 22.04
node-worker-02  Ready    <none>          42d   v1.28.4   10.0.1.12       Ubuntu 22.04
node-worker-03  NotReady <none>          42d   v1.28.4   10.0.1.13       Ubuntu 22.04`,
    }),
    // → 右侧：终端输出
    ws("add_panel", {
      id: uid("wp"), type: "terminal",
      title: "$ kubectl get nodes -o wide",
      lines: [
        { text: "NAME            STATUS   ROLES           AGE   VERSION   INTERNAL-IP     OS-IMAGE", cls: "head" },
        { text: "node-master-01  Ready    control-plane   42d   v1.28.4   10.0.1.10       Ubuntu 22.04", cls: "ok" },
        { text: "node-worker-01  Ready    <none>          42d   v1.28.4   10.0.1.11       Ubuntu 22.04", cls: "ok" },
        { text: "node-worker-02  Ready    <none>          42d   v1.28.4   10.0.1.12       Ubuntu 22.04", cls: "ok" },
        { text: "node-worker-03  NotReady <none>          42d   v1.28.4   10.0.1.13       Ubuntu 22.04", cls: "error" },
      ],
    }),
    d(200),
    evt(EventType.STEP_FINISHED, { stepName: "检查节点状态" }),

    // ── 步骤2：扫描异常 Pod
    evt(EventType.STEP_STARTED, { stepName: "扫描异常 Pod", detail: "执行 kubectl get pods -A 过滤异常状态" }),
    d(150),
    evt(EventType.TOOL_CALL_START, { toolCallId: tc2, toolCallName: "kubectl" }),
    d(60),
    evt(EventType.TOOL_CALL_ARGS, { toolCallId: tc2, delta: '{"command":"get pods -A --field-selector=status.phase!=Running"}' }),
    d(80),
    evt(EventType.TOOL_CALL_END, { toolCallId: tc2 }),
    d(800),
    evt(EventType.TOOL_CALL_RESULT, {
      toolCallId: tc2, messageId: uid("tool"),
      content: "Found 3 abnormal pods",
    }),
    // → 右侧：异常 Pod 表格
    ws("add_panel", {
      id: uid("wp"), type: "pods",
      title: "异常 Pod 列表",
      pods: [
        { namespace: "default", name: "payment-svc-7f8b9c6d4-x2k9p", status: "CrashLoopBackOff", restarts: 12, age: "2h", node: "node-worker-01", actions: ["logs", "describe", "restart"] },
        { namespace: "monitoring", name: "prometheus-node-exp-worker03-abc", status: "Pending", restarts: 0, age: "35m", node: "node-worker-03", actions: ["describe", "events"] },
        { namespace: "kube-system", name: "coredns-fallback-xyz", status: "Error", restarts: 3, age: "1h", node: "node-worker-02", actions: ["logs", "describe", "restart"] },
      ],
    }),
    d(200),
    evt(EventType.STEP_FINISHED, { stepName: "扫描异常 Pod" }),

    // → 右侧：集群指标卡片
    ws("add_panel", {
      id: uid("wp"), type: "metrics",
      title: "集群概况",
      items: [
        { label: "节点", value: "3/4", sub: "1 NotReady", status: "warning" },
        { label: "Pod 总数", value: "47", sub: "44 Running", status: "normal" },
        { label: "异常 Pod", value: "3", sub: "需关注", status: "danger" },
        { label: "SLO", value: "99.2%", sub: "目标 99.9%", status: "warning" },
      ],
    }),
    d(100),

    // → 右侧：告警时间线
    ws("add_panel", {
      id: uid("wp"), type: "alerts",
      title: "活跃告警",
      alerts: [
        { level: "critical", time: "08:55", text: "node-worker-03 NotReady — kubelet 停止心跳", source: "node-monitor" },
        { level: "warning", time: "08:12", text: "payment-svc OOMKilled — 已重启 12 次", source: "pod-monitor" },
        { level: "warning", time: "08:30", text: "coredns-fallback Error — DNS 冗余受损", source: "kube-system" },
        { level: "info", time: "07:45", text: "集群自动扩缩触发评估", source: "cluster-autoscaler" },
      ],
    }),
    d(300),

    // ── 左侧：总结
    evt(EventType.STEP_STARTED, { stepName: "生成巡检结论", detail: "综合节点状态和异常 Pod 信息生成巡检摘要" }),
    d(200),
    evt(EventType.TEXT_MESSAGE_START, { messageId: msgId, role: "assistant" }),
    ...streamText(msgId, `巡检完成，发现以下问题：

**1 个节点异常** — \`node-worker-03\` NotReady，建议立即排查 kubelet 状态
**3 个异常 Pod** — 包括 payment-svc OOM、CoreDNS 备份实例 Error
**SLO 降至 99.2%** — 低于 99.9% 目标

右侧工作区已展示详细信息，你可以点击操作按钮进行处理。需要我进一步诊断 payment-svc 的 OOM 问题吗？`),
    evt(EventType.TEXT_MESSAGE_END, { messageId: msgId }),
    d(100),
    evt(EventType.STEP_FINISHED, { stepName: "生成巡检结论" }),

    evt(EventType.RUN_FINISHED, { threadId, runId }),
  ];
}

// ─── Prometheus 监控查询 ─────────────────────────────────────────
export function promQueryScenario() {
  const runId = uid("run"); const threadId = uid("thread");
  const tc1 = uid("tc"); const msgId = uid("msg");

  return [
    evt(EventType.RUN_STARTED, { threadId, runId }),
    d(200),
    evt(EventType.STEP_STARTED, { stepName: "解析查询意图", detail: "识别监控查询需求，生成 PromQL 表达式" }),
    d(400),
    evt(EventType.STEP_FINISHED, { stepName: "解析查询意图" }),

    evt(EventType.STEP_STARTED, { stepName: "执行 PromQL", detail: "并行查询 CPU / 内存 / 错误率 / QPS 四个指标" }),
    d(100),
    evt(EventType.TOOL_CALL_START, { toolCallId: tc1, toolCallName: "prometheus_query" }),
    d(60),
    evt(EventType.TOOL_CALL_ARGS, { toolCallId: tc1, delta: '{"queries":["cpu_usage","memory_usage","http_5xx_rate","qps"]}' }),
    d(80),
    evt(EventType.TOOL_CALL_END, { toolCallId: tc1 }),
    d(900),
    evt(EventType.TOOL_CALL_RESULT, { toolCallId: tc1, messageId: uid("tool"), content: "4 queries completed" }),

    // → 右侧：PromQL 终端
    ws("add_panel", {
      id: uid("wp"), type: "terminal",
      title: "$ PromQL Queries",
      lines: [
        { text: "# sum(rate(container_cpu_usage_seconds_total[5m])) / sum(kube_node_allocatable_cpu_cores)", cls: "comment" },
        { text: "→ 0.427  (42.7%)", cls: "ok" },
        { text: "# sum(container_memory_usage_bytes) / sum(kube_node_allocatable_memory_bytes)", cls: "comment" },
        { text: "→ 0.683  (68.3%)  ⚠ 接近告警阈值 70%", cls: "warn" },
        { text: "# sum(rate(http_server_requests_seconds_count{status=~\"5..\"}[5m]))", cls: "comment" },
        { text: "→ 23 req/s  (0.12%)", cls: "ok" },
        { text: "# sum(rate(http_server_requests_seconds_count[1m]))", cls: "comment" },
        { text: "→ 1,847 req/s", cls: "ok" },
      ],
    }),
    d(200),
    evt(EventType.STEP_FINISHED, { stepName: "执行 PromQL" }),

    // → 右侧：指标面板
    ws("add_panel", {
      id: uid("wp"), type: "metrics",
      title: "实时监控指标",
      items: [
        { label: "CPU 使用率", value: "42.7%", status: "normal", chart: [35, 38, 40, 42, 43, 42, 41, 43, 42, 43] },
        { label: "内存使用率", value: "68.3%", status: "warning", chart: [55, 58, 60, 62, 64, 65, 66, 67, 68, 68] },
        { label: "5xx 错误率", value: "0.12%", sub: "23 req/s", status: "normal", chart: [0, 0, 1, 0, 2, 1, 0, 3, 2, 1] },
        { label: "QPS", value: "1,847", sub: "req/s", status: "normal", chart: [1600, 1700, 1750, 1800, 1820, 1850, 1840, 1860, 1850, 1847] },
      ],
    }),
    d(100),

    // → 右侧：5xx 错误 Top 服务
    ws("add_panel", {
      id: uid("wp"), type: "table",
      title: "5xx 错误 Top 服务",
      columns: ["服务", "错误数/5m", "错误率", "状态"],
      rows: [
        ["payment-svc", "18", "0.31%", "CrashLoopBackOff"],
        ["order-api", "3", "0.02%", "Running"],
        ["gateway", "2", "0.01%", "Running"],
      ],
    }),
    d(300),

    evt(EventType.STEP_STARTED, { stepName: "生成分析报告", detail: "综合指标数据，识别风险项" }),
    d(200),
    evt(EventType.TEXT_MESSAGE_START, { messageId: msgId, role: "assistant" }),
    ...streamText(msgId, `监控查询完成，关键发现：

**内存使用率 68.3%** ⚠ 接近 70% 告警阈值，呈上升趋势
**5xx 错误集中在 payment-svc** — 贡献 78% 的 5xx，与 OOM 重启相关
**CPU 和 QPS 正常** — 无需额外操作

建议：
1. 设置内存 70% 预警规则
2. 优先解决 payment-svc OOM 问题以降低 5xx`),
    evt(EventType.TEXT_MESSAGE_END, { messageId: msgId }),
    d(100),
    evt(EventType.STEP_FINISHED, { stepName: "生成分析报告" }),

    evt(EventType.RUN_FINISHED, { threadId, runId }),
  ];
}

// ─── 故障诊断 ────────────────────────────────────────────────────
export function diagnoseScenario() {
  const runId = uid("run"); const threadId = uid("thread");
  const tc1 = uid("tc"); const tc2 = uid("tc");
  const msgId = uid("msg"); const msgId2 = uid("msg");

  return [
    evt(EventType.RUN_STARTED, { threadId, runId }),
    d(200),

    evt(EventType.STEP_STARTED, { stepName: "理解故障现象", detail: "分析用户描述，确定诊断方向：服务响应慢 → 查日志 → 查资源 → 定位根因" }),
    d(500),
    evt(EventType.STEP_FINISHED, { stepName: "理解故障现象" }),

    // ── 查日志
    evt(EventType.STEP_STARTED, { stepName: "查询服务日志", detail: "执行 kubectl logs 获取最近错误日志" }),
    d(150),
    evt(EventType.TOOL_CALL_START, { toolCallId: tc1, toolCallName: "kubectl" }),
    d(60),
    evt(EventType.TOOL_CALL_ARGS, { toolCallId: tc1, delta: '{"command":"logs -n default payment-svc-7f8b9c6d4-x2k9p --tail=50"}' }),
    d(80),
    evt(EventType.TOOL_CALL_END, { toolCallId: tc1 }),
    d(700),
    evt(EventType.TOOL_CALL_RESULT, { toolCallId: tc1, messageId: uid("tool"), content: "OOM errors found" }),

    ws("add_panel", {
      id: uid("wp"), type: "terminal",
      title: "$ kubectl logs payment-svc --tail=50",
      lines: [
        { text: "[INFO]  2026-04-03T08:10:12Z Starting payment-svc v2.3.1", cls: "dim" },
        { text: "[INFO]  2026-04-03T08:10:15Z Connected to DB pool (5 conns)", cls: "dim" },
        { text: "[WARN]  2026-04-03T08:11:50Z Memory usage exceeding 80% of limit", cls: "warn" },
        { text: "[ERROR] 2026-04-03T08:12:33Z OOM: container memory limit exceeded (512Mi)", cls: "error" },
        { text: "[ERROR] 2026-04-03T08:12:33Z Fatal: unable to allocate memory for request buffer", cls: "error" },
        { text: "[INFO]  2026-04-03T08:12:34Z Process exited with code 137 (SIGKILL)", cls: "error" },
        { text: "[INFO]  2026-04-03T08:12:35Z Container restarting (attempt 12)", cls: "warn" },
      ],
    }),
    d(200),
    evt(EventType.STEP_FINISHED, { stepName: "查询服务日志" }),

    // ── 查资源
    evt(EventType.STEP_STARTED, { stepName: "检查资源配置", detail: "执行 kubectl describe 查看资源 Limits/Requests" }),
    d(150),
    evt(EventType.TOOL_CALL_START, { toolCallId: tc2, toolCallName: "kubectl" }),
    d(60),
    evt(EventType.TOOL_CALL_ARGS, { toolCallId: tc2, delta: '{"command":"describe pod payment-svc -n default"}' }),
    d(80),
    evt(EventType.TOOL_CALL_END, { toolCallId: tc2 }),
    d(600),
    evt(EventType.TOOL_CALL_RESULT, { toolCallId: tc2, messageId: uid("tool"), content: "Resource limits found" }),

    ws("add_panel", {
      id: uid("wp"), type: "terminal",
      title: "$ kubectl describe pod payment-svc (资源配置)",
      lines: [
        { text: "Containers:", cls: "head" },
        { text: "  payment-svc:", cls: "ok" },
        { text: "    Image:     payment-svc:v2.3.1", cls: "dim" },
        { text: "    Limits:    memory=512Mi  cpu=500m", cls: "warn" },
        { text: "    Requests:  memory=256Mi  cpu=250m", cls: "dim" },
        { text: "    Last State: Terminated (OOMKilled)", cls: "error" },
        { text: "    Restart Count: 12", cls: "error" },
      ],
    }),
    d(200),
    evt(EventType.STEP_FINISHED, { stepName: "检查资源配置" }),

    // → 右侧：诊断报告
    ws("add_panel", {
      id: uid("wp"), type: "report",
      title: "故障诊断报告",
      rootCause: "payment-svc 内存上限 512Mi 不足，触发 OOMKilled（退出码 137）",
      impact: ["支付服务不可用，影响支付链路", "5xx 错误率升至 0.12%", "已连续重启 12 次"],
      timeline: [
        { time: "08:10", text: "payment-svc v2.3.1 启动" },
        { time: "08:11", text: "内存使用超过 80% limit" },
        { time: "08:12", text: "OOM — 进程被 SIGKILL" },
        { time: "08:12", text: "容器重启（第 12 次）" },
      ],
    }),
    d(200),

    // → 右侧：操作面板
    ws("add_panel", {
      id: uid("wp"), type: "actions",
      title: "修复方案",
      groups: [
        {
          label: "方案 A — 临时扩容（推荐）",
          desc: "将 payment-svc 内存 Limit 从 512Mi 提升到 1Gi",
          actions: [
            { id: "scale_mem", label: "执行扩容", variant: "primary", command: "kubectl set resources deployment/payment-svc -n default --limits=memory=1Gi --requests=memory=512Mi" },
          ],
        },
        {
          label: "方案 B — 回滚版本",
          desc: "回滚到 v2.2.x 版本（无已知内存问题）",
          actions: [
            { id: "rollback", label: "回滚到 v2.2.9", variant: "warning", command: "kubectl rollout undo deployment/payment-svc -n default" },
          ],
        },
        {
          label: "方案 C — 重启当前实例",
          desc: "删除当前 Pod 触发重建，不改配置",
          actions: [
            { id: "restart", label: "重启 Pod", variant: "secondary", command: "kubectl delete pod payment-svc-7f8b9c6d4-x2k9p -n default" },
          ],
        },
      ],
    }),
    d(300),

    // ── 左侧：诊断结论
    evt(EventType.STEP_STARTED, { stepName: "输出诊断结论", detail: "综合日志和资源信息，给出根因分析和修复方案" }),
    d(200),
    evt(EventType.TEXT_MESSAGE_START, { messageId: msgId, role: "assistant" }),
    ...streamText(msgId, `诊断完成。根因：**payment-svc OOM**

容器内存上限 512Mi 不足，被 K8s 强制终止（退出码 137），已重启 12 次。

右侧工作区展示了：
- 错误日志和资源配置详情
- 故障诊断报告（根因 + 影响 + 时间线）
- 三种修复方案及一键执行按钮

**推荐方案 A：临时扩容至 1Gi**，是否执行？`),
    evt(EventType.TEXT_MESSAGE_END, { messageId: msgId }),
    d(100),
    evt(EventType.STEP_FINISHED, { stepName: "输出诊断结论" }),

    // ── 人工确认
    confirm({
      id: uid("cfm"),
      title: "确认执行扩容操作",
      message: "将 payment-svc 内存 Limit 从 512Mi 提升到 1Gi，Requests 从 256Mi 提升到 512Mi",
      command: "kubectl set resources deployment/payment-svc -n default --limits=memory=1Gi --requests=memory=512Mi",
      severity: "warning",
      actions: [
        { id: "approve", label: "确认执行", variant: "primary" },
        { id: "reject", label: "暂不执行", variant: "secondary" },
      ],
    }),
    d(800),

    evt(EventType.RUN_FINISHED, { threadId, runId }),
  ];
}

// ─── 巡检报告 ────────────────────────────────────────────────────
export function reportScenario() {
  const runId = uid("run"); const threadId = uid("thread");
  const msgId = uid("msg");

  return [
    evt(EventType.RUN_STARTED, { threadId, runId }),
    d(200),
    evt(EventType.STEP_STARTED, { stepName: "收集集群数据", detail: "并行获取节点、Pod、资源指标、告警数据" }),
    d(800),
    evt(EventType.STEP_FINISHED, { stepName: "收集集群数据" }),

    evt(EventType.STEP_STARTED, { stepName: "分析指标趋势", detail: "计算各维度环比变化和 SLO 达成率" }),
    d(600),
    evt(EventType.STEP_FINISHED, { stepName: "分析指标趋势" }),

    // → 右侧：概览指标
    ws("add_panel", {
      id: uid("wp"), type: "metrics",
      title: "今日巡检概览",
      items: [
        { label: "集群健康度", value: "亚健康", status: "warning" },
        { label: "节点", value: "3/4", sub: "1 异常", status: "warning" },
        { label: "Pod", value: "44/47", sub: "3 异常", status: "warning" },
        { label: "SLO", value: "99.2%", sub: "↓0.7%", status: "danger" },
      ],
    }),

    // → 右侧：资源水位
    ws("add_panel", {
      id: uid("wp"), type: "table",
      title: "资源水位",
      columns: ["资源", "使用率", "趋势", "状态"],
      rows: [
        ["CPU", "42.7%", "→ 平稳", "正常"],
        ["内存", "68.3%", "↑ 上升", "⚠ 偏高"],
        ["磁盘", "55.1%", "→ 平稳", "正常"],
        ["网络", "12.3 Mbps", "→ 平稳", "正常"],
      ],
    }),

    // → 右侧：告警
    ws("add_panel", {
      id: uid("wp"), type: "alerts",
      title: "今日告警汇总",
      alerts: [
        { level: "critical", time: "08:55", text: "node-worker-03 NotReady", source: "node-monitor" },
        { level: "warning", time: "08:12", text: "payment-svc OOMKilled x12", source: "pod-monitor" },
        { level: "warning", time: "08:30", text: "coredns-fallback Error", source: "kube-system" },
        { level: "info", time: "07:45", text: "cluster-autoscaler 评估完成", source: "autoscaler" },
        { level: "info", time: "06:00", text: "定时巡检开始", source: "sre-agent" },
      ],
    }),

    // → 右侧：待办
    ws("add_panel", {
      id: uid("wp"), type: "checklist",
      title: "待办事项",
      items: [
        { text: "恢复 node-worker-03", done: false, priority: "high" },
        { text: "修复 payment-svc OOM", done: false, priority: "high" },
        { text: "修复 coredns-fallback", done: false, priority: "medium" },
        { text: "设置内存 70% 告警规则", done: false, priority: "medium" },
        { text: "排查 payment-svc v2.3.1 内存泄漏", done: false, priority: "low" },
      ],
    }),
    d(300),

    evt(EventType.STEP_STARTED, { stepName: "生成报告", detail: "汇总所有数据生成结构化巡检日报" }),
    d(300),
    evt(EventType.TEXT_MESSAGE_START, { messageId: msgId, role: "assistant" }),
    ...streamText(msgId, `巡检报告已生成，关键数据已推送到右侧工作区。

**整体评估：亚健康** — 1 个节点异常，3 个 Pod 异常，SLO 降至 99.2%

**优先处理：**
1. 恢复 node-worker-03 节点
2. 解决 payment-svc OOM 问题

需要我针对某个问题做详细诊断吗？`),
    evt(EventType.TEXT_MESSAGE_END, { messageId: msgId }),
    d(100),
    evt(EventType.STEP_FINISHED, { stepName: "生成报告" }),

    evt(EventType.RUN_FINISHED, { threadId, runId }),
  ];
}

// ─── 默认场景 ────────────────────────────────────────────────────
export function defaultScenario(messages) {
  const runId = uid("run"); const threadId = uid("thread");
  const msgId = uid("msg");
  const userText = messages[messages.length - 1]?.content ?? "";

  return [
    evt(EventType.RUN_STARTED, { threadId, runId }),
    d(300),
    evt(EventType.STEP_STARTED, { stepName: "理解意图", detail: "解析指令内容，匹配可用技能" }),
    d(400),
    evt(EventType.STEP_FINISHED, { stepName: "理解意图" }),
    d(200),
    evt(EventType.TEXT_MESSAGE_START, { messageId: msgId, role: "assistant" }),
    ...streamText(msgId, `收到指令：「${userText}」

我可以帮你执行以下运维任务，请直接下达：

• **巡检集群** — 节点 + Pod 全面扫描
• **查监控** — CPU / 内存 / 错误率 / QPS
• **诊断故障** — 日志分析 → 根因定位 → 修复方案
• **出报告** — 生成结构化巡检日报`),
    evt(EventType.TEXT_MESSAGE_END, { messageId: msgId }),
    evt(EventType.RUN_FINISHED, { threadId, runId }),
  ];
}

// ─── 工具函数 ─────────────────────────────────────────────────────
function streamText(messageId, text, chunkSize = 4, pauseMs = 20) {
  const events = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    events.push(
      evt(EventType.TEXT_MESSAGE_CONTENT, {
        messageId,
        delta: text.slice(i, i + chunkSize),
      }, pauseMs),
    );
  }
  return events;
}
