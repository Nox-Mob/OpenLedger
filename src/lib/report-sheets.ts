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
