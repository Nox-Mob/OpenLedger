import { describe, expect, it } from "vitest";
import {
  assertPledgeSettlement,
  assertReleaseAllowed,
  computeFundBalances,
  netAssetsByRestriction,
  type FundRow,
} from "./funds";

const funds = [
  { id: "r", name: "Building", isRestricted: true },
  { id: "u", name: "General", isRestricted: false },
];
const rows: FundRow[] = [
  // 1,000 restricted gift into cash
  { amountCents: 100000, accountType: "asset", fundId: null, source: "manual" },
  { amountCents: -100000, accountType: "revenue", fundId: "r", source: "manual" },
  // 300 spent from the restricted fund
  { amountCents: 30000, accountType: "expense", fundId: "r", source: "manual" },
  { amountCents: -30000, accountType: "asset", fundId: null, source: "manual" },
  // 300 released
  { amountCents: 30000, accountType: "equity", fundId: "r", source: "release" },
  { amountCents: -30000, accountType: "equity", fundId: null, source: "release" },
  // 200 unrestricted gift
  { amountCents: 20000, accountType: "asset", fundId: null, source: "manual" },
  { amountCents: -20000, accountType: "revenue", fundId: "u", source: "manual" },
];

describe("fund balances", () => {
  it("tracks received, spent, released and remaining", () => {
    const [r, u] = computeFundBalances(rows, funds);
    expect(r).toMatchObject({ receivedCents: 100000, spentCents: 30000, releasedCents: 30000 });
    expect(r!.remainingCents).toBe(70000);
    expect(u!.remainingCents).toBe(20000);
  });

  it("splits net assets by restriction", () => {
    expect(netAssetsByRestriction(rows, funds)).toEqual({
      totalCents: 90000,
      withRestrictionsCents: 70000,
      withoutRestrictionsCents: 20000,
    });
  });

  it("limits releases to the restricted balance", () => {
    const [r, u] = computeFundBalances(rows, funds);
    expect(() => assertReleaseAllowed(r, 70000)).not.toThrow();
    expect(() => assertReleaseAllowed(r, 70001)).toThrow(/only has/);
    expect(() => assertReleaseAllowed(u, 100)).toThrow(/restricted/);
    expect(() => assertReleaseAllowed(r, 0)).toThrow();
    expect(() => assertReleaseAllowed(undefined, 1)).toThrow();
  });
});

describe("pledges", () => {
  it("accepts payments up to the outstanding amount", () => {
    expect(() => assertPledgeSettlement("open", 10000, 4000, 6000)).not.toThrow();
    expect(() => assertPledgeSettlement("open", 10000, 4000, 6001)).toThrow(/more than/);
    expect(() => assertPledgeSettlement("paid", 10000, 10000, 1)).toThrow(/settled/);
    expect(() => assertPledgeSettlement("open", 10000, 0, -5)).toThrow();
  });
});
