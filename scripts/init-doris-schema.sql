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
  `sessionId` VARCHAR(128) NOT NULL,
  `timestamp` VARCHAR(64) NOT NULL,
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `type` VARCHAR(64),
  `version` VARCHAR(32),
  `parent_id` VARCHAR(128),
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
UNIQUE KEY(sessionId, timestamp)
DISTRIBUTED BY HASH(sessionId) BUCKETS 10
PROPERTIES ('replication_num' = '1');


-- audit_logs 表：审计日志
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `event_time` datetime NOT NULL COMMENT "审计时间",
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `log_attributes` variant NOT NULL COMMENT "动态审计属性"
) ENGINE=OLAP
DUPLICATE KEY(`event_time`)
DISTRIBUTED BY HASH(`event_time`) BUCKETS 10
PROPERTIES ('replication_num' = '1');

-- gateway_logs 表：网关日志
CREATE TABLE IF NOT EXISTS `gateway_logs` (
  `event_time` datetime NOT NULL COMMENT "审计时间",
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `module` varchar(64) NOT NULL DEFAULT "" COMMENT "模块",
  `level` varchar(64) NOT NULL DEFAULT "" COMMENT "级别",
  `log_attributes` variant NOT NULL COMMENT "动态审计属性"
) ENGINE=OLAP
DUPLICATE KEY(`event_time`)
DISTRIBUTED BY HASH(`event_time`) BUCKETS 10
PROPERTIES ('replication_num' = '1');