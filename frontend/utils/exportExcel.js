import * as XLSX from "xlsx";

/**
 * 下载当前页为 .xlsx（首行表头，与 CSV 列一致）
 * @param {string} filename - 须含 .xlsx 后缀
 * @param {string[]} headers
 * @param {string[][]} rows
 */
export function downloadExcel(filename, headers, rows) {
  const name = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  const aoa = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Logs");
  XLSX.writeFile(wb, name);
}
