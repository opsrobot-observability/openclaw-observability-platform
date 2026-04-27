# agentSessionsLogs 数据源说明文档

# 一、基本信息


| 数据名称 | Agent 会话日志                                                                                                                                                                                                                                                                                                                                                                         |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 原始路径 | `~/openclaw/agents/{agentName}/sessionS/{sessionid}.jsonl`                                                                                                                                                                                                                                                                                                                         |
| 数据内容 | 记录 OpenClaw 中 Agent 会话全生命周期事件，包含会话创建、模型切换、消息交互、工具调用、错误日志、Token 消耗等全量信息                                                                                                                                                                                                                                                                                                             |
| 数据库  | opsRobot                                                                                                                                                                                                                                                                                                                                                                           |
| 数据表  | agent_sessions_logs                                                                                                                                                                                                                                                                                                                                                                |
| 用途定位 | 用于追踪、审计、排查 Agent 运行行为，分析模型调用与工具执行情况                                                                                                                                                                                                                                                                                                                                                |
| 应用场景 | 1 会话审计：对OpenClaw Agent的每一次会话全流程进行合规性审查，追溯会话发起、交互、结束的完整轨迹，确保会话操作符合系统规范；2 故障排查：当Agent运行出现异常、工具调用失败或模型响应异常时，通过查询该表日志，定位故障发生节点、错误原因及影响范围，辅助快速排查修复；3 模型性能分析：统计不同模型（如MiniMaxM25）的Token消耗、响应时长、停止原因等数据，分析模型在实际应用中的性能表现，为模型选型和优化提供数据支撑；4 工具调用统计：统计exec、write、read等各类工具的调用次数、成功失败率、执行耗时，分析工具使用频率和有效性，优化工具调用逻辑；5 用户交互日志回溯：完整保留用户与Agent的所有交互消息、思考过程，可回溯用户需求、Agent响应逻辑，用于需求分析、问题复盘及交互体验优化。 |


# 二、数据字段

## 21 数据表列


| 字段名称                    | 字段类型       | 字段说明           | 字段示例                                                                                                                 |
| ----------------------- | ---------- | -------------- | -------------------------------------------------------------------------------------------------------------------- |
| id                      | bigint     | 自增主键，唯一标识一条日志  | 1364                                                                                                                 |
| sessionid               | varchar128 | 会话唯一 ID        | c2d22601c4344c62a149d4332f78fee9                                                                                     |
| timestamp               | varchar64  | 日志时间戳（UTC）     | 20260410T10:27:12840Z                                                                                                |
| type                    | varchar64  | 日志类型           | session、modelchange、message、toolResult                                                                               |
| version                 | varchar32  | 会话版本           | 3                                                                                                                    |
| messageid               | varchar128 | 消息唯一 ID        | c30db8e3                                                                                                             |
| messageparentid         | varchar128 | 父消息 ID，用于关联上下文 | 05e20ea0                                                                                                             |
| provider                | varchar128 | 模型服务商          | minimaxcn                                                                                                            |
| modelid                 | varchar128 | 模型名称           | MiniMaxM25                                                                                                           |
| thinkinglevel           | int        | 思考级别           | 0、1                                                                                                                  |
| messagedetailscwd       | varchar512 | 执行工作目录         | /Users/mac/openclaw/workspace                                                                                        |
| messagerole             | varchar64  | 消息角色           | user、assistant、toolResult                                                                                            |
| messagetoolcallid       | varchar128 | 工具调用 ID        | callfunction5b4eqls112qg1                                                                                            |
| messagetoolname         | varchar128 | 工具名称           | exec、write、read                                                                                                      |
| messageiserror          | boolean    | 是否为错误消息        | true、false                                                                                                           |
| messagedetailsstatus    | varchar64  | 执行状态           | running、completed、failed                                                                                             |
| messagedetailsexitcode  | int        | 退出码            | 0、1                                                                                                                  |
| messageapi              | varchar128 | 调用 API 类型      | anthropicmessages                                                                                                    |
| messagestopreason       | varchar128 | 停止原因           | stop、toolUse                                                                                                         |
| messagemodel            | varchar128 | 实际使用模型         | MiniMaxM25                                                                                                           |
| messageusageinput       | bigint     | 输入 Token 数     | 8755                                                                                                                 |
| messageusageoutput      | bigint     | 输出 Token 数     | 165                                                                                                                  |
| messageusagecacheread   | bigint     | 缓存读取 Token 数   | 80                                                                                                                   |
| messageusagecachewrite  | bigint     | 缓存写入 Token 数   | 0                                                                                                                    |
| messageusagetotaltokens | bigint     | 总 Token 数      | 9000                                                                                                                 |
| logattributes           | variant    | 扩展 JSON 日志属性   | 34;id34;:34;c2d22601c4344c62a149d4332f78fee934;,34;type34;:34;session34;,34;timestamp34;:34;20260410T10:27:12840Z34; |


## 22 JSON 扩展字段（logattributes）


| 子字段路径                   | 字段类型   | 字段说明     | 字段示例                                                                                                                      |
| ----------------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| cwd                     | string | 工作目录     | /Users/mac/openclaw/workspace                                                                                             |
| id                      | string | 日志唯一标识   | c2d22601c4344c62a149d4332f78fee9                                                                                          |
| type                    | string | 日志细分类型   | session、modelchange、thinkinglevelchange                                                                                   |
| customType              | string | 自定义类型    | modelsnapshot、openclaw:bootstrapcontext:full                                                                              |
| datamodelApi            | string | 模型 API   | anthropicmessages                                                                                                         |
| datamodelId             | string | 模型 ID    | MiniMaxM25                                                                                                                |
| dataprovider            | string | 模型提供方    | minimaxcn                                                                                                                 |
| messagecontent          | array  | 消息内容数组   | 34;text34;:34;你好34;,34;type34;:34;text34;,34;thinking34;:34;用户打招呼，友好回复34;,34;type34;:34;thinking34;                       |
| messagerole             | string | 消息角色     | user、assistant                                                                                                            |
| messageapi              | string | 调用接口     | anthropicmessages                                                                                                         |
| messagestopReason       | string | 停止原因     | stop、toolUse                                                                                                              |
| messageusageinput       | bigint | 输入 Token | 8755                                                                                                                      |
| messageusageoutput      | bigint | 输出 Token | 165                                                                                                                       |
| messageusagetotalTokens | bigint | 总 Token  | 9000                                                                                                                      |
| thinking                | string | 模型思考过程   | 用户说“你好”，应友好回复                                                                                                             |
| thinkingSignature       | string | 思考签名     | 644c57b78acce5a1abf1cfceac2c5564a3d2e7f890123456789abcdef12345678                                                         |
| text                    | string | 回复文本     | 你好！👋                                                                                                                     |
| arguments               | object | 工具执行参数   | 34;command34;:34;curl s [http://localhost:18060/health34;,34;timeout34;:10](http://localhost:18060/health","timeout":10}) |
| name                    | string | 工具名称     | exec、write、read                                                                                                           |
| details                 | object | 执行详情     | 34;pid34;:83241,34;status34;:34;running34;,34;durationMs34;:43                                                            |


# 三、使用示例（Doris SQL）

## 31 基础数据表列查询

```sql
-- 1. 查询指定会话的全部日志
SELECT id, session_id, timestamp, type, message_role, model_id
FROM agent_sessions_logs
WHERE session_id = 'c2d22601-c434-4c62-a149-d4332f78fee9'
ORDER BY id;

-- 2. 统计各模型 Token 消耗
SELECT model_id, 
       SUM(message_usage_input) AS total_input,
       SUM(message_usage_output) AS total_output,
       SUM(message_usage_total_tokens) AS total_tokens
FROM agent_sessions_logs
WHERE model_id IS NOT NULL
GROUP BY model_id;

-- 3. 查询工具调用失败记录
SELECT id, session_id, message_tool_name, message_details_status, message_details_exit_code
FROM agent_sessions_logs
WHERE message_is_error = true 
  AND message_details_status = 'failed';
```

## 32 JSON 扩展字段查询

```sql
-- 1. 提取 log_attributes 中的工作目录与消息文本
SELECT 
    id,
    session_id,
    log_attributes['cwd'] AS work_dir,
    log_attributes['message']['content'][0]['text'] AS msg_text
FROM agent_sessions_logs
WHERE type = 'message' AND message_role = 'user';

-- 2. 查询模型思考内容
SELECT 
    id,
    session_id,
    log_attributes['message']['content'][0]['thinking'] AS think_content
FROM agent_sessions_logs
WHERE log_attributes['message']['content'][0]['thinking'] IS NOT NULL;

-- 3. 按工具类型统计调用次数
SELECT 
    log_attributes['name'] AS tool_name,
    COUNT(*) AS call_count
FROM agent_sessions_logs
WHERE type = 'toolResult'
GROUP BY log_attributes['name'];
```

