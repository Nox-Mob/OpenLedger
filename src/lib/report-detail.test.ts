import { describe, expect, it } from "vitest";
import { computeFundActivity, computeGeneralLedger, computeStatementCheck } from "./report-detail";
import { computeBalance, computeIncome, computeTrialBalance, type LedgerRow } from "./report-math";

const row = (
  date: string,
  tx: string,
  name: string,
  type: LedgerRow["accountType"],
  cents: number,
  fundId: string | null = null,
): LedgerRow & { source: "manual" | "release" } => ({
  transactionDate: date,
  transactionId: tx,
  description: tx,
  accountName: name,
  accountType: type,
  amountCents: cents,
  fundId,
  source: "manual",
});

const rows = [
  row("2025-12-15", "t0", "Checking", "asset", 10000),
  row("2025-12-15", "t0", "Donations", "revenue", -10000),
  row("2026-01-05", "t1", "Checking", "asset", 5000),
  row("2026-01-05", "t1", "Donations", "revenue", -5000),
  row("2026-02-01", "t2", "Rent", "expense", 3000),
  row("2026-02-01", "t2", "Checking", "asset", -3000),
];
const f = { from: "2026-01-01", to: "2026-12-31", fiscalYearStart: "2026-01-01" };

describe("general ledger", () => {
  it("carries asset opening balances and runs a balance per line", () => {
    const checking = computeGeneralLedger(rows, f).find((a) => a.accountName === "Checking")!;
    expect(checking.openingCents).toBe(10000);
    expect(checking.lines.map((l) => l.balanceCents)).toEqual([15000, 12000]);
    expect(checking.closingCents).toBe(12000);
    expect(checking.totalDebitCents).toBe(5000);
    expect(checking.totalCreditCents).toBe(3000);
  });
  it("starts income accounts at zero each fiscal year", () => {
    const d = computeGeneralLedger(rows, f).find((a) => a.accountName === "Donations")!;
    expect(d.openingCents).toBe(0);
    expect(d.closingCents).toBe(5000);
  });
  it("account activity filters to one account", () => {
    const one = computeGeneralLedger(rows, { ...f, accountName: "Rent" });
    expect(one).toHaveLength(1);
    expect(one[0]!.closingCents).toBe(3000);
  });
  it("closing balances match the balance sheet and income statement", () => {
    const gl = computeGeneralLedger(rows, f);
    const bs = computeBalance(rows, f.to, f.fiscalYearStart);
    expect(gl.find((a) => a.accountName === "Checking")!.closingCents).toBe(bs.totalAssetsCents);
    const inc = computeIncome(rows.filter((r) => r.transactionDate >= f.from));
    expect(gl.find((a) => a.accountName === "Donations")!.closingCents).toBe(inc.totalRevenueCents);
  });
  it("excludes rows after the end date", () => {
    const gl = computeGeneralLedger(rows, { ...f, to: "2026-01-31" });
    expect(gl.find((a) => a.accountName === "Rent")).toBeUndefined();
  });
});

describe("fund activity", () => {
  it("rolls opening + period into closing", () => {
    const fr = [
      row("2025-12-01", "a", "Grants", "revenue", -2000, "f1"),
      row("2026-03-01", "b", "Grants", "revenue", -1000, "f1"),
      row("2026-04-01", "c", "Supplies", "expense", 400, "f1"),
    ];
    const [a] = computeFundActivity(
      fr,
      [{ id: "f1", name: "Food", isRestricted: false }],
      "2026-01-01",
      "2026-12-31",
    );
    expect(a).toMatchObject({
      openingCents: 2000,
      receivedCents: 1000,
      spentCents: 400,
      closingCents: 2600,
    });
  });
});

describe("statement check report", () => {
  it("splits matched and outstanding items", () => {
    const r = computeStatementCheck(
      "asset",
      { beginningBalanceCents: 1000, endingBalanceCents: 1500 },
      [
        { date: "2026-01-02", description: "Dep", amountCents: 500, cleared: true },
        { date: "2026-01-30", description: "Check 101", amountCents: -200, cleared: false },
      ],
    );
    expect(r.cleared).toHaveLength(1);
    expect(r.outstanding).toHaveLength(1);
    expect(r.clearedBalanceCents).toBe(1500);
    expect(r.differenceCents).toBe(0);
    expect(r.adjustedBalanceCents).toBe(1300);
  });
  it("flips sign for credit-card (liability) accounts", () => {
    const r = computeStatementCheck(
      "liability",
      { beginningBalanceCents: 0, endingBalanceCents: 300 },
      [{ date: "2026-01-02", description: "Charge", amountCents: -300, cleared: true }],
    );
    expect(r.differenceCents).toBe(0);
  });
});

describe("speed at 50,000 ledger lines", () => {
  it("runs every report over 50k lines in under two seconds", () => {
    const big: LedgerRow[] = [];
    for (let i = 0; i < 25000; i++) {
      const d = `2026-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`;
      big.push(row(d, `t${i}`, "Checking", "asset", 100));
      big.push(row(d, `t${i}`, `Income ${i % 20}`, "revenue", -100));
    }
    const t0 = performance.now();
    const gl = computeGeneralLedger(big, f);
    computeBalance(big, f.to, f.fiscalYearStart);
    computeTrialBalance(big, f.to);
    computeIncome(big);
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(gl.find((a) => a.accountName === "Checking")!.closingCents).toBe(2500000);
  });
});
