// Budget rules: pure, no storage imports.
import type { AccountType, IsoDate } from "./models";

export type BudgetPeriod = "year" | "month";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** First day of the budget period containing `day`. Years follow the fiscal year start month. */
export function periodStartFor(
  type: BudgetPeriod,
  day: IsoDate,
  fiscalStartMonth: number,
): IsoDate {
  const [y, m] = day.split("-").map(Number) as [number, number];
  if (type === "month") return `${y}-${pad(m)}-01`;
  const startYear = m >= fiscalStartMonth ? y : y - 1;
  return `${startYear}-${pad(fiscalStartMonth)}-01`;
}

/** Inclusive date range for a period that starts on `start`. */
export function periodRange(type: BudgetPeriod, start: IsoDate): { from: IsoDate; to: IsoDate } {
  const [y, m] = start.split("-").map(Number) as [number, number];
  const months = type === "month" ? 1 : 12;
  const endIdx = y * 12 + (m - 1) + months; // first month after the period
  const ey = Math.floor(endIdx / 12);
  const em = (endIdx % 12) + 1;
  const firstAfter = Date.UTC(ey, em - 1, 1);
  const last = new Date(firstAfter - 86400000);
  return {
    from: start,
    to: `${last.getUTCFullYear()}-${pad(last.getUTCMonth() + 1)}-${pad(last.getUTCDate())}`,
  };
}

/** Shift a period start by `n` periods. */
export function shiftPeriod(type: BudgetPeriod, start: IsoDate, n: number): IsoDate {
  const [y, m] = start.split("-").map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + n * (type === "month" ? 1 : 12);
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}-01`;
}

/** Ledger amount (debit +) to a positive "actual" for the account type. */
export function actualFromLedger(type: AccountType, sumCents: number): number {
  return type === "revenue" ? -sumCents : sumCents;
}

export function assertBudgetAmount(cents: number) {
  if (!Number.isInteger(cents) || cents < 0) throw new Error("Budget must be zero or more.");
}
