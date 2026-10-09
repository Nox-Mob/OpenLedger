// Pure report math — no I/O, so it is unit-tested directly (report-math.test.ts).
// Input rows must already exclude voided transactions.

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

export interface LedgerRow {
  amountCents: number;
  accountName: string;
  accountType: AccountType;
  projectId?: string | null;
  transactionDate: string;
  accountId?: string;
  transactionId?: string;
  description?: string;
  fundId?: string | null;
}

export interface Line {
  name: string;
  totalCents: number;
}

function groupBy(rows: LedgerRow[], type: AccountType, sign: 1 | -1): Line[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.accountType !== type) continue;
    map.set(r.accountName, (map.get(r.accountName) ?? 0) + r.amountCents);
  }
  return [...map.entries()]
    .map(([name, sum]) => ({ name, totalCents: sign * sum }))
    .sort((a, b) => b.totalCents - a.totalCents);
}

const sum = (l: Line[]) => l.reduce((a, r) => a + r.totalCents, 0);

export function inRange(rows: LedgerRow[], from?: string, to?: string): LedgerRow[] {
  return rows.filter(
    (r) => (!from || r.transactionDate >= from) && (!to || r.transactionDate <= to),
  );
}

export function computeIncome(rows: LedgerRow[]) {
  const revenue = groupBy(rows, "revenue", -1);
  const expenses = groupBy(rows, "expense", 1);
  const totalRevenueCents = sum(revenue);
  const totalExpensesCents = sum(expenses);
  return {
    revenue,
    expenses,
    totalRevenueCents,
    totalExpensesCents,
    netCents: totalRevenueCents - totalExpensesCents,
  };
}

/**
 * Balance sheet as of a date. Net income from before the current fiscal year is
 * rolled into retained earnings (net assets for nonprofits); this year's result
 * is shown separately. Both count toward equity so Assets = Liabilities + Equity.
 */
export function computeBalance(rows: LedgerRow[], asOf: string, fiscalYearStart: string) {
  const upTo = inRange(rows, undefined, asOf);
  const assets = groupBy(upTo, "asset", 1);
  const liabilities = groupBy(upTo, "liability", -1);
  const equity = groupBy(upTo, "equity", -1);
  const priorNet = computeIncome(upTo.filter((r) => r.transactionDate < fiscalYearStart)).netCents;
  const currentNet = computeIncome(
    upTo.filter((r) => r.transactionDate >= fiscalYearStart),
  ).netCents;
  const totalAssetsCents = sum(assets);
  const totalLiabilitiesCents = sum(liabilities);
  const totalEquityCents = sum(equity) + priorNet + currentNet;
  return {
    assets,
    liabilities,
    equity,
    retainedEarningsCents: priorNet,
    netIncomeCents: currentNet,
    totalAssetsCents,
    totalLiabilitiesCents,
    totalEquityCents,
    balanced: totalAssetsCents === totalLiabilitiesCents + totalEquityCents,
  };
}

export function computeTrialBalance(rows: LedgerRow[], asOf?: string) {
  const map = new Map<string, { name: string; type: AccountType; net: number }>();
  for (const r of inRange(rows, undefined, asOf)) {
    const k = `${r.accountType}:${r.accountName}`;
    const cur = map.get(k) ?? { name: r.accountName, type: r.accountType, net: 0 };
    cur.net += r.amountCents;
    map.set(k, cur);
  }
  const lines = [...map.values()]
    .filter((l) => l.net !== 0)
    .map((l) => ({
      name: l.name,
      type: l.type,
      debitCents: l.net > 0 ? l.net : 0,
      creditCents: l.net < 0 ? -l.net : 0,
    }))
    .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  const totalDebitCents = lines.reduce((a, l) => a + l.debitCents, 0);
  const totalCreditCents = lines.reduce((a, l) => a + l.creditCents, 0);
  return {
    lines,
    totalDebitCents,
    totalCreditCents,
    balanced: totalDebitCents === totalCreditCents,
  };
}

export function computeProjectSpend(rows: LedgerRow[]): Map<string, number> {
  const spent = new Map<string, number>();
  for (const r of rows) {
    if (!r.projectId || r.accountType !== "expense") continue;
    spent.set(r.projectId, (spent.get(r.projectId) ?? 0) + r.amountCents);
  }
  return spent;
}

/** Daily running total of asset accounts ("cash on hand") from `from` to `to` inclusive. */
export function computeCashSeries(
  rows: LedgerRow[],
  from: string,
  to: string,
): { date: string; cents: number }[] {
  const byDay = new Map<string, number>();
  let opening = 0;
  for (const r of rows) {
    if (r.accountType !== "asset" || r.transactionDate > to) continue;
    if (r.transactionDate < from) opening += r.amountCents;
    else byDay.set(r.transactionDate, (byDay.get(r.transactionDate) ?? 0) + r.amountCents);
  }
  const out: { date: string; cents: number }[] = [];
  let running = opening;
  for (let d = from; d <= to; d = addDaysUTC(d, 1)) {
    running += byDay.get(d) ?? 0;
    out.push({ date: d, cents: running });
  }
  return out;
}

function addDaysUTC(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Net income (revenue − expenses) from raw signed entries of revenue/expense accounts. */
export function netIncomeFromEntries(rows: { amountCents: number; accountType: string }[]): number {
  let net = 0;
  for (const r of rows) {
    if (r.accountType === "revenue" || r.accountType === "expense") net -= r.amountCents;
  }
  return net === 0 ? 0 : net;
}
