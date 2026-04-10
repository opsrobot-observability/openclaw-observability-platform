-- 初始化 OpenClaw Observability 数据库 schema
-- 会自动创建 otel 数据库（如不存在）以及所需的表

CREATE DATABASE IF NOT EXISTS opsRobot;

USE opsRobot;

-- agent_sessions 表：会话数据
CREATE TABLE IF NOT EXISTS `agent_sessions` (
  `session_id` varchar(128) NOT NULL DEFAULT "",
  `session_key` varchar(512) NOT NULL DEFAULT "",
  `display_name` varchar(512) NOT NULL DEFAULT "",
  `agent_name` varchar(256) NOT NULL DEFAULT "",
  `started_at` bigint NOT NULL DEFAULT 0,
  `updated_at` bigint NOT NULL DEFAULT 0,
  `ended_at` bigint NOT NULL DEFAULT 0,
  `system_sent` boolean NOT NULL,
  `aborted_last_run` boolean NOT NULL,
  `chat_type` varchar(64) NOT NULL DEFAULT "",
  `channel` varchar(64) NOT NULL DEFAULT "",
  `group_id` varchar(256) NOT NULL DEFAULT "",
  `origin_label` varchar(256) NOT NULL DEFAULT "",
  `origin_provider` varchar(256) NOT NULL DEFAULT "",
  `origin_surface` varchar(256) NOT NULL DEFAULT "",
  `origin_chat_type` varchar(64) NOT NULL DEFAULT "",
  `origin_from` varchar(256) NOT NULL DEFAULT "",
  `origin_to` varchar(256) NOT NULL DEFAULT "",
  `origin_account_id` varchar(256) NOT NULL DEFAULT "",
  `delivery_context_channel` varchar(64) NOT NULL DEFAULT "",
  `delivery_context_to` varchar(256) NOT NULL DEFAULT "",
  `delivery_context_account_id` varchar(256) NOT NULL DEFAULT "",
  `last_channel` varchar(64) NOT NULL DEFAULT "",
  `last_to` varchar(256) NOT NULL DEFAULT "",
  `last_account_id` varchar(256) NOT NULL DEFAULT "",
  `log_attributes` variant NOT NULL
) ENGINE=OLAP
UNIQUE KEY(`session_id`) -- 关键修改：改为 UNIQUE KEY
DISTRIBUTED BY HASH(`session_id`) BUCKETS 10
PROPERTIES (
    "enable_unique_key_merge_on_write" = "true",
    "replication_allocation" = "tag.location.default: 1",
    "light_schema_change" = "true"
);

-- agent_sessions_logs 表：对话日志
CREATE TABLE IF NOT EXISTS agent_sessions_logs (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `session_id` VARCHAR(128) ,
  `timestamp` VARCHAR(64),
  `type` VARCHAR(64),
  `version` VARCHAR(32),
  `message_id` VARCHAR(128),
  `message_parent_id` VARCHAR(128),
  `provider` VARCHAR(128),
  `model_id` VARCHAR(128),
  `thinking_level` INT,
  `message_details_cwd` VARCHAR(512),
  `message_role` VARCHAR(64),
  `message_tool_call_id` VARCHAR(128),
  `message_tool_name` VARCHAR(128),
  `message_is_error` BOOLEAN,
  `message_details_status` VARCHAR(64),
  `message_details_exit_code` INT,
  `message_api` VARCHAR(128),
  `message_stop_reason` VARCHAR(128),
  `message_model` VARCHAR(128),
  `message_usage_input` BIGINT,
  `message_usage_output` BIGINT,
  `message_usage_cache_read` BIGINT,
  `message_usage_cache_write` BIGINT,
  `message_usage_total_tokens` BIGINT,
  `log_attributes` variant
) ENGINE=OLAP
DUPLICATE KEY(id)
DISTRIBUTED BY HASH(session_id) BUCKETS 10
PROPERTIES ('replication_num' = '1');


-- audit_logs 表：审计日志
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `event_time` datetime NOT NULL COMMENT "审计时间",
  `log_attributes` variant NOT NULL COMMENT "动态审计属性"
) ENGINE=OLAP
DUPLICATE KEY(`id`)
DISTRIBUTED BY HASH(`event_time`) BUCKETS 10
PROPERTIES ('replication_num' = '1');

-- gateway_logs 表：网关日志
CREATE TABLE IF NOT EXISTS `gateway_logs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `event_time` datetime NOT NULL COMMENT "审计时间",
  `module` varchar(64) NOT NULL DEFAULT "" COMMENT "模块",
  `level` varchar(64) NOT NULL DEFAULT "" COMMENT "级别",
  `log_attributes` variant NOT NULL COMMENT "动态审计属性"
) ENGINE=OLAP
DUPLICATE KEY(`id`)
DISTRIBUTED BY HASH(`event_time`) BUCKETS 10
PROPERTIES ('replication_num' = '1');

-- openclaw_config：从 openclaw.json 采集的扁平字段 + 脱敏 JSON 快照，供数字员工概览/画像扩展
CREATE TABLE IF NOT EXISTS `openclaw_config` (
  `config_key` varchar(64) NOT NULL COMMENT "配置实例键，如 default",
  `collected_at` bigint NOT NULL COMMENT "采集时间(ms)",
  `content_sha256` varchar(64) NOT NULL DEFAULT "" COMMENT "原文 SHA256",
  `source_path` varchar(1024) NOT NULL DEFAULT "" COMMENT "采集源绝对路径",
  `sandbox_mode` varchar(64) NOT NULL DEFAULT "",
  `workspace_default` varchar(512) NOT NULL DEFAULT "",
  `exec_security` varchar(64) NOT NULL DEFAULT "",
  `exec_ask` varchar(64) NOT NULL DEFAULT "",
  `exec_host` varchar(64) NOT NULL DEFAULT "",
  `fs_workspace_only` boolean NOT NULL,
  `channel_group_policy` varchar(64) NOT NULL DEFAULT "",
  `gateway_auth_mode` varchar(64) NOT NULL DEFAULT "",
  `gateway_mode` varchar(32) NOT NULL DEFAULT "",
  `gateway_deny_commands_count` int NOT NULL DEFAULT 0,
  `gateway_deny_commands_csv` varchar(4096) NOT NULL DEFAULT "" COMMENT "gateway.nodes.denyCommands 列表（逗号分隔）",
  `elevated_allow_from_summary` varchar(1024) NOT NULL DEFAULT "",
  `subagents_max_concurrent` int NOT NULL DEFAULT 0,
  `default_timeout_seconds` int NOT NULL DEFAULT 0,
  `default_model_primary` varchar(512) NOT NULL DEFAULT "",
  `tools_profile` varchar(64) NOT NULL DEFAULT "",
  `meta_last_touched_version` varchar(64) NOT NULL DEFAULT "",
  `meta_last_touched_at` varchar(128) NOT NULL DEFAULT "",
  `diagnostics_otel_enabled` boolean NOT NULL,
  `plugins_allow_csv` varchar(2048) NOT NULL DEFAULT "",
  `log_attributes` variant NOT NULL COMMENT "脱敏后的配置 JSON 快照"
) ENGINE=OLAP
UNIQUE KEY(`config_key`)
DISTRIBUTED BY HASH(`config_key`) BUCKETS 1
PROPERTIES (
  "enable_unique_key_merge_on_write" = "true",
  "replication_allocation" = "tag.location.default: 1",
  "light_schema_change" = "true"
);

-- agent_models：从 models.json 采集的模型目录（按 agent/provider/model_id 去重）
CREATE TABLE IF NOT EXISTS `agent_models` (
  `agent_name` varchar(128) NOT NULL DEFAULT "" COMMENT "agent 标识（如 main）",
  `provider` varchar(128) NOT NULL DEFAULT "" COMMENT "模型 provider",
  `model_id` varchar(256) NOT NULL DEFAULT "" COMMENT "模型 id",
  `display_name` varchar(256) NOT NULL DEFAULT "" COMMENT "模型展示名",
  `reasoning` boolean NOT NULL COMMENT "是否推理模型",
  `context_window` bigint NOT NULL DEFAULT 0 COMMENT "上下文窗口",
  `max_tokens` bigint NOT NULL DEFAULT 0 COMMENT "最大输出 token",
  `cost_input` double NOT NULL DEFAULT 0 COMMENT "输入单价",
  `cost_output` double NOT NULL DEFAULT 0 COMMENT "输出单价",
  `cost_cache_read` double NOT NULL DEFAULT 0 COMMENT "cache read 单价",
  `cost_cache_write` double NOT NULL DEFAULT 0 COMMENT "cache write 单价",
  `input_capabilities_csv` varchar(512) NOT NULL DEFAULT "" COMMENT "输入能力（逗号分隔）",
  `collected_at` bigint NOT NULL COMMENT "采集时间(ms)",
  `content_sha256` varchar(64) NOT NULL DEFAULT "" COMMENT "原文摘要（预留）",
  `source_path` varchar(1024) NOT NULL DEFAULT "" COMMENT "采集源路径",
  `log_attributes` variant NOT NULL COMMENT "模型原始条目快照"
) ENGINE=OLAP
UNIQUE KEY(`agent_name`, `provider`, `model_id`)
DISTRIBUTED BY HASH(`agent_name`, `provider`) BUCKETS 4
PROPERTIES (
  "enable_unique_key_merge_on_write" = "true",
  "replication_allocation" = "tag.location.default: 1",
  "light_schema_change" = "true"
);
