# agentSessions数据源说明文档

# 一、基本信息


| 项目   | 内容                                                                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 数据名称 | OpenClaw Agent会话元数据                                                                                                                  |
| 原始路径 | `~/openclaw/agents/{agentName}/sessions/sessions.jsonl`                                                                              |
| 数据内容 | 存储OpenClaw Agent会话全生命周期信息，包括会话标识、智能体信息、渠道信息、模型调用详情、Token消耗、技能快照、系统提示及执行上下文等核心数据                                                      |
| 数据库  | opsRobot                                                                                                                             |
| 数据表  | agent_sessions                                                                                                                       |
| 用途定位 | 用于OpenClaw智能体会话的全生命周期管理、审计追溯、用量统计、故障排查及技能使用分析，为智能体运维提供数据支撑                                                                           |
| 应用场景 | 1 会话审计：查询特定会话的操作记录、渠道来源及执行状态； 2 用量统计：统计各智能体、各模型的Token消耗情况； 3 故障排查：通过会话日志定位智能体运行异常原因； 4 技能分析：分析各技能的使用频率及关联会话； 5 渠道监控：统计不同接入渠道的会话量 |


# 二、数据字段

## 21 数据表列


| 字段名称                     | 字段类型       | 字段说明                                       | 字段示例                                                                       |
| ------------------------ | ---------- | ------------------------------------------ | -------------------------------------------------------------------------- |
| sessionid                | varchar128 | 会话唯一标识，主键，用于唯一区分每一个智能体会话                   | 5ce735ffafd84a7dadee229abc3c24a7                                           |
| sessionkey               | varchar512 | 会话全局唯一键，结合智能体、渠道等信息生成，用于全局会话标识             | agent:main:feishu:direct:ou71c0e6d58438c3f89fda2f599b0f3ee4                |
| displayname              | varchar512 | 会话显示名称，可用于前端展示，当前示例中无具体值                   | （空值）                                                                       |
| agentname                | varchar256 | 发起会话的智能体名称，用于区分不同智能体的会话                    | main、xiaohongshuagent                                                      |
| startedat                | bigint     | 会话开始时间戳（毫秒级），0表示未明确记录开始时间                  | 0、1774856723129                                                            |
| updatedat                | bigint     | 会话最后更新时间戳（毫秒级），记录会话最新操作时间                  | 1773370732466、1773823238290                                                |
| endedat                  | bigint     | 会话结束时间戳（毫秒级），0表示会话未结束                      | 0、1774856803827                                                            |
| systemsent               | boolean    | 标识会话是否已发送系统提示，1表示已发送，0表示未发送                | 1、0                                                                        |
| abortedlastrun           | boolean    | 标识会话上一次运行是否异常终止，1表示异常终止，0表示正常运行            | 0、1                                                                        |
| chattype                 | varchar64  | 聊天类型，当前仅支持direct（直接对话）类型                   | direct                                                                     |
| channel                  | varchar64  | 会话接入渠道，标识会话通过哪个平台发起                        | feishu、webchat                                                             |
| groupid                  | varchar256 | 群组ID，用于标识会话所属群组，当前示例中无具体值                  | （空值）                                                                       |
| originlabel              | varchar256 | 来源标签，标识会话发起方的名称或标识                         | 周小亮、（空值）                                                                   |
| originprovider           | varchar256 | 来源平台提供商，标识会话发起的平台归属                        | feishu、webchat                                                             |
| originsurface            | varchar256 | 来源界面，标识会话发起的具体界面                           | feishu、webchat                                                             |
| originchattype           | varchar64  | 来源聊天类型，与chattype一致，标识来源对话类型                | direct                                                                     |
| originfrom               | varchar256 | 消息发送方标识，记录会话发起者的具体ID                       | feishu:ou71c0e6d58438c3f89fda2f599b0f3ee4、（空值）                             |
| originto                 | varchar256 | 消息接收方标识，记录会话接收者的具体ID                       | user:ou71c0e6d58438c3f89fda2f599b0f3ee4、（空值）                               |
| originaccountid          | varchar256 | 来源账号ID，标识会话发起的账号                           | main、（空值）                                                                  |
| deliverycontextchannel   | varchar64  | 消息投递渠道，标识会话消息的下发渠道                         | feishu、webchat                                                             |
| deliverycontextto        | varchar256 | 消息投递目标，标识会话消息的下发目标ID                       | user:ou71c0e6d58438c3f89fda2f599b0f3ee4、（空值）                               |
| deliverycontextaccountid | varchar256 | 投递账号ID，标识消息投递使用的账号                         | main、（空值）                                                                  |
| lastchannel              | varchar64  | 最后使用渠道，标识会话最后一次操作使用的渠道                     | feishu、webchat                                                             |
| lastto                   | varchar256 | 最后接收方，标识会话最后一次消息的接收目标ID                    | user:ou71c0e6d58438c3f89fda2f599b0f3ee4、（空值）                               |
| lastaccountid            | varchar256 | 最后使用账号，标识会话最后一次操作使用的账号                     | main、（空值）                                                                  |
| logattributes            | variant    | 扩展日志JSON字段，存储会话核心扩展信息，包括Token消耗、模型信息、技能快照等 | 34;inputTokens34;:686,34;outputTokens34;:182,34;model34;:34;MiniMaxM2534;, |


## 22 JSON扩展字段（logattributes 平铺）


| 字段路径                                            | 字段类型    | 字段说明                                            | 字段示例                                                                                                                                                      |
| ----------------------------------------------- | ------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| logattributesabortedLastRun                     | tinyint | 会话上一次运行是否异常终止，与表中abortedlastrun字段一致，0表示正常，1表示异常 | 0                                                                                                                                                         |
| logattributesauthProfileOverride                | string  | 授权配置覆盖标识，指定会话使用的授权配置                            | minimaxportal:default、minimaxcn:default                                                                                                                   |
| logattributesauthProfileOverrideCompactionCount | bigint  | 授权配置覆盖压缩次数，记录授权配置覆盖后的压缩次数                       | 0                                                                                                                                                         |
| logattributesauthProfileOverrideSource          | string  | 授权配置覆盖来源，标识授权配置覆盖的触发方式                          | auto                                                                                                                                                      |
| logattributescacheRead                          | bigint  | 缓存读取次数，记录会话过程中缓存的读取次数                           | 10266、12805                                                                                                                                               |
| logattributescacheWrite                         | bigint  | 缓存写入次数，记录会话过程中缓存的写入次数                           | 0                                                                                                                                                         |
| logattributeschatType                           | string  | 聊天类型，与表中chattype字段一致，当前为direct                  | direct                                                                                                                                                    |
| logattributescompactionCount                    | bigint  | 压缩次数，记录会话日志的压缩次数                                | 0                                                                                                                                                         |
| logattributescontextTokens                      | bigint  | 上下文窗口大小，指定会话使用的模型上下文Token上限                     | 200000                                                                                                                                                    |
| logattributesdeliveryContext                    | object  | 投递上下文信息，存储消息投递的渠道、目标等信息                         | 34;accountId34;:34;main34;,34;channel34;:34;feishu34;,34;to34;:34;user:ouxxx34;                                                                           |
| logattributesdeliveryContextaccountId           | string  | 投递账号ID，嵌套在deliveryContext中的账号标识                 | main                                                                                                                                                      |
| logattributesdeliveryContextchannel             | string  | 投递渠道，嵌套在deliveryContext中的渠道标识                   | feishu、webchat                                                                                                                                            |
| logattributesdeliveryContextto                  | string  | 投递目标，嵌套在deliveryContext中的接收方ID                  | user:ou71c0e6d58438c3f89fda2f599b0f3ee4                                                                                                                   |
| logattributesinputTokens                        | bigint  | 输入Token数，记录会话过程中输入模型的Token总量                    | 686、1391868                                                                                                                                               |
| logattributeslabel                              | string  | 会话标签，记录会话的简要描述信息                                | 周小亮: 你好 0f3ee4                                                                                                                                            |
| logattributeslastAccountId                      | string  | 最后使用账号，与表中lastaccountid字段一致                     | main                                                                                                                                                      |
| logattributeslastChannel                        | string  | 最后使用渠道，与表中lastchannel字段一致                       | feishu、webchat                                                                                                                                            |
| logattributeslastTo                             | string  | 最后接收方，与表中lastto字段一致                             | user:ou71c0e6d58438c3f89fda2f599b0f3ee4                                                                                                                   |
| logattributesmemoryFlushAt                      | bigint  | 内存刷新时间戳，记录会话内存刷新的时间                             | 1773818364394                                                                                                                                             |
| logattributesmemoryFlushCompactionCount         | bigint  | 内存刷新压缩次数，记录内存刷新后的压缩次数                           | 0                                                                                                                                                         |
| logattributesmodel                              | string  | 会话使用的大模型名称                                      | MiniMaxM25                                                                                                                                                |
| logattributesmodelProvider                      | string  | 模型厂商，标识提供大模型的平台                                 | minimaxportal、minimaxcn                                                                                                                                   |
| logattributesorigin                             | object  | 来源信息，存储会话发起的详细来源参数                              | 34;accountId34;:34;main34;,34;chatType34;:34;direct34;,34;from34;:34;feishu:ouxxx34;,                                                                     |
| logattributesoriginaccountId                    | string  | 来源账号ID，嵌套在origin中的账号标识                          | main                                                                                                                                                      |
| logattributesoriginchatType                     | string  | 来源聊天类型，嵌套在origin中的聊天类型                          | direct                                                                                                                                                    |
| logattributesoriginfrom                         | string  | 来源发送方，嵌套在origin中的发送方ID                          | feishu:ou71c0e6d58438c3f89fda2f599b0f3ee4                                                                                                                 |
| logattributesoriginlabel                        | string  | 来源标签，嵌套在origin中的来源标识                            | 周小亮                                                                                                                                                       |
| logattributesoriginprovider                     | string  | 来源平台提供商，嵌套在origin中的平台标识                         | feishu、webchat                                                                                                                                            |
| logattributesoriginsurface                      | string  | 来源界面，嵌套在origin中的界面标识                            | feishu、webchat                                                                                                                                            |
| logattributesoriginto                           | string  | 来源接收方，嵌套在origin中的接收方ID                          | user:ou71c0e6d58438c3f89fda2f599b0f3ee4                                                                                                                   |
| logattributesoutputTokens                       | bigint  | 输出Token数，记录会话过程中模型输出的Token总量                    | 182、4231                                                                                                                                                  |
| logattributessessionFile                        | string  | 会话日志文件路径，存储会话详细日志的文件位置                          | /Users/leon/openclaw/agents/main/sessions/5ce735ffafd84a7dadee229abc3c24a7jsonl                                                                           |
| logattributessessionId                          | string  | 会话ID，与表中sessionid字段一致                           | 5ce735ffafd84a7dadee229abc3c24a7                                                                                                                          |
| logattributesskillsSnapshot                     | object  | 技能快照，存储会话过程中加载的技能相关信息                           | 34;prompt34;:34;34;,34;skills34;:34;name34;:34;feishudoc34;,,                                                                                             |
| logattributesskillsSnapshotprompt               | string  | 技能提示文本，用于指导智能体调用相关技能                            | The following skills provide specialized instructions for specific tasks Use the read tool to load a skill39;s file when the task matches its description |
| logattributesskillsSnapshotresolvedSkills       | array   | 已解析技能列表，存储会话中已加载并解析的技能详情                        | 34;name34;:34;feishudoc34;,34;description34;:34;Feishu document read/write operations34;,,                                                                |
| logattributesskillsSnapshotskills               | array   | 加载技能列表，存储会话中加载的所有技能名称及相关配置                      | 34;name34;:34;feishudoc34;,34;name34;:34;github34;,                                                                                                       |
| logattributesskillsSnapshotversion              | bigint  | 技能快照版本号                                         | 0                                                                                                                                                         |
| logattributessystemPromptReport                 | object  | 系统提示报告，存储系统提示词的相关统计信息                           | 34;bootstrapMaxChars34;:20000,34;generatedAt34;:1773050890413,                                                                                            |
| logattributessystemSent                         | tinyint | 是否已发送系统提示，与表中systemsent字段一致，1表示已发送              | 1                                                                                                                                                         |
| logattributestotalTokens                        | bigint  | 总Token数，记录会话过程中输入与输出Token的总和                    | 10928                                                                                                                                                     |
| logattributestotalTokensFresh                   | bigint  | 新增Token数，记录会话中新增的Token量                         | 1                                                                                                                                                         |
| logattributesupdatedAt                          | bigint  | 更新时间戳，与表中updatedat字段一致                          | 1773370732466                                                                                                                                             |


# 三、使用示例（Doris查询语法）

## 31 数据表列查询示例

```sql
-- 示例1：查询最近20条会话的核心基础信息
SELECT session_id, agent_name, channel, started_at, updated_at, ended_at
FROM opsRobot.agent_sessions
ORDER BY updated_at DESC
LIMIT 20;

-- 示例2：按智能体分组，统计各智能体的会话总数
SELECT agent_name, COUNT(session_id) AS session_total
FROM opsRobot.agent_sessions
GROUP BY agent_name
ORDER BY session_total DESC;

-- 示例3：查询飞书渠道（feishu）且未结束的会话
SELECT session_id, agent_name, origin_label, updated_at
FROM opsRobot.agent_sessions
WHERE channel = 'feishu' AND ended_at = 0;

-- 示例4：查询异常终止的会话详情
SELECT session_id, agent_name, channel, updated_at
FROM opsRobot.agent_sessions
WHERE aborted_last_run = 1;
```

## 32 JSON扩展字段查询示例

```sql
-- 示例1：提取会话的Token消耗及模型信息，关联基础会话字段
SELECT
  session_id,
  agent_name,
  log_attributes['inputTokens'] AS input_tokens,
  log_attributes['outputTokens'] AS output_tokens,
  log_attributes['totalTokens'] AS total_tokens,
  log_attributes['model'] AS model_name,
  log_attributes['modelProvider'] AS model_provider
FROM opsRobot.agent_sessions;

-- 示例2：按模型分组，统计各模型的Token总消耗
SELECT
  log_attributes['model'] AS model_name,
  SUM(log_attributes['inputTokens']) AS total_input_tokens,
  SUM(log_attributes['outputTokens']) AS total_output_tokens,
  SUM(log_attributes['totalTokens']) AS total_all_tokens
FROM opsRobot.agent_sessions
GROUP BY log_attributes['model']
ORDER BY total_all_tokens DESC;

-- 示例3：查询使用了feishu-doc技能的会话（通过skillsSnapshot.skills数组匹配）
SELECT session_id, agent_name, log_attributes['sessionFile'] AS session_log_path
FROM opsRobot.agent_sessions
WHERE array_contains(log_attributes['skillsSnapshot.skills'], 'feishu-doc');

-- 示例4：提取会话的来源信息（嵌套JSON字段查询）
SELECT
  session_id,
  log_attributes['origin.label'] AS origin_label,
  log_attributes['origin.provider'] AS origin_provider,
  log_attributes['origin.from'] AS origin_from,
  log_attributes['origin.to'] AS origin_to
FROM opsRobot.agent_sessions;

-- 示例5：查询缓存读取次数大于10000的会话
SELECT session_id, agent_name, log_attributes['cacheRead'] AS cache_read_count
FROM opsRobot.agent_sessions
WHERE log_attributes['cacheRead'] > 10000
```

