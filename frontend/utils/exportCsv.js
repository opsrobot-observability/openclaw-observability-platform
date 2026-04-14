/** CSV 单元格转义（RFC 4180 风格） */
export function escapeCsvCell(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * 触发浏览器下载 UTF-8 CSV（带 BOM，便于 Excel 正确识别中文）
 * @param {string} filename - 文件名，建议以 .csv 结尾
 * @param {string[]} headers - 表头
 * @param {string[][]} rows - 数据行
 */
export function downloadCsv(filename, headers, rows) {
  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ];
  const bom = "\uFEFF";
  const blob = new Blob([bom + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 下载纯文本（UTF-8），如 NDJSON / 每行一条 JSON
 * @param {string} filename
 * @param {string} text
 * @param {string} [mime]
 */
export function downloadUtf8Text(filename, text, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * @param {string} prefix
 * @param {string} [ext] - 不含点，默认 csv
 */
export function filenameWithTime(prefix, ext = "csv") {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const safe = String(ext || "csv").replace(/^\./, "");
  return `${prefix}_${stamp}.${safe}`;
}
