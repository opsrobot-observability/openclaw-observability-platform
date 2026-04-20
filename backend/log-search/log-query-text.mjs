/**
 * 全文检索：引号短语、NOT、AND/OR 优先级、通配符 * ? → LIKE（使用 ESCAPE）。
 * 用于 agent_sessions（LOCATE / LIKE on LOWER(concat)）、audit/gateway（JSON 文本 LIKE）。
 */

/** @typedef {{ type: "term"; value: string } | { type: "and" | "or" | "not" } | { type: "lparen" } | { type: "rparen" }} Tok */

/**
 * 兼容旧行为：仅按 ` AND ` 拆词（大小写不敏感）。
 * @param {string} q
 * @returns {string[]}
 */
export function splitAndTerms(q) {
  const s = String(q ?? "").trim();
  if (!s) return [];
  return s
    .split(/\s+AND\s+/i)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * @param {string} raw
 * @returns {Tok[]}
 */
function tokenize(raw) {
  const s = String(raw ?? "");
  /** @type {Tok[]} */
  const out = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    if (s[i] === "(") {
      out.push({ type: "lparen" });
      i++;
      continue;
    }
    if (s[i] === ")") {
      out.push({ type: "rparen" });
      i++;
      continue;
    }
    if (s[i] === '"') {
      i++;
      let buf = "";
      while (i < s.length && s[i] !== '"') {
        buf += s[i];
        i++;
      }
      if (s[i] === '"') i++;
      out.push({ type: "term", value: buf });
      continue;
    }
    let buf = "";
    while (
      i < s.length &&
      !/\s/.test(s[i]) &&
      s[i] !== "(" &&
      s[i] !== ")"
    ) {
      buf += s[i++];
    }
    const u = buf.toUpperCase();
    if (u === "AND" || u === "OR" || u === "NOT") out.push({ type: u.toLowerCase() });
    else out.push({ type: "term", value: buf });
  }
  return out;
}

/**
 * OR < AND < NOT（一元 NOT 绑定右侧因子）
 * @param {Tok[]} tokens
 * @param {number} [start]
 */
function parseOr(tokens, start = 0) {
  let { node, pos } = parseAnd(tokens, start);
  while (pos < tokens.length && tokens[pos].type === "or") {
    const r = parseAnd(tokens, pos + 1);
    node = { op: "or", left: node, right: r.node };
    pos = r.pos;
  }
  return { node, pos };
}

function parseAnd(tokens, start) {
  let { node, pos } = parseNot(tokens, start);
  while (pos < tokens.length) {
    const nt = tokens[pos];
    if (nt.type === "and") {
      const r = parseNot(tokens, pos + 1);
      node = { op: "and", left: node, right: r.node };
      pos = r.pos;
      continue;
    }
    if (nt.type === "or" || nt.type === "rparen") break;
    if (nt.type === "term" || nt.type === "lparen" || nt.type === "not") {
      const r = parseNot(tokens, pos);
      node = { op: "and", left: node, right: r.node };
      pos = r.pos;
      continue;
    }
    break;
  }
  return { node, pos };
}

function parseNot(tokens, start) {
  if (start < tokens.length && tokens[start].type === "not") {
    const r = parseNot(tokens, start + 1);
    return { node: { op: "not", child: r.node }, pos: r.pos };
  }
  return parsePrimary(tokens, start);
}

function parsePrimary(tokens, start) {
  const t = tokens[start];
  if (!t) throw new Error("log query: unexpected end of query");
  if (t.type === "lparen") {
    const inner = parseOr(tokens, start + 1);
    if (inner.pos >= tokens.length || tokens[inner.pos].type !== "rparen") {
      throw new Error("log query: expected )");
    }
    return { node: inner.node, pos: inner.pos + 1 };
  }
  if (t.type === "term") {
    return { node: { op: "term", value: t.value }, pos: start + 1 };
  }
  throw new Error("log query: unexpected token near position " + start);
}

/**
 * 将 AST 转为「析取范式」：OR of ANDs，每项含 positive terms 与 negative terms（均为字符串）
 * @param {unknown} node
 * @returns {{ pos: { and: string[]; not: string[] }[] }}
 */
function toDNF(node) {
  if (!node) return { pos: [] };
  if (node.op === "term") {
    return { pos: [{ and: [node.value], not: [] }] };
  }
  if (node.op === "not") {
    if (node.child?.op === "term") {
      return { pos: [{ and: [], not: [node.child.value] }] };
    }
    throw new Error("log query: NOT 仅支持作用于单个词或短语");
  }
  if (node.op === "and") {
    const a = toDNF(node.left);
    const b = toDNF(node.right);
    /** @type {{ and: string[]; not: string[] }[]} */
    const out = [];
    for (const x of a.pos) {
      for (const y of b.pos) {
        out.push({
          and: [...x.and, ...y.and],
          not: [...x.not, ...y.not],
        });
      }
    }
    return { pos: out };
  }
  if (node.op === "or") {
    const a = toDNF(node.left);
    const b = toDNF(node.right);
    return { pos: [...a.pos, ...b.pos] };
  }
  throw new Error("log query: invalid AST");
}

/**
 * 无显式 AND/OR/NOT 时：按 token 收集 term（引号内整段为一个词）
 * @param {string} q
 */
function parseImplicitAndFromTokens(q) {
  const s = String(q ?? "").trim();
  if (!s) return { pos: [] };
  const tokens = tokenize(s);
  const terms = [];
  for (const t of tokens) {
    if (t.type === "term") terms.push(t.value);
  }
  if (!terms.length) return { pos: [] };
  return { pos: [{ and: terms, not: [] }] };
}

/**
 * 解析查询串为 DNF：{ pos: { and: string[]; not: string[] }[] }
 * 空串 → pos 为空数组（调用方视为无全文条件）
 * @param {string} q
 */
export function parseLogQueryDNF(q) {
  const s = String(q ?? "").trim();
  if (!s) return { pos: [] };
  const tokens = tokenize(s);
  if (tokens.length === 0) return { pos: [] };
  try {
    const { node, pos } = parseOr(tokens, 0);
    if (pos !== tokens.length) throw new Error("log query: trailing tokens");
    return toDNF(node);
  } catch {
    return parseImplicitAndFromTokens(s);
  }
}

const LIKE_ESC = "!";

/**
 * @param {string} term
 */
export function termHasWildcard(term) {
  return /[*?]/.test(term);
}

/**
 * 将 * ? 转为 SQL LIKE 模式，并转义 % _ \
 * @param {string} term
 */
export function wildcardToLikePattern(term) {
  let out = "";
  for (const ch of term) {
    if (ch === "*") out += "%";
    else if (ch === "?") out += "_";
    else if (ch === "%" || ch === "_") out += "!" + ch;
    else if (ch === "!") out += "!!";
    else out += ch;
  }
  return out.toLowerCase();
}

/**
 * 无通配符：LOCATE(lower(term), blobLowerExpr) > 0
 * 有通配符：blobLowerExpr LIKE pattern ESCAPE '!'
 * @param {string} blobLowerExpr SQL 片段，已是 LOWER(...)
 * @param {string} term
 * @param {unknown[]} params
 */
export function pushTextPredicateForBlob(blobLowerExpr, term, params) {
  const t = String(term ?? "").trim();
  if (!t) return;
  if (termHasWildcard(t)) {
    const pat = wildcardToLikePattern(t);
    params.push(pat);
    return `( ${blobLowerExpr} LIKE ? ESCAPE '${LIKE_ESC}' )`;
  }
  params.push(t.toLowerCase());
  return `( LOCATE(?, ${blobLowerExpr}) > 0 )`;
}

/**
 * 对单列 lower 文本的 LIKE / LOCATE（audit / gateway 全文）
 * @param {string} colLowerExpr 如 LOWER(CONCAT(COALESCE(CAST(`log_attributes` AS STRING), ''), ''))（variant cast 须 CONCAT 再 lower）
 */
export function pushTextPredicateForColumn(colLowerExpr, term, params) {
  const t = String(term ?? "").trim();
  if (!t) return;
  if (termHasWildcard(t)) {
    const pat = wildcardToLikePattern(t);
    params.push(pat);
    return `( ${colLowerExpr} LIKE ? ESCAPE '${LIKE_ESC}' )`;
  }
  params.push(`%${t.toLowerCase()}%`);
  return `( ${colLowerExpr} LIKE ? )`;
}

/**
 * 构建 agent_sessions 全文 WHERE 子句（拼入 AND 列表）
 * @param {string} q
 * @param {string} blobLowerExpr
 * @param {unknown[]} params
 * @returns {string[]} 不含 AND 前缀的片段
 */
export function buildAgentTextWhereParts(q, blobLowerExpr, params) {
  const dnf = parseLogQueryDNF(q);
  if (!dnf.pos.length) return [];

  const orChunks = [];
  for (const g of dnf.pos) {
    const parts = [];
    for (const t of g.and) {
      const sql = pushTextPredicateForBlob(blobLowerExpr, t, params);
      if (sql) parts.push(sql);
    }
    for (const t of g.not) {
      const inner = pushTextPredicateForBlob(blobLowerExpr, t, params);
      if (inner) parts.push(`NOT (${inner})`);
    }
    if (parts.length === 0) continue;
    orChunks.push(`(${parts.join(" AND ")})`);
  }
  return orChunks;
}

/**
 * audit_logs / gateway_logs：对若干列做 OR，再与组内 AND 组合（简化：每词匹配 attributes 整段或额外列）
 * @param {(term: string) => string | undefined} pushOne — 返回单条件 SQL 片段并自行 push 参数
 */
export function buildSimpleOrOfAndGroups(q, pushOne) {
  const dnf = parseLogQueryDNF(q);
  if (!dnf.pos.length) return { sql: "", params: [] };
  const params = [];
  const orChunks = [];
  for (const g of dnf.pos) {
    const parts = [];
    for (const t of g.and) {
      const sql = pushOne(t, params);
      if (sql) parts.push(sql);
    }
    for (const t of g.not) {
      const inner = pushOne(t, params);
      if (inner) parts.push(`NOT (${inner})`);
    }
    if (parts.length) orChunks.push(`(${parts.join(" AND ")})`);
  }
  if (!orChunks.length) return { sql: "", params: [] };
  return { sql: `(${orChunks.join(" OR ")})`, params };
}
