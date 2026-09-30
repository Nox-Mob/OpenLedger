import { describe, expect, it } from "vitest";
import { fetchLedger } from "./reports.functions";
import { computeBalance, computeIncome } from "./report-math";

/** Chainable mock of the supabase query builder, paging from a fixed dataset. */
function mockSupabase(allRows: any[]) {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    lte: () => builder,
    order: () => builder,
    range: (from: number, to: number) =>
      Promise.resolve({ data: allRows.slice(from, to + 1), error: null }),
  };
  return { from: () => builder };
}

function makeRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    amount_cents: i % 2 === 0 ? 100 : -100,
    project_id: null,
    accounts: { name: i % 2 === 0 ? "Checking" : "Sales", type: i % 2 === 0 ? "asset" : "revenue" },
    transactions: { org_id: "o1", status: "posted", transaction_date: "2026-01-01" },
  }));
}

describe("fetchLedger paging", () => {
  it("fetches every page past the 1,000-row cap", async () => {
    const rows = makeRows(2300); // pages of 1000, 1000, 300
    const ledger = await fetchLedger(mockSupabase(rows), "o1");
    expect(ledger).toHaveLength(2300);
    expect(ledger[0]).toMatchObject({ accountName: "Checking", accountType: "asset", amountCents: 100 });
  });

  it("returns an empty ledger for an org with no entries", async () => {
    expect(await fetchLedger(mockSupabase([]), "o1")).toEqual([]);
  });
});

describe("report math at scale", () => {
  it("totals a 5,000-row ledger exactly", () => {
    const ledger = makeRows(5000).map((r) => ({
      amountCents: r.amount_cents,
      accountName: r.accounts.name,
      accountType: r.accounts.type as "asset" | "revenue",
      projectId: null,
      transactionDate: r.transactions.transaction_date,
    }));
    const b = computeBalance(ledger, "2026-12-31", "2026-01-01");
    expect(b.assets.find((a) => a.name === "Checking")?.balanceCents).toBe(250_000);
    expect(b.netIncomeCents).toBe(250_000);
    expect(b.balanced).toBe(true);
    const i = computeIncome(ledger);
    expect(i.totalRevenueCents).toBe(250_000);
  });
});
