# agentModels 数据源说明文档

# 一、基本信息


| 数据名称 | Agent 模型配置数据                                                                                                                                                                                                                           |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 原始路径 | ~/openclaw/agents/agentname/agent/models.json                                                                                                                                                                                          |
| 数据内容 | 存储OpenClaw系统中各Agent的模型配置信息，涵盖不同Agent关联的各类模型（如MiniMax系列、gpt系列）的基础配置、成本信息、能力范围等全量数据，记录模型与Agent的关联关系及模型自身核心参数。                                                                                                                            |
| 数据库  | opsRobot                                                                                                                                                                                                                               |
| 数据表  | agent_models                                                                                                                                                                                                                           |
| 用途定位 | 用于管理OpenClaw各Agent对应的模型配置，提供模型的基础信息、成本核算、能力范围等数据支撑，为Agent调用模型、成本统计、模型选型提供核心依据。                                                                                                                                                         |
| 应用场景 | 1 模型配置管理：查询各Agent关联的模型列表、模型基础参数，维护Agent与模型的关联关系； 2 成本核算：根据模型输入输出单价、缓存读写单价，统计不同模型的使用成本； 3 模型选型：根据模型的上下文窗口、最大输出Token、推理能力、输入能力等参数，为Agent选择合适的模型； 4 配置审计：检查各Agent的模型配置是否合规，追溯模型配置的来源路径；5 模型性能参考：通过模型上下文窗口、最大输出Token等参数，评估模型的处理能力适配场景。 |


# 二、数据字段

## 21 数据表列


| 字段名称                 | 字段类型        | 字段说明                               | 字段示例                                                                                                                                                                                                                                                                 |
| -------------------- | ----------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| agentname            | varchar128  | Agent标识（如main、hehaoagent），非空默认空字符串 | main、hehaoagent                                                                                                                                                                                                                                                      |
| provider             | varchar128  | 模型提供方，非空默认空字符串                     | minimaxcn、minimax、qclaw                                                                                                                                                                                                                                              |
| modelid              | varchar256  | 模型ID，非空默认空字符串                      | MiniMaxM25、gpt52                                                                                                                                                                                                                                                     |
| displayname          | varchar256  | 模型展示名，非空默认空字符串                     | MiniMax M25、GPT54Mini                                                                                                                                                                                                                                                |
| reasoning            | boolean     | 是否为推理模型，非空                         | true、false                                                                                                                                                                                                                                                           |
| contextwindow        | bigint      | 模型上下文窗口，非空默认0                      | 200000、272000                                                                                                                                                                                                                                                        |
| maxtokens            | bigint      | 模型最大输出Token数，非空默认0                 | 8192、16384                                                                                                                                                                                                                                                           |
| costinput            | double      | 模型输入单价，非空默认0                       | 03、04                                                                                                                                                                                                                                                                |
| costoutput           | double      | 模型输出单价，非空默认0                       | 12、15                                                                                                                                                                                                                                                                |
| costcacheread        | double      | 模型缓存读取单价，非空默认0                     | 003、004                                                                                                                                                                                                                                                              |
| costcachewrite       | double      | 模型缓存写入单价，非空默认0                     | 012、015                                                                                                                                                                                                                                                              |
| inputcapabilitiescsv | varchar512  | 模型输入能力，逗号分隔，非空默认空字符串               | text、text,image                                                                                                                                                                                                                                                      |
| collectedat          | bigint      | 数据采集时间（毫秒），非空                      | 1776654820339                                                                                                                                                                                                                                                        |
| contentsha256        | varchar64   | 原文摘要（预留字段），非空默认空字符串                | 空字符串                                                                                                                                                                                                                                                                 |
| sourcepath           | varchar1024 | 数据采集源路径，非空默认空字符串                   | /Users/leon/openclaw/agents/main/agent/modelsjson                                                                                                                                                                                                                    |
| logattributes        | variant     | 模型原始条目快照，非空，存储JSON格式数据             | 34;api34;:34;anthropicmessages34;,34;contextWindow34;:200000,34;cost34;:34;cacheRead34;:003,34;cacheWrite34;:012,34;input34;:03,34;output34;:12,34;id34;:34;MiniMaxM2534;,34;input34;:34;text34;,34;maxTokens34;:8192,34;name34;:34;MiniMax M2534;,34;reasoning34;:1 |


## 22 JSON 扩展字段（logattributes）


| 子字段路径                          | 字段类型   | 字段说明                               | 字段示例                                                                    |
| ------------------------------ | ------ | ---------------------------------- | ----------------------------------------------------------------------- |
| api                            | string | 模型调用的API类型（部分模型有该字段）               | anthropicmessages、openaicodexresponses                                  |
| contextWindow                  | number | 模型上下文窗口大小，与数据表contextwindow字段对应    | 200000、272000                                                           |
| cost                           | object | 模型成本相关配置，包含缓存读写、输入输出单价             | 34;cacheRead34;:003,34;cacheWrite34;:012,34;input34;:03,34;output34;:12 |
| costcacheRead                  | number | 模型缓存读取单价，与costcacheread字段对应        | 003、006                                                                 |
| costcacheWrite                 | number | 模型缓存写入单价，与costcachewrite字段对应       | 012、0375                                                                |
| costinput                      | number | 模型输入单价，与costinput字段对应              | 03、06                                                                   |
| costoutput                     | number | 模型输出单价，与costoutput字段对应             | 12、24                                                                   |
| id                             | string | 模型ID，与数据表modelid字段对应               | MiniMaxM25、gpt54                                                        |
| input                          | array  | 模型输入能力数组，与inputcapabilitiescsv字段对应 | 34;text34;、34;text34;, 34;image34;                                      |
| maxTokens                      | number | 模型最大输出Token数，与maxtokens字段对应        | 8192、131072                                                             |
| name                           | string | 模型展示名，与数据表displayname字段对应          | MiniMax M25、GPT54Mini                                                   |
| reasoning                      | number | 是否为推理模型（1为是，0为否），与reasoning字段对应    | 1、0                                                                     |
| compat                         | object | 模型兼容性配置（部分模型有该字段）                  | 34;supportsReasoningEffort34;:1,34;supportsUsageInStreaming34;:1        |
| compatsupportsReasoningEffort  | number | 是否支持推理能力（1为支持，0为不支持）               | 1                                                                       |
| compatsupportsUsageInStreaming | number | 是否支持流式使用中的用量统计（1为支持，0为不支持）         | 1                                                                       |


# 三、使用示例（Doris SQL）

## 31 基础数据表列查询

```sql
-- 1. 查询指定Agent（main）关联的全部模型信息
SELECT agent_name, provider, model_id, display_name, reasoning, context_window, max_tokens
FROM agent_models
WHERE agent_name = 'main'
ORDER BY model_id;

-- 2. 统计各模型提供方的模型数量及平均上下文窗口
SELECT provider,
       COUNT(*) AS model_count,
       AVG(context_window) AS avg_context_window
FROM agent_models
GROUP BY provider;

-- 3. 查询推理模型且输入能力包含image的模型
SELECT agent_name, model_id, display_name, input_capabilities_csv
FROM agent_models
WHERE reasoning = true 
  AND input_capabilities_csv LIKE '%image%';

-- 4. 查询成本非零的模型（输入或输出单价大于0）
SELECT model_id, display_name, cost_input, cost_output, cost_cache_read, cost_cache_write
FROM agent_models
WHERE cost_input > 0 OR cost_output > 0;

-- 5. 查询指定采集路径下的模型配置
SELECT agent_name, model_id, display_name, source_path
FROM agent_models
WHERE source_path = '/Users/leon/.openclaw/agents/main/agent/models.json';
```

## 32 JSON 扩展字段查询

```sql
-- 1. 提取log_attributes中的API类型、上下文窗口及成本信息
SELECT 
    agent_name,
    model_id,
    log_attributes['api'] AS model_api,
    log_attributes['contextWindow'] AS json_context_window,
    log_attributes['cost']['input'] AS json_cost_input,
    log_attributes['cost']['output'] AS json_cost_output
FROM agent_models
WHERE log_attributes['api'] IS NOT NULL;

-- 2. 查询支持流式用量统计的模型（compat字段相关）
SELECT 
    agent_name,
    model_id,
    display_name,
    log_attributes['compat']['supportsUsageInStreaming'] AS supports_streaming_usage
FROM agent_models
WHERE log_attributes['compat'] IS NOT NULL
  AND log_attributes['compat']['supportsUsageInStreaming'] = 1;

-- 3. 提取模型输入能力数组并统计各输入类型的模型数量
SELECT 
    log_attributes['input'] AS input_capabilities,
    COUNT(*) AS model_count
FROM agent_models
WHERE log_attributes['input'] IS NOT NULL
GROUP BY log_attributes['input'];

-- 4. 查询缓存读取单价大于0.05的模型
SELECT 
    agent_name,
    model_id,
    display_name,
    log_attributes['cost']['cacheRead'] AS cache_read_cost
FROM agent_models
WHERE log_attributes['cost']['cacheRead'] > 0.05;

-- 5. 关联数据表字段与JSON字段，对比一致性
SELECT 
    agent_name,
    model_id,
    context_window AS table_context_window,
    log_attributes['contextWindow'] AS json_context_window,
    max_tokens AS table_max_tokens,
    log_attributes['maxTokens'] AS json_max_tokens
FROM agent_models
WHERE context_window <> log_attributes['contextWindow'] OR max_tokens <> log_attributes['maxTokens'];
```

