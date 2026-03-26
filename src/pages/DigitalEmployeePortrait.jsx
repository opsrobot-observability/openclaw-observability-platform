import { useState } from "react";

/** 生产力标签样式 */
function productivityTagClass(tag) {
  if (tag.includes("高效")) return "bg-emerald-50 text-emerald-800 ring-emerald-600/20";
  if (tag.includes("精准")) return "bg-blue-50 text-blue-800 ring-blue-600/20";
  if (tag.includes("全能")) return "bg-violet-50 text-violet-800 ring-violet-600/20";
  if (tag.includes("稳健")) return "bg-slate-100 text-slate-800 ring-slate-500/15";
  if (tag.includes("探索")) return "bg-amber-50 text-amber-900 ring-amber-600/20";
  return "bg-gray-100 text-gray-800 ring-gray-500/15";
}

const EMPLOYEES = [
  {
    id: "DE-001",
    name: "客服助手 · 小智",
    role: "客服",
    status: "运行中",
    model: "openclaw-agent",
    avatar: "智",
    summary: "面向终端用户的会话型数字员工，支持多轮澄清与工单转接，对接企业知识库与 CRM。",
    skills: ["多轮对话", "知识检索", "工单创建", "情绪识别"],
    metrics: { sessions: "4.2k/日", satisfaction: "94%", latency: "0.9s" },
    recent: ["09:12 完成会话 #8821，用户评分 5", "08:55 知识库命中「退换货政策」"],
    portrait: {
      productivityTags: ["高效型", "全能型"],
      domainScores: [
        { domain: "办公协同", score: 92 },
        { domain: "数据处理", score: 68 },
        { domain: "运维自动化", score: 45 },
        { domain: "安全合规", score: 72 },
      ],
      executionPrefs: [
        "偏好并发会话与短轮次闭环，高峰时段吞吐优先于单会话极致延迟。",
        "对结构化工单与 FAQ 命中场景效率显著高于开放式闲聊。",
      ],
      weaknesses: ["复杂浏览器自动化类工具调用成功率低于团队均值约 12%", "多模态附件解析在超大文件场景下偶发超时"],
      scenarios: ["在线客服分流与一线答疑", "活动大促期间会话扩容", "标准退换货与物流政策咨询"],
      fluctuation: [
        "上周生产力略降主要因大促期间会话排队加深，P95 延迟上升与人工坐席并发争用网关配额有关。",
        "知识库冷启动条目增加后，首周命中率波动属预期，目前已趋稳。",
      ],
    },
  },
  {
    id: "DE-002",
    name: "运维巡检员",
    role: "运维",
    status: "运行中",
    model: "openclaw-tool-runner",
    avatar: "维",
    summary: "按计划执行基础设施与健康检查，自动汇总异常并推送告警通道。",
    skills: ["定时巡检", "指标采集", "告警聚合", "Runbook 执行"],
    metrics: { sessions: "128/日", satisfaction: "—", latency: "2.1s" },
    recent: ["10:01 巡检集群 oc-node-02 全绿", "昨日生成报告 #RPT-0318"],
    portrait: {
      productivityTags: ["精准型", "稳健型"],
      domainScores: [
        { domain: "运维自动化", score: 96 },
        { domain: "数据处理", score: 78 },
        { domain: "办公协同", score: 52 },
        { domain: "安全合规", score: 81 },
      ],
      executionPrefs: [
        "任务以定时批处理为主，强调可重复性与审计留痕，对实时交互需求较低。",
        "长耗时巡检任务倾向拆分阶段并带检查点，失败自动重试策略偏保守。",
      ],
      weaknesses: ["自然语言即兴问答能力弱于通用对话型员工", "跨云 API 限流时批量工具调用需人工调参"],
      scenarios: ["机房与容器健康巡检", "备份与证书到期检查", "告警降噪与 Runbook 自动执行"],
      fluctuation: [
        "夜间窗口批量任务集中时 CPU 占用升高，导致白班交互类请求排队略增。",
        "上月因上游监控 API 变更，曾出现半日指标空缺，已回滚采集器版本。",
      ],
    },
  },
  {
    id: "DE-003",
    name: "数据分析员",
    role: "分析",
    status: "试运行",
    model: "openclaw-agent",
    avatar: "析",
    summary: "根据自然语言问题生成查询与可视化建议，当前处于灰度验证阶段。",
    skills: ["NL2SQL", "图表推荐", "权限校验", "结果解释"],
    metrics: { sessions: "356/日", satisfaction: "88%", latency: "3.4s" },
    recent: ["灰度用户 12 人", "待优化：长查询超时"],
    portrait: {
      productivityTags: ["精准型", "探索型"],
      domainScores: [
        { domain: "数据处理", score: 94 },
        { domain: "办公协同", score: 76 },
        { domain: "运维自动化", score: 58 },
        { domain: "安全合规", score: 70 },
      ],
      executionPrefs: [
        "偏好将问题拆解为「取数 → 校验 → 可视化」链式步骤，对长 SQL 会主动请求行数上限。",
        "灰度阶段更关注结果可解释性，宁可多一轮确认也不盲目出数。",
      ],
      weaknesses: ["超宽表关联场景下生成 SQL 偶发全表扫描风险", "对业务口径不一致的追问依赖人工标注补充"],
      scenarios: ["运营看板自助取数", "活动复盘临时分析", "数据口径对齐前的探索性查询"],
      fluctuation: [
        "试运行阶段请求分布不均，晚间批处理与白天即席查询混跑导致 P95 波动大。",
        "长查询超时增多与近期接入新数仓分区未统计信息有关，已安排 ANALYZE。",
      ],
    },
  },
  {
    id: "DE-004",
    name: "安全审计员",
    role: "安全",
    status: "已暂停",
    model: "openclaw-mcp-bridge",
    avatar: "审",
    summary: "审计敏感操作与策略命中情况，暂停期间不接收新任务。",
    skills: ["策略审计", "访问轨迹", "合规检查", "导出报告"],
    metrics: { sessions: "0", satisfaction: "—", latency: "—" },
    recent: ["管理员于 03-15 暂停实例", "历史报告仍可在审计中心查看"],
    portrait: {
      productivityTags: ["精准型", "稳健型"],
      domainScores: [
        { domain: "安全合规", score: 95 },
        { domain: "运维自动化", score: 62 },
        { domain: "数据处理", score: 55 },
        { domain: "办公协同", score: 48 },
      ],
      executionPrefs: [
        "强依赖策略与证据链完整性，单条结论多源交叉验证，吞吐让位于准确率。",
        "导出与外传类操作默认走审批流，自动化程度受组织策略约束。",
      ],
      weaknesses: ["暂停期间无新样本，模型与策略漂移无法评估", "对新型无文件攻击链的检测依赖特征库更新节奏"],
      scenarios: ["敏感操作双人复核辅助", "合规检查月报与抽查", "数据出境评估问答"],
      fluctuation: [
        "暂停后生产力指标归零，历史波动主要来自季度末审计高峰与批量导出限流。",
      ],
    },
  },
  {
    id: "DE-005",
    name: "研发助手 · CodeBuddy",
    role: "研发",
    status: "运行中",
    model: "openclaw-agent",
    avatar: "码",
    summary: "辅助代码评审、生成测试用例与文档摘要，仅限内网仓库。",
    skills: ["代码解释", "单测生成", "Diff 摘要", "依赖扫描"],
    metrics: { sessions: "890/日", satisfaction: "91%", latency: "1.8s" },
    recent: ["合并请求 #4412 已自动摘要", "昨日跳过 2 次敏感文件变更"],
    portrait: {
      productivityTags: ["高效型", "精准型"],
      domainScores: [
        { domain: "办公协同", score: 88 },
        { domain: "数据处理", score: 74 },
        { domain: "运维自动化", score: 66 },
        { domain: "安全合规", score: 83 },
      ],
      executionPrefs: [
        "偏好基于 Diff 与静态分析的短上下文评审，对巨型 MR 会建议拆分。",
        "生成测试时优先覆盖变更函数与边界分支，减少无效样板代码。",
      ],
      weaknesses: ["对领域特定框架「魔法」约定理解需更多仓库内示例", "跨语言混合项目中单测模板统一性不足"],
      scenarios: ["MR 初评与风险点标注", "单测与文档草稿生成", "依赖漏洞扫描结果解读"],
      fluctuation: [
        "版本发布周合并请求激增，队列等待拉长导致「单位时间完成评审数」下降。",
        "内网模型推理节点扩容后延迟回落，生产力指数已回升至基线以上。",
      ],
    },
  },
  {
    id: "DE-006",
    name: "销售线索员",
    role: "销售",
    status: "运行中",
    model: "openclaw-agent",
    avatar: "销",
    summary: "对官网留资进行初筛与分级，同步至 CRM 并触发跟进任务。",
    skills: ["线索打分", "去重合并", "CRM 写入", "话术建议"],
    metrics: { sessions: "2.1k/日", satisfaction: "89%", latency: "1.1s" },
    recent: ["今日新增线索 312 条", "高意向 28 条已推送销售"],
    portrait: {
      productivityTags: ["高效型", "全能型"],
      domainScores: [
        { domain: "办公协同", score: 90 },
        { domain: "数据处理", score: 85 },
        { domain: "安全合规", score: 68 },
        { domain: "运维自动化", score: 40 },
      ],
      executionPrefs: [
        "偏好规则引擎 + 模型打分的混合决策，对高价值线索降低自动化阈值。",
        "高峰时段批量写 CRM 采用异步队列，保证主链路响应稳定。",
      ],
      weaknesses: ["跨渠道身份去重在手机号缺失场景准确率下降", "竞品话术类开放域生成未上线，依赖模板"],
      scenarios: ["官网表单与活动页留资清洗", "线索分级与销售任务分配", "简单外呼前话术建议"],
      fluctuation: [
        "投放渠道切换日易出现评分分布突变，需重新校准阈值，通常 24–48h 内恢复。",
        "节假日后无效线索占比上升属周期性现象，已叠加时间特征缓解。",
      ],
    },
  },
  {
    id: "DE-007",
    name: "文档生成员",
    role: "研发",
    status: "试运行",
    model: "openclaw-agent",
    avatar: "档",
    summary: "根据接口定义与变更记录生成对外 API 文档草稿。",
    skills: ["OpenAPI 同步", "示例生成", "多语言模板", "版本对比"],
    metrics: { sessions: "64/日", satisfaction: "85%", latency: "4.2s" },
    recent: ["灰度项目：开放平台 v3", "待接入人工终审"],
    portrait: {
      productivityTags: ["精准型", "探索型"],
      domainScores: [
        { domain: "办公协同", score: 87 },
        { domain: "数据处理", score: 60 },
        { domain: "运维自动化", score: 50 },
        { domain: "安全合规", score: 75 },
      ],
      executionPrefs: [
        "长文档生成采用分章节缓存，减少单次上下文爆炸。",
        "对示例代码运行环境隔离，避免文档构建影响生产。",
      ],
      weaknesses: ["手写备注与代码不一致时无法自动纠错，需人工 diff", "多语言翻译术语表覆盖不全"],
      scenarios: ["对外 API 文档初稿", "版本间变更说明草稿", "示例代码片段生成"],
      fluctuation: [
        "灰度用户少导致日均产出波动大，单个大版本合并会拉高当日页数。",
      ],
    },
  },
  {
    id: "DE-008",
    name: "备份执行员",
    role: "运维",
    status: "运行中",
    model: "openclaw-tool-runner",
    avatar: "备",
    summary: "按策略触发备份任务并校验完整性，失败自动重试与告警。",
    skills: ["增量备份", "校验和", "跨区复制", "恢复演练"],
    metrics: { sessions: "48/日", satisfaction: "—", latency: "5.0s" },
    recent: ["昨夜全量备份成功", "对象存储用量 +3%"],
    portrait: {
      productivityTags: ["稳健型", "精准型"],
      domainScores: [
        { domain: "运维自动化", score: 93 },
        { domain: "数据处理", score: 70 },
        { domain: "安全合规", score: 78 },
        { domain: "办公协同", score: 42 },
      ],
      executionPrefs: [
        "任务窗口严格避让业务高峰，重试退避策略偏长以降低惊群效应。",
        "校验失败会阻断后续复制，宁可延迟也不带伤数据传播。",
      ],
      weaknesses: ["跨区网络抖动时任务墙钟时间拉长，占用调度槽位", "对非标准存储后端适配需单独插件"],
      scenarios: ["数据库与对象存储定期备份", "灾备复制与健康校验", "恢复演练脚本化"],
      fluctuation: [
        "全量备份日吞吐量下降属预期；增量日生产力指数回升。",
        "上月存储侧限流导致部分任务顺延至次日窗口，报表中显示为异常低谷。",
      ],
    },
  },
  {
    id: "DE-009",
    name: "合规问答员",
    role: "安全",
    status: "运行中",
    model: "openclaw-mcp-bridge",
    avatar: "规",
    summary: "回答内部合规与数据出境相关问题，答案来源经法务审核的知识库。",
    skills: ["条款检索", "引用溯源", "审批流触发", "多语言"],
    metrics: { sessions: "512/日", satisfaction: "92%", latency: "1.4s" },
    recent: ["更新知识库条目 7 条", "无越权访问告警"],
    portrait: {
      productivityTags: ["精准型", "全能型"],
      domainScores: [
        { domain: "安全合规", score: 96 },
        { domain: "办公协同", score: 82 },
        { domain: "数据处理", score: 65 },
        { domain: "运维自动化", score: 44 },
      ],
      executionPrefs: [
        "回答必须带来源条款与版本号，不确定时触发升级而非猜测。",
        "多语言并行检索后做一致性校验，避免翻译偏差导致合规风险。",
      ],
      weaknesses: ["法规更新滞后时，旧条目需人工下线，存在短暂空窗", "极长尾个案可能无现成条款可引用"],
      scenarios: ["员工自助合规咨询", "数据出境评估前置问答", "合同条款快速溯源"],
      fluctuation: [
        "监管发文密集期咨询量激增，排队导致满意度短时下滑，已通过弹性副本缓解。",
      ],
    },
  },
  {
    id: "DE-010",
    name: "培训陪练员",
    role: "客服",
    status: "已暂停",
    model: "openclaw-agent",
    avatar: "练",
    summary: "模拟客户与新人客服对练，暂停原因：课程大纲改版中。",
    skills: ["情景剧本", "评分报告", "话术纠错", "录音分析"],
    metrics: { sessions: "0", satisfaction: "—", latency: "—" },
    recent: ["预计 04-01 恢复服务", "历史对练记录可导出"],
    portrait: {
      productivityTags: ["全能型", "探索型"],
      domainScores: [
        { domain: "办公协同", score: 80 },
        { domain: "数据处理", score: 58 },
        { domain: "运维自动化", score: 38 },
        { domain: "安全合规", score: 72 },
      ],
      executionPrefs: [
        "对练回合数与难度梯度可配置，强调反馈即时性与可复盘性。",
        "录音分析异步执行，避免阻塞对练主流程。",
      ],
      weaknesses: ["暂停期间无法积累新对练语料，画像更新停滞", "方言场景识别率低于普通话基线"],
      scenarios: ["新人客服上岗前模拟", "话术升级 A/B 对练", "质检标准对齐训练"],
      fluctuation: [
        "课程大纲停更期间生产力归零；历史高峰与每批次入职人数强相关。",
      ],
    },
  },
];

function statusClass(s) {
  switch (s) {
    case "运行中":
      return "bg-emerald-50 text-emerald-700 ring-emerald-600/15";
    case "试运行":
      return "bg-primary-soft text-primary ring-primary/20";
    case "已暂停":
      return "bg-gray-100 text-gray-600 ring-gray-500/10";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function SectionTitle({ children }) {
  return <h4 className="text-sm font-semibold text-gray-900">{children}</h4>;
}

export default function DigitalEmployeePortrait() {
  const [selectedId, setSelectedId] = useState(EMPLOYEES[0].id);
  const current = EMPLOYEES.find((e) => e.id === selectedId) ?? EMPLOYEES[0];
  const p = current.portrait;

  return (
    <div className="flex flex-row gap-6 h-full overflow-hidden">
      <aside className="w-64">
        <div className="app-card p-3">
          <p className="px-2 pb-2 text-xs font-medium text-gray-500">员工列表</p>
          <ul className="space-y-1 w-full">
            {EMPLOYEES.map((e) => {
              const active = e.id === selectedId;
              return (
                <li key={e.id} className="w-full">
                  <button
                    type="button"
                    onClick={() => setSelectedId(e.id)}
                    className={[
                      "flex w-full flex-col rounded-lg px-3 py-2.5 text-left transition duration-200",
                      active ? "bg-primary-soft ring-1 ring-primary/20" : "hover:bg-gray-50",
                    ].join(" ")}
                  >
                    <span className={["text-sm font-medium", active ? "text-primary" : "text-gray-900"].join(" ")}>
                      {e.name}
                    </span>
                    <span className="mt-0.5 text-xs text-gray-500">
                      {e.id} · {e.role}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      <div className="flex flex-col gap-6 flex-1 h-full">
        <div className="app-card p-0 h-full overflow-y-auto">
          <div className="border-b border-gray-100 bg-gradient-to-br from-primary/5 via-white to-gray-50/80 p-6 dark:border-gray-800 dark:from-primary/10 dark:via-gray-900 dark:to-gray-950 sm:p-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[#2563eb] text-2xl font-bold text-white shadow-md">
                {current.avatar}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 gap-y-2">
                  <h3 className="text-xl font-semibold text-gray-900">{current.name}</h3>
                  <span
                    className={[
                      "inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                      statusClass(current.status),
                    ].join(" ")}
                  >
                    {current.status}
                  </span>
                </div>
                <p className="mt-2 font-mono text-xs text-gray-500">{current.id}</p>
                <p className="mt-3 text-sm leading-relaxed text-gray-600">{current.summary}</p>

                <div className="mt-4">
                  <p className="text-xs font-medium text-gray-500">1. 数字员工生产力标签</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {p.productivityTags.map((t) => (
                      <span
                        key={t}
                        className={[
                          "inline-flex rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
                          productivityTagClass(t),
                        ].join(" ")}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {current.skills.map((s) => (
                    <span
                      key={s}
                      className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-200/80"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 border-b border-gray-100 p-6 sm:grid-cols-3">
            <div className="rounded-lg bg-gray-50/80 p-4 ring-1 ring-gray-100">
              <p className="text-xs font-medium text-gray-500">会话 / 任务量</p>
              <p className="mt-2 text-lg font-semibold tabular-nums text-gray-900">{current.metrics.sessions}</p>
            </div>
            <div className="rounded-lg bg-gray-50/80 p-4 ring-1 ring-gray-100">
              <p className="text-xs font-medium text-gray-500">满意度</p>
              <p className="mt-2 text-lg font-semibold tabular-nums text-gray-900">{current.metrics.satisfaction}</p>
            </div>
            <div className="rounded-lg bg-gray-50/80 p-4 ring-1 ring-gray-100">
              <p className="text-xs font-medium text-gray-500">典型延迟 (P95)</p>
              <p className="mt-2 text-lg font-semibold tabular-nums text-gray-900">{current.metrics.latency}</p>
            </div>
          </div>

          <div className="space-y-6 p-6">
            <section className="space-y-3">
              <SectionTitle>2. 技能擅长领域分析</SectionTitle>
              <p className="text-xs text-gray-500">按领域相对得分（演示维度：运维 / 办公 / 数据处理 / 安全合规）</p>
              <div className="space-y-3">
                {p.domainScores.map((row) => (
                  <div key={row.domain}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="font-medium text-gray-700">{row.domain}</span>
                      <span className="tabular-nums text-gray-500">{row.score}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-[#2563eb] transition-all duration-300"
                        style={{ width: `${row.score}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-3 border-t border-gray-100 pt-6">
              <SectionTitle>3. 任务执行偏好与效率特征</SectionTitle>
              <ul className="space-y-2">
                {p.executionPrefs.map((line, i) => (
                  <li
                    key={i}
                    className="flex gap-3 rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2.5 text-sm leading-relaxed text-gray-700"
                  >
                    <span className="mt-0.5 font-mono text-xs text-primary">{String(i + 1).padStart(2, "0")}</span>
                    {line}
                  </li>
                ))}
              </ul>
            </section>

            <section className="space-y-3 border-t border-gray-100 pt-6">
              <SectionTitle>4. 短板能力识别</SectionTitle>
              <ul className="space-y-2">
                {p.weaknesses.map((line, i) => (
                  <li
                    key={i}
                    className="flex gap-2 rounded-lg border border-amber-200/80 bg-amber-50/50 px-3 py-2.5 text-sm text-amber-950"
                  >
                    <span className="shrink-0 text-amber-600" aria-hidden>
                      ▲
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="space-y-3 border-t border-gray-100 pt-6">
              <SectionTitle>5. 适配场景推荐</SectionTitle>
              <ul className="flex flex-wrap gap-2">
                {p.scenarios.map((s) => (
                  <li
                    key={s}
                    className="rounded-lg bg-primary-soft px-3 py-1.5 text-sm font-medium text-primary ring-1 ring-primary/15"
                  >
                    {s}
                  </li>
                ))}
              </ul>
            </section>

            <section className="space-y-3 border-t border-gray-100 pt-6">
              <SectionTitle>6. 生产力波动原因分析</SectionTitle>
              <ul className="space-y-2">
                {p.fluctuation.map((line, i) => (
                  <li key={i} className="text-sm leading-relaxed text-gray-700">
                    <span className="mr-2 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200/80 text-xs font-medium text-gray-600">
                      {i + 1}
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
            </section>

            <div className="border-t border-gray-100 pt-6">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">关联服务</p>
              <p className="mt-2 font-mono text-sm text-primary">{current.model}</p>
              <p className="mt-6 text-xs font-medium uppercase tracking-wide text-gray-400">近期动态</p>
              <ul className="mt-3 space-y-2">
                {current.recent.map((line, i) => (
                  <li
                    key={i}
                    className="flex gap-3 rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2.5 text-sm text-gray-700"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
