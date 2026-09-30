export type OrgType = "nonprofit" | "business";
export type Terminology = "simplest" | "simple" | "accounting";

/** Normalize stored values (legacy "simplified" -> "simplest"). */
export function normalizeTerminology(v: unknown): Terminology {
  return v === "simple" || v === "accounting" ? v : "simplest";
}

export interface Terms {
  orgLabel: string;
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

export function getTerms(orgType: OrgType, pref: Terminology): Terms {
  const nonprofit = orgType === "nonprofit";
  if (pref === "accounting") {
    return {
      orgLabel: nonprofit ? "Nonprofit" : "Business",
      incomeStatement: nonprofit ? "Statement of Activities" : "Profit & Loss",
      balanceSheet: nonprofit ? "Statement of Financial Position" : "Balance Sheet",
      revenue: nonprofit ? "Revenue & Support" : "Revenue",
      expenses: "Expenses",
      netIncome: nonprofit ? "Change in Net Assets" : "Net Income",
      equity: nonprofit ? "Net Assets" : "Equity",
      debit: "Debit",
      credit: "Credit",
      journal: "Journal Entry",
    };
  }
  if (pref === "simple") {
    return {
      orgLabel: nonprofit ? "Nonprofit" : "Business",
      incomeStatement: nonprofit ? "Income & Expenses" : "Income Statement",
      balanceSheet: "Accounts Summary",
      revenue: "Income",
      expenses: "Expenses",
      netIncome: nonprofit ? "Net Change" : "Net Income",
      equity: nonprofit ? "Net Assets" : "Owner's Equity",
      debit: "Increase",
      credit: "Decrease",
      journal: "Transaction",
    };
  }
  return {
    orgLabel: nonprofit ? "Nonprofit" : "Business",
    incomeStatement: nonprofit ? "Money In & Out" : "Income Statement",
    balanceSheet: "What You Have & Owe",
    revenue: "Money In",
    expenses: "Money Out",
    netIncome: nonprofit ? "Net Change" : "Profit",
    equity: nonprofit ? "Net Assets" : "What's Yours",
    debit: "Increase",
    credit: "Decrease",
    journal: "Transaction",
  };
}

export function accountTypeLabel(type: string, pref: Terminology): string {
  const simple: Record<string, string> = {
    asset: "Money You Have",
    liability: "Money You Owe",
    equity: "What's Yours",
    revenue: "Money In",
    expense: "Money Out",
  };
  const formal: Record<string, string> = {
    asset: "Assets",
    liability: "Liabilities",
    equity: "Equity",
    revenue: "Revenue",
    expense: "Expenses",
  };
  const mid: Record<string, string> = {
    asset: "Accounts",
    liability: "Debts",
    equity: "Equity",
    revenue: "Income",
    expense: "Expenses",
  };
  const map = pref === "accounting" ? formal : pref === "simple" ? mid : simple;
  return map[type] ?? type;
}

/** Signed display balance: debit-normal accounts show sum as-is, credit-normal negated. */
export function displayBalance(accountType: string, sumCents: number): number {
  return accountType === "asset" || accountType === "expense" ? sumCents : -sumCents;
}
