# openclawconfig数据源说明文档

# 一、基本信息


| **信息类别** | **具体内容**                                                                                                                                                                     |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 数据名称     | OpenClaw配置数据                                                                                                                                                                 |
| 原始路径     | ~/openclaw/openclawjson                                                                                                                                                      |
| 数据内容     | 存储OpenClaw工具的配置信息，包括配置实例键、采集时间、配置文件路径、沙箱模式、工作空间设置、网关配置、插件允许列表等，同时包含脱敏后的配置JSON快照，记录配置的完整信息                                                                                    |
| 数据库      | opsRobot                                                                                                                                                                     |
| 数据表      | openclaw_config                                                                                                                                                              |
| 用途定位     | 用于存储和管理OpenClaw工具的配置实例，记录配置的完整信息及采集详情，支持配置追溯、参数查询、配置校验等操作，为OpenClaw工具的正常运行提供配置支撑                                                                                             |
| 应用场景     | 1 配置查询：查询OpenClaw工具的各项配置参数，如沙箱模式、网关配置、插件允许列表等； 2 配置追溯：通过采集时间、配置快照，追溯配置的历史变更情况； 3 配置校验：通过contentsha256字段校验配置文件的完整性，确认配置未被篡改； 4 运维支撑：根据配置信息排查OpenClaw工具运行异常，调整相关参数以保障工具正常运行 |


# 二、数据字段

## （一）数据表列

openclawconfig数据表共25个核心字段，具体信息如下（列表形式展示）：


| **字段名称**                 | **字段类型**    | **字段说明**                        | **字段示例**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------ | ----------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| configkey                | varchar64   | 配置实例键，非空字段，如default，作为数据表唯一键    | default                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| collectedat              | bigint      | 配置采集时间，单位为毫秒，非空字段               | 1776752013348                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| contentsha256            | varchar64   | 配置原文的SHA256值，用于校验配置完整性，默认值为空字符串 | （空字符串）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| sourcepath               | varchar1024 | 配置采集源的绝对路径，默认值为空字符串             | /Users/mac/openclaw/openclawjson                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| sandboxmode              | varchar64   | 沙箱模式，默认值为空字符串                   | off                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| workspacedefault         | varchar512  | 默认工作空间路径，默认值为空字符串               | /Users/mac/openclaw/workspace                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| execsecurity             | varchar64   | 执行安全配置，默认值为空字符串                 | （空字符串）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| execask                  | varchar64   | 执行询问配置，默认值为空字符串                 | （空字符串）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| exechost                 | varchar64   | 执行主机配置，默认值为空字符串                 | （空字符串）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| fsworkspaceonly          | boolean     | 是否仅允许工作空间文件操作，非空字段              | 0（false）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| channelgrouppolicy       | varchar64   | 渠道组策略，默认值为空字符串                  | allowlist                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| gatewayauthmode          | varchar64   | 网关认证模式，默认值为空字符串                 | token                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| gatewaymode              | varchar32   | 网关模式，默认值为空字符串                   | local                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| gatewaydenycommandscount | int         | 网关禁止的命令数量，默认值为0                 | 7                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| gatewaydenycommandscsv   | varchar4096 | 网关禁止的命令列表，以逗号分隔，默认值为空字符串        | camerasnap,cameraclip,screenrecord,contactsadd,calendaradd,remindersadd,smssend                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| elevatedallowfromsummary | varchar1024 | 高级允许来源摘要，默认值为空字符串               | （空字符串）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| subagentsmaxconcurrent   | int         | 子代理最大并发数，默认值为0                  | 8                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| defaulttimeoutseconds    | int         | 默认超时时间（秒），默认值为0                 | 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| defaultmodelprimary      | varchar512  | 默认主模型，默认值为空字符串                  | minimaxcn/MiniMaxM25                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| toolsprofile             | varchar64   | 工具配置文件，默认值为空字符串                 | coding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| metalasttouchedversion   | varchar64   | 元数据最后修改版本，默认值为空字符串              | 2026412                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| metalasttouchedat        | varchar128  | 元数据最后修改时间，默认值为空字符串              | 20260421T01:37:43867Z                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| diagnosticsotelenabled   | boolean     | 是否启用诊断otel，非空字段                 | 1（true）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| pluginsallowcsv          | varchar2048 | 允许的插件列表，以逗号分隔，默认值为空字符串          | openclawcmsplugin,diagnosticsotel,feishu,minimax,memorycore                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| logattributes            | variant     | 脱敏后的配置JSON快照，非空字段，存储配置的完整结构化信息  | 34;agentsdefaults34;:34;modelprimary34;:34;minimaxcn/MiniMaxM2534;,34;sandboxmode34;:34;off34;,34;subagentsmaxconcurrent34;:8,34;timeoutseconds34;:0,34;workspacedefault34;:34;/Users/mac/openclaw/workspace34;,34;diagnosticsotelenabled34;:1,34;gateway34;:34;authmode34;:34;token34;,34;denycommandscount34;:7,34;denycommandscsv34;:34;camerasnap,cameraclip,screenrecord,contactsadd,calendaradd,remindersadd,smssend34;,34;mode34;:34;local34;,34;meta34;:34;lastTouchedAt34;:34;20260421T01:37:43867Z34;,34;lastTouchedVersion34;:34;202641234;,34;plugins34;:34;allowcsv34;:34;openclawcmsplugin,diagnosticsotel,feishu,minimax,memorycore34;,34;session34;:34;channelgrouppolicy34;:34;allowlist34;,34;tools34;:34;exec34;:34;ask34;:34;34;,34;host34;:34;34;,34;security34;:34;34;,34;fs34;:34;workspaceonly34;:0,34;profile34;:34;coding34; |


## （二）JSON扩展字段

本表logattributes字段为variant类型JSON结构化数据，存储脱敏后的完整配置快照，以下为全量平铺解析（含字段类型），兼容Doris JSON函数查询：


| **字段路径**                             | **字段类型** | **字段说明**                    | **字段示例**                                                                        |
| ------------------------------------ | -------- | --------------------------- | ------------------------------------------------------------------------------- |
| agentsdefaultsmodelprimary           | string   | 代理默认主模型                     | minimaxcn/MiniMaxM25                                                            |
| agentsdefaultssandboxmode            | string   | 代理默认沙箱模式                    | off                                                                             |
| agentsdefaultssubagentsmaxconcurrent | bigint   | 代理默认子代理最大并发数                | 8                                                                               |
| agentsdefaultstimeoutseconds         | bigint   | 代理默认超时时间（秒）                 | 0                                                                               |
| agentsdefaultsworkspacedefault       | string   | 代理默认工作空间路径                  | /Users/mac/openclaw/workspace                                                   |
| diagnosticsotelenabled               | bigint   | 是否启用诊断otel，1表示启用，0表示禁用      | 1                                                                               |
| gatewayauthmode                      | string   | 网关认证模式                      | token                                                                           |
| gatewaydenycommandscount             | bigint   | 网关禁止的命令数量                   | 7                                                                               |
| gatewaydenycommandscsv               | string   | 网关禁止的命令列表，以逗号分隔             | camerasnap,cameraclip,screenrecord,contactsadd,calendaradd,remindersadd,smssend |
| gatewaymode                          | string   | 网关模式                        | local                                                                           |
| metalastTouchedAt                    | string   | 元数据最后修改时间（UTC格式）            | 20260421T01:37:43867Z                                                           |
| metalastTouchedVersion               | string   | 元数据最后修改版本                   | 2026412                                                                         |
| pluginsallowcsv                      | string   | 允许的插件列表，以逗号分隔               | openclawcmsplugin,diagnosticsotel,feishu,minimax,memorycore                     |
| sessionchannelgrouppolicy            | string   | 会话渠道组策略                     | allowlist                                                                       |
| toolsexecask                         | string   | 工具执行询问配置                    | （空字符串）                                                                          |
| toolsexechost                        | string   | 工具执行主机配置                    | （空字符串）                                                                          |
| toolsexecsecurity                    | string   | 工具执行安全配置                    | （空字符串）                                                                          |
| toolsfsworkspaceonly                 | bigint   | 工具文件系统是否仅允许工作空间操作，1表示是，0表示否 | 0                                                                               |
| toolsprofile                         | string   | 工具配置文件                      | coding                                                                          |


# 三、使用示例

以下示例均采用**Apache Doris原生标准语法**，覆盖数据表列常规查询、JSON扩展字段解析查询，可直接复制执行，适配实际业务场景，规避variant类型查询报错问题。

## （一）数据表列查询示例

### 示例1：查询所有配置实例的基础信息

```sql
-- 查询openclaw_config数据表所有配置实例，展示核心基础字段
SELECT
  config_key,
  collected_at,
  source_path,
  sandbox_mode,
  gateway_mode,
  plugins_allow_csv
FROM openclaw_config
ORDER BY collected_at DESC;
```

### 示例2：查询指定配置实例的完整信息

```sql
-- 查询config_key为default的配置实例，展示所有数据表列信息
SELECT
  *
FROM openclaw_config
WHERE config_key = 'default';
```

### 示例3：查询启用诊断otel的配置实例

```sql
-- 筛选diagnostics_otel_enabled为true（1）的配置实例，展示核心配置信息
SELECT
  config_key,
  source_path,
  default_model_primary,
  plugins_allow_csv
FROM openclaw_config
WHERE diagnostics_otel_enabled = 1;
```

## （二）JSON扩展字段查询示例

### 示例1：解析JSON核心字段，关联基础字段查询

```sql
-- 解析log_attributes中的核心JSON字段，关联基础字段展示（添加类型转换，规避variant报错）
SELECT
  config_key,
  collected_at,
  -- 解析JSON一级字段，字符串类型无需转换
  log_attributes['gateway.mode'] AS gateway_mode,
  log_attributes['plugins.allow_csv'] AS plugins_allow,
  -- 解析JSON嵌套字段，数值型字段转为bigint
  cast(log_attributes['gateway.deny_commands_count'] AS bigint) AS deny_cmd_count,
  cast(log_attributes['agents_defaults.subagents_max_concurrent'] AS bigint) AS max_concurrent,
  -- 解析嵌套字符串字段
  log_attributes['agents_defaults.model_primary'] AS default_model
FROM openclaw_config
WHERE config_key = 'default';
```

### 示例2：基于JSON字段过滤，查询特定网关模式的配置

```sql
-- 筛选网关模式为local的配置实例，解析相关JSON字段
SELECT
  config_key,
  source_path,
  cast(log_attributes['gateway.deny_commands_count'] AS bigint) AS deny_cmd_count,
  log_attributes['gateway.deny_commands_csv'] AS deny_cmd_list
FROM openclaw_config
-- 转换JSON字段为string类型后过滤，规避variant字段过滤报错
WHERE cast(log_attributes['gateway.mode'] AS string) = 'local';
```

### 示例3：JSON字段聚合统计，按网关模式分组统计

```sql
-- 按网关模式分组，统计各模式的配置实例数量、平均禁止命令数
SELECT
  -- 转换variant类型为string，作为分组字段
  cast(log_attributes['gateway.mode'] AS string) AS gateway_mode,
  COUNT(*) AS config_count,  -- 配置实例数量
  -- 数值型JSON字段转换后聚合
  ROUND(AVG(cast(log_attributes['gateway.deny_commands_count'] AS bigint)), 0) AS avg_deny_cmd_count
FROM openclaw_config
-- 分组字段与查询字段保持一致，规避variant分组报错
GROUP BY cast(log_attributes['gateway.mode'] AS string)
ORDER BY config_count DESC;
```

