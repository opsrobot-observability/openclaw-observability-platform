# Cron 定时任务信息模型（Doris）

本文基于 Doris 库 `opsRobot` 中两张表构建：

- `cron_jobs`：任务主数据（当前状态快照）
- `cron_runs`：任务每次执行的流水事件

---

## 1. 模型关系

- 一个 `cron_job` 对应多条 `cron_run`
- 关联键：`cron_jobs.id = cron_runs.job_id`
- 推荐查询顺序：
  1) 先读 `cron_jobs` 获取任务列表与最新状态  
  2) 再按 `job_id` 拉取 `cron_runs` 形成执行历史

---

## 2. `cron_jobs`（任务主表）

### 2.1 物理字段模型

| 字段 | 类型 | 为空 | 说明 |
|---|---|---|---|
| `id` | `varchar(128)` | 否 | 任务唯一 ID（UUID） |
| `agent_id` | `varchar(128)` | 否 | 执行智能体 ID |
| `session_key` | `varchar(128)` | 否 | 会话键 |
| `name` | `varchar(256)` | 否 | 任务名称 |
| `log_attributes` | `variant` | 否 | 任务完整 JSON 快照（业务主语义） |

### 2.2 `log_attributes` 语义子模型（建议作为业务对象解析）

| 字段路径 | 类型 | 说明 |
|---|---|---|
| `id` | string | 任务 ID（与表列 `id` 对齐） |
| `agentId` | string | 智能体 ID |
| `sessionKey` | string | 会话键 |
| `name` | string | 任务名 |
| `description` | string | 任务描述 |
| `enabled` | number/bool | 是否启用（样例为 `1`） |
| `createdAtMs` | number | 创建时间（毫秒时间戳） |
| `updatedAtMs` | number | 更新时间（毫秒时间戳） |
| `sessionTarget` | string | 会话目标（如 `isolated`） |
| `wakeMode` | string | 唤醒模式（如 `now`） |
| `delivery.mode` | string | 投递模式（如 `announce`） |
| `payload.kind` | string | 执行类型（如 `agentTurn`） |
| `payload.message` | string | 执行指令 |
| `schedule.kind` | string | 调度类型（样例为 `every`） |
| `schedule.everyMs` | number | 周期毫秒 |
| `schedule.anchorMs` | number | 调度锚点时间 |
| `state.nextRunAtMs` | number | 下次执行时间 |
| `state.lastRunAtMs` | number | 最近执行时间 |
| `state.lastRunStatus` | string | 最近执行状态 |
| `state.lastStatus` | string | 当前总体状态 |
| `state.lastDurationMs` | number | 最近执行耗时 |
| `state.lastDeliveryStatus` | string | 最近投递状态 |
| `state.consecutiveErrors` | number | 连续失败次数 |
| `state.lastError` | string | 最近错误信息 |

---

## 3. `cron_runs`（任务执行流水表）

### 3.1 物理字段模型

| 字段 | 类型 | 为空 | 说明 |
|---|---|---|---|
| `id` | `bigint` | 否 | 自增流水 ID |
| `ts` | `bigint` | 否 | 事件时间（毫秒时间戳） |
| `job_id` | `varchar(128)` | 否 | 关联任务 ID（外键语义） |
| `action` | `varchar(128)` | 否 | 生命周期阶段（如 `finished`） |
| `status` | `varchar(128)` | 否 | 执行状态（如 `error`） |
| `delivery_status` | `varchar(128)` | 否 | 投递状态（如 `unknown`） |
| `model` | `varchar(128)` | 否 | 执行模型 |
| `provider` | `varchar(128)` | 否 | 模型提供商 |
| `log_attributes` | `variant` | 否 | 本次执行完整事件 JSON |

### 3.2 `log_attributes` 语义子模型

| 字段路径 | 类型 | 说明 |
|---|---|---|
| `jobId` | string | 任务 ID（与 `job_id` 对齐） |
| `ts` | number | 事件时间 |
| `runAtMs` | number | 本次计划/开始执行时间 |
| `nextRunAtMs` | number | 下次执行时间 |
| `action` | string | 阶段 |
| `status` | string | 执行结果 |
| `deliveryStatus` | string | 投递结果 |
| `durationMs` | number | 执行耗时 |
| `error` | string | 错误信息 |
| `summary` | string | 执行摘要 |
| `sessionId` | string | 本次执行会话 ID |
| `sessionKey` | string | 本次执行会话键 |
| `model` | string | 模型 |
| `provider` | string | 提供商 |
| `usage.input_tokens` | number | 输入 token |
| `usage.output_tokens` | number | 输出 token |
| `usage.total_tokens` | number | 总 token |

---

## 4. 统一业务信息模型（建议给前端/API）

### 4.1 CronJob（任务聚合视图）

| 字段 | 类型 | 来源 |
|---|---|---|
| `jobId` | string | `cron_jobs.id` |
| `agentId` | string | `cron_jobs.agent_id` / `log_attributes.agentId` |
| `sessionKey` | string | `cron_jobs.session_key` / `log_attributes.sessionKey` |
| `name` | string | `cron_jobs.name` / `log_attributes.name` |
| `description` | string | `log_attributes.description` |
| `enabled` | boolean | `log_attributes.enabled`（建议标准化为 bool） |
| `scheduleKind` | string | `log_attributes.schedule.kind` |
| `everyMs` | number | `log_attributes.schedule.everyMs` |
| `nextRunAtMs` | number | `log_attributes.state.nextRunAtMs` |
| `lastRunAtMs` | number | `log_attributes.state.lastRunAtMs` |
| `lastRunStatus` | string | `log_attributes.state.lastRunStatus` |
| `consecutiveErrors` | number | `log_attributes.state.consecutiveErrors` |
| `lastError` | string | `log_attributes.state.lastError` |

### 4.2 CronRun（执行记录）

| 字段 | 类型 | 来源 |
|---|---|---|
| `runId` | number | `cron_runs.id` |
| `jobId` | string | `cron_runs.job_id` |
| `ts` | number | `cron_runs.ts` |
| `action` | string | `cron_runs.action` |
| `status` | string | `cron_runs.status` |
| `deliveryStatus` | string | `cron_runs.delivery_status` |
| `model` | string | `cron_runs.model` |
| `provider` | string | `cron_runs.provider` |
| `durationMs` | number | `log_attributes.durationMs` |
| `error` | string | `log_attributes.error` |
| `summary` | string | `log_attributes.summary` |
| `inputTokens` | number | `log_attributes.usage.input_tokens` |
| `outputTokens` | number | `log_attributes.usage.output_tokens` |
| `totalTokens` | number | `log_attributes.usage.total_tokens` |

---

## 5. 查询建议

- **任务列表（概览）**：以 `cron_jobs` 为主，直接读 `log_attributes.state.*`。  
- **任务详情（执行历史）**：按 `job_id` 查询 `cron_runs`，按 `ts` 或 `id` 倒序。  
- **状态口径建议**：优先使用 `cron_runs.status` 与 `cron_runs.delivery_status`，`cron_jobs.state.*` 作为快照显示。  
- **异常诊断**：结合 `state.consecutiveErrors`、`state.lastError` 与最近 N 条 `cron_runs.log_attributes.error`。  

