import { describe, expect, it } from "vitest";
import { createSupabaseRepositories } from "./adapters/supabase";
import { ledger } from "./services/reports";
import { computeBalance, computeIncome } from "./report-math";

/** Chainable, awaitable mock of the supabase query builder, paging from a fixed dataset. */
function mockSupabase(allRows: any[]) {
  let range: [number, number] = [0, allRows.length];
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    neq: () => builder,
    lte: () => builder,
    order: () => builder,
    range: (from: number, to: number) => {
      range = [from, to + 1];
      return builder;
    },
    then: (res: (v: unknown) => unknown) =>
      Promise.resolve({ data: allRows.slice(range[0], range[1]), error: null }).then(res),
  };
  return createSupabaseRepositories({ from: () => builder } as any);
}

function makeRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `e${i}`,
    amount_cents: i % 2 === 0 ? 100 : -100,
    account_id: i % 2 === 0 ? "a1" : "a2",
    project_id: null,
    accounts: { name: i % 2 === 0 ? "Checking" : "Sales", type: i % 2 === 0 ? "asset" : "revenue" },
    transactions: { org_id: "o1", status: "posted", source: "manual", transaction_date: "2026-01-01" },
  }));
}

describe("ledger paging (cloud adapter)", () => {
  it("fetches every page past the 1,000-row cap", async () => {
    const rows = makeRows(2300); // pages of 1000, 1000, 300
    const l = await ledger(mockSupabase(rows), "o1");
    expect(l).toHaveLength(2300);
    expect(l[0]).toMatchObject({ accountName: "Checking", accountType: "asset", amountCents: 100 });
  });

  it("returns an empty ledger for an org with no entries", async () => {
    expect(await ledger(mockSupabase([]), "o1")).toEqual([]);
  });

  it("feeds report math correctly across pages", async () => {
    const l = await ledger(mockSupabase(makeRows(2001)), "o1");
    expect(computeIncome(l).revenue.length).toBeGreaterThan(0);
    expect(computeBalance(l, "2026-12-31", "2026-01-01")).toBeTruthy();
  });
});
