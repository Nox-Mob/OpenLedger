import { describe, expect, it } from "vitest";
import {
  computeBalance,
  computeIncome,
  computeProjectSpend,
  computeTrialBalance,
  inRange,
  type LedgerRow,
  type AccountType,
} from "./report-math";
import { fiscalYearStart } from "./dates";

// Helper: a balanced transaction as ledger rows (debit first, credit second).
function tx(
  date: string,
  amount: number,
  debit: [string, AccountType],
  credit: [string, AccountType],
  projectId?: string,
): LedgerRow[] {
  return [
    {
      transactionDate: date,
      amountCents: amount,
      accountName: debit[0],
      accountType: debit[1],
      projectId: projectId ?? null,
    },
    { transactionDate: date, amountCents: -amount, accountName: credit[0], accountType: credit[1] },
  ];
}
const cash: [string, AccountType] = ["Checking", "asset"];
const card: [string, AccountType] = ["Credit Card", "liability"];
const owner: [string, AccountType] = ["Owner Equity", "equity"];
const sales: [string, AccountType] = ["Sales", "revenue"];
const rent: [string, AccountType] = ["Rent", "expense"];

// Two fiscal years (FY starts July): prior year and current year activity.
const ledger: LedgerRow[] = [
  ...tx("2025-01-05", 500_00, cash, owner),
  ...tx("2025-03-10", 1200_00, cash, sales),
  ...tx("2025-06-30", 300_00, rent, cash), // last day of FY2025 (July start)
  ...tx("2025-07-01", 800_00, cash, sales), // first day of FY2026
  ...tx("2025-08-15", 250_00, rent, card, "p1"),
  ...tx("2026-03-31", 100_00, rent, cash, "p1"),
];

describe("balance sheet", () => {
  for (const asOf of ["2025-06-30", "2025-07-01", "2025-12-31", "2026-06-30"]) {
    it(`assets = liabilities + equity as of ${asOf}`, () => {
      const b = computeBalance(ledger, asOf, fiscalYearStart(asOf, 7));
      expect(b.totalAssetsCents).toBe(b.totalLiabilitiesCents + b.totalEquityCents);
      expect(b.balanced).toBe(true);
    });
  }

  it("rolls prior fiscal years into retained earnings", () => {
    const b = computeBalance(ledger, "2026-06-30", "2025-07-01");
    expect(b.retainedEarningsCents).toBe(1200_00 - 300_00);
    expect(b.netIncomeCents).toBe(800_00 - 250_00 - 100_00);
  });

  it("with a January fiscal year, everything in 2025 is prior-year on 2026-03-31", () => {
    const b = computeBalance(ledger, "2026-03-31", fiscalYearStart("2026-03-31", 1));
    expect(b.retainedEarningsCents).toBe(1200_00 - 300_00 + 800_00 - 250_00);
    expect(b.netIncomeCents).toBe(-100_00);
  });
});

describe("income statement", () => {
  it("net income equals the change in equity over the period", () => {
    const from = "2025-07-01",
      to = "2026-06-30";
    const income = computeIncome(inRange(ledger, from, to));
    const start = computeBalance(ledger, "2025-06-30", "2024-07-01");
    const end = computeBalance(ledger, to, from);
    // No owner contributions in the period, so equity change is purely income.
    expect(end.totalEquityCents - start.totalEquityCents).toBe(income.netCents);
  });

  it("includes both boundary dates and nothing outside", () => {
    const i = computeIncome(inRange(ledger, "2025-06-30", "2025-07-01"));
    expect(i.totalRevenueCents).toBe(800_00);
    expect(i.totalExpensesCents).toBe(300_00);
  });

  it("a 3/31 transaction stays in March", () => {
    expect(computeIncome(inRange(ledger, "2026-04-01", "2026-04-30")).totalExpensesCents).toBe(0);
    expect(computeIncome(inRange(ledger, "2026-03-01", "2026-03-31")).totalExpensesCents).toBe(
      100_00,
    );
  });
});

describe("trial balance", () => {
  it("debits equal credits", () => {
    const t = computeTrialBalance(ledger);
    expect(t.totalDebitCents).toBe(t.totalCreditCents);
    expect(t.balanced).toBe(true);
  });
  it("flags an unbalanced ledger", () => {
    const bad = [
      ...ledger,
      {
        transactionDate: "2026-01-01",
        amountCents: 1,
        accountName: "Checking",
        accountType: "asset" as const,
      },
    ];
    expect(computeTrialBalance(bad).balanced).toBe(false);
  });
});

describe("projects", () => {
  it("sums only expense lines tagged to the project", () => {
    expect(computeProjectSpend(ledger).get("p1")).toBe(350_00);
  });
});

describe("year-end net income", () => {
  const rows = (rev: number, exp: number) => [
    { amountCents: -rev, accountType: "revenue" },
    { amountCents: exp, accountType: "expense" },
    { amountCents: rev - exp, accountType: "asset" }, // ignored
  ];
  it("profit: $10,000 revenue − $6,000 expense = $4,000", async () => {
    const { netIncomeFromEntries } = await import("./report-math");
    expect(netIncomeFromEntries(rows(1_000_000, 600_000))).toBe(400_000);
  });
  it("loss: $6,000 revenue − $10,000 expense = −$4,000", async () => {
    const { netIncomeFromEntries } = await import("./report-math");
    expect(netIncomeFromEntries(rows(600_000, 1_000_000))).toBe(-400_000);
  });
  it("July fiscal year only counts Jul 1 – Jun 30", async () => {
    const { netIncomeFromEntries } = await import("./report-math");
    const start = fiscalYearStart("2026-06-30", 7);
    expect(start).toBe("2025-07-01");
    const all = [
      { amountCents: -500_00, accountType: "revenue", date: "2025-06-30" },
      { amountCents: -1_000_00, accountType: "revenue", date: "2025-07-01" },
      { amountCents: 300_00, accountType: "expense", date: "2026-06-30" },
      { amountCents: 900_00, accountType: "expense", date: "2026-07-01" },
    ];
    const inYear = all.filter((r) => r.date >= start && r.date <= "2026-06-30");
    expect(netIncomeFromEntries(inYear)).toBe(700_00);
  });
});
