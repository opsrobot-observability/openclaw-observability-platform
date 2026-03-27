-- 初始化 OpenClaw Observability 数据库 schema
-- 会自动创建 otel 数据库（如不存在）以及所需的表

CREATE DATABASE IF NOT EXISTS opsRobot;

USE opsRobot;

-- agent_sessions 表：会话维度数据
CREATE TABLE IF NOT EXISTS agent_sessions (
  session_id VARCHAR(128) NOT NULL,
  session_key VARCHAR(512),
  display_name VARCHAR(512),
  agent_name VARCHAR(256),
  started_at DATETIME,
  updated_at DATETIME,
  ended_at DATETIME,
  system_sent TEXT,
  aborted_last_run BOOLEAN,
  chat_type VARCHAR(64),
  channel VARCHAR(64),
  group_id VARCHAR(256),
  origin_label VARCHAR(256),
  origin_provider VARCHAR(256),
  origin_surface VARCHAR(256),
  origin_chat_type VARCHAR(64),
  origin_from VARCHAR(256),
  origin_to VARCHAR(256),
  origin_account_id VARCHAR(256),
  delivery_context_channel VARCHAR(64),
  delivery_context_to VARCHAR(256),
  delivery_context_account_id VARCHAR(256),
  last_channel VARCHAR(64),
  last_to VARCHAR(256),
  last_account_id VARCHAR(256),
  log_attributes JSON
) ENGINE=OLAP
DUPLICATE KEY(session_id)
DISTRIBUTED BY HASH(session_id) BUCKETS 10
PROPERTIES ('replication_num' = '1');

-- agent_sessions_logs 表：会话日志（行级别）
CREATE TABLE IF NOT EXISTS agent_sessions_logs (
  sessionId VARCHAR(128),
  timestamp VARCHAR(64),
  type VARCHAR(64),
  version VARCHAR(32),
  parent_id VARCHAR(128),
  provider VARCHAR(128),
  model_id VARCHAR(128),
  thinking_level INT,
  message_details_cwd VARCHAR(512),
  message_role VARCHAR(64),
  message_tool_call_id VARCHAR(128),
  message_tool_name VARCHAR(128),
  message_is_error BOOLEAN,
  message_details_status VARCHAR(64),
  message_details_exit_code INT,
  message_api VARCHAR(128),
  message_stop_reason VARCHAR(128),
  message_model VARCHAR(128),
  message_usage_input BIGINT,
  message_usage_output BIGINT,
  message_usage_cache_read BIGINT,
  message_usage_cache_write BIGINT,
  message_usage_total_tokens BIGINT,
  log_attributes JSON
) ENGINE=OLAP
DUPLICATE KEY(sessionId, timestamp)
DISTRIBUTED BY HASH(sessionId) BUCKETS 10
PROPERTIES ('replication_num' = '1');