// Turn report results into spreadsheet sheets (pure, testable).
import { centsToNumber as n, type Sheet } from "./export";

type Row = { name: string; totalCents: number };

export function incomeSheet(
  title: string,
  d: {
    revenue: Row[];
    expenses: Row[];
    totalRevenueCents: number;
    totalExpensesCents: number;
    netCents: number;
  },
  labels: { revenue: string; expenses: string; netIncome: string },
): Sheet {
  return {
    name: title,
    rows: [
      ["Section", "Account", "Amount"],
      ...d.revenue.map((r) => [labels.revenue, r.name, n(r.totalCents)]),
      [labels.revenue, "Total", n(d.totalRevenueCents)],
      ...d.expenses.map((r) => [labels.expenses, r.name, n(r.totalCents)]),
      [labels.expenses, "Total", n(d.totalExpensesCents)],
      [labels.netIncome, "", n(d.netCents)],
    ],
  };
}

export function balanceSheetSheet(
  title: string,
  d: {
    assets: Row[];
    liabilities: Row[];
    equity: Row[];
    retainedEarningsCents: number;
    netIncomeCents: number;
    totalAssetsCents: number;
    totalLiabilitiesCents: number;
    totalEquityCents: number;
  },
  labels: { assets: string; liabilities: string; equity: string },
): Sheet {
  return {
    name: title,
    rows: [
      ["Section", "Account", "Amount"],
      ...d.assets.map((r) => [labels.assets, r.name, n(r.totalCents)]),
      [labels.assets, "Total", n(d.totalAssetsCents)],
      ...d.liabilities.map((r) => [labels.liabilities, r.name, n(r.totalCents)]),
      [labels.liabilities, "Total", n(d.totalLiabilitiesCents)],
      ...d.equity.map((r) => [labels.equity, r.name, n(r.totalCents)]),
      [labels.equity, "Retained earnings", n(d.retainedEarningsCents)],
      [labels.equity, "Current year net", n(d.netIncomeCents)],
      [labels.equity, "Total", n(d.totalEquityCents)],
    ],
  };
}

export function trialSheet(d: {
  lines: { name: string; type: string; debitCents: number; creditCents: number }[];
  totalDebitCents: number;
  totalCreditCents: number;
}): Sheet {
  return {
    name: "Trial balance",
    rows: [
      ["Account", "Type", "Debit", "Credit"],
      ...d.lines.map((l) => [l.name, l.type, n(l.debitCents), n(l.creditCents)]),
      ["Total", "", n(d.totalDebitCents), n(d.totalCreditCents)],
    ],
  };
}

type LedgerAcct = {
  accountName: string;
  accountType: string;
  openingCents: number;
  closingCents: number;
  lines: {
    date: string;
    description: string;
    debitCents: number;
    creditCents: number;
    balanceCents: number;
  }[];
};

/** Rows shared by the ledger spreadsheet and PDF (amounts in cents). */
export function ledgerRows(accounts: LedgerAcct[]) {
  const rows: (string | number)[][] = [];
  for (const a of accounts) {
    rows.push([a.accountName, "", "Opening balance", "", "", a.openingCents]);
    for (const l of a.lines)
      rows.push([
        a.accountName,
        l.date,
        l.description,
        l.debitCents,
        l.creditCents,
        l.balanceCents,
      ]);
    rows.push([a.accountName, "", "Closing balance", "", "", a.closingCents]);
  }
  return rows;
}

const c = (v: string | number) => (typeof v === "number" ? n(v) : v);

export function ledgerSheet(title: string, accounts: LedgerAcct[]): Sheet {
  return {
    name: title,
    rows: [
      ["Account", "Date", "Description", "Debit", "Credit", "Balance"],
      ...ledgerRows(accounts).map((r) => r.map(c)),
    ],
  };
}

export function fundActivitySheet(
  funds: {
    name: string;
    isRestricted: boolean;
    openingCents: number;
    receivedCents: number;
    spentCents: number;
    releasedCents: number;
    closingCents: number;
  }[],
): Sheet {
  return {
    name: "Fund activity",
    rows: [
      ["Fund", "Restricted", "Opening", "Received", "Spent", "Released", "Closing"],
      ...funds.map((f) => [
        f.name,
        f.isRestricted ? "Yes" : "No",
        n(f.openingCents),
        n(f.receivedCents),
        n(f.spentCents),
        n(f.releasedCents),
        n(f.closingCents),
      ]),
    ],
  };
}

export function statementCheckSheet(d: {
  accountName: string;
  periodEnd: string;
  beginningBalanceCents: number;
  endingBalanceCents: number;
  cleared: { date: string; description: string; amountCents: number }[];
  outstanding: { date: string; description: string; amountCents: number }[];
  clearedBalanceCents: number;
  differenceCents: number;
}): Sheet {
  return {
    name: "Statement check",
    rows: [
      ["Status", "Date", "Description", "Amount"],
      ["Statement", "", "Beginning balance", n(d.beginningBalanceCents)],
      ...d.cleared.map((e) => ["Matched", e.date, e.description, n(e.amountCents)]),
      ...d.outstanding.map((e) => ["Outstanding", e.date, e.description, n(e.amountCents)]),
      ["Statement", "", "Cleared balance", n(d.clearedBalanceCents)],
      ["Statement", "", "Ending balance", n(d.endingBalanceCents)],
      ["Statement", "", "Difference", n(d.differenceCents)],
    ],
  };
}
