# opsRobot 数据源总览（Data Model）

本目录描述 **opsRobot** 库中各业务数据表的来源、字段与用途，供采集、建模、查询与审计对齐使用。数据形态包括：OpenClaw 配置与日志、定时任务、网关与会话明细，以及经 **OpenTelemetry** 入库的主机与 OpenClaw 运行时指标。

详细字段说明以各 Markdown 文档为准。

## 采集与入库架构

日志与配置类数据通常经 **Vector** 采集、清洗后写入 **Apache Doris**；OTel 指标经 **Collector / OTLP** 进入 Doris。整体流水线见：

[数据流水线架构（OTel / Vector / Doris）](../architecture/data-pipeline.md)

## 数据源索引

以下 **Doris 表名**、路径与概要均与各文档「一、基本信息」一致（同一文件内多表时，在「Doris 表名」列并列）；字段级说明以对应 Markdown 为准。


| 文档                                                 | Doris 表名                                | 数据名称（文档）               | 数据概要                                                  | 原始路径（与各文档「基本信息」一致）                                                                                        |
| -------------------------------------------------- | --------------------------------------- | ---------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [openclaw_config.md](./openclaw_config.md)         | `openclaw_config`                       | OpenClaw 配置数据          | 配置实例键、采集时间、沙箱/工作空间/网关/插件列表及脱敏配置 JSON 快照               | `~/openclaw/openclawjson`                                                                                 |
| [agent_models.md](./agent_models.md)               | `agent_models`                          | Agent 模型配置数据           | 各 Agent 关联模型的基础配置、成本、能力范围及关联关系                        | `~/openclaw/agents/agentname/agent/modelsjson`                                                            |
| [agent_sessions.md](./agent_sessions.md)           | `agent_sessions`                        | OpenClaw Agent 会话元数据   | 会话标识、智能体/渠道、模型与 Token、技能快照、系统提示与上下文等                  | `~/openclaw/agents/{agentName}/sessions/sessions.jsonl`                                                   |
| [agent_sessions_logs.md](./agent_sessions_logs.md) | `agent_sessions_logs`                   | Agent 会话日志             | 会话全生命周期事件：模型切换、消息、工具调用、错误、Token 等                     | `~/openclaw/agents/{agentName}/sessionS/{sessionid}.jsonl`                                                |
| [gateway_logs .md](./gateway_logs%20.md)           | `gateway_logs`                          | gatewaylogs（网关日志）      | 网关与 WS、可观测性、安全观测、agents/modelproviders 等模块的操作/错误/状态日志 | `~/openclaw/logs/`                                                                                        |
| [audit_logs.md](./audit_logs.md)                   | `audit_logs`                            | auditlogs（审计日志）        | OpenClaw 配置写入审计：时间、命令、配置路径、变更前后哈希、进程等                 | `~/.openclaw/logs/config-audit.log`                                                                       |
| [cron_jobs .md](./cron_jobs%20.md)                 | `cronjobs`                              | 定时任务配置表                | 任务 ID、关联 Agent、会话密钥、调度规则、状态与执行参数等                     | `/openclaw/cron/jobsJSONL`                                                                                |
| [cron_runs .md](./cron_runs%20.md)                 | `cron_runs`                             | 定时任务执行日志               | 执行时间、阶段、状态、错误、模型与 Token、摘要与下次执行时间等                    | `/openclaw/cron/runs/jobidJSONL`                                                                          |
| [system_host_monitor.md](./system_host_monitor.md) | `hostmetricssum`、`hostmetricsgauge`     | 主机累计型 / 瞬时型监控指标        | OTel hostmetrics：CPU/磁盘/网络/内存等累计型与 CPU 负载、进程数等瞬时型     | `github.com/open-telemetry/opentelemetry-collector-contrib/receiver/hostmetricsreceiver`（文档标注版本 v0.144.0） |
| [openclaw_monitor.md](./openclaw_monitor.md)       | `otelmetricssum`、`otelmetricshistogram` | OpenClaw 累计型/单值型与直方图指标 | 网关会话、消息队列、Token/成本、耗时分布等 OTel 指标                      | OpenClaw Gateway 内置 OTel Meter Provider → SDK 采集 → OTLP Exporter → Collector                              |


## 表之间的逻辑关系（简图）

```text
【配置与模型】
  openclaw_config    agent_models

【会话与网关】
  agent_sessions ──► agent_sessions_logs
        ├──────────► gateway_logs
        └──────────► audit_logs（配置审计文件侧）

【定时任务】
  cronjobs ──────────► cron_runs

【可观测性 · OTel → Doris】（与上列业务表弱耦合，关联以时间戳 / 主机名 / servicename 等为准）
  hostmetricssum / hostmetricsgauge     … 主机指标
  otelmetricssum / otelmetricshistogram … OpenClaw 网关指标
```

实际关联以各文档中的 **sessionid**、**jobid**、时间戳、Agent 标识及 OTel 资源属性等字段为准。

## 维护约定

- 新增或变更表时：在本 README 的索引表中增加或调整一行，并新增或更新独立说明文档（格式可与现有「基本信息 + 字段」章节对齐）。
- 若仅调整采集路径或 Doris 表名，请同步更新对应文档与本文索引，避免运维与查询侧信息不一致。

