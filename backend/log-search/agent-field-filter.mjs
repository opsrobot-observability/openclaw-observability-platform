/**
 * 日志搜索「字段取值」过滤：与前端 getUnifiedCellText / agent_sessions_logs 列一致
 * @param {string[]} where
 * @param {unknown[]} params
 * @param {string} key 列 key（与 ALL_COLUMN_DEF.key 一致）
 * @param {string} rawValue 聚合中的原始文本；空字符串表示「空」
 * @param {string} concatBlobLower 已包在 LOWER(...) 内的 CONCAT_WS 表达式，供 summary 检索
 */
export function pushAgentFieldFilter(where, params, key, rawValue, concatBlobLower) {
  const k = String(key || "").trim();
  if (!k) return;
  const v = rawValue === undefined || rawValue === null ? "" : String(rawValue);
  const isEmpty = v === "";

  const emptyOrTrim = (col) =>
    `(${col} IS NULL OR TRIM(COALESCE(${col}, '')) = '')`;

  switch (k) {
    case "time":
      if (isEmpty) where.push(emptyOrTrim("l.`timestamp`"));
      else {
        where.push("l.`timestamp` = ?");
        params.push(v);
      }
      break;
    case "level": {
      if (isEmpty) {
        where.push(
          "((l.`message_is_error` IS NULL OR l.`message_is_error` = 0) AND (l.`message_role` IS NULL OR TRIM(COALESCE(l.`message_role`, '')) = ''))"
        );
      } else {
        const lv = v.toLowerCase();
        if (lv === "error") {
          where.push("l.`message_is_error` = 1");
        } else {
          where.push("(l.`message_is_error` IS NULL OR l.`message_is_error` = 0)");
          where.push("LOWER(TRIM(IFNULL(l.`message_role`, ''))) = ?");
          params.push(lv);
        }
      }
      break;
    }
    case "source":
      if (!isEmpty && v !== "agent_sessions") where.push("1=0");
      break;
    case "sqlId":
      if (isEmpty) where.push(emptyOrTrim("l.`id`"));
      else {
        where.push("CAST(l.`id` AS STRING) = ?");
        params.push(String(v).trim());
      }
      break;
    case "type":
      if (isEmpty) where.push(emptyOrTrim("l.`type`"));
      else {
        where.push("l.`type` = ?");
        params.push(v);
      }
      break;
    case "messageRole":
      if (isEmpty) where.push(emptyOrTrim("l.`message_role`"));
      else {
        where.push("l.`message_role` = ?");
        params.push(v);
      }
      break;
    case "toolName":
      if (isEmpty) where.push(emptyOrTrim("l.`message_tool_name`"));
      else {
        where.push("l.`message_tool_name` = ?");
        params.push(v);
      }
      break;
    case "provider":
      if (isEmpty) where.push(emptyOrTrim("l.`provider`"));
      else {
        where.push("l.`provider` = ?");
        params.push(v);
      }
      break;
    case "model":
      if (isEmpty) {
        where.push(
          "(COALESCE(NULLIF(TRIM(l.`model_id`), ''), NULLIF(TRIM(l.`message_model`), ''), '') = '')"
        );
      } else {
        where.push(
          "COALESCE(NULLIF(TRIM(l.`model_id`), ''), NULLIF(TRIM(l.`message_model`), ''), '') = ?"
        );
        params.push(v);
      }
      break;
    case "channel":
      if (isEmpty) where.push(emptyOrTrim("s.`channel`"));
      else {
        where.push("s.`channel` = ?");
        params.push(v);
      }
      break;
    case "version":
      if (isEmpty) where.push(emptyOrTrim("l.`version`"));
      else {
        where.push("l.`version` = ?");
        params.push(v);
      }
      break;
    case "messageParentId":
      if (isEmpty) where.push(emptyOrTrim("l.`message_parent_id`"));
      else {
        where.push("l.`message_parent_id` = ?");
        params.push(v);
      }
      break;
    case "messageId":
      if (isEmpty) where.push(emptyOrTrim("l.`message_id`"));
      else {
        where.push("l.`message_id` = ?");
        params.push(v);
      }
      break;
    case "messageToolCallId":
      if (isEmpty) where.push(emptyOrTrim("l.`message_tool_call_id`"));
      else {
        where.push("l.`message_tool_call_id` = ?");
        params.push(v);
      }
      break;
    case "thinkingLevel":
      if (isEmpty) where.push("(l.`thinking_level` IS NULL)");
      else {
        const n = Number(v);
        if (!Number.isNaN(n)) {
          where.push("l.`thinking_level` = ?");
          params.push(n);
        } else {
          where.push("CAST(l.`thinking_level` AS STRING) = ?");
          params.push(v);
        }
      }
      break;
    case "messageDetailsCwd":
      if (isEmpty) where.push(emptyOrTrim("l.`message_details_cwd`"));
      else {
        where.push("l.`message_details_cwd` = ?");
        params.push(v);
      }
      break;
    case "messageIsError":
      if (isEmpty) where.push("(l.`message_is_error` IS NULL)");
      else {
        const t = v.toLowerCase();
        if (t === "true" || t === "1") where.push("l.`message_is_error` = 1");
        else if (t === "false" || t === "0")
          where.push("(l.`message_is_error` IS NULL OR l.`message_is_error` = 0)");
        else {
          where.push("CAST(l.`message_is_error` AS STRING) = ?");
          params.push(v);
        }
      }
      break;
    case "messageDetailsStatus":
      if (isEmpty) where.push(emptyOrTrim("l.`message_details_status`"));
      else {
        where.push("l.`message_details_status` = ?");
        params.push(v);
      }
      break;
    case "messageDetailsExitCode":
      if (isEmpty) where.push("(l.`message_details_exit_code` IS NULL)");
      else {
        const n = Number(v);
        if (!Number.isNaN(n)) {
          where.push("l.`message_details_exit_code` = ?");
          params.push(n);
        } else {
          where.push("CAST(l.`message_details_exit_code` AS STRING) = ?");
          params.push(v);
        }
      }
      break;
    case "messageApi":
      if (isEmpty) where.push(emptyOrTrim("l.`message_api`"));
      else {
        where.push("l.`message_api` = ?");
        params.push(v);
      }
      break;
    case "messageStopReason":
      if (isEmpty) where.push(emptyOrTrim("l.`message_stop_reason`"));
      else {
        where.push("l.`message_stop_reason` = ?");
        params.push(v);
      }
      break;
    case "usageInput":
    case "usageOutput":
    case "usageCacheRead":
    case "usageCacheWrite":
    case "usageTotalTokens": {
      const colMap = {
        usageInput: "l.`message_usage_input`",
        usageOutput: "l.`message_usage_output`",
        usageCacheRead: "l.`message_usage_cache_read`",
        usageCacheWrite: "l.`message_usage_cache_write`",
        usageTotalTokens: "l.`message_usage_total_tokens`",
      };
      const col = colMap[k];
      if (isEmpty) where.push(`(${col} IS NULL)`);
      else {
        const n = Number(v);
        if (!Number.isNaN(n)) {
          where.push(`${col} = ?`);
          params.push(n);
        } else {
          where.push(`CAST(${col} AS STRING) = ?`);
          params.push(v);
        }
      }
      break;
    }
    case "subsystem":
      if (isEmpty) {
        where.push(
          "(TRIM(COALESCE(l.`type`, '')) = '' AND TRIM(COALESCE(l.`provider`, '')) = '')"
        );
      } else {
        where.push(
          "(TRIM(COALESCE(l.`type`, '')) = ? OR TRIM(COALESCE(l.`provider`, '')) = ?)"
        );
        params.push(v, v);
      }
      break;
    case "agent":
      if (isEmpty) where.push(emptyOrTrim("s.`agent_name`"));
      else {
        where.push("COALESCE(NULLIF(TRIM(s.`agent_name`), ''), '') = ?");
        params.push(v);
      }
      break;
    case "session":
      if (isEmpty) where.push(emptyOrTrim("l.`session_id`"));
      else {
        where.push("l.`session_id` = ?");
        params.push(v);
      }
      break;
    case "trace":
      if (isEmpty) {
        where.push(`(
          COALESCE(TRIM(GET_JSON_STRING(CAST(l.\`log_attributes\` AS STRING), '$.trace_id')), '') = ''
          AND COALESCE(TRIM(GET_JSON_STRING(CAST(l.\`log_attributes\` AS STRING), '$.traceId')), '') = ''
        )`);
      } else {
        where.push(`(
          GET_JSON_STRING(CAST(l.\`log_attributes\` AS STRING), '$.trace_id') = ?
          OR GET_JSON_STRING(CAST(l.\`log_attributes\` AS STRING), '$.traceId') = ?
        )`);
        params.push(v, v);
      }
      break;
    case "requestId":
      if (isEmpty) {
        where.push(`(
          COALESCE(TRIM(GET_JSON_STRING(CAST(l.\`log_attributes\` AS STRING), '$.request_id')), '') = ''
          AND COALESCE(TRIM(GET_JSON_STRING(CAST(l.\`log_attributes\` AS STRING), '$.requestId')), '') = ''
        )`);
      } else {
        where.push(`(
          GET_JSON_STRING(CAST(l.\`log_attributes\` AS STRING), '$.request_id') = ?
          OR GET_JSON_STRING(CAST(l.\`log_attributes\` AS STRING), '$.requestId') = ?
        )`);
        params.push(v, v);
      }
      break;
    case "summary":
      if (isEmpty) {
        where.push(
          "(TRIM(COALESCE(l.`message_role`, '')) = '' AND TRIM(COALESCE(l.`message_tool_name`, '')) = '' AND TRIM(COALESCE(l.`type`, '')) = '')"
        );
      } else {
        where.push(`LOCATE(?, ${concatBlobLower}) > 0`);
        params.push(v.toLowerCase());
      }
      break;
    case "logAttributes": {
      const t = v.trim();
      if (isEmpty) {
        where.push(
          "(l.`log_attributes` IS NULL OR LENGTH(TRIM(CAST(l.`log_attributes` AS STRING))) = 0)"
        );
      } else if (t === "{}") {
        where.push("(TRIM(COALESCE(CAST(l.`log_attributes` AS STRING), '')) = '{}')");
      } else {
        where.push(
          "LOWER(CONCAT(COALESCE(CAST(l.`log_attributes` AS STRING), ''), '')) LIKE ?"
        );
        params.push(`%${t.toLowerCase()}%`);
      }
      break;
    }
    default:
      break;
  }
}
