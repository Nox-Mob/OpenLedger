// Detail reports (general ledger, account activity, fund activity, statement check).
// Pure math, no I/O, unit-tested in report-detail.test.ts. Input rows exclude voids.
import type { AccountType, LedgerRow } from "./report-math";
import { computeFundBalances, type FundInfo } from "./domain/funds";
import type { TransactionSource } from "./domain/models";

/** +1 when the account normally carries a debit balance (assets, expenses). */
export const normalSign = (t: AccountType) => (t === "asset" || t === "expense" ? 1 : -1);
const isBalanceSheet = (t: AccountType) => t === "asset" || t === "liability" || t === "equity";

export interface LedgerLine {
  date: string;
  transactionId: string;
  description: string;
  debitCents: number;
  creditCents: number;
  /** Running balance in the account's normal sign (positive = normal balance). */
  balanceCents: number;
}

export interface AccountLedger {
  accountName: string;
  accountType: AccountType;
  openingCents: number;
  lines: LedgerLine[];
  totalDebitCents: number;
  totalCreditCents: number;
  closingCents: number;
}

export interface LedgerFilter {
  from: string;
  to: string;
  /** Income and expense accounts start each fiscal year at zero. */
  fiscalYearStart: string;
  accountName?: string;
  fundId?: string;
}

/**
 * General ledger: every account with activity or a balance, its opening balance,
 * each line in date order with a running balance, and the closing balance.
 * With `accountName` it is the account activity report for that one account.
 */
export function computeGeneralLedger(rows: LedgerRow[], f: LedgerFilter): AccountLedger[] {
  const byAccount = new Map<string, { name: string; type: AccountType; rows: LedgerRow[] }>();
  for (const r of rows) {
    if (r.transactionDate > f.to) continue;
    if (f.accountName && r.accountName !== f.accountName) continue;
    if (f.fundId && r.fundId !== f.fundId) continue;
    const k = `${r.accountType}:${r.accountName}`;
    const cur = byAccount.get(k) ?? { name: r.accountName, type: r.accountType, rows: [] };
    cur.rows.push(r);
    byAccount.set(k, cur);
  }
  const out: AccountLedger[] = [];
  for (const a of byAccount.values()) {
    const sign = normalSign(a.type);
    const openFrom = isBalanceSheet(a.type) ? "" : f.fiscalYearStart;
    let opening = 0;
    const period: LedgerRow[] = [];
    for (const r of a.rows) {
      if (r.transactionDate >= f.from) period.push(r);
      else if (r.transactionDate >= openFrom) opening += sign * r.amountCents;
    }
    // A from-date before the fiscal year start still begins income accounts at zero.
    if (!isBalanceSheet(a.type) && f.from < f.fiscalYearStart) opening = 0;
    period.sort(
      (x, y) =>
        x.transactionDate.localeCompare(y.transactionDate) ||
        (x.transactionId ?? "").localeCompare(y.transactionId ?? ""),
    );
    let running = opening;
    let dr = 0;
    let cr = 0;
    const lines = period.map((r) => {
      running += sign * r.amountCents;
      const debit = r.amountCents > 0 ? r.amountCents : 0;
      const credit = r.amountCents < 0 ? -r.amountCents : 0;
      dr += debit;
      cr += credit;
      return {
        date: r.transactionDate,
        transactionId: r.transactionId ?? "",
        description: r.description ?? "",
        debitCents: debit,
        creditCents: credit,
        balanceCents: running,
      };
    });
    if (lines.length === 0 && opening === 0) continue;
    out.push({
      accountName: a.name,
      accountType: a.type,
      openingCents: opening,
      lines,
      totalDebitCents: dr,
      totalCreditCents: cr,
      closingCents: running,
    });
  }
  const order: AccountType[] = ["asset", "liability", "equity", "revenue", "expense"];
  return out.sort(
    (x, y) =>
      order.indexOf(x.accountType) - order.indexOf(y.accountType) ||
      x.accountName.localeCompare(y.accountName),
  );
}

export interface FundActivityRow extends FundInfo {
  openingCents: number;
  receivedCents: number;
  spentCents: number;
  releasedCents: number;
  closingCents: number;
}

type FundLedgerRow = LedgerRow & { source: TransactionSource };

/** Fund activity for a period: opening, received, spent, released and closing remaining. */
export function computeFundActivity(
  rows: FundLedgerRow[],
  funds: FundInfo[],
  from: string,
  to: string,
): FundActivityRow[] {
  const toFund = (r: FundLedgerRow) => ({
    amountCents: r.amountCents,
    accountType: r.accountType,
    fundId: r.fundId ?? null,
    source: r.source,
  });
  const before = computeFundBalances(
    rows.filter((r) => r.transactionDate < from).map(toFund),
    funds,
  );
  const during = computeFundBalances(
    rows.filter((r) => r.transactionDate >= from && r.transactionDate <= to).map(toFund),
    funds,
  );
  return funds.map((f, i) => {
    const b = before[i]!;
    const d = during[i]!;
    return {
      ...f,
      openingCents: b.remainingCents,
      receivedCents: d.receivedCents,
      spentCents: d.spentCents,
      releasedCents: d.releasedCents,
      closingCents: b.remainingCents + d.remainingCents,
    };
  });
}

export interface CheckItem {
  date: string;
  description: string;
  amountCents: number;
  cleared: boolean;
}

/** Statement check report: matched (cleared) and outstanding items with totals. */
export function computeStatementCheck(
  accountType: AccountType,
  rec: { beginningBalanceCents: number; endingBalanceCents: number },
  entries: CheckItem[],
) {
  const sign = normalSign(accountType);
  const cleared = entries.filter((e) => e.cleared);
  const outstanding = entries.filter((e) => !e.cleared);
  const total = (l: CheckItem[]) => sign * l.reduce((s, e) => s + e.amountCents, 0);
  const clearedCents = total(cleared);
  const outstandingCents = total(outstanding);
  const clearedBalanceCents = rec.beginningBalanceCents + clearedCents;
  return {
    cleared,
    outstanding,
    clearedCents,
    outstandingCents,
    clearedBalanceCents,
    differenceCents: rec.endingBalanceCents - clearedBalanceCents,
    /** Book balance once outstanding items clear. */
    adjustedBalanceCents: clearedBalanceCents + outstandingCents,
  };
}
