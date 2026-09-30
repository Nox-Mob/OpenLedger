/** RFC-4180-ish CSV tokenizer: quoted fields, escaped quotes, commas/newlines inside quotes. */
export function tokenizeCsv(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const s = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === delimiter) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row.map((f) => f.trim()));
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row.map((f) => f.trim()));
  return rows;
}

export type DateFormat = "auto" | "MDY" | "DMY" | "YMD";

export type DecimalSeparator = "dot" | "comma";

export interface CsvMapping {
  hasHeader: boolean;
  dateCol: number;
  descCol: number;
  amountMode: "single" | "split";
  amountCol: number;
  debitCol: number; // money out
  creditCol: number; // money in
  dateFormat: DateFormat;
  flipSign: boolean;
  decimalSeparator?: DecimalSeparator | undefined; // default "dot"
  externalIdCol?: number | undefined;
}

export interface ParsedRow {
  line: number;
  date: string;
  description: string;
  amountCents: number;
  externalId?: string | undefined;
  error?: string | undefined;
}

export function parseDate(raw: string, fmt: DateFormat): string | null {
  const v = raw.trim();
  if (!v) return null;
  let y: number, m: number, d: number;
  const iso = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  const other = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if ((fmt === "YMD" || fmt === "auto") && iso) {
    y = +iso[1]!; m = +iso[2]!; d = +iso[3]!;
  } else if (other && fmt !== "YMD") {
    const a = +other[1]!, b = +other[2]!;
    y = +other[3]!; if (y < 100) y += 2000;
    if (fmt === "DMY" || (fmt === "auto" && a > 12)) { d = a; m = b; } else { m = a; d = b; }
  } else if (fmt === "auto") {
    const t = new Date(v);
    if (isNaN(t.getTime())) return null;
    y = t.getFullYear(); m = t.getMonth() + 1; d = t.getDate();
  } else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Strict amount parser. Rejects hex/scientific notation and more than 2
 * decimal places. `decimalSeparator` says which mark is the decimal point;
 * the other mark is treated as a thousands separator and must appear in
 * valid groups of three.
 */
export function parseAmount(raw: string, decimalSeparator: DecimalSeparator = "dot"): number | null {
  let v = (raw ?? "").trim();
  if (!v) return null;
  let neg = false;
  if (/^\(.*\)$/.test(v)) { neg = true; v = v.slice(1, -1).trim(); }
  if (v.endsWith("-")) { neg = true; v = v.slice(0, -1).trim(); }
  if (/\bCR$/i.test(v)) v = v.replace(/CR$/i, "").trim();
  if (/\bDR$/i.test(v)) { neg = true; v = v.replace(/DR$/i, "").trim(); }
  v = v.replace(/[$€£¥\s]/g, "");
  if (v.startsWith("-")) { neg = !neg; v = v.slice(1); }
  if (v.startsWith("+")) v = v.slice(1);
  if (!v) return null;

  const dec = decimalSeparator === "comma" ? "," : ".";
  const thou = decimalSeparator === "comma" ? "." : ",";
  // Either plain digits, or digits with properly grouped thousands separators,
  // optionally followed by one decimal mark and 1-2 decimal digits.
  const grouped = `\\d{1,3}(?:\\${thou}\\d{3})+`;
  const re = new RegExp(`^(?:${grouped}|\\d+)(\\${dec}(\\d{1,2}))?$`);
  const m = v.match(re);
  if (!m) return null;
  const decimals = m[2] ?? "";
  const intPart = v.slice(0, m[1] ? -m[1].length : undefined).replaceAll(thou, "");
  const cents = Number(intPart) * 100 + (decimals ? Number(decimals.padEnd(2, "0")) : 0);
  if (!Number.isSafeInteger(cents)) return null;
  return neg ? -cents : cents;
}

/** Guess the decimal separator by sampling the amount column(s). */
export function guessDecimalSeparator(rows: string[][], cols: number[]): DecimalSeparator {
  let comma = 0, dot = 0;
  for (const r of rows.slice(0, 50)) {
    for (const c of cols) {
      const v = (r[c] ?? "").trim().replace(/[($€£¥\s)]/g, "").replace(/(CR|DR|-)$/i, "");
      if (/,\d{2}$/.test(v) && !/\.\d{2}$/.test(v)) comma++;
      else if (/\.\d{2}$/.test(v) && !/,\d{2}$/.test(v)) dot++;
    }
  }
  return comma > dot ? "comma" : "dot";
}

export function guessMapping(rows: string[][]): CsvMapping {
  const header = (rows[0] ?? []).map((h) => h.toLowerCase());
  const hasHeader = header.some((h) => /date|desc|amount|memo|debit|credit|payee/.test(h));
  const find = (re: RegExp, fb: number) => {
    const i = header.findIndex((h) => re.test(h));
    return i >= 0 ? i : fb;
  };
  const debitCol = header.findIndex((h) => /debit|withdraw|money out/.test(h));
  const creditCol = header.findIndex((h) => /credit|deposit|money in/.test(h));
  const split = hasHeader && debitCol >= 0 && creditCol >= 0 && !header.some((h) => h === "amount");
  const amountCol = hasHeader ? find(/amount/, 2) : 2;
  const sampleRows = hasHeader ? rows.slice(1) : rows;
  return {
    hasHeader,
    dateCol: hasHeader ? find(/date/, 0) : 0,
    descCol: hasHeader ? find(/desc|memo|payee|name|details/, 1) : 1,
    amountMode: split ? "split" : "single",
    amountCol,
    debitCol: debitCol >= 0 ? debitCol : 2,
    creditCol: creditCol >= 0 ? creditCol : 3,
    dateFormat: "auto",
    flipSign: false,
    decimalSeparator: guessDecimalSeparator(sampleRows, split ? [debitCol, creditCol] : [amountCol]),
  };
}

export function applyMapping(rows: string[][], m: CsvMapping): ParsedRow[] {
  const out: ParsedRow[] = [];
  rows.forEach((cols, i) => {
    if (m.hasHeader && i === 0) return;
    const line = i + 1;
    const date = parseDate(cols[m.dateCol] ?? "", m.dateFormat);
    const description = (cols[m.descCol] ?? "").trim() || "Bank transaction";
    const dec = m.decimalSeparator ?? "dot";
    let amount: number | null;
    if (m.amountMode === "single") amount = parseAmount(cols[m.amountCol] ?? "", dec);
    else {
      const out_ = parseAmount(cols[m.debitCol] ?? "", dec);
      const in_ = parseAmount(cols[m.creditCol] ?? "", dec);
      amount = out_ == null && in_ == null ? null : (in_ ?? 0) - Math.abs(out_ ?? 0);
    }
    if (amount != null && m.flipSign) amount = -amount;
    const externalId = m.externalIdCol != null ? cols[m.externalIdCol] || undefined : undefined;
    let error: string | undefined;
    if (!date) error = `Can't read date "${cols[m.dateCol] ?? ""}"`;
    else if (amount == null) error = "Can't read amount";
    else if (amount === 0) error = "Amount is zero";
    out.push({ line, date: date ?? "", description: description.slice(0, 300), amountCents: amount ?? 0, externalId, error });
  });
  return out;
}
