# OpenClaw 链路追踪数据规范 （otel\_traces）

本文档为基于 OpenTelemetry 采集的 OpenClaw 数字员工链路追踪数据规范，涵盖数据元信息、字段定义、查询使用全流程说明，适配 Apache Doris 数据库存储引擎。

***

# otel\_traces（链路追踪数据）

## 一、基本信息

| 字段项 | 详情说明 |
| --- | --- |
| 数据名称 | OpenClaw 数字员工链路追踪数据集（OpenClaw Traces） |
| 原始路径 (OpenClaw 原始数据来源) | OpenClaw Gateway 内置 OTel Tracer Provider，通过 OpenTelemetry SDK 自动采集网关运行时链路数据并经 OTLP Exporter 推送至 Collector |
| 数据内容 | 基于 OpenTelemetry SDK 采集的 OpenClaw 网关运行全链路追踪数据，覆盖消息处理、模型调用、Webhook 处理、会话异常等核心链路，每个 Span 记录一次操作的完整生命周期，包括开始时间、结束时间、耗时、状态、维度属性等 |
| 数据库 | opsRobot |
| 数据表 | otel\_traces |
| 用途定位 | 标准化存储 OpenClaw 网关运行的全链路追踪数据，构建数字员工运维监控的链路数据底座，支撑消息处理全链路追踪、模型调用耗时分析、Webhook 处理异常定位、会话卡死检测等核心运维场景 |
| 应用场景 | 1. 消息处理全链路追踪与耗时分析 2. 模型调用 Token 消耗与性能追踪 3. Webhook 处理成功 / 失败链路分析 4. 会话卡死（Stuck Session）检测与根因定位 5. 运维自动化平台、可观测性系统的 OpenClaw 链路数据供给 |

## 二、数据字段

### 2.1 数据表列

| 字段名称 | 字段类型 | 字段说明 | 字段示例 |
| --- | --- | --- | --- |
| service\_name | varchar(200) | 服务名称，标识链路所属的服务实例 | openclaw-gateway |
| timestamp | datetime(6) | Span 开始时间戳，精度为微秒，是链路的核心时序字段 | 2026-04-20 02:48:46.000000 |
| service\_instance\_id | varchar(200) | 服务实例 ID，标识链路所属的具体实例，无实例归属时为空 | '' |
| trace\_id | varchar(200) | 链路追踪 ID，唯一标识一次完整链路，核心关联字段 | ed418a7e4201349b483b1dcef34575f2 |
| span\_id | string | Span 唯一标识，标识链路中的单个操作节点 | 309cdd0de29b612f |
| trace\_state | string | 链路状态字符串，W3C tracestate 格式，无状态时为空 | '' |
| parent\_span\_id | string | 父 Span ID，标识当前 Span 的上游调用节点，根 Span 时为空 | '' |
| span\_name | string | Span 名称，标识链路操作的业务语义，核心查询维度 | openclaw.message.processed |
| span\_kind | string | Span 类型，标识链路操作的调用关系角色 | SPAN\_KIND\_INTERNAL |
| end\_time | datetime(6) | Span 结束时间戳，精度为微秒 | 2026-04-20 02:49:04.000000 |
| duration | bigint(20) | Span 持续时间，单位为纳秒（ns），核心度量字段 | 17286000 |
| span\_attributes | variant | Span 维度属性，JSON 格式存储，用于链路的过滤与分组，核心维度字段 | {"openclaw":{"channel":"webchat","messageId":"cdcfb906-...",...}} |
| events | array\<struct\<datetime(6),string,map\<string,string\>\>\> | Span 事件数组，记录链路执行过程中的关键事件，无事件时为空数组 | [] |
| links | array\<struct\<string,string,string,map\<string,string\>\>\> | Span 关联链接数组，记录与其它链路的因果关联，无关联时为空数组 | [] |
| status\_message | string | Span 状态描述信息，正常时为空，异常时记录错误原因 | '' |
| status\_code | string | Span 状态码，标识链路操作的执行结果 | STATUS\_CODE\_UNSET |
| resource\_attributes | variant | 资源属性，JSON 格式存储，标识链路来源的资源信息 | {"host":{"arch":"amd64","name":"WIN-956AJQN5686"},...} |
| scope\_name | string | 链路采集器的作用域名称，标识链路的采集模块来源 | openclaw |
| scope\_version | string | 链路采集器的版本号 | '' |

### 2.2 JSON 扩展字段

本章节对表中 Variant / 复杂结构体类型的 JSON 扩展字段进行平铺拆解，明确各子字段的定义与用法。

#### 2.2.1 span\_attributes 链路维度字段

span\_attributes 为链路的核心维度属性，所有维度子字段均嵌套在 `openclaw` 命名空间下，不同 Span 类型对应不同的维度子字段，完整定义如下：

| 字段路径 | 字段类型 | 字段说明 | 适用 Span | 字段示例 |
| --- | --- | --- | --- | --- |
| attributes.openclaw.channel | 字符串 | 消息来源渠道 | openclaw.message.processed、openclaw.model.usage、openclaw.webhook.processed、openclaw.webhook.error | webchat、discord、telegram |
| attributes.openclaw.messageId | 字符串 | 消息唯一标识 | openclaw.message.processed | cdcfb906-0e88-494b-a57c-de986b3d7bf3 |
| attributes.openclaw.outcome | 字符串 | 消息处理结果 | openclaw.message.processed | completed、success、error |
| attributes.openclaw.sessionKey | 字符串 | 会话键标识 | openclaw.message.processed、openclaw.model.usage、openclaw.session.stuck | agent:main:main |
| attributes.openclaw.sessionId | 字符串 | 会话唯一标识 | openclaw.model.usage | 476a6255-c68a-4051-ba33-090cbf4dba31 |
| attributes.openclaw.model | 字符串 | 使用的模型标识 | openclaw.model.usage | MiniMax-M2.7 |
| attributes.openclaw.provider | 字符串 | 模型提供商标识 | openclaw.model.usage | minimax |
| attributes.openclaw.tokens.input | 数值 | 输入 Token 数量 | openclaw.model.usage | 343 |
| attributes.openclaw.tokens.output | 数值 | 输出 Token 数量 | openclaw.model.usage | 636 |
| attributes.openclaw.tokens.total | 数值 | 总 Token 数量 | openclaw.model.usage | 24467 |
| attributes.openclaw.tokens.cache\_read | 数值 | 缓存读取 Token 数量 | openclaw.model.usage | 23488 |
| attributes.openclaw.tokens.cache\_write | 数值 | 缓存写入 Token 数量 | openclaw.model.usage | 0 |
| attributes.openclaw.webhook | 字符串 | Webhook 类型 | openclaw.webhook.processed、openclaw.webhook.error | message、interaction |
| attributes.openclaw.chatId | 字符串 | 聊天 ID | openclaw.webhook.processed | 123456 |
| attributes.openclaw.error | 字符串 | 错误描述信息 | openclaw.webhook.error | Discord API rate limit exceeded |
| attributes.openclaw.state | 字符串 | 会话当前状态 | openclaw.session.stuck | processing |
| attributes.openclaw.ageMs | 数值 | 会话卡死时长（毫秒） | openclaw.session.stuck | 30000 |
| attributes.openclaw.queueDepth | 数值 | 队列深度 | openclaw.session.stuck | 5 |

#### 2.2.2 resource\_attributes 资源属性字段

resource\_attributes 用于标识链路来源的主机 / 进程 / 服务元信息，为可扩展 JSON 结构，核心子字段定义如下：

| 字段路径 | 字段类型 | 字段说明 | 字段示例 |
| --- | --- | --- | --- |
| resource\_attributes.host.name | 字符串 | 主机名称 | WIN-956AJQN5686 |
| resource\_attributes.host.arch | 字符串 | 主机 CPU 架构 | amd64 |
| resource\_attributes.host.id | 字符串 | 主机唯一标识 | 21aa27b1-e3b2-470c-b6f5-1699ba278c49 |
| resource\_attributes.process.command | 字符串 | 进程启动命令 | C:\\Users\\Administrator\\AppData\\Roaming\\npm\\node\_modules\\openclaw\\openclaw.mjs |
| resource\_attributes.process.command\_args | 字符串数组 | 进程启动参数列表 | ["D:\\Program Files\\nodejs\\node.exe", "--disable-warning=ExperimentalWarning", ...] |
| resource\_attributes.process.executable.name | 字符串 | 可执行文件名称 | openclaw-gateway |
| resource\_attributes.process.executable.path | 字符串 | 可执行文件路径 | D:\\Program Files\\nodejs\\node.exe |
| resource\_attributes.process.owner | 字符串 | 进程所属用户 | Administrator |
| resource\_attributes.process.pid | 数值 | 进程 ID | 5748 |
| resource\_attributes.process.runtime.name | 字符串 | 运行时名称 | nodejs |
| resource\_attributes.process.runtime.version | 字符串 | 运行时版本 | 25.2.1 |
| resource\_attributes.process.runtime.description | 字符串 | 运行时描述 | Node.js |
| resource\_attributes.service.name | 字符串 | 服务名称 | openclaw-gateway |

#### 2.2.3 events 链路事件字段

events 为数组结构体类型，记录链路执行过程中的关键事件，数组内单个元素的子字段定义如下：

| 字段路径 | 字段类型 | 字段说明 | 字段示例 |
| --- | --- | --- | --- |
| events\[\].timestamp | datetime(6) | 事件发生的时间戳 | 2026-04-20 02:48:50.000000 |
| events\[\].name | 字符串 | 事件名称 | exception |
| events\[\].attributes | map\<string,string\> | 事件的附加属性键值对 | {"exception.type":"TypeError","exception.message":"..."} |

#### 2.2.4 links 链路关联字段

links 为数组结构体类型，记录与其它链路的因果关联，数组内单个元素的子字段定义如下：

| 字段路径 | 字段类型 | 字段说明 | 字段示例 |
| --- | --- | --- | --- |
| links\[\].trace\_id | 字符串 | 关联链路的 TraceID | abc123def4567890abcdef1234567890 |
| links\[\].span\_id | 字符串 | 关联链路的 SpanID | 309cdd0de29b612f |
| links\[\].trace\_state | 字符串 | 关联链路的 tracestate | '' |
| links\[\].attributes | map\<string,string\> | 关联的附加属性键值对 | {"link.reason":"child"} |

#### 2.2.5 Span 名称与维度对照表

| Span 名称 | Span 类型 | 业务描述 | status\_code | attributes.openclaw 维度 |
| --- | --- | --- | --- | --- |
| openclaw.message.processed | SPAN\_KIND\_INTERNAL | 消息处理链路，记录消息从接收到处理完成的全过程 | UNSET / ERROR | channel, messageId, outcome, sessionKey |
| openclaw.model.usage | SPAN\_KIND\_INTERNAL | 模型调用链路，记录模型调用与 Token 消耗详情 | UNSET | channel, model, provider, sessionId, sessionKey, tokens.* |
| openclaw.webhook.processed | SPAN\_KIND\_INTERNAL | Webhook 处理链路，记录 Webhook 请求的处理过程 | UNSET | channel, webhook, chatId |
| openclaw.webhook.error | SPAN\_KIND\_INTERNAL | Webhook 异常链路，记录 Webhook 处理失败详情 | ERROR | channel, webhook, error |
| openclaw.session.stuck | SPAN\_KIND\_INTERNAL | 会话卡死链路，记录检测到的会话卡死事件 | ERROR | sessionKey, state, ageMs, queueDepth |

## 三、使用示例

本章节基于 Apache Doris SQL 语法，提供 otel\_traces 表的常用查询示例，覆盖基础字段查询与 JSON 扩展字段查询两大核心场景。

### 3.1 数据表列查询示例

1\. 按时间范围查询链路数据

查询 2026-04-20 当天的全量链路数据，适用于链路总览分析场景：

```sql
SELECT
    timestamp,
    span_name,
    trace_id,
    span_id,
    duration,
    status_code,
    metric_unit
FROM
    opsRobot.otel_traces
WHERE
    timestamp >= '2026-04-20 00:00:00'
    AND timestamp < '2026-04-21 00:00:00'
ORDER BY
    timestamp ASC;
```

2\. 按 Span 名称查询指定链路类型

查询消息处理链路的全量数据，适用于消息处理性能分析场景：

```sql
SELECT
    timestamp,
    span_name,
    trace_id,
    duration,
    status_code
FROM
    opsRobot.otel_traces
WHERE
    span_name = 'openclaw.message.processed'
    AND timestamp >= '2026-04-20 00:00:00'
ORDER BY
    timestamp DESC
LIMIT 20;
```

3\. 查询异常链路

查询状态码为 ERROR 的异常链路，适用于故障排查场景：

```sql
SELECT
    timestamp,
    span_name,
    trace_id,
    span_id,
    duration,
    status_code,
    status_message
FROM
    opsRobot.otel_traces
WHERE
    status_code = 'STATUS_CODE_ERROR'
    AND timestamp >= '2026-04-20 00:00:00'
ORDER BY
    timestamp DESC;
```

4\. 按耗时排序查询慢链路

查询耗时最长的 Top 10 链路，适用于性能瓶颈定位场景：

```sql
SELECT
    timestamp,
    span_name,
    trace_id,
    duration / 1000000 AS duration_ms,
    status_code
FROM
    opsRobot.otel_traces
WHERE
    timestamp >= '2026-04-20 00:00:00'
    AND timestamp < '2026-04-21 00:00:00'
ORDER BY
    duration DESC
LIMIT 10;
```

### 3.2 JSON 扩展字段查询示例

1\. 基于 span\_attributes 维度过滤查询指定渠道的消息处理链路

Doris 中 Variant 类型支持 `->` 运算符直接提取 JSON 子字段，可快速完成维度过滤：

```sql
SELECT
    timestamp,
    span_name,
    trace_id,
    duration / 1000000 AS duration_ms,
    status_code
FROM
    opsRobot.otel_traces
WHERE
    span_name = 'openclaw.message.processed'
    AND span_attributes->'openclaw.channel' = 'webchat'
    AND timestamp >= '2026-04-20 00:00:00'
ORDER BY
    timestamp DESC;
```

2\. 查询模型调用的 Token 消耗详情

提取 span\_attributes 中的 Token 维度，查询各模型调用的 Token 消耗明细，适用于成本核算场景：

```sql
SELECT
    timestamp,
    span_attributes->'openclaw.model' AS model_name,
    span_attributes->'openclaw.provider' AS provider,
    span_attributes->'openclaw.tokens.input' AS input_tokens,
    span_attributes->'openclaw.tokens.output' AS output_tokens,
    span_attributes->'openclaw.tokens.total' AS total_tokens,
    span_attributes->'openclaw.tokens.cache_read' AS cache_read_tokens,
    span_attributes->'openclaw.tokens.cache_write' AS cache_write_tokens,
    duration / 1000000 AS duration_ms
FROM
    opsRobot.otel_traces
WHERE
    span_name = 'openclaw.model.usage'
    AND timestamp >= '2026-04-20 00:00:00'
    AND timestamp < '2026-04-21 00:00:00'
ORDER BY
    total_tokens DESC;
```

3\. 查询 Webhook 异常链路详情

提取 span\_attributes 中的错误信息维度，查询 Webhook 处理失败的详细原因：

```sql
SELECT
    timestamp,
    trace_id,
    span_attributes->'openclaw.channel' AS channel,
    span_attributes->'openclaw.webhook' AS webhook_type,
    span_attributes->'openclaw.error' AS error_message,
    status_code
FROM
    opsRobot.otel_traces
WHERE
    span_name = 'openclaw.webhook.error'
    AND timestamp >= '2026-04-20 00:00:00'
ORDER BY
    timestamp DESC;
```

4\. 查询会话卡死事件

提取 span\_attributes 中的卡死维度，查询检测到的会话卡死事件及卡死时长：

```sql
SELECT
    timestamp,
    trace_id,
    span_attributes->'openclaw.sessionKey' AS session_key,
    span_attributes->'openclaw.state' AS session_state,
    span_attributes->'openclaw.ageMs' AS stuck_age_ms,
    span_attributes->'openclaw.queueDepth' AS queue_depth,
    status_message
FROM
    opsRobot.otel_traces
WHERE
    span_name = 'openclaw.session.stuck'
    AND timestamp >= '2026-04-20 00:00:00'
ORDER BY
    timestamp DESC;
```

5\. 使用 json\_extract 函数查询多层级 Token 字段

使用 json\_extract 函数提取深层级 JSON 字段，按模型分组统计 Token 消耗总量：

```sql
SELECT
    json_extract(span_attributes, '$.openclaw.model') AS model_name,
    SUM(CAST(json_extract(span_attributes, '$.openclaw.tokens.input') AS BIGINT)) AS total_input,
    SUM(CAST(json_extract(span_attributes, '$.openclaw.tokens.output') AS BIGINT)) AS total_output,
    SUM(CAST(json_extract(span_attributes, '$.openclaw.tokens.total') AS BIGINT)) AS total_tokens,
    COUNT(*) AS call_count
FROM
    opsRobot.otel_traces
WHERE
    span_name = 'openclaw.model.usage'
    AND timestamp >= '2026-04-20 00:00:00'
    AND timestamp < '2026-04-21 00:00:00'
GROUP BY
    model_name
ORDER BY
    total_tokens DESC;
```

6\. 基于 resource\_attributes 资源属性过滤指定主机链路

通过资源属性字段过滤指定主机的链路数据，适用于多实例集群监控场景：

```sql
SELECT
    timestamp,
    span_name,
    trace_id,
    duration / 1000000 AS duration_ms,
    status_code
FROM
    opsRobot.otel_traces
WHERE
    resource_attributes->'host.name' = 'WIN-956AJQN5686'
    AND timestamp >= '2026-04-20 00:00:00'
ORDER BY
    timestamp DESC;
```

7\. 按 Span 名称分组统计链路数量与平均耗时

按 Span 名称分组，统计各链路类型的调用次数、平均耗时与错误率，适用于链路健康度分析场景：

```sql
SELECT
    span_name,
    COUNT(*) AS total_count,
    AVG(duration / 1000000) AS avg_duration_ms,
    MIN(duration / 1000000) AS min_duration_ms,
    MAX(duration / 1000000) AS max_duration_ms,
    SUM(CASE WHEN status_code = 'STATUS_CODE_ERROR' THEN 1 ELSE 0 END) AS error_count,
    ROUND(SUM(CASE WHEN status_code = 'STATUS_CODE_ERROR' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS error_rate_pct
FROM
    opsRobot.otel_traces
WHERE
    timestamp >= '2026-04-20 00:00:00'
    AND timestamp < '2026-04-21 00:00:00'
GROUP BY
    span_name
ORDER BY
    total_count DESC;
```

> （注：文档部分内容可能由 AI 生成）
