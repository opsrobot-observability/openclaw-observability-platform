

# 根对象模型
字段	类型	说明
version	number	配置版本，固定为 1
jobs	array[Job]	定时任务列表

# Job 任务对象模型
表格
字段	类型	说明
id	string	任务唯一 UUID
agentId	string	执行智能体 ID
sessionKey	string	会话唯一标识
name	string	任务名称 / 描述
enabled	boolean	是否启用
createdAtMs	number	创建时间戳（毫秒）
updatedAtMs	number	更新时间戳（毫秒）
schedule	Schedule	定时调度配置
sessionTarget	string	会话环境（isolated = 隔离）
wakeMode	string	唤醒模式（now = 立即）
payload	Payload	任务执行内容
delivery	Delivery	结果投递配置
state	State	任务运行状态


# Schedule 调度配置模型
表格
字段	类型	说明
expr	string	Cron 表达式
kind	string	调度类型（cron）
tz	string	时区（Asia/Shanghai）


# Payload 任务载荷模型
表格
字段	类型	说明
kind	string	执行类型（agentTurn）
message	string	智能体执行指令
model	string	调用大模型标识

# Delivery 投递配置模型
表格
字段	类型	说明
mode	string	投递模式（announce）

# State 运行状态模型
字段	类型	说明
nextRunAtMs	number	下次执行时间戳
lastRunAtMs	number	上次执行时间戳
lastRunStatus	string	上次运行结果（error）
lastStatus	string	任务最新状态（error）
lastDurationMs	number	上次执行耗时（毫秒）
lastDeliveryStatus	string	投递状态（unknown）
consecutiveErrors	number	连续失败次数
lastError	string	最近一次错误信息

# 关键异常说明
consecutiveErrors: 26：连续 26 次执行失败
lastError：飞书投递缺少目标 ID（chatId /user:openId）