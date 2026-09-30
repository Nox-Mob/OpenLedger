export type OrgType = "nonprofit" | "business";
export type Terminology = "simplest" | "simple" | "accounting";
export const LEVELS: Terminology[] = ["simplest", "simple", "accounting"];
export const LEVEL_LABEL: Record<Terminology, string> = {
  simplest: "Simplest",
  simple: "Simple",
  accounting: "Double-entry",
};

/** Normalize stored values (legacy "simplified" -> "simplest"). */
export function normalizeTerminology(v: unknown): Terminology {
  return v === "simple" || v === "accounting" ? v : "simplest";
}

export type TermKey =
  | "assets" | "liabilities" | "equity" | "revenue" | "expenses"
  | "debitCredit" | "netIncome" | "incomeStatement" | "balanceSheet" | "journal";

export type TermOverrides = Partial<Record<TermKey, Terminology>>;

type Triple = [string, string, string];
interface TermItem { key: TermKey; label: string; business: Triple; nonprofit?: Triple }

/** Every configurable term with its three default wordings: [simplest, simple, double-entry]. */
export const TERM_ITEMS: TermItem[] = [
  { key: "assets", label: "What you own", business: ["Money You Have", "Accounts", "Assets"] },
  { key: "liabilities", label: "What you owe", business: ["Money You Owe", "Debts", "Liabilities"] },
  { key: "equity", label: "What's left over", business: ["What's Yours", "Owner's Equity", "Equity"], nonprofit: ["Net Assets", "Net Assets", "Net Assets"] },
  { key: "revenue", label: "Money coming in", business: ["Money In", "Income", "Revenue"], nonprofit: ["Money In", "Income", "Revenue & Support"] },
  { key: "expenses", label: "Money going out", business: ["Money Out", "Expenses", "Expenses"] },
  { key: "debitCredit", label: "Entry sides", business: ["Increase / Decrease", "Increase / Decrease", "Debit / Credit"] },
  { key: "netIncome", label: "Bottom line", business: ["Profit", "Net Income", "Net Income"], nonprofit: ["Net Change", "Net Change", "Change in Net Assets"] },
  { key: "incomeStatement", label: "Income report", business: ["Income Statement", "Income Statement", "Profit & Loss"], nonprofit: ["Money In & Out", "Income & Expenses", "Statement of Activities"] },
  { key: "balanceSheet", label: "Position report", business: ["What You Have & Owe", "Accounts Summary", "Balance Sheet"], nonprofit: ["What You Have & Owe", "Accounts Summary", "Statement of Financial Position"] },
  { key: "journal", label: "Advanced entry", business: ["Transaction", "Transaction", "Journal Entry"] },
];

export function termOptions(item: TermItem, orgType: OrgType): Triple {
  return (orgType === "nonprofit" && item.nonprofit) || item.business;
}

export function cleanOverrides(v: unknown): TermOverrides {
  const out: TermOverrides = {};
  if (v && typeof v === "object") {
    for (const item of TERM_ITEMS) {
      const val = (v as any)[item.key];
      if (val === "simplest" || val === "simple" || val === "accounting") out[item.key] = val;
    }
  }
  return out;
}

export interface Terms {
  orgLabel: string;
  levels: Record<TermKey, Terminology>;
  assets: string;
  liabilities: string;
  incomeStatement: string;
  balanceSheet: string;
  revenue: string;
  expenses: string;
  netIncome: string;
  equity: string;
  debit: string;
  credit: string;
  journal: string;
}

export function getTerms(orgType: OrgType, level: Terminology, overrides: TermOverrides = {}): Terms {
  const levels = {} as Record<TermKey, Terminology>;
  const w = {} as Record<TermKey, string>;
  for (const item of TERM_ITEMS) {
    const l = overrides[item.key] ?? level;
    levels[item.key] = l;
    w[item.key] = termOptions(item, orgType)[LEVELS.indexOf(l)];
  }
  const [debit, credit] = w.debitCredit.split(" / ");
  return {
    orgLabel: orgType === "nonprofit" ? "Nonprofit" : "Business",
    levels,
    assets: w.assets,
    liabilities: w.liabilities,
    incomeStatement: w.incomeStatement,
    balanceSheet: w.balanceSheet,
    revenue: w.revenue,
    expenses: w.expenses,
    netIncome: w.netIncome,
    equity: w.equity,
    debit,
    credit,
    journal: w.journal,
  };
}

export function accountTypeLabel(type: string, terms: Terms): string {
  const map: Record<string, string> = {
    asset: terms.assets,
    liability: terms.liabilities,
    equity: terms.equity,
    revenue: terms.revenue,
    expense: terms.expenses,
  };
  return map[type] ?? type;
}

/** Signed display balance: debit-normal accounts show sum as-is, credit-normal negated. */
export function displayBalance(accountType: string, sumCents: number): number {
  return accountType === "asset" || accountType === "expense" ? sumCents : -sumCents;
}
