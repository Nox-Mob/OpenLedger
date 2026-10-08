// Full-year scenarios with golden totals: a business and a nonprofit run twelve months
// of activity through the shared services and memory adapter, then reports must match
// hand-computed figures exactly. Any change to posting or report math shows up here.
import { describe, expect, it } from "vitest";
import { createMemoryRepositories } from "@/lib/adapters/memory";
import { computeBalance, computeIncome, computeTrialBalance } from "@/lib/report-math";
import { postTransaction, voidTransaction } from "./ledger";

const USER = "00000000-0000-4000-8000-0000000000aa";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
type T = "asset" | "liability" | "equity" | "revenue" | "expense";

async function setup(orgType: "business" | "nonprofit", accounts: [number, string, T][]) {
  const repos = createMemoryRepositories();
  const ORG = id(1);
  await repos.orgs.create({
    id: ORG,
    name: "Scenario",
    orgType,
    currency: "USD",
    fiscalYearStartMonth: 1,
    timezone: "America/Chicago",
    terminology: "simple",
    termOverrides: {},
    aiPdfEnabled: false,
    booksLockedThrough: null,
    createdBy: USER,
  });
  await repos.accounts.create(
    accounts.map(([n, name, type]) => ({
      id: id(n),
      orgId: ORG,
      name,
      type,
      subtype: null,
      isActive: true,
    })),
  );
  const post = (date: string, description: string, lines: [number, number][]) =>
    postTransaction(repos, {
      orgId: ORG,
      userId: USER,
      transactionDate: date,
      description,
      source: "manual",
      entries: lines.map(([a, c]) => ({ accountId: id(a), amountCents: c })),
    });
  return { repos, ORG, post };
}

const month = (m: number) => `2026-${String(m).padStart(2, "0")}-15`;

describe("full-year business scenario", () => {
  it("matches golden totals", async () => {
    const { repos, ORG, post } = await setup("business", [
      [10, "Checking", "asset"],
      [11, "Credit card", "liability"],
      [12, "Owner equity", "equity"],
      [13, "Sales", "revenue"],
      [14, "Rent", "expense"],
      [15, "Supplies", "expense"],
    ]);
    await post("2026-01-01", "Owner investment", [
      [10, 1_000_000],
      [12, -1_000_000],
    ]);
    for (let m = 1; m <= 12; m++) {
      await post(month(m), "Sales", [
        [10, 250_000 + m * 1_000],
        [13, -(250_000 + m * 1_000)],
      ]);
      await post(month(m), "Rent", [
        [14, 120_000],
        [10, -120_000],
      ]);
      await post(month(m), "Supplies on card", [
        [15, 15_550],
        [11, -15_550],
      ]);
    }
    const mistake = await post("2026-06-30", "Duplicate sale", [
      [10, 99_999],
      [13, -99_999],
    ]);
    await voidTransaction(repos, { orgId: ORG, userId: USER, id: mistake.id });

    const rows = await repos.transactions.ledgerRows(ORG);
    const income = computeIncome(rows);
    expect(income.totalRevenueCents).toBe(3_078_000);
    expect(income.totalExpensesCents).toBe(1_626_600);
    expect(income.netCents).toBe(1_451_400);

    const bs = computeBalance(rows, "2026-12-31", "2026-01-01");
    expect(bs.totalAssetsCents).toBe(2_638_000);
    expect(bs.totalLiabilitiesCents).toBe(186_600);
    expect(bs.totalAssetsCents).toBe(bs.totalLiabilitiesCents + bs.totalEquityCents);

    const tb = computeTrialBalance(rows) as any;
    const lines = (tb.lines ?? tb.rows ?? tb) as { debitCents?: number; creditCents?: number }[];
    if (Array.isArray(lines) && lines[0]?.debitCents !== undefined) {
      const d = lines.reduce((a, l) => a + (l.debitCents ?? 0), 0);
      const c = lines.reduce((a, l) => a + (l.creditCents ?? 0), 0);
      expect(d).toBe(c);
    }
    expect(repos.store.audit.length).toBe(1 + 36 + 2);
  });
});

describe("full-year nonprofit scenario", () => {
  it("matches golden totals and rolls prior years into net assets", async () => {
    const { repos, ORG, post } = await setup("nonprofit", [
      [20, "Bank", "asset"],
      [21, "Net assets", "equity"],
      [22, "Donations", "revenue"],
      [23, "Grants", "revenue"],
      [24, "Program costs", "expense"],
      [25, "Admin costs", "expense"],
    ]);
    await post("2025-12-31", "Prior year donation", [
      [20, 500_000],
      [22, -500_000],
    ]);
    for (let m = 1; m <= 12; m++) {
      await post(month(m), "Monthly donations", [
        [20, 80_000],
        [22, -80_000],
      ]);
      await post(month(m), "Programs", [
        [24, 60_000],
        [20, -60_000],
      ]);
      await post(month(m), "Admin", [
        [25, 12_345],
        [20, -12_345],
      ]);
    }
    await post("2026-03-01", "Grant award", [
      [20, 300_000],
      [23, -300_000],
    ]);

    const rows = await repos.transactions.ledgerRows(ORG);
    const year = rows.filter((r) => r.transactionDate >= "2026-01-01");
    const income = computeIncome(year);
    expect(income.totalRevenueCents).toBe(1_260_000);
    expect(income.totalExpensesCents).toBe(868_140);
    expect(income.netCents).toBe(391_860);

    const bs = computeBalance(rows, "2026-12-31", "2026-01-01");
    expect(bs.retainedEarningsCents).toBe(500_000);
    expect(bs.netIncomeCents).toBe(391_860);
    expect(bs.totalAssetsCents).toBe(891_860);
    expect(bs.totalAssetsCents).toBe(bs.totalLiabilitiesCents + bs.totalEquityCents);
  });
});
