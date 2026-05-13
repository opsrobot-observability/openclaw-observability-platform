# cronJobs 数据源说明文档

# 一、基本信息


| 数据名称 | 定时任务配置表                                                                                                   |
| ---- | --------------------------------------------------------------------------------------------------------- |
| 原始路径 | OpenClaw 中定时任务配置的实际存储路径，默认路径为 /openclaw/cron/jobsJSONL                                                    |
| 数据内容 | 记录OpenClaw平台所有定时任务的配置信息，包括任务唯一ID、关联智能体ID、会话密钥、任务名称、任务执行参数、调度规则、任务状态等核心配置详情，支撑定时任务的创建、执行与管理                |
| 数据库  | opsRobot                                                                                                  |
| 数据表  | cronjobs                                                                                                  |
| 用途定位 | 用于定时任务的配置管理、调度规则查看、任务关联关系查询、任务状态监控及任务配置审计，为定时任务的正常执行提供核心配置支撑                                              |
| 应用场景 | 1 定时任务配置查询与核对； 2 任务调度规则（执行时间、频率）查看与调整； 3 智能体与定时任务的关联关系梳理； 4 任务启用/禁用状态监控； 5 任务配置历史追溯与审计； 6 任务执行参数（如查询指令）查看 |


# 二、数据字段

## （一）数据表列


| 字段名称          | 字段类型       | 字段说明                                                  | 字段示例                                                                                                                                                                                     |
| ------------- | ---------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id            | varchar128 | 定时任务唯一ID，非自增，为主键，用于唯一标识每个定时任务                         | a5580f61b7b34c6cb4117ab9abcddad0                                                                                                                                                         |
| agentid       | varchar128 | 关联的智能体ID，标识该定时任务归属的智能体                                | main、xiaohongshuagent                                                                                                                                                                    |
| sessionkey    | varchar128 | 会话密钥，用于关联定时任务所属的会话，支撑任务执行时的会话验证                       | agent:main:main、agent:xiaohongshuagent:feishu:direct:ou31b6d64d40874207f53b468bfe8208ff                                                                                                  |
| name          | varchar256 | 定时任务的名称，简洁描述任务核心功能，便于识别                               | 查询当前恒生指数（港股）最新点位并播报涨跌情况、美元汇率查询                                                                                                                                                           |
| logattributes | variant    | 存储定时任务的原始配置日志，格式为JSON字符串，包含任务创建时间、调度规则、执行参数、状态等详细扩展信息 | 34;agentId34;:34;main34;,34;createdAtMs34;:1776835191280,34;deleteAfterRun34;:1,34;enabled34;:1,34;id34;:34;a5580f61b7b34c6cb4117ab9abcddad034;,34;name34;:34;查询当前恒生指数（港股）最新点位并播报涨跌情况34; |


## （二）JSON扩展字段

说明：JSON扩展字段均来自 logattributes 列（JSON格式），以下为JSON字段平铺展示，覆盖所有出现的JSON子字段


| 字段路径                                 | 字段类型   | 字段说明                                         | 字段示例                                                                  |
| ------------------------------------ | ------ | -------------------------------------------- | --------------------------------------------------------------------- |
| logattributesagentId                 | string | 定时任务归属的智能体ID，与数据表中agentid字段一致                | main                                                                  |
| logattributescreatedAtMs             | bigint | 定时任务的创建时间戳，单位为毫秒                             | 1776835191280                                                         |
| logattributesdeleteAfterRun          | int    | 任务执行后是否删除标识，1表示执行后删除，0表示不删除                  | 1                                                                     |
| logattributesenabled                 | int    | 任务启用状态标识，1表示启用，0表示禁用                         | 1                                                                     |
| logattributesid                      | string | 定时任务唯一ID，与数据表中id字段一致                         | a5580f61b7b34c6cb4117ab9abcddad0                                      |
| logattributesname                    | string | 定时任务名称，与数据表中name字段一致                         | 查询当前恒生指数（港股）最新点位并播报涨跌情况                                               |
| logattributespayload                 | object | 任务执行的负载参数，包含任务执行的核心指令和事件类型                   | 34;kind34;:34;systemEvent34;,34;text34;:34;查询当前恒生指数（港股）最新点位并播报涨跌情况34; |
| logattributespayloadkind             | string | 任务负载类型，分为systemEvent（系统事件）和agentTurn（智能体交互）  | systemEvent、agentTurn                                                 |
| logattributespayloadtext             | string | 任务执行的核心指令文本，描述任务需要完成的具体操作                    | 查询当前恒生指数（港股）最新点位并播报涨跌情况                                               |
| logattributespayloadmessage          | string | 智能体交互类任务的执行指令，包含更详细的操作要求（仅agentTurn类型负载有该字段） | 查询上海当前天气，包括温度、湿度、风力、天气状况。用简洁友好的语言播报，适合小红书风格。                          |
| logattributesschedule                | object | 任务调度规则配置，定义任务的执行时间、频率                        | 34;at34;:34;20260422T05:45:00000Z34;,34;kind34;:34;at34;              |
| logattributesschedulekind            | string | 调度类型，at表示指定时间执行，every表示按固定频率循环执行             | at、every                                                              |
| logattributesscheduleat              | string | 指定时间执行的时间点（UTC时间），仅at类型调度有该字段                | 20260422T05:45:00000Z                                                 |
| logattributesscheduleanchorMs        | bigint | 循环执行的基准时间戳，单位为毫秒，仅every类型调度有该字段              | 1776836931569                                                         |
| logattributesscheduleeveryMs         | bigint | 循环执行的时间间隔，单位为毫秒，仅every类型调度有该字段               | 300000（即5分钟）                                                          |
| logattributessessionKey              | string | 会话密钥，与数据表中sessionkey字段一致                     | agent:main:main                                                       |
| logattributessessionTarget           | string | 会话目标，标识任务执行的会话范围，分为main（主会话）和isolated（独立会话）  | main、isolated                                                         |
| logattributesstate                   | object | 任务执行状态详情，记录任务的运行状态、下次执行时间等信息                 | 34;nextRunAtMs34;:1776836700000,34;runningAtMs34;:1776836700133       |
| logattributesstatenextRunAtMs        | bigint | 任务下次执行的时间戳，单位为毫秒                             | 1776836700000                                                         |
| logattributesstaterunningAtMs        | bigint | 任务当前运行的时间戳，单位为毫秒（仅正在运行的任务有该字段）               | 1776836700133                                                         |
| logattributesstateconsecutiveErrors  | int    | 任务连续执行失败的次数（仅循环执行任务有该字段）                     | 0                                                                     |
| logattributesstatelastDelivered      | int    | 任务上次交付状态标识，1表示交付成功（仅循环执行任务有该字段）              | 1                                                                     |
| logattributesstatelastDeliveryStatus | string | 任务上次交付状态（仅循环执行任务有该字段）                        | delivered                                                             |
| logattributesstatelastDurationMs     | bigint | 任务上次执行的耗时，单位为毫秒（仅循环执行任务有该字段）                 | 29002                                                                 |
| logattributesstatelastRunAtMs        | bigint | 任务上次执行的时间戳，单位为毫秒（仅循环执行任务有该字段）                | 1776840610442                                                         |
| logattributesstatelastRunStatus      | string | 任务上次执行状态（仅循环执行任务有该字段）                        | ok                                                                    |
| logattributesstatelastStatus         | string | 任务上次整体状态（仅循环执行任务有该字段）                        | ok                                                                    |
| logattributesupdatedAtMs             | bigint | 定时任务配置的最后更新时间戳，单位为毫秒                         | 1776835191280                                                         |
| logattributeswakeMode                | string | 任务唤醒模式，默认值为now（立即唤醒）                         | now                                                                   |
| logattributesdelivery                | object | 任务执行结果的交付配置（仅部分循环执行任务有该字段）                   | 34;channel34;:34;webchat34;,34;mode34;:34;announce34;                 |
| logattributesdeliverychannel         | string | 任务结果交付渠道（仅delivery配置存在时有该字段）                 | webchat                                                               |
| logattributesdeliverymode            | string | 任务结果交付模式（仅delivery配置存在时有该字段）                 | announce                                                              |

## （三）Token 消耗：`cron_jobs.log_attributes` 明细（与后端 `cron-runs-query.mjs` 对齐）

说明：平台任务列表 / 任务卡片上的 **Token 汇总**、**最近一次运行 Token** 会优先从 **`cron_jobs`** 的 **`log_attributes`**（JSON）读取；列名由 Doris 探测，常见为 `log_attributes`。若这些路径均为空，再回退为对 **`cron_runs.log_attributes`** 按任务聚合（见 `cron_runs` 数据说明）。

### 1. 任务级汇总 Token（`job_summary_total_tokens_raw` → 前端 `totalTokensSum` 优先来源之一）

| JSONPath（按序 COALESCE，先非空者生效） | 含义说明 |
| ---------------------------------------- | -------- |
| `$.total_tokens_sum` | 累计 Token 汇总（推荐写入字段名） |
| `$.totalTokensSum` | 驼峰别名 |
| `$.sum_tokens` | 合计 Token 别名 |
| `$.sumTokens` | 驼峰别名 |

### 2. 最近一次运行 Token 快照（`job_last_tokens_snapshot_raw` → 前端「最近 Token」优先来源之一）

| JSONPath（按序 COALESCE） | 含义说明 |
| -------------------------- | -------- |
| `$.state.last_run_tokens_total` | 最近一次运行的 Token 合计（嵌套在 `state` 下） |
| `$.state.lastRunTokensTotal` | 驼峰别名 |
| `$.state.last_total_tokens` | 最近一次 total tokens |
| `$.last_run_tokens_total` | 顶层别名 |
| `$.lastRunTokensTotal` | 驼峰别名 |
| `$.last_total_tokens` | 顶层别名 |

### 3. 与 `cron_runs` 的关系（回退逻辑）

- 当 **`cron_jobs.log_attributes`** 中上述路径均无有效数值时，前端列表上的 Token 汇总会使用 **`cron_runs`** 表按 `job_id` 聚合的结果（从 **`cron_runs.log_attributes`** 内 `$.usage.*` / `$.total_tokens` 等路径解析后求和）。
- **单次运行日志**里的 Token **只读 `cron_runs`**，不会把 `cron_jobs` 的快照拆到每一行。

### 4. Doris 查询示例（直接查看 JSON 中的 Token 字段）

```sql
-- 从任务表 log_attributes 读取汇总与最近一次 Token（需存在 log_attributes 列）
SELECT
  id AS job_id,
  name AS job_name,
  NULLIF(TRIM(GET_JSON_STRING(CAST(log_attributes AS STRING), '$.total_tokens_sum')), '') AS total_tokens_sum_raw,
  NULLIF(TRIM(GET_JSON_STRING(CAST(log_attributes AS STRING), '$.state.last_run_tokens_total')), '') AS last_run_tokens_raw
FROM cron_jobs
ORDER BY id
LIMIT 50;
```

实现参考：`backend/cron-jobs/cron-runs-query.mjs` 中 `resolveJobsLogAttributesSelectSql`。

# 三、使用示例

说明：以下示例均采用 Doris 数据库查询语法，贴合 cronjobs 表实际数据，可直接复制执行，适配表结构及JSON扩展字段格式

## （一）数据表列查询示例

场景1：查询所有定时任务的核心配置信息，快速了解任务归属及名称

```sql
-- 所有定时任务核心配置查询
SELECT 
  id AS job_id,
  agent_id,
  session_key,
  name AS job_name
FROM cron_jobs
ORDER BY agent_id ASC; -- 按智能体ID排序，便于分组查看
```

场景2：查询指定智能体（如xiaohongshuagent）的所有定时任务

```sql
-- 指定智能体定时任务查询
SELECT 
  id AS job_id,
  name AS job_name,
  session_key
FROM cron_jobs
WHERE agent_id = 'xiaohongshu-agent' -- 筛选指定智能体
ORDER BY name ASC;
```

## （二）JSON扩展字段查询示例

场景1：查询所有循环执行（every类型）的定时任务，获取执行频率、下次执行时间

```sql
-- 循环执行任务详情查询
SELECT 
  id AS job_id,
  name AS job_name,
  log_attributes.schedule.kind AS schedule_type, -- 调度类型
  log_attributes.schedule.everyMs / 1000 AS interval_seconds, -- 执行间隔（转换为秒）
  from_unixtime(log_attributes.state.nextRunAtMs / 1000, 'yyyy-MM-dd HH:mm:ss') AS next_exec_time, -- 下次执行时间（格式化）
  log_attributes.state.lastRunAtMs AS last_run_timestamp -- 上次执行时间戳
FROM cron_jobs
WHERE log_attributes.schedule.kind = 'every' -- 筛选循环执行任务
ORDER BY log_attributes.schedule.everyMs ASC;
```

场景2：查询任务执行指令（payload），筛选包含“汇率”关键词的定时任务

```sql
-- 按执行指令关键词筛选任务
SELECT 
  id AS job_id,
  name AS job_name,
  agent_id,
  -- 区分不同payload类型，获取执行指令
  CASE 
    WHEN log_attributes.payload.kind = 'systemEvent' THEN log_attributes.payload.text
    WHEN log_attributes.payload.kind = 'agentTurn' THEN log_attributes.payload.message
  END AS execute_instruction
FROM cron_jobs
-- 筛选执行指令包含“汇率”的任务
WHERE log_attributes.payload.text LIKE '%汇率%' 
   OR log_attributes.payload.message LIKE '%汇率%'
ORDER BY id ASC;
```

场景3：查询任务状态及最近执行情况，监控任务运行健康度

```sql
-- 任务运行状态查询
SELECT 
  id AS job_id,
  name AS job_name,
  log_attributes.enabled AS job_enabled, -- 任务启用状态
  log_attributes.state.lastRunStatus AS last_run_status, -- 上次执行状态
  log_attributes.state.consecutiveErrors AS consecutive_error_count, -- 连续失败次数
  from_unixtime(log_attributes.state.lastRunAtMs / 1000, 'yyyy-MM-dd HH:mm:ss') AS last_run_time, -- 上次执行时间
  log_attributes.state.lastDurationMs AS last_run_duration_ms -- 上次执行耗时
FROM cron_jobs
-- 优先查看循环执行的任务
WHERE log_attributes.schedule.kind = 'every'
ORDER BY log_attributes.state.consecutiveErrors DESC;
```

> （注：文档部分内容可能由 AI 生成）

