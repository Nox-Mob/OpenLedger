export function formatCents(cents: number, opts?: { sign?: boolean }): string {
  const abs = Math.abs(cents);
  const formatted = (abs / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (cents < 0) return `-$${formatted}`;
  if (opts?.sign && cents > 0) return `+$${formatted}`;
  return `$${formatted}`;
}

export function parseToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  // toPrecision strips binary float noise (1.005*100 = 100.49999…) before rounding.
  return Math.round(Number((value * 100).toPrecision(15)));
}

export { todayISO } from "./dates";
