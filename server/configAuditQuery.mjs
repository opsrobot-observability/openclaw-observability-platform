/**
 * 配置变更审计查询 - 从 Doris otel.audit_logs 表读取
 */
import mysql from "mysql2/promise";
import { getDorisConfig } from "./agentSessionsQuery.mjs";

/**
 * 查询配置变更审计日志
 * @param {object} options
 * @param {string} [options.startIso] - 开始时间 ISO 格式
 * @param {string} [options.endIso] - 结束时间 ISO 格式
 * @param {string} [options.source] - 来源筛选
 * @param {string} [options.event] - 事件类型筛选
 * @param {string} [options.configPath] - 配置路径模糊搜索
 * @param {number} [options.pid] - 进程 ID 筛选
 * @param {string} [options.result] - 结果筛选
 * @param {string} [options.suspicious] - 可疑状态筛选: "yes" | "no" | "all"
 * @param {string} [options.gatewayChange] - 网关模式变更筛选
 * @param {string} [options.sortKey] - 排序字段
 * @param {string} [options.sortDir] - 排序方向 "asc" | "desc"
 * @param {number} [options.limit] - 限制条数
 * @param {number} [options.offset] - 偏移量
 */
export async function queryConfigAuditLogs({
  startIso,
  endIso,
  source,
  event,
  configPath,
  pid,
  result,
  suspicious = "all",
  gatewayChange,
  sortKey = "event_time",
  sortDir = "desc",
  limit = 100,
  offset = 0,
}) {
  const conn = await mysql.createConnection({
    ...getDorisConfig(),
    connectTimeout: 30000,
  });

  try {
    // 构建查询条件
    const conditions = [];
    const params = [];

    if (startIso) {
      conditions.push("event_time >= ?");
      params.push(startIso.replace("T", " ").slice(0, 19));
    }

    if (endIso) {
      conditions.push("event_time <= ?");
      params.push(endIso.replace("T", " ").slice(0, 19));
    }

    // 从 log_attributes JSON 中提取字段进行筛选
    if (source && source !== "全部") {
      conditions.push("GET_JSON_STRING(CAST(log_attributes AS STRING), '$.source') = ?");
      params.push(source);
    }

    if (event && event !== "全部") {
      conditions.push("GET_JSON_STRING(CAST(log_attributes AS STRING), '$.event') = ?");
      params.push(event);
    }

    if (configPath && configPath.trim()) {
      conditions.push("GET_JSON_STRING(CAST(log_attributes AS STRING), '$.configPath') LIKE ?");
      params.push(`%${configPath.trim()}%`);
    }

    if (pid !== undefined && pid !== null && String(pid).trim() !== "") {
      conditions.push("CAST(GET_JSON_STRING(CAST(log_attributes AS STRING), '$.pid') AS INT) = ?");
      params.push(Number(pid));
    }

    if (result && result !== "全部") {
      conditions.push("GET_JSON_STRING(CAST(log_attributes AS STRING), '$.result') = ?");
      params.push(result);
    }

    if (suspicious === "yes") {
      conditions.push("JSON_LENGTH(GET_JSON_STRING(CAST(log_attributes AS STRING), '$.suspicious')) > 0");
    } else if (suspicious === "no") {
      conditions.push("(GET_JSON_STRING(CAST(log_attributes AS STRING), '$.suspicious') = '[]' OR GET_JSON_STRING(CAST(log_attributes AS STRING), '$.suspicious') IS NULL)");
    }

    if (gatewayChange === "变更") {
      conditions.push("GET_JSON_STRING(CAST(log_attributes AS STRING), '$.gatewayModeBefore') != GET_JSON_STRING(CAST(log_attributes AS STRING), '$.gatewayModeAfter')");
    } else if (gatewayChange === "未变更") {
      conditions.push("GET_JSON_STRING(CAST(log_attributes AS STRING), '$.gatewayModeBefore') = GET_JSON_STRING(CAST(log_attributes AS STRING), '$.gatewayModeAfter')");
    } else if (gatewayChange === "空") {
      conditions.push("GET_JSON_STRING(CAST(log_attributes AS STRING), '$.gatewayModeBefore') IS NULL AND GET_JSON_STRING(CAST(log_attributes AS STRING), '$.gatewayModeAfter') IS NULL");
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // 排序字段映射
    const sortColumnMap = {
      ts: "event_time",
      event_time: "event_time",
      source: "GET_JSON_STRING(CAST(log_attributes AS STRING), '$.source')",
      event: "GET_JSON_STRING(CAST(log_attributes AS STRING), '$.event')",
      configPath: "GET_JSON_STRING(CAST(log_attributes AS STRING), '$.configPath')",
      pid: "CAST(GET_JSON_STRING(CAST(log_attributes AS STRING), '$.pid') AS INT)",
      result: "GET_JSON_STRING(CAST(log_attributes AS STRING), '$.result')",
    };
    const sortColumn = sortColumnMap[sortKey] || "event_time";
    const sortDirection = sortDir?.toLowerCase() === "asc" ? "ASC" : "DESC";

    // 查询总数
    const countSql = `SELECT COUNT(*) AS total FROM audit_logs ${whereClause}`;
    const [countRows] = await conn.query(countSql, params);
    const total = Number(countRows[0]?.total ?? 0);

    // 查询数据
    const dataSql = `
      SELECT 
        event_time,
        log_attributes
      FROM audit_logs 
      ${whereClause}
      ORDER BY ${sortColumn} ${sortDirection}
      LIMIT ? OFFSET ?
    `;
    const dataParams = [...params, limit, offset];
    const [dataRows] = await conn.query(dataSql, dataParams);

    // 解析 log_attributes JSON
    const events = dataRows.map((row) => {
      let attrs = {};
      try {
        attrs = typeof row.log_attributes === "string" 
          ? JSON.parse(row.log_attributes) 
          : row.log_attributes;
      } catch {
        attrs = {};
      }
      return {
        ...attrs,
        event_time: row.event_time,
      };
    });

    return {
      total,
      events,
      limit,
      offset,
    };
  } finally {
    await conn.end();
  }
}

/**
 * 获取配置变更统计信息
 * @param {string} [startIso] - 开始时间
 * @param {string} [endIso] - 结束时间
 */
export async function queryConfigAuditStats({ startIso, endIso } = {}) {
  const conn = await mysql.createConnection({
    ...getDorisConfig(),
    connectTimeout: 30000,
  });

  try {
    const conditions = [];
    const params = [];

    if (startIso) {
      conditions.push("event_time >= ?");
      params.push(startIso.replace("T", " ").slice(0, 19));
    }

    if (endIso) {
      conditions.push("event_time <= ?");
      params.push(endIso.replace("T", " ").slice(0, 19));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // 总数统计
    const [totalRows] = await conn.query(`SELECT COUNT(*) AS total FROM audit_logs ${whereClause}`, params);
    const total = Number(totalRows[0]?.total ?? 0);

    // 按来源统计
    const [sourceRows] = await conn.query(`
      SELECT 
        GET_JSON_STRING(CAST(log_attributes AS STRING), '$.source') AS source,
        COUNT(*) AS cnt
      FROM audit_logs ${whereClause}
      GROUP BY source
      ORDER BY cnt DESC
    `, params);

    // 按事件类型统计
    const [eventRows] = await conn.query(`
      SELECT 
        GET_JSON_STRING(CAST(log_attributes AS STRING), '$.event') AS event,
        COUNT(*) AS cnt
      FROM audit_logs ${whereClause}
      GROUP BY event
      ORDER BY cnt DESC
    `, params);

    // 按结果统计
    const [resultRows] = await conn.query(`
      SELECT 
        GET_JSON_STRING(CAST(log_attributes AS STRING), '$.result') AS result,
        COUNT(*) AS cnt
      FROM audit_logs ${whereClause}
      GROUP BY result
      ORDER BY cnt DESC
    `, params);

    return {
      total,
      bySource: sourceRows.map(r => ({ source: r.source || "(未知)", count: Number(r.cnt) })),
      byEvent: eventRows.map(r => ({ event: r.event || "(未知)", count: Number(r.cnt) })),
      byResult: resultRows.map(r => ({ result: r.result || "(未知)", count: Number(r.cnt) })),
    };
  } finally {
    await conn.end();
  }
}