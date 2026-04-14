/**
 * gateway_logs 表「字段取值」过滤，与前端 ALL_COLUMN_DEF / 归一化行一致
 * 与 gateway-logs-query 一致：variant cast 后须 CONCAT 再 LOWER，避免 Doris lower(Nullable(String)) 报错
 */
const GW_ATTR_LOWER = "LOWER(CONCAT(COALESCE(CAST(`log_attributes` AS STRING), ''), ''))";

/**
 * @param {string[]} where
 * @param {unknown[]} params
 * @param {string} key
 * @param {string} rawValue 聚合中的原始文本；空字符串表示「空」
 */
export function pushGatewayFieldFilter(where, params, key, rawValue) {
  const k = String(key || "").trim();
  if (!k) return;
  const v = rawValue === undefined || rawValue === null ? "" : String(rawValue);
  const isEmpty = v === "";

  switch (k) {
    case "time":
      if (isEmpty) {
        where.push("(event_time IS NULL)");
      } else {
        where.push("TRIM(CAST(event_time AS STRING)) = ?");
        params.push(v.trim());
      }
      break;
    case "level":
      if (isEmpty) {
        where.push("(TRIM(IFNULL(`level`, '')) = '')");
      } else {
        where.push("LOWER(CONCAT(COALESCE(TRIM(IFNULL(`level`, '')), ''), '')) = ?");
        params.push(v.toLowerCase());
      }
      break;
    case "subsystem":
    case "module":
      if (isEmpty) {
        where.push("(`module` IS NULL OR TRIM(IFNULL(`module`, '')) = '')");
      } else {
        where.push("`module` = ?");
        params.push(v);
      }
      break;
    case "source":
      if (isEmpty) {
        where.push("1=1");
      } else if (v.trim().toLowerCase() === "gateway_logs") {
        where.push("1=1");
      } else {
        where.push("1=0");
      }
      break;
    case "session":
      if (isEmpty) {
        where.push(`(
          (GET_JSON_STRING(CAST(\`log_attributes\` AS STRING), '$.session_id') IS NULL OR TRIM(COALESCE(GET_JSON_STRING(CAST(\`log_attributes\` AS STRING), '$.session_id'), '')) = '')
          AND (GET_JSON_STRING(CAST(\`log_attributes\` AS STRING), '$.sessionId') IS NULL OR TRIM(COALESCE(GET_JSON_STRING(CAST(\`log_attributes\` AS STRING), '$.sessionId'), '')) = '')
        )`);
      } else {
        where.push(`(
          GET_JSON_STRING(CAST(\`log_attributes\` AS STRING), '$.session_id') = ?
          OR GET_JSON_STRING(CAST(\`log_attributes\` AS STRING), '$.sessionId') = ?
        )`);
        params.push(v, v);
      }
      break;
    case "trace":
      if (isEmpty) {
        where.push(`(
          (GET_JSON_STRING(CAST(\`log_attributes\` AS STRING), '$.trace_id') IS NULL OR TRIM(COALESCE(GET_JSON_STRING(CAST(\`log_attributes\` AS STRING), '$.trace_id'), '')) = '')
          AND (GET_JSON_STRING(CAST(\`log_attributes\` AS STRING), '$.traceId') IS NULL OR TRIM(COALESCE(GET_JSON_STRING(CAST(\`log_attributes\` AS STRING), '$.traceId'), '')) = '')
        )`);
      } else {
        where.push(`(
          GET_JSON_STRING(CAST(\`log_attributes\` AS STRING), '$.trace_id') = ?
          OR GET_JSON_STRING(CAST(\`log_attributes\` AS STRING), '$.traceId') = ?
        )`);
        params.push(v, v);
      }
      break;
    case "requestId":
      if (isEmpty) {
        where.push(`(
          (GET_JSON_STRING(CAST(\`log_attributes\` AS STRING), '$.request_id') IS NULL OR TRIM(COALESCE(GET_JSON_STRING(CAST(\`log_attributes\` AS STRING), '$.request_id'), '')) = '')
          AND (GET_JSON_STRING(CAST(\`log_attributes\` AS STRING), '$.requestId') IS NULL OR TRIM(COALESCE(GET_JSON_STRING(CAST(\`log_attributes\` AS STRING), '$.requestId'), '')) = '')
        )`);
      } else {
        where.push(`(
          GET_JSON_STRING(CAST(\`log_attributes\` AS STRING), '$.request_id') = ?
          OR GET_JSON_STRING(CAST(\`log_attributes\` AS STRING), '$.requestId') = ?
        )`);
        params.push(v, v);
      }
      break;
    case "summary":
      if (isEmpty) {
        where.push("(TRIM(IFNULL(CAST(`log_attributes` AS STRING), '')) = '')");
      } else {
        where.push(`(${GW_ATTR_LOWER} LIKE ?)`);
        params.push(`%${v.toLowerCase()}%`);
      }
      break;
    case "logAttributes": {
      const t = v.trim();
      if (isEmpty) {
        where.push("(log_attributes IS NULL OR LENGTH(TRIM(CAST(`log_attributes` AS STRING))) = 0)");
      } else if (t === "{}") {
        // 与 summary 一致用 LIKE 而非 LOCATE：Doris 在 LOCATE(?, CONCAT(CAST(variant…))) 上曾触发 Nullable→String 断言失败
        where.push("(TRIM(COALESCE(CAST(`log_attributes` AS STRING), '')) = '{}')");
      } else {
        where.push(`(${GW_ATTR_LOWER} LIKE ?)`);
        params.push(`%${t.toLowerCase()}%`);
      }
      break;
    }
    case "agent":
      if (isEmpty) {
        where.push(`(
          GET_JSON_STRING(CAST(\`log_attributes\` AS STRING), '$.agent') IS NULL
          AND GET_JSON_STRING(CAST(\`log_attributes\` AS STRING), '$.agent_name') IS NULL
        )`);
      } else {
        where.push(`(
          GET_JSON_STRING(CAST(\`log_attributes\` AS STRING), '$.agent') = ?
          OR GET_JSON_STRING(CAST(\`log_attributes\` AS STRING), '$.agent_name') = ?
        )`);
        params.push(v, v);
      }
      break;
    case "rowId":
      if (isEmpty) {
        where.push("(id IS NULL)");
      } else {
        where.push("CAST(id AS STRING) = ?");
        params.push(String(v).trim());
      }
      break;
    default:
      break;
  }
}
