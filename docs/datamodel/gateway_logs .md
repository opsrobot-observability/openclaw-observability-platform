# gatewayLogs 数据表详细说明

# 一、基本信息


| 信息类别 | 具体内容                                                                                                                                                                                                             |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 数据名称 | gatewaylogs（网关日志数据）                                                                                                                                                                                              |
| 原始路径 | ~/openclaw/logs/openclaw-YYYY-MM-DD.log                                                                                                                                                                          |
| 数据内容 | 存储OpenClaw系统网关相关日志信息，涵盖ws模块（WebSocket）、openclawobservability（可观测性）、openclawobservabilitysecurity（安全可观测性）、agents/modelproviders（模型提供商）等模块的操作日志、错误日志、状态日志，记录审计时间、模块名称、日志级别及动态审计属性等核心信息。                            |
| 数据库  | opsRobot                                                                                                                                                                                                         |
| 数据表  | gateway_logs                                                                                                                                                                                                     |
| 用途定位 | 用于记录OpenClaw系统网关的各类操作及运行状态，提供日志审计、错误排查、安全监控、性能分析等数据支撑，追踪网关连接、模型调用、工具调用等核心操作的全流程，为系统运维和问题定位提供依据。                                                                                                                  |
| 应用场景 | 1 错误排查：查询ws模块的token mismatch错误日志，定位客户端与网关的认证问题；2 安全审计：通过openclawobservabilitysecurity模块日志，监测数据泄露等安全风险；3 性能分析：统计工具调用、模型调用的耗时，评估系统运行性能；4 运维监控：追踪网关连接状态、配置读取等操作，确保网关正常运行；5 操作追溯：查询特定时间段内的日志，追溯模型调用、工具执行等核心操作流程。 |


# 二、数据字段

## 21 数据表列


| 字段名称          | 字段类型      | 字段说明                              | 字段示例                                                                                                                                                               |
| ------------- | --------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| id            | bigint    | 日志唯一标识，自增主键（自增起始值为1）              | 54                                                                                                                                                                 |
| eventtime     | datetime  | 日志审计时间，非空字段                       | 20260323 11:20:01                                                                                                                                                  |
| module        | varchar64 | 日志所属模块，默认值为空字符串，非空字段              | ws、openclawobservability                                                                                                                                           |
| level         | varchar64 | 日志级别，默认值为空字符串，非空字段，常见值为error、info | error、info                                                                                                                                                         |
| logattributes | variant   | 动态审计属性，存储日志的详细信息，格式为JSON字符串，非空字段  | 34;20260323T11:20:0131908:00 ws unauthorized conn=772913ea0c324c37b2815194ece403ca remote=127001 client=openclawcontrolui webchat v2026313 reason=tokenmismatch34; |


## 22 JSON扩展字段

说明：logattributes字段为variant类型，存储JSON格式字符串，根据日志模块不同，JSON字段存在差异，以下为常见场景的JSON扩展字段平铺展示（覆盖所有日志类型的核心字段）：


| 字段路径                       | 字段类型    | 字段说明                                                                     | 字段示例                                                                                                      |
| -------------------------- | ------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| logattributesdatetime      | varchar | 日志具体时间（带时区）                                                              | 20260323T11:20:0131908:00                                                                                 |
| logattributesmodule        | varchar | 日志所属模块（与数据表module字段一致，JSON中冗余存储）                                         | ws、openclawobservability                                                                                  |
| logattributesconn          | varchar | WebSocket连接唯一标识（仅ws模块日志存在）                                               | 772913ea0c324c37b2815194ece403ca                                                                          |
| logattributesremote        | varchar | 远程连接地址（仅ws模块日志存在）                                                        | 127001                                                                                                    |
| logattributesclient        | varchar | 客户端信息（仅ws模块日志存在）                                                         | openclawcontrolui webchat v2026313                                                                        |
| logattributesreason        | varchar | 错误原因（仅error级别日志存在）                                                       | tokenmismatch、unauthorized: gateway token mismatch                                                        |
| logattributesfwd           | varchar | 转发地址（仅ws模块日志存在，无转发时为n/a）                                                 | n/a                                                                                                       |
| logattributesorigin        | varchar | 请求来源地址（仅ws模块日志存在）                                                        | [http://127001:18789](http://127.0.0.1:18789)                                                             |
| logattributeshost          | varchar | 请求主机地址（仅ws模块日志存在）                                                        | 127001:18789                                                                                              |
| logattributesua            | varchar | 客户端浏览器标识（仅ws模块日志存在）                                                      | Mozilla/50 Macintosh; Intel Mac OS X 10157 AppleWebKit/53736 KHTML, like Gecko Chrome/146000 Safari/53736 |
| logattributescode          | int     | 连接关闭状态码（仅ws模块closed before connect日志存在）                                  | 1008                                                                                                      |
| logattributestool          | varchar | 工具名称（仅openclawobservability模块toolcall相关日志存在）                             | read、exec、edit、sessionsspawn、process                                                                      |
| logattributessession       | varchar | 会话唯一标识（仅openclawobservability、openclawobservabilitysecurity模块日志存在）       | 803b7bd2e8394924a68dffaf1af07f61、bdde461ca82548208455f6dea4850912                                         |
| logattributescallId        | varchar | 工具调用唯一标识（仅openclawobservability模块beforetoolcall日志存在）                     | callfunctionmo38xi7cqvd01                                                                                 |
| logattributesduration      | int     | 操作耗时（单位：ms，仅openclawobservability模块aftertoolcall、agentend、llmoutput日志存在） | 62ms、3394ms、3436ms                                                                                        |
| logattributesmodel         | varchar | 模型名称（仅openclawobservability模块llminput、llmoutput日志存在）                     | MiniMaxM27、minimaxcn/MiniMaxM27                                                                           |
| logattributestokens        | varchar | 模型输入输出token数量（仅openclawobservability模块llmoutput日志存在）                     | 38/58                                                                                                     |
| logattributescacher        | int     | 缓存读取量（仅openclawobservability模块llmoutput日志存在）                             | 13574                                                                                                     |
| logattributescachew        | int     | 缓存写入量（仅openclawobservability模块llmoutput日志存在）                             | 113                                                                                                       |
| logattributesmsgs          | int     | 消息数量（仅openclawobservability模块beforepromptbuild日志存在）                      | 73、190                                                                                                    |
| logattributesrunId         | varchar | 模型运行唯一标识（仅openclawobservability模块llminput日志存在）                           | 21244c4ce0b146ecaa7d66a8476da997                                                                          |
| logattributeschannel       | varchar | 渠道名称（仅openclawobservability模块llminput日志存在）                               | webchat                                                                                                   |
| logattributesimages        | int     | 图片数量（仅openclawobservability模块llminput日志存在）                               | 0                                                                                                         |
| logattributesmediaParts    | int     | 媒体部分数量（仅openclawobservability模块llminput日志存在）                             | 0                                                                                                         |
| logattributessecuritychain | varchar | 安全攻击链描述（仅openclawobservabilitysecurity模块日志存在）                            | Data exfiltration chain: read sensitive file outbound request                                             |
| logattributessecuritylevel | varchar | 安全级别（仅openclawobservabilitysecurity模块日志存在）                               | CRITICAL                                                                                                  |
| logattributessecuritycode  | varchar | 安全告警编码（仅openclawobservabilitysecurity模块日志存在）                             | CHAIN001                                                                                                  |


# 三、使用示例

说明：以下示例均使用 Doris 查询语法，基于 opsRobot 数据库、gatewaylogs 数据表，涵盖数据表列查询和 JSON 扩展字段查询，适配 Doris 对 variant 类型字段的 JSON 解析语法。

## 31 数据表列查询示例

示例1：查询2026年3月23日ws模块的所有错误日志，展示日志唯一标识、审计时间、日志级别及动态审计属性

```sql
-- 数据表列查询：ws模块错误日志查询
SELECT 
  id,
  event_time,
  level,
  log_attributes
FROM 
  opsRobot.gateway_logs
WHERE 
  module = 'ws' 
  AND level = 'error'
  AND event_time BETWEEN '2026-03-23 00:00:00' AND '2026-03-23 23:59:59'
ORDER BY 
  event_time ASC;
```

示例2：查询所有info级别日志，统计各模块的日志数量，按日志数量降序排列

```sql
-- 数据表列查询：各模块info级别日志数量统计
SELECT 
  module,
  COUNT(id) AS log_count
FROM 
  opsRobot.gateway_logs
WHERE 
  level = 'info'
GROUP BY 
  module
ORDER BY 
  log_count DESC;
```

## 32 JSON扩展字段查询示例

示例1：查询因tokenmismatch导致的ws模块错误日志，解析JSON中的连接标识、远程地址和客户端信息

```sql
-- JSON扩展字段查询：token_mismatch错误日志详情
SELECT 
  id,
  event_time,
  log_attributes['conn'] AS conn_id,  -- 解析JSON中的conn字段
  log_attributes['remote'] AS remote_addr,  -- 解析JSON中的remote字段
  log_attributes['client'] AS client_info,  -- 解析JSON中的client字段
  log_attributes['reason'] AS error_reason  -- 解析JSON中的reason字段
FROM 
  opsRobot.gateway_logs
WHERE 
  module = 'ws' 
  AND level = 'error'
  AND log_attributes['reason'] = 'token_mismatch'
ORDER BY 
  event_time ASC;
```

示例2：查询openclawobservability模块工具调用日志，解析工具名称、会话ID和调用耗时，筛选耗时超过50ms的记录

```sql
-- JSON扩展字段查询：工具调用耗时筛选
SELECT 
  id,
  event_time,
  log_attributes['tool'] AS tool_name,  -- 解析JSON中的tool字段
  log_attributes['session'] AS session_id,  -- 解析JSON中的session字段
  log_attributes['duration'] AS tool_duration  -- 解析JSON中的duration字段
FROM 
  opsRobot.gateway_logs
WHERE 
  module = 'openclaw-observability'
  AND level = 'info'
  AND log_attributes['tool'] IS NOT NULL
  AND CAST(SUBSTRING_INDEX(log_attributes['duration'], 'ms', 1) AS INT) > 50  -- 提取耗时数值并筛选
ORDER BY 
  CAST(SUBSTRING_INDEX(log_attributes['duration'], 'ms', 1) AS INT) DESC;
```

示例3：查询安全告警日志，解析安全级别、攻击链描述和会话ID，定位数据泄露相关记录

```sql
-- JSON扩展字段查询：安全告警日志查询
SELECT 
  id,
  event_time,
  log_attributes['security_level'] AS security_level,  -- 解析JSON中的安全级别
  log_attributes['security_chain'] AS attack_chain,  -- 解析JSON中的攻击链描述
  log_attributes['session'] AS session_id  -- 解析JSON中的会话ID
FROM 
  opsRobot.gateway_logs
WHERE 
  module = 'openclaw-observability-security'
  AND log_attributes['security_level'] = 'CRITICAL'
  AND log_attributes['security_chain'] LIKE '%Data exfiltration%';
```

> （注：文档部分内容可能由 AI 生成）

