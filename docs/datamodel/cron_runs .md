# cronRuns 数据源说明文档

# 一、基本信息


| 项目                 | 具体内容                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| 数据名称               | 定时任务执行日志                                                                                       |
| 原始路径OpenClaw原始数据来源 | OpenClaw 中定时任务运行日志的实际存储路径，默认路径为 /openclaw/cron/runs/jobidJSONL                                 |
| 数据内容               | 记录Agent 定时任务全生命周期日志，包括任务执行时间、执行阶段、执行状态、错误信息、调用的AI模型及提供商、Token消耗情况、任务执行摘要、下次执行时间等核心信息           |
| 数据库                | opsRobot                                                                                       |
| 数据表                | cron_runs                                                                                      |
| 用途定位               | 用于定时任务执行监控、失败原因排查、任务性能统计、AI模型调用分析及定时任务执行审计                                                     |
| 应用场景               | 1 定时任务失败告警及根因排查； 2 任务执行耗时统计与性能优化； 3 AI模型调用Token用量统计与成本核算； 4 定时任务执行周期合理性分析与调整； 5 任务执行历史审计追溯 |


# 二、数据字段

## （一）数据表列


| 字段名称           | 字段类型       | 字段说明                                     | 字段示例                                                                                                                        |
| -------------- | ---------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| id             | bigint     | 数据表自增主键ID，唯一标识每条任务执行日志                   | 9                                                                                                                           |
| ts             | bigint     | 日志事件产生的时间戳，单位为毫秒                         | 1776309856401                                                                                                               |
| jobid          | varchar128 | 定时任务的唯一标识ID，用于关联单个定时任务的所有执行记录            | ac2ad6fb3b5d46f783cb71efc90d08d7                                                                                            |
| action         | varchar128 | 任务执行流当前所处的生命周期阶段                         | finished                                                                                                                    |
| status         | varchar128 | 任务执行状态，主要包括error（失败）、success（成功）等        | error                                                                                                                       |
| deliverystatus | varchar128 | 任务执行结果的交付状态                              | unknown                                                                                                                     |
| model          | varchar128 | 任务执行过程中调用的AI模型名称                         | MiniMaxM25                                                                                                                  |
| provider       | varchar128 | AI模型的提供商                                 | bailian2                                                                                                                    |
| logattributes  | variant    | 存储定时任务执行的原始日志信息，格式为JSON字符串，包含任务执行的详细扩展字段 | 34;action34;:34;finished34;,34;deliveryStatus34;:34;unknown34;,34;durationMs34;:22667,34;error34;:34;Channel is required34; |


## （二）JSON扩展字段

说明：JSON扩展字段均来自 logattributes 列（JSON格式），以下为JSON字段平铺展示


| 字段路径                           | 字段类型   | 字段说明                                | 字段示例                                                                                                                                              |
| ------------------------------ | ------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| logattributesaction            | string | 任务执行动作，与数据表中action字段一致              | finished                                                                                                                                          |
| logattributesdeliveryStatus    | string | 任务执行结果的交付状态，与数据表中deliverystatus字段一致 | unknown                                                                                                                                           |
| logattributesdurationMs        | bigint | 任务执行耗时，单位为毫秒                        | 22667                                                                                                                                             |
| logattributeserror             | string | 任务执行失败时的错误信息，执行成功时该字段为空             | Channel is required no configured channels detected Set deliverychannel explicitly or use a main session with a previous channel                  |
| logattributesjobId             | string | 定时任务唯一ID，与数据表中jobid字段一致             | ac2ad6fb3b5d46f783cb71efc90d08d7                                                                                                                  |
| logattributesmodel             | string | 调用的AI模型名称，与数据表中model字段一致            | MiniMaxM25                                                                                                                                        |
| logattributesnextRunAtMs       | bigint | 该定时任务下次执行的时间戳，单位为毫秒                 | 1776309893730                                                                                                                                     |
| logattributesprovider          | string | AI模型提供商，与数据表中provider字段一致           | bailian2                                                                                                                                          |
| logattributesrunAtMs           | bigint | 该次定时任务启动执行的时间戳，单位为毫秒                | 1776309833730                                                                                                                                     |
| logattributessessionId         | string | 任务执行过程中的会话唯一ID                      | 4598cece699b4462a6b58cf4a9a721c7                                                                                                                  |
| logattributessessionKey        | string | 任务执行会话的唯一标识键，用于关联会话相关信息             | agent:main:cron:ac2ad6fb3b5d46f783cb71efc90d08d7:run:4598cece699b4462a6b58cf4a9a721c7                                                             |
| logattributesstatus            | string | 任务执行状态，与数据表中status字段一致              | error                                                                                                                                             |
| logattributessummary           | string | 任务执行结果的摘要信息，描述任务执行的具体内容及结果          | Executed successfully Appended Thu Apr 16 11:24:05 CST 2026 to /Users/lxg/openclaw/workspace/timenowtxt The file now contains 2 timestamp entries |
| logattributests                | bigint | 日志事件产生的时间戳，与数据表中ts字段一致，单位为毫秒        | 1776309856401                                                                                                                                     |
| logattributesusageinputtokens  | bigint | AI模型调用过程中的输入Token数量                 | 14337                                                                                                                                             |
| logattributesusageoutputtokens | bigint | AI模型调用过程中的输出Token数量                 | 311                                                                                                                                               |
| logattributesusagetotaltokens  | bigint | AI模型调用过程中的总Token数量（输入输出）            | 14617                                                                                                                                             |


# 三、使用示例

## （一）数据表列查询示例

场景：查询最近10条定时任务执行日志，获取核心基础信息

```sql
-- 最近10条任务日志查询（基础字段）
SELECT 
  id,
  job_id,
  from_unixtime(ts/1000, 'yyyy-MM-dd HH:mm:ss') AS log_create_time, -- 时间戳转格式化时间
  action,
  status,
  model,
  provider
FROM cron_runs
ORDER BY ts DESC -- 按日志产生时间倒序
LIMIT 10;
```

## （二）JSON扩展字段查询示例

场景1：查询所有执行失败的任务，获取错误信息、执行耗时及Token消耗情况

```sql
-- 失败任务详情查询（含JSON扩展字段）
SELECT 
  id,
  job_id,
  from_unixtime(ts/1000, 'yyyy-MM-dd HH:mm:ss') AS exec_time,
  status,
  log_attributes['error'] AS error_message, -- 提取JSON中的错误信息
  log_attributes['durationMs'] AS execute_duration_ms, -- 提取执行耗时
  log_attributes['usage']['input_tokens'] AS input_token_count, -- 提取输入Token数
  log_attributes['usage']['output_tokens'] AS output_token_count, -- 提取输出Token数
  log_attributes['usage']['total_tokens'] AS total_token_count -- 提取总Token数
FROM cron_runs
WHERE status = 'error' -- 筛选失败任务
ORDER BY ts DESC;
```

场景2：查询指定任务（jobid）的所有执行记录，包含下次执行时间及执行摘要

```sql
-- 指定任务执行记录查询（含JSON扩展字段）
SELECT 
  id,
  job_id,
  from_unixtime(ts/1000, 'yyyy-MM-dd HH:mm:ss') AS log_time,
  from_unixtime(log_attributes['runAtMs']/1000, 'yyyy-MM-dd HH:mm:ss') AS start_exec_time, -- 任务启动时间
  from_unixtime(log_attributes['nextRunAtMs']/1000, 'yyyy-MM-dd HH:mm:ss') AS next_exec_time, -- 下次执行时间
  log_attributes['summary'] AS execute_summary -- 执行结果摘要
FROM cron_runs
WHERE job_id = 'ac2ad6fb-3b5d-46f7-83cb-71efc90d08d7' -- 指定任务ID
ORDER BY ts DESC;
```

