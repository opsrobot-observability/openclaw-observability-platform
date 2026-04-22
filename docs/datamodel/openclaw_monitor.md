# OpenClaw 运行监控指标数据规范 （otel\_metrics）

本文档为基于 OpenTelemetry 采集的 OpenClaw 数字员工运行监控指标数据规范，涵盖数据元信息、字段定义、查询使用全流程说明，适配 Apache Doris 数据库存储引擎。

***

# otel\_metrics\_sum（累计型 / 单值型指标）

## 一、基本信息

| 字段项                    | 详情说明                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 数据名称                   | OpenClaw 数字员工累计型运行监控指标集（OpenClaw Runtime Sum Metrics）                                                               |
| 原始路径 (OpenClaw 原始数据来源) | OpenClaw Gateway 内置 OTel Meter Provider，通过 OpenTelemetry SDK 自动采集网关运行时指标并经 OTLP Exporter 推送至 Collector              |
| 数据内容                   | 基于 OpenTelemetry SDK 采集的 OpenClaw 网关累计型 / 单值型时序指标，覆盖会话状态转换、消息排队与处理、队列通道调度、Token 消耗、模型成本五大核心监控域，聚合类型为 Cumulative     |
| 数据库                    | opsRobot                                                                                                            |
| 数据表                    | otel\_metrics\_sum                                                                                                  |
| 用途定位                   | 标准化存储 OpenClaw 网关运行的累计型 / 单值型可观测指标，构建数字员工运维监控的时序数据底座，支撑会话状态追踪、消息处理统计、队列调度监控、Token 消耗与成本核算等核心运维场景                    |
| 应用场景                   | 1. 数字员工会话状态实时监控与异常告警 2. 消息排队与处理计数统计 3. 队列通道入队 / 出队事件监控，调度策略优化 4. Token 消耗统计与模型成本核算 5. 运维自动化平台、可观测性系统的 OpenClaw 数据供给 |

## 二、数据字段

### 2.1 数据表列

| 字段名称                     | 字段类型                                                                  | 字段说明                                | 字段示例                                                        |
| ------------------------ | --------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------- |
| service\_name            | varchar(200)                                                          | 服务名称，标识指标所属的服务实例                    | openclaw                                                    |
| timestamp                | datetime(6)                                                           | 指标采集的时间戳，精度为微秒，是指标的核心时序字段           | 2026-04-20 06:26:03.000000                                  |
| service\_instance\_id    | varchar(200)                                                          | 服务实例 ID，标识指标所属的具体实例，无实例归属时为空        | ''                                                          |
| metric\_name             | varchar(200)                                                          | 指标名称，OpenClaw 监控指标的唯一标识，核心查询维度      | openclaw\.session.state                                     |
| metric\_description      | string                                                                | 指标的文本描述，说明指标的业务含义                   | Session state transitions                                   |
| metric\_unit             | string                                                                | 指标的计量单位                             | 1                                                           |
| attributes               | variant                                                               | 指标的维度标签，JSON 格式存储，用于指标的过滤与分组，核心维度字段 | {"openclaw":{"reason":"message\_completed","state":"idle"}} |
| start\_time              | datetime(6)                                                           | 指标采集的起始时间，累计型指标的统计起始时间，精度为微秒        | 2026-04-20 06:25:59.000000                                  |
| value                    | double                                                                | 指标的数值，核心度量字段                        | 2                                                           |
| exemplars                | array\<struct\<map\<string,string>,datetime(6),double,string,string>> | 指标的采样数据数组，存储链路追踪关联的采样数据，无采样时为空数组    | \[]                                                         |
| aggregation\_temporality | string                                                                | 指标聚合时间性，Cumulative 表示累计聚合           | Cumulative                                                  |
| is\_monotonic            | tinyint(1)                                                            | 指标值是否单调递增，1 表示单调递增，0 表示非单调          | 1                                                           |
| resource\_attributes     | variant                                                               | 资源属性，JSON 格式存储，标识指标来源的资源信息          | {"host":{"arch":"arm64","name":"leondeMac-mini.local"},...} |
| scope\_name              | string                                                                | 指标采集器的作用域名称，标识指标的采集模块来源             | openclaw                                                    |
| scope\_version           | string                                                                | 指标采集器的版本号                           | ''                                                          |

### 2.2 JSON 扩展字段

本章节对表中 Variant / 复杂结构体类型的 JSON 扩展字段进行平铺拆解，明确各子字段的定义与用法。

#### 2.2.1 attributes 指标维度字段

attributes 为指标的核心维度标签，所有维度子字段均嵌套在 `openclaw` 命名空间下，不同指标类型对应不同的维度子字段，完整定义如下：

| 字段路径                          | 字段类型 | 字段说明       | 适用指标                                                                                     | 字段示例                                                          |
| ----------------------------- | ---- | ---------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| attributes.openclaw\.state    | 字符串  | 会话当前状态     | openclaw\.session.state                                                                  | idle、processing                                               |
| attributes.openclaw\.reason   | 字符串  | 会话状态变更原因   | openclaw\.session.state                                                                  | message\_completed、run\_started、message\_start、run\_completed |
| attributes.openclaw\.channel  | 字符串  | 消息来源渠道     | openclaw\.tokens、openclaw\.cost.usd、openclaw\.message.queued、openclaw\.message.processed | webchat                                                       |
| attributes.openclaw\.model    | 字符串  | 使用的模型标识    | openclaw\.tokens、openclaw\.cost.usd                                                      | MiniMax-M2.7                                                  |
| attributes.openclaw\.provider | 字符串  | 模型提供商标识    | openclaw\.tokens、openclaw\.cost.usd                                                      | minimax-cn                                                    |
| attributes.openclaw\.token    | 字符串  | Token 使用类型 | openclaw\.tokens                                                                         | input、output、total、cache\_write、cache\_read                   |
| attributes.openclaw\.outcome  | 字符串  | 消息处理结果     | openclaw\.message.processed                                                              | completed                                                     |
| attributes.openclaw\.source   | 字符串  | 消息来源类型     | openclaw\.message.queued                                                                 | dispatch                                                      |
| attributes.openclaw\.lane     | 字符串  | 队列通道标识     | openclaw\.queue.lane.enqueue、openclaw\.queue.lane.dequeue                                | main、session:agent:main:main、session:temp:slug-generator      |

#### 2.2.2 resource\_attributes 资源属性字段

resource\_attributes 用于标识指标来源的主机 / 进程 / 服务元信息，为可扩展 JSON 结构，核心子字段定义如下：

| 字段路径                                             | 字段类型  | 字段说明      | 字段示例                                                                                                                                   |
| ------------------------------------------------ | ----- | --------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| resource\_attributes.host.name                   | 字符串   | 主机名称      | leondeMac-mini.local                                                                                                                   |
| resource\_attributes.host.arch                   | 字符串   | 主机 CPU 架构 | arm64                                                                                                                                  |
| resource\_attributes.process.command             | 字符串   | 进程启动命令    | /opt/homebrew/lib/node\_modules/openclaw/dist/index.js                                                                                 |
| resource\_attributes.process.command\_args       | 字符串数组 | 进程启动参数列表  | \["/opt/homebrew/Cellar/node/25.8.0/bin/node", "/opt/homebrew/lib/node\_modules/openclaw/dist/index.js", "gateway", "--port", "18789"] |
| resource\_attributes.process.executable.name     | 字符串   | 可执行文件名称   | openclaw-gateway                                                                                                                       |
| resource\_attributes.process.executable.path     | 字符串   | 可执行文件路径   | /opt/homebrew/Cellar/node/25.8.0/bin/node                                                                                              |
| resource\_attributes.process.owner               | 字符串   | 进程所属用户    | leon                                                                                                                                   |
| resource\_attributes.process.pid                 | 数值    | 进程 ID     | 75531                                                                                                                                  |
| resource\_attributes.process.runtime.name        | 字符串   | 运行时名称     | nodejs                                                                                                                                 |
| resource\_attributes.process.runtime.version     | 字符串   | 运行时版本     | 25.8.0                                                                                                                                 |
| resource\_attributes.process.runtime.description | 字符串   | 运行时描述     | Node.js                                                                                                                                |
| resource\_attributes.service.name                | 字符串   | 服务名称      | openclaw                                                                                                                               |

#### 2.2.3 exemplars 采样示例字段

exemplars 为数组结构体类型，存储指标关联的链路追踪采样数据，数组内单个元素的子字段定义如下：

| 字段路径                              | 字段类型                | 字段说明          | 字段示例                             |
| --------------------------------- | ------------------- | ------------- | -------------------------------- |
| exemplars\[].filtered\_attributes | map\<string,string> | 采样数据的过滤标签键值对  | {"http.status\_code":"200"}      |
| exemplars\[].timestamp            | datetime(6)         | 采样数据的时间戳      | 2026-04-20 06:26:03.000000       |
| exemplars\[].value                | double              | 采样数据对应的指标值    | 2.0                              |
| exemplars\[].span\_id             | 字符串                 | 链路追踪的 SpanID  | abc123def456                     |
| exemplars\[].trace\_id            | 字符串                 | 链路追踪的 TraceID | 1234567890abcdef1234567890abcdef |

#### 2.2.4 指标名称与维度对照表

| 指标名称                         | 指标描述             | 计量单位 | attributes.openclaw 维度          |
| ---------------------------- | ---------------- | ---- | ------------------------------- |
| openclaw\.session.state      | 会话状态转换计数         | 1    | state, reason                   |
| openclaw\.message.queued     | 排队待处理的消息计数       | 1    | channel, source                 |
| openclaw\.message.processed  | 已处理的消息计数（按结果分类）  | 1    | channel, outcome                |
| openclaw\.tokens             | Token 使用量（按类型分类） | 1    | channel, model, provider, token |
| openclaw\.cost.usd           | 模型调用成本估算（美元）     | 1    | channel, model, provider        |
| openclaw\.queue.lane.enqueue | 队列通道入队事件计数       | 1    | lane                            |
| openclaw\.queue.lane.dequeue | 队列通道出队事件计数       | 1    | lane                            |

## 三、使用示例

本章节基于 Apache Doris SQL 语法，提供 otel\_metrics\_sum 表的常用查询示例，覆盖基础字段查询与 JSON 扩展字段查询两大核心场景。

### 3.1 数据表列查询示例

1\. 按时间范围查询会话状态指标

查询 2026-04-20 当天会话状态转换的全量采集数据，适用于会话状态趋势分析场景：

```sql
SELECT
    timestamp,
    metric_name,
    value,
    metric_unit
FROM
    opsRobot.otel_metrics_sum
WHERE
    metric_name = 'openclaw.session.state'
    AND timestamp >= '2026-04-20 00:00:00'
    AND timestamp < '2026-04-21 00:00:00'
ORDER BY
    timestamp ASC;
```

2\. 统计指定时间段内 Token 总消耗量

查询各类 Token 的累计使用量，适用于资源消耗统计场景：

```sql
SELECT
    metric_name,
    value AS token_count,
    metric_unit
FROM
    opsRobot.otel_metrics_sum
WHERE
    metric_name = 'openclaw.tokens'
    AND timestamp >= '2026-04-20 00:00:00'
    AND timestamp < '2026-04-21 00:00:00'
ORDER BY
    value DESC;
```

3\. 查询队列通道入队 / 出队事件计数

查询各队列通道的入队和出队事件累计计数，适用于队列调度监控场景：

```sql
SELECT
    timestamp,
    metric_name,
    value,
    metric_unit
FROM
    opsRobot.otel_metrics_sum
WHERE
    metric_name IN ('openclaw.queue.lane.enqueue', 'openclaw.queue.lane.dequeue')
    AND timestamp >= '2026-04-20 00:00:00'
ORDER BY
    timestamp DESC;
```

### 3.2 JSON 扩展字段查询示例

1\. 基于 attributes 维度过滤查询指定渠道的 Token 消耗

Doris 中 Variant 类型支持 `->` 运算符直接提取 JSON 子字段，可快速完成维度过滤：

```sql
SELECT
    timestamp,
    attributes->'openclaw.token' AS token_type,
    attributes->'openclaw.model' AS model_name,
    value AS token_count
FROM
    opsRobot.otel_metrics_sum
WHERE
    metric_name = 'openclaw.tokens'
    AND attributes->'openclaw.channel' = 'webchat'
    AND attributes->'openclaw.token' = 'total'
    AND timestamp >= '2026-04-20 00:00:00'
ORDER BY
    timestamp ASC;
```

2\. 按模型维度分组统计成本

提取 attributes 中的模型与提供商维度，统计各模型的累计成本，适用于成本核算场景：

```sql
SELECT
    attributes->'openclaw.model' AS model_name,
    attributes->'openclaw.provider' AS provider,
    value AS cost_usd
FROM
    opsRobot.otel_metrics_sum
WHERE
    metric_name = 'openclaw.cost.usd'
    AND timestamp >= '2026-04-20 00:00:00'
    AND timestamp < '2026-04-21 00:00:00'
ORDER BY
    cost_usd DESC;
```

3\. 查询会话状态变更原因分布

提取 attributes 中的 state 和 reason 维度，统计会话状态转换的各类原因及对应计数：

```sql
SELECT
    attributes->'openclaw.state' AS session_state,
    attributes->'openclaw.reason' AS transition_reason,
    value AS transition_count
FROM
    opsRobot.otel_metrics_sum
WHERE
    metric_name = 'openclaw.session.state'
    AND timestamp >= '2026-04-20 00:00:00'
    AND timestamp < '2026-04-21 00:00:00'
ORDER BY
    transition_count DESC;
```

4\. 基于 resource\_attributes 资源属性过滤指定主机数据

通过资源属性字段过滤指定主机的监控指标，适用于多实例集群监控场景：

```sql
SELECT
    timestamp,
    metric_name,
    value
FROM
    opsRobot.otel_metrics_sum
WHERE
    resource_attributes->'host.name' = 'leondeMac-mini.local'
    AND metric_name LIKE 'openclaw.%'
ORDER BY
    timestamp DESC;
```

***

# otel\_metrics\_histogram（直方图分布型指标）

## 一、基本信息

| 字段项                    | 详情说明                                                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 数据名称                   | OpenClaw 数字员工直方图分布型运行监控指标集（OpenClaw Runtime Histogram Metrics）                                                               |
| 原始路径 (OpenClaw 原始数据来源) | OpenClaw Gateway 内置 OTel Meter Provider，通过 OpenTelemetry SDK 自动采集网关运行时指标并经 OTLP Exporter 推送至 Collector                       |
| 数据内容                   | 基于 OpenTelemetry SDK 采集的 OpenClaw 网关直方图分布型时序指标，覆盖消息处理耗时、Agent Run 执行耗时、队列等待时间、队列深度、上下文窗口大小与使用量五大核心监控域，聚合类型为 Cumulative       |
| 数据库                    | opsRobot                                                                                                                     |
| 数据表                    | otel\_metrics\_histogram                                                                                                     |
| 用途定位                   | 标准化存储 OpenClaw 网关运行的直方图分布型可观测指标，构建数字员工运维监控的时序数据底座，支撑消息处理性能分析、Agent Run 耗时分布、队列瓶颈定位、上下文窗口利用率评估等核心运维场景                         |
| 应用场景                   | 1. 消息处理耗时分布分析与性能瓶颈定位 2. Agent Run 执行耗时分布监控与优化 3. 队列等待时间与深度监控，调度策略优化 4. 上下文窗口利用率分析，模型选型与参数调优 5. 运维自动化平台、可观测性系统的 OpenClaw 数据供给 |

## 二、数据字段

### 2.1 数据表列

| 字段名称                     | 字段类型                                                                  | 字段说明                                | 字段示例                                                                       |
| ------------------------ | --------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------- |
| service\_name            | varchar(200)                                                          | 服务名称，标识指标所属的服务实例                    | openclaw                                                                   |
| timestamp                | datetime(6)                                                           | 指标采集的时间戳，精度为微秒，是指标的核心时序字段           | 2026-04-20 06:26:04.000000                                                 |
| service\_instance\_id    | varchar(200)                                                          | 服务实例 ID，标识指标所属的具体实例，无实例归属时为空        | ''                                                                         |
| metric\_name             | varchar(200)                                                          | 指标名称，OpenClaw 监控指标的唯一标识，核心查询维度      | openclaw\.queue.wait\_ms                                                   |
| metric\_description      | string                                                                | 指标的文本描述，说明指标的业务含义                   | Queue wait time before execution                                           |
| metric\_unit             | string                                                                | 指标的计量单位                             | ms                                                                         |
| attributes               | variant                                                               | 指标的维度标签，JSON 格式存储，用于指标的过滤与分组，核心维度字段 | {"openclaw":{"lane":"session:temp:slug-generator"}}                        |
| start\_time              | datetime(6)                                                           | 指标采集的起始时间，累计型指标的统计起始时间，精度为微秒        | 2026-04-20 06:26:00.000000                                                 |
| count                    | bigint(20)                                                            | 直方图采样总次数                            | 1                                                                          |
| sum                      | double                                                                | 直方图采样值总和                            | 0                                                                          |
| bucket\_counts           | array\<bigint(20)>                                                    | 直方图各桶的计数数组，与 explicit\_bounds 一一对应  | \[1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]                          |
| explicit\_bounds         | array\<double>                                                        | 直方图桶的显式边界值数组，定义各桶的上下界               | \[0, 5, 10, 25, 50, 75, 100, 250, 500, 750, 1000, 2500, 5000, 7500, 10000] |
| exemplars                | array\<struct\<map\<string,string>,datetime(6),double,string,string>> | 指标的采样数据数组，存储链路追踪关联的采样数据，无采样时为空数组    | \[]                                                                        |
| min                      | double                                                                | 直方图采样值的最小值                          | 0                                                                          |
| max                      | double                                                                | 直方图采样值的最大值                          | 0                                                                          |
| aggregation\_temporality | string                                                                | 指标聚合时间性，Cumulative 表示累计聚合           | Cumulative                                                                 |
| resource\_attributes     | variant                                                               | 资源属性，JSON 格式存储，标识指标来源的资源信息          | {"host":{"arch":"arm64","name":"leondeMac-mini.local"},...}                |
| scope\_name              | string                                                                | 指标采集器的作用域名称，标识指标的采集模块来源             | openclaw                                                                   |
| scope\_version           | string                                                                | 指标采集器的版本号                           | ''                                                                         |

### 2.2 JSON 扩展字段

本章节对表中 Variant / 复杂结构体类型的 JSON 扩展字段进行平铺拆解，明确各子字段的定义与用法。

#### 2.2.1 attributes 指标维度字段

attributes 为指标的核心维度标签，所有维度子字段均嵌套在 `openclaw` 命名空间下，不同指标类型对应不同的维度子字段，完整定义如下：

| 字段路径                          | 字段类型 | 字段说明    | 适用指标                                                                               | 字段示例                                                     |
| ----------------------------- | ---- | ------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------- |
| attributes.openclaw\.channel  | 字符串  | 消息来源渠道  | openclaw\.message.duration\_ms、openclaw\.run.duration\_ms、openclaw\.context.tokens | webchat                                                  |
| attributes.openclaw\.model    | 字符串  | 使用的模型标识 | openclaw\.run.duration\_ms、openclaw\.context.tokens                                | MiniMax-M2.7                                             |
| attributes.openclaw\.provider | 字符串  | 模型提供商标识 | openclaw\.run.duration\_ms、openclaw\.context.tokens                                | minimax-cn                                               |
| attributes.openclaw\.outcome  | 字符串  | 消息处理结果  | openclaw\.message.duration\_ms                                                     | completed                                                |
| attributes.openclaw\.source   | 字符串  | 消息来源类型  | openclaw\.queue.depth                                                              | dispatch                                                 |
| attributes.openclaw\.lane     | 字符串  | 队列通道标识  | openclaw\.queue.wait\_ms、openclaw\.queue.depth                                     | main、session:agent:main:main、session:temp:slug-generator |
| attributes.openclaw\.context  | 字符串  | 上下文窗口类型 | openclaw\.context.tokens                                                           | used、limit                                               |

#### 2.2.2 resource\_attributes 资源属性字段

resource\_attributes 用于标识指标来源的主机 / 进程 / 服务元信息，为可扩展 JSON 结构，核心子字段定义如下：

| 字段路径                                             | 字段类型  | 字段说明      | 字段示例                                                                                                                                   |
| ------------------------------------------------ | ----- | --------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| resource\_attributes.host.name                   | 字符串   | 主机名称      | leondeMac-mini.local                                                                                                                   |
| resource\_attributes.host.arch                   | 字符串   | 主机 CPU 架构 | arm64                                                                                                                                  |
| resource\_attributes.process.command             | 字符串   | 进程启动命令    | /opt/homebrew/lib/node\_modules/openclaw/dist/index.js                                                                                 |
| resource\_attributes.process.command\_args       | 字符串数组 | 进程启动参数列表  | \["/opt/homebrew/Cellar/node/25.8.0/bin/node", "/opt/homebrew/lib/node\_modules/openclaw/dist/index.js", "gateway", "--port", "18789"] |
| resource\_attributes.process.executable.name     | 字符串   | 可执行文件名称   | openclaw-gateway                                                                                                                       |
| resource\_attributes.process.executable.path     | 字符串   | 可执行文件路径   | /opt/homebrew/Cellar/node/25.8.0/bin/node                                                                                              |
| resource\_attributes.process.owner               | 字符串   | 进程所属用户    | leon                                                                                                                                   |
| resource\_attributes.process.pid                 | 数值    | 进程 ID     | 75531                                                                                                                                  |
| resource\_attributes.process.runtime.name        | 字符串   | 运行时名称     | nodejs                                                                                                                                 |
| resource\_attributes.process.runtime.version     | 字符串   | 运行时版本     | 25.8.0                                                                                                                                 |
| resource\_attributes.process.runtime.description | 字符串   | 运行时描述     | Node.js                                                                                                                                |
| resource\_attributes.service.name                | 字符串   | 服务名称      | openclaw                                                                                                                               |

#### 2.2.3 exemplars 采样示例字段

exemplars 为数组结构体类型，存储指标关联的链路追踪采样数据，数组内单个元素的子字段定义如下：

| 字段路径                              | 字段类型                | 字段说明          | 字段示例                             |
| --------------------------------- | ------------------- | ------------- | -------------------------------- |
| exemplars\[].filtered\_attributes | map\<string,string> | 采样数据的过滤标签键值对  | {"http.status\_code":"200"}      |
| exemplars\[].timestamp            | datetime(6)         | 采样数据的时间戳      | 2026-04-20 06:26:04.000000       |
| exemplars\[].value                | double              | 采样数据对应的指标值    | 0.0                              |
| exemplars\[].span\_id             | 字符串                 | 链路追踪的 SpanID  | abc123def456                     |
| exemplars\[].trace\_id            | 字符串                 | 链路追踪的 TraceID | 1234567890abcdef1234567890abcdef |

#### 2.2.4 bucket\_counts 与 explicit\_bounds 直方图桶字段

直方图型指标通过 bucket\_counts 和 explicit\_bounds 两个数组联合描述值的分布情况。explicit\_bounds 定义桶边界，bucket\_counts 记录各桶内的计数，二者长度关系为 `len(bucket_counts) = len(explicit_bounds) + 1`（末尾桶为 +Inf 溢出桶）。

以默认桶边界为例：

| 桶序号 | 桶范围           | explicit\_bounds 值 | bucket\_counts 含义    |
| --- | ------------- | ------------------ | -------------------- |
| 0   | (-Inf, 0]     | 0                  | 值 ≤ 0 的计数            |
| 1   | (0, 5]        | 5                  | 0 < 值 ≤ 5 的计数        |
| 2   | (5, 10]       | 10                 | 5 < 值 ≤ 10 的计数       |
| 3   | (10, 25]      | 25                 | 10 < 值 ≤ 25 的计数      |
| 4   | (25, 50]      | 50                 | 25 < 值 ≤ 50 的计数      |
| 5   | (50, 75]      | 75                 | 50 < 值 ≤ 75 的计数      |
| 6   | (75, 100]     | 100                | 75 < 值 ≤ 100 的计数     |
| 7   | (100, 250]    | 250                | 100 < 值 ≤ 250 的计数    |
| 8   | (250, 500]    | 500                | 250 < 值 ≤ 500 的计数    |
| 9   | (500, 750]    | 750                | 500 < 值 ≤ 750 的计数    |
| 10  | (750, 1000]   | 1000               | 750 < 值 ≤ 1000 的计数   |
| 11  | (1000, 2500]  | 2500               | 1000 < 值 ≤ 2500 的计数  |
| 12  | (2500, 5000]  | 5000               | 2500 < 值 ≤ 5000 的计数  |
| 13  | (5000, 7500]  | 7500               | 5000 < 值 ≤ 7500 的计数  |
| 14  | (7500, 10000] | 10000              | 7500 < 值 ≤ 10000 的计数 |
| 15  | (10000, +Inf) | —                  | 值 > 10000 的计数        |

#### 2.2.5 指标名称与维度对照表

| 指标名称                           | 指标描述             | 计量单位 | attributes.openclaw 维度            |
| ------------------------------ | ---------------- | ---- | --------------------------------- |
| openclaw\.message.duration\_ms | 消息处理耗时分布         | ms   | channel, outcome                  |
| openclaw\.run.duration\_ms     | Agent Run 执行耗时分布 | ms   | channel, model, provider          |
| openclaw\.queue.wait\_ms       | 队列等待时间分布         | ms   | lane                              |
| openclaw\.queue.depth          | 队列深度分布           | 1    | lane / channel                    |
| openclaw\.context.tokens       | 上下文窗口大小与使用量分布    | 1    | channel, model, provider, context |

## 三、使用示例

本章节基于 Apache Doris SQL 语法，提供 otel\_metrics\_histogram 表的常用查询示例，覆盖基础字段查询与 JSON 扩展字段查询两大核心场景。

### 3.1 数据表列查询示例

1\. 查询消息处理耗时的直方图统计

查询消息处理耗时的直方图分布数据，适用于消息处理性能分析场景：

```sql
SELECT
    timestamp,
    metric_name,
    count,
    sum,
    min,
    max,
    bucket_counts,
    explicit_bounds,
    metric_unit
FROM
    opsRobot.otel_metrics_histogram
WHERE
    metric_name = 'openclaw.message.duration_ms'
    AND timestamp >= '2026-04-20 00:00:00'
ORDER BY
    timestamp DESC
LIMIT 10;
```

2\. 查询队列等待时间分布

查询队列等待时间的直方图分布，适用于队列调度瓶颈分析场景：

```sql
SELECT
    timestamp,
    count,
    sum,
    min,
    max,
    bucket_counts,
    explicit_bounds
FROM
    opsRobot.otel_metrics_histogram
WHERE
    metric_name = 'openclaw.queue.wait_ms'
    AND timestamp >= '2026-04-20 00:00:00'
ORDER BY
    timestamp DESC
LIMIT 10;
```

3\. 查询 Agent Run 执行耗时统计

查询 Agent Run 执行耗时的直方图分布数据，适用于运行性能监控场景：

```sql
SELECT
    timestamp,
    metric_name,
    count,
    sum,
    min,
    max,
    metric_unit
FROM
    opsRobot.otel_metrics_histogram
WHERE
    metric_name = 'openclaw.run.duration_ms'
    AND timestamp >= '2026-04-20 00:00:00'
ORDER BY
    timestamp DESC
LIMIT 10;
```

### 3.2 JSON 扩展字段查询示例

1\. 过滤查询指定队列通道的等待时间

提取 attributes 中的 lane 维度，查询指定通道的队列等待时间分布，适用于队列瓶颈定位场景：

```sql
SELECT
    timestamp,
    count,
    sum,
    min,
    max,
    bucket_counts,
    explicit_bounds
FROM
    opsRobot.otel_metrics_histogram
WHERE
    metric_name = 'openclaw.queue.wait_ms'
    AND attributes->'openclaw.lane' = 'main'
    AND timestamp >= '2026-04-20 00:00:00'
ORDER BY
    timestamp DESC
LIMIT 10;
```

2\. 使用 json\_extract 函数查询上下文窗口利用率

使用 json\_extract 函数提取深层级 JSON 字段，查询上下文窗口的使用量与限制值：

```sql
SELECT
    timestamp,
    json_extract(attributes, '$.openclaw.model') AS model_name,
    json_extract(attributes, '$.openclaw.context') AS context_type,
    sum,
    count,
    min,
    max
FROM
    opsRobot.otel_metrics_histogram
WHERE
    metric_name = 'openclaw.context.tokens'
    AND json_extract(attributes, '$.openclaw.context') IN ('used', 'limit')
    AND timestamp >= '2026-04-20 00:00:00'
ORDER BY
    timestamp DESC;
```

3\. 计算消息处理耗时的百分位数近似值

基于直方图的 bucket\_counts 和 explicit\_bounds 计算消息处理耗时的 P50 / P90 / P99 近似值：

```sql
SELECT
    metric_name,
    count AS total_count,
    sum AS total_duration_ms,
    (sum / count) AS avg_duration_ms,
    min,
    max
FROM
    opsRobot.otel_metrics_histogram
WHERE
    metric_name = 'openclaw.message.duration_ms'
    AND timestamp >= '2026-04-20 00:00:00'
    AND timestamp < '2026-04-21 00:00:00'
ORDER BY
    timestamp DESC;
```

4\. 基于 resource\_attributes 资源属性过滤指定主机数据

通过资源属性字段过滤指定主机的监控指标，适用于多实例集群监控场景：

```sql
SELECT
    timestamp,
    metric_name,
    count,
    sum,
    min,
    max
FROM
    opsRobot.otel_metrics_histogram
WHERE
    resource_attributes->'host.name' = 'leondeMac-mini.local'
    AND metric_name LIKE 'openclaw.%'
ORDER BY
    timestamp DESC;
```

> （注：文档部分内容可能由 AI 生成）

