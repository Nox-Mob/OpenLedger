// Spreadsheet exports (CSV + XLSX). Pure helpers live here; file download is browser-only.
// Every text cell is escaped against spreadsheet formula injection.

export type Cell = string | number | null | undefined;
export interface Sheet {
  name: string;
  rows: Cell[][]; // first row = header
}

/** Text beginning with = + - @ tab or CR is treated as a formula by spreadsheets; prefix a quote. */
export function escapeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function csvCell(value: Cell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  const safe = escapeFormula(value);
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: Cell[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Cents to a plain decimal number for spreadsheets (no currency symbol). */
export function centsToNumber(cents: number): number {
  return Math.round(cents) / 100;
}

export function safeFileName(name: string): string {
  return name.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "export";
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(sheet: Sheet, fileName: string) {
  // BOM so Excel opens UTF-8 correctly.
  download(new Blob(["\ufeff" + toCsv(sheet.rows)], { type: "text/csv;charset=utf-8" }), fileName);
}

export async function downloadXlsx(sheets: Sheet[], fileName: string) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "OpenLedgerApp";
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31) || "Sheet");
    for (const r of s.rows)
      ws.addRow(r.map((c) => (typeof c === "string" ? escapeFormula(c) : (c ?? null))));
    ws.getRow(1).font = { bold: true };
    ws.columns.forEach((col) => (col.width = 18));
  }
  const buf = await wb.xlsx.writeBuffer();
  download(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    fileName,
  );
}

export function downloadJson(value: unknown, fileName: string) {
  download(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }), fileName);
}
