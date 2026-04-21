# 主机系统监控指标数据规范（system\_monitor）

本文档为基于 OpenTelemetry 采集的主机系统监控指标数据规范，涵盖数据元信息、字段定义、查询使用全流程说明，适配 Apache Doris 数据库存储引擎。

# 一、基本信息

| 字段项                    | 详情说明                                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 数据名称                   | 主机系统运行监控指标集（System Host Metrics）                                                                                              |
| 原始路径 (OpenClaw 原始数据来源) | github.com/open-telemetry/opentelemetry-collector-contrib/receiver/hostmetricsreceiver（版本：v0.144.0）                           |
| 数据内容                   | 基于 OpenTelemetry Collector 主机指标采集器获取的 Windows 主机全维度运行时序数据，覆盖 CPU、内存、磁盘、网络、系统负载五大核心监控域，分为累计型（Cumulative）时序指标和瞬时型（Gauge）时序指标两大类 |
| 数据库                    | opsRobot                                                                                                                      |
| 数据表                    | 1. host\_metrics\_sum：累计型主机指标数据表2. host\_metrics\_gauge：瞬时型主机指标数据表                                                            |
| 用途定位                   | 标准化存储主机硬件与操作系统运行的全量可观测指标，构建主机运维监控的时序数据底座，支撑主机健康度评估、性能瓶颈分析、故障根因排查、资源容量规划等核心运维场景                                                |
| 应用场景                   | 1. 主机实时性能监控与异常阈值告警2. 系统故障根因定位与历史运行状态回溯3. 主机 CPU / 内存 / 磁盘 / 网络资源利用率分析与优化4. 运维自动化平台、可观测性系统的主机数据供给5. 服务器资产容量规划与资源成本管控           |

# 二、数据字段

host\_metrics\_sum 与 host\_metrics\_gauge 两张数据表的表结构完全一致，仅存储的指标聚合类型不同，以下为完整的字段定义说明。

## 2.1 数据表列

| 字段名称                  | 字段类型                                                                                                                                       | 字段说明                                | 字段示例                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| service\_name         | varchar(200)                                                                                                                               | 服务名称，标识指标所属的服务实例，无服务归属时为空           | \&#39;\&#39;                                                                                                       |
| timestamp             | datetime(6)                                                                                                                                | 指标采集的时间戳，精度为微秒，是指标的核心时序字段           | 2026-04-20 15:43:19.305829                                                                                         |
| service\_instance\_id | varchar(200)                                                                                                                               | 服务实例 ID，标识指标所属的具体实例，无实例归属时为空        | \&#39;\&#39;                                                                                                       |
| metric\_name          | varchar(200)                                                                                                                               | 指标名称，主机监控指标的唯一标识，核心查询维度             | system.cpu.time                                                                                                    |
| metric\_description   | text                                                                                                                                       | 指标的文本描述，说明指标的业务含义                   | Total seconds each logical CPU spent on each mode.                                                                 |
| metric\_unit          | text                                                                                                                                       | 指标的计量单位                             | s                                                                                                                  |
| attributes            | variant                                                                                                                                    | 指标的维度标签，JSON 格式存储，用于指标的过滤与分组，核心维度字段 | {\&#34;cpu\&#34;:\&#34;cpu0\&#34;,\&#34;state\&#34;:\&#34;user\&#34;}                                              |
| start\_time           | datetime(6)                                                                                                                                | 指标采集的起始时间，累计型指标的统计起始时间，精度为微秒        | 2026-04-16 17:42:10.000000                                                                                         |
| value                 | double                                                                                                                                     | 指标的数值，核心度量字段                        | 2526.578125                                                                                                        |
| exemplars             | array\&lt;struct\&lt;filtered\_attributes:map\&lt;text,text\&gt;,timestamp:datetime(6),value:double,span\_id:text,trace\_id:text\&gt;\&gt; | 指标的采样数据数组，存储链路追踪关联的采样数据，无采样时为空数组    | \[]                                                                                                                |
| resource\_attributes  | variant                                                                                                                                    | 资源属性，JSON 格式存储，标识指标来源的资源信息，无额外属性时为空 | {}                                                                                                                 |
| scope\_name           | text                                                                                                                                       | 指标采集器的作用域名称，标识指标的采集模块来源             | github.com/open-telemetry/opentelemetry-collector-contrib/receiver/hostmetricsreceiver/internal/scraper/cpuscraper |
| scope\_version        | text                                                                                                                                       | 指标采集器的版本号                           | 0.144.0                                                                                                            |

## 2.2 JSON 扩展字段

本章节对表中 Variant / 复杂结构体类型的 JSON 扩展字段进行平铺拆解，明确各子字段的定义与用法。

### 2.2.1 attributes 指标维度字段

attributes 为指标的核心维度标签，不同监控域的指标对应不同的维度子字段，完整定义如下：

| 字段路径                  | 字段类型 | 字段说明                                  | 字段示例                        |
| --------------------- | ---- | ------------------------------------- | --------------------------- |
| attributes.cpu        | 字符串  | CPU 核心编号，仅 CPU 类指标携带                  | cpu0                        |
| attributes.state      | 字符串  | 指标状态维度，CPU 类指标为运行模式，内存 / 文件系统类指标为使用状态 | user、free、used              |
| attributes.device     | 字符串  | 设备标识，磁盘 / 网络类指标携带，标识磁盘分区 / 网卡名称       | C:、D:、以太网、Meta              |
| attributes.direction  | 字符串  | 数据传输方向，磁盘 / 网络类指标携带                   | read、write、receive、transmit |
| attributes.mode       | 字符串  | 文件系统挂载模式，仅文件系统类指标携带                   | rw                          |
| attributes.mountpoint | 字符串  | 文件系统挂载点，仅文件系统类指标携带                    | C:、D:                       |
| attributes.type       | 字符串  | 文件系统类型，仅文件系统类指标携带                     | NTFS                        |
| attributes.protocol   | 字符串  | 网络协议类型，仅网络连接类指标携带                     | tcp                         |

### 2.2.2 resource\_attributes 资源属性字段

resource\_attributes 用于标识指标来源的主机 / 资源元信息，为可扩展 JSON 结构，核心子字段定义如下：

| 字段路径                            | 字段类型 | 字段说明   | 字段示例              |
| ------------------------------- | ---- | ------ | ----------------- |
| resource\_attributes.host.name  | 字符串  | 主机名称   | windows-server-01 |
| resource\_attributes.host.id    | 字符串  | 主机唯一标识 | host-123456       |
| resource\_attributes.os.type    | 字符串  | 操作系统类型 | windows           |
| resource\_attributes.os.version | 字符串  | 操作系统版本 | 10.0.17763        |

### 2.2.3 exemplars 采样示例字段

exemplars 为数组结构体类型，存储指标关联的链路追踪采样数据，数组内单个元素的子字段定义如下：

| 字段路径                              | 字段类型                   | 字段说明          | 字段示例                                            |
| --------------------------------- | ---------------------- | ------------- | ----------------------------------------------- |
| exemplars\[].filtered\_attributes | map\&lt;text,text\&gt; | 采样数据的过滤标签键值对  | {\&#34;http.status\_code\&#34;:\&#34;200\&#34;} |
| exemplars\[].timestamp            | datetime(6)            | 采样数据的时间戳      | 2026-04-20 15:43:19.305829                      |
| exemplars\[].value                | double                 | 采样数据对应的指标值    | 2526.578125                                     |
| exemplars\[].span\_id             | 字符串                    | 链路追踪的 SpanID  | abc123def456                                    |
| exemplars\[].trace\_id            | 字符串                    | 链路追踪的 TraceID | 1234567890abcdef1234567890abcdef                |

# 三、使用示例

本章节基于 Apache Doris SQL 语法，提供主机监控指标的常用查询示例，覆盖基础字段查询与 JSON 扩展字段查询两大核心场景。

## 3.1 数据表列查询示例

1\. 按时间范围查询指定指标的时序数据

查询 2026-04-20 当天 CPU 时间指标的全量采集数据，适用于指标趋势分析场景：

```sql
SELECT 
    timestamp,
    metric_name,
    attributes,
    value,
    metric_unit
FROM 
    opsRobot.host_metrics_sum
WHERE 
    metric_name = 'system.cpu.time'
    AND timestamp >= '2026-04-20 00:00:00'
    AND timestamp < '2026-04-21 00:00:00'
ORDER BY 
    timestamp ASC;
```

2\. 查询主机 CPU 负载的最新瞬时指标

查询最新采集的 1 分钟 / 5 分钟 / 15 分钟 CPU 负载数据，适用于实时监控大盘场景：

```sql
SELECT 
    timestamp,
    metric_name,
    value,
    metric_unit
FROM 
    opsRobot.host_metrics_gauge
WHERE 
    metric_name IN ('system.cpu.load_average.1m', 'system.cpu.load_average.5m', 'system.cpu.load_average.15m')
ORDER BY 
    timestamp DESC
LIMIT 3;
```

3\. 统计指定时间段内磁盘读写总流量

统计 C 盘和 D 盘在指定时间范围内的读写字节总量，适用于磁盘资源用量统计场景：

```sql
SELECT 
    attributes->'device' AS disk_device,
    attributes->'direction' AS io_direction,
    MAX(value) - MIN(value) AS io_total_bytes,
    metric_unit
FROM 
    opsRobot.host_metrics_sum
WHERE 
    metric_name = 'system.disk.io'
    AND timestamp >= '2026-04-20 00:00:00'
    AND timestamp < '2026-04-21 00:00:00'
    AND attributes->'device' IN ('C:', 'D:')
GROUP BY 
    disk_device, io_direction, metric_unit;
```

4\. 查询主机内存使用实时状态

查询最新的内存使用与空闲容量数据，适用于主机资源健康度检查场景：

```sql
SELECT 
    timestamp,
    attributes->'state' AS memory_state,
    value / 1024 / 1024 / 1024 AS memory_gb,
    metric_unit
FROM 
    opsRobot.host_metrics_sum
WHERE 
    metric_name = 'system.memory.usage'
ORDER BY 
    timestamp DESC
LIMIT 2;
```

## 3.2 JSON 扩展字段查询示例

1\. 基于 attributes 维度过滤查询指定 CPU 核心的用户态耗时

Doris 中 Variant 类型支持-\&gt;运算符直接提取 JSON 子字段，可快速完成维度过滤：

```sql
SELECT 
    timestamp,
    value AS user_cpu_time_seconds
FROM 
    opsRobot.host_metrics_sum
WHERE 
    metric_name = 'system.cpu.time'
    AND attributes->'cpu' = 'cpu0'
    AND attributes->'state' = 'user'
    AND timestamp >= '2026-04-20 00:00:00'
ORDER BY 
    timestamp ASC;
```

2\. 按网卡维度分组统计网络流量

提取 attributes 中的网卡设备维度，统计各网卡的接收 / 发送字节总量，适用于网络流量监控场景：

```sql
SELECT 
    attributes->'device' AS network_device,
    attributes->'direction' AS traffic_direction,
    MAX(value) - MIN(value) AS total_bytes,
    (MAX(value) - MIN(value)) / 1024 / 1024 AS total_mb
FROM 
    opsRobot.host_metrics_sum
WHERE 
    metric_name = 'system.network.io'
    AND timestamp >= '2026-04-20 00:00:00'
    AND timestamp< '2026-04-21 00:00:00'
GROUP BY 
    network_device, traffic_direction
HAVING 
    total_bytes > 0
ORDER BY 
    total_bytes DESC;
```

3\. 过滤查询 TCP 不同连接状态的数量

提取 attributes 中的协议与连接状态维度，查询 TCP 各状态的实时连接数，适用于网络连接健康度分析：

```sql
SELECT 
    attributes->'state' AS tcp_connection_state,
    value AS connection_count
FROM 
    opsRobot.host_metrics_sum
WHERE 
    metric_name = 'system.network.connections'
    AND attributes->'protocol' = 'tcp'
    AND timestamp = (
        SELECT MAX(timestamp) 
        FROM opsRobot.host_metrics_sum 
        WHERE metric_name = 'system.network.connections'
    )
ORDER BY 
    connection_count DESC;
```

4\. 多层级 JSON 字段查询与过滤

使用json\_extract函数提取深层级 JSON 字段，结合维度过滤查询指定磁盘分区的读写操作次数：

```sql
SELECT 
    timestamp,
    json_extract(attributes, '$.device') AS disk_device,
    json_extract(attributes, '$.direction') AS io_direction,
    value AS operation_count
FROM 
    opsRobot.host_metrics_sum
WHERE 
    metric_name = 'system.disk.operations'
    AND json_extract(attributes, '$.device') = 'D:'
    AND timestamp BETWEEN '2026-04-20 12:00:00' AND '2026-04-20 18:00:00'
ORDER BY 
    timestamp ASC;
```

5\. 基于 resource\_attributes 资源属性过滤多主机数据

通过资源属性字段过滤指定主机的监控指标，适用于多主机集群监控场景：

```sql
SELECT 
    timestamp,
    metric_name,
    value
FROM 
    opsRobot.host_metrics_gauge
WHERE 
    resource_attributes->'host.name' = 'windows-server-01'
    AND metric_name LIKE 'system.cpu.load_average%'
ORDER BY 
    timestamp DESC;
```

> （注：文档部分内容可能由 AI 生成）

