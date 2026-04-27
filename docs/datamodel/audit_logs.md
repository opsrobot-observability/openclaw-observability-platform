# auditlogs数据源说明文档

# 一、基本信息


| 信息类别 | 具体内容                                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------- |
| 数据名称 | auditlogs（审计日志数据）                                                                                             |
| 原始路径 | `~/.openclaw/logs/config-audit.log`                                                                           |
| 数据内容 | 存储openclaw工具的配置写入审计日志，记录每次配置修改的详细信息，包括操作时间、执行命令、配置文件路径、操作前后配置哈希值、进程信息等                                        |
| 数据库  | opsRobot                                                                                                      |
| 数据表  | audit_logs                                                                                                    |
| 用途定位 | 用于审计openclaw工具的配置变更操作，追溯配置修改历史、排查配置异常问题、记录操作行为轨迹                                                              |
| 应用场景 | 1 配置变更追溯：当配置出现异常时，查询审计日志确认修改时间、操作内容及执行进程；2 操作行为审计：统计特定时间段内的配置修改频次、操作类型；3 故障排查：结合日志中的哈希值、字节数变化，定位配置文件损坏或篡改问题 |


# 二、数据字段

## （一）数据表列

auditlogs数据表共3个核心字段，具体信息如下（列表形式展示）：


| **字段名称**      | **字段类型** | **字段说明**                               | **字段示例**                                                                                          |
| ------------- | -------- | -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| id            | bigint   | 审计日志唯一标识，自增主键，起始值为1，用于唯一定位单条日志         | 34、42、51                                                                                          |
| eventtime     | datetime | 审计时间，即配置修改操作的执行时间，非空字段，精确到秒            | 20260320 14:02:45、20260410 18:53:01                                                               |
| logattributes | variant  | 动态审计属性，存储JSON格式的结构化数据，记录配置修改的详细参数，非空字段 | 34;argv34;:34;node34;, 34;openclaw34;,, 34;configPath34;:34;/Users/leon/openclaw/openclawjson34;, |


## （二）JSON扩展字段

本表logattributes字段为variant类型JSON结构化数据，存储配置修改的详细审计属性，以下为全量平铺解析（含字段类型），兼容Doris JSON函数查询：


| 字段路径              | 字段类型        | 字段说明                                  | 字段示例                                                                                                                                                |
| ----------------- | ----------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| argv              | arraystring | 执行的命令行参数数组，包含node路径、openclaw路径及具体操作命令 | 34;/opt/homebrew/Cellar/node/2580/bin/node34;, 34;/opt/homebrew/bin/openclaw34;, 34;config34;, 34;set34;, 34;browserdefaultProfile34;, 34;chrome34; |
| configPath        | string      | openclaw配置文件的绝对路径                     | /Users/leon/openclaw/openclawjson、/home/node/openclaw/openclawjson                                                                                  |
| cwd               | string      | 命令执行时的当前工作目录                          | /Users/leon/project/test2、/app、/                                                                                                                    |
| event             | string      | 审计事件类型，当前均为配置写入操作                     | configwrite                                                                                                                                         |
| execArgv          | arraystring | node执行参数，可选字段，主要用于禁用实验性警告             | 34;disablewarning=ExperimentalWarning34;                                                                                                            |
| existsBefore      | bigint      | 配置文件修改前是否存在，1表示存在，0表示不存在              | 1、0                                                                                                                                                 |
| gatewayModeAfter  | string      | 配置修改后网关模式，当前均为本地模式                    | local                                                                                                                                               |
| gatewayModeBefore | string      | 配置修改前网关模式，当前均为本地模式                    | local                                                                                                                                               |
| hasMetaAfter      | bigint      | 配置修改后是否包含元数据，1表示包含，0表示不包含             | 1、0                                                                                                                                                 |
| hasMetaBefore     | bigint      | 配置修改前是否包含元数据，1表示包含，0表示不包含             | 1、0                                                                                                                                                 |
| nextBytes         | bigint      | 配置修改后文件大小（字节数）                        | 16535、4238、5457                                                                                                                                     |
| nextHash          | string      | 配置修改后文件的哈希值，用于校验文件完整性                 | c2a1b69d11ea31cb7748a360889bcd7aa84e6cbf80df6d365328359bf2e64d90                                                                                    |
| pid               | bigint      | 执行配置修改操作的进程ID                         | 56472、82522、7                                                                                                                                       |
| ppid              | bigint      | 执行配置修改操作的父进程ID                        | 56471、1、97155                                                                                                                                       |
| previousBytes     | bigint      | 配置修改前文件大小（字节数）                        | 16415、4190、5403                                                                                                                                     |
| previousHash      | string      | 配置修改前文件的哈希值，用于校验文件完整性                 | 12bea688f607de40777c7997d228439ef95e33cb89fc91e5e8855872e5b6f563                                                                                    |
| result            | string      | 配置修改操作结果，当前均为重命名（配置写入的底层操作）           | rename                                                                                                                                              |
| source            | string      | 审计日志来源，当前均为配置IO操作                     | configio                                                                                                                                            |
| ts                | string      | UTC时间戳，与eventtime对应，精确到毫秒             | 20260320T06:02:45175Z、20260410T10:53:01683Z                                                                                                         |
| watchMode         | bigint      | 监控模式，当前均为0（默认模式）                      | 0                                                                                                                                                   |
| nextDev           | string      | 配置修改后文件所在设备ID，可选字段                    | 16777234、16777232                                                                                                                                   |
| nextGid           | bigint      | 配置修改后文件所属组ID，可选字段                     | 20                                                                                                                                                  |
| nextIno           | string      | 配置修改后文件的inode编号，可选字段                  | 6101656、77507362                                                                                                                                    |
| nextMode          | bigint      | 配置修改后文件权限模式，可选字段                      | 384                                                                                                                                                 |
| nextNlink         | bigint      | 配置修改后文件的硬链接数，可选字段                     | 1                                                                                                                                                   |
| nextUid           | bigint      | 配置修改后文件所属用户ID，可选字段                    | 501                                                                                                                                                 |
| previousDev       | string      | 配置修改前文件所在设备ID，可选字段                    | 16777234、16777232                                                                                                                                   |
| previousGid       | bigint      | 配置修改前文件所属组ID，可选字段                     | 20                                                                                                                                                  |
| previousIno       | string      | 配置修改前文件的inode编号，可选字段                  | 6099183、77491753                                                                                                                                    |
| previousMode      | bigint      | 配置修改前文件权限模式，可选字段                      | 384                                                                                                                                                 |
| previousNlink     | bigint      | 配置修改前文件的硬链接数，可选字段                     | 1                                                                                                                                                   |
| previousUid       | bigint      | 配置修改前文件所属用户ID，可选字段                    | 501                                                                                                                                                 |


# 三、使用示例

以下示例均采用**Apache Doris原生标准语法**，覆盖数据表列常规查询、JSON扩展字段解析查询，可直接复制执行，适配实际业务场景。

## （一）数据表列查询示例

### 示例1：查询指定时间段内的所有审计日志基础信息

```sql
-- 查询2026年3月20日至2026年4月21日的审计日志，展示核心基础字段
SELECT
  id,
  event_time,
  -- 仅展示JSON字段的字符串形式，不解析
  log_attributes
FROM audit_logs
WHERE event_time BETWEEN '2026-03-20 00:00:00' AND '2026-04-21 23:59:59'
ORDER BY event_time DESC;
```

### 示例2：统计指定进程ID的配置修改操作次数

```sql
-- 统计pid为7的进程执行的配置修改次数及时间范围
SELECT
  cast(log_attributes['pid'] AS bigint) AS pid,
  COUNT(*) AS operate_count,  -- 操作次数
  MIN(event_time) AS first_operate_time,  -- 首次操作时间
  MAX(event_time) AS last_operate_time   -- 末次操作时间
FROM audit_logs
WHERE cast(log_attributes['pid'] AS bigint) = 7
GROUP BY cast(log_attributes['pid'] AS bigint);
```

## （二）JSON扩展字段查询示例

### 示例1：解析JSON核心字段，关联基础字段查询

```sql
-- 解析log_attributes中的核心JSON字段，关联id、event_time展示（添加类型转换）
SELECT
  id,
  event_time,
  -- 解析一级JSON字段：命令参数、配置路径（无需转换，本身为字符串）
  log_attributes['argv'] AS execute_argv,
  log_attributes['configPath'] AS config_path,
  -- 数值型JSON字段：强制转为bigint类型（与JSON字段实际类型匹配）
  cast(log_attributes['pid'] AS bigint) AS execute_pid,
  cast(log_attributes['previousBytes'] AS bigint) AS before_file_size,
  cast(log_attributes['nextBytes'] AS bigint) AS after_file_size,
  -- 转换后再进行数值运算
  (cast(log_attributes['nextBytes'] AS bigint) - cast(log_attributes['previousBytes'] AS bigint)) AS size_change
FROM audit_logs
WHERE event_time > '2026-04-01 00:00:00'
ORDER BY event_time DESC;
```

### 示例2：基于JSON字段过滤，查询特定操作类型的日志

```sql
-- 筛选执行config set命令（配置修改）且配置路径包含leon的审计日志
SELECT
  id,
  event_time,
  log_attributes['argv'] AS execute_command,
  log_attributes['configPath'] AS config_path,
  log_attributes['nextHash'] AS after_hash
FROM audit_logs
-- 过滤条件：命令包含config set，配置路径包含leon（修正语法：适配Doris类型转换格式）
WHERE array_contains(cast(log_attributes['argv'] as array<string>), 'config') 
  AND array_contains(cast(log_attributes['argv'] as array<string>), 'set')
  AND log_attributes['configPath'] LIKE '%leon%'
ORDER BY event_time;
```

### 示例3：JSON字段聚合统计，按配置路径分组统计操作次数

```sql
-- 按配置文件路径分组，统计各配置文件的修改次数、平均文件大小变化（核心修正：规避variant字段group by，适配Doris语法）
SELECT
  -- 先将variant类型的configPath转为string，再作为分组字段和展示字段
  cast(log_attributes['configPath'] AS string) AS config_path,
  COUNT(*) AS modify_count,  -- 修改次数
  -- 数值型JSON字段转换为bigint，再进行AVG聚合运算
  ROUND(AVG(cast(log_attributes['nextBytes'] AS bigint)), 0) AS avg_after_size,  -- 平均修改后大小
  ROUND(AVG(cast(log_attributes['nextBytes'] AS bigint) - cast(log_attributes['previousBytes'] AS bigint)), 0) AS avg_size_change  -- 平均大小变化
FROM audit_logs
-- 分组字段与查询字段保持一致，均为转换后的string类型
GROUP BY cast(log_attributes['configPath'] AS string)
ORDER BY modify_count DESC;
```

