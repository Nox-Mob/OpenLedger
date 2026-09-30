// Accounting dates are plain "YYYY-MM-DD" strings. Never round-trip them through
// Date + toISOString (UTC shifts 3/31 evening into April for US timezones).

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isISODate(s: string): boolean {
  const m = ISO.exec(s);
  if (!m) return false;
  const y = +m[1]!, mo = +m[2]!, d = +m[3]!;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Today's date in the user's local timezone (not UTC). */
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Adds whole days to a YYYY-MM-DD string using UTC math only. */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** First day of the fiscal year containing `iso`, given a 1–12 start month. */
export function fiscalYearStart(iso: string, startMonth: number): string {
  const y = +iso.slice(0, 4);
  const m = +iso.slice(5, 7);
  const year = m >= startMonth ? y : y - 1;
  return `${year}-${String(startMonth).padStart(2, "0")}-01`;
}

/** Last day of the fiscal year containing `iso`. */
export function fiscalYearEnd(iso: string, startMonth: number): string {
  const start = fiscalYearStart(iso, startMonth);
  const nextStart = `${+start.slice(0, 4) + 1}${start.slice(4)}`;
  return addDays(nextStart, -1);
}

/** Days between two YYYY-MM-DD strings (b - a). */
export function daysBetween(a: string, b: string): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.split("-").map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}
