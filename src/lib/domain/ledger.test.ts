import { describe, it, expect } from "vitest";
import {
  assertBalancedEntries,
  assertDateOpen,
  assertAccountsUsable,
  voidDecision,
  assertReconciliationCanFinish,
  newId,
} from "./ledger";

const e = (accountId: string, amountCents: number) => ({ accountId, amountCents });

describe("assertBalancedEntries", () => {
  it("accepts balanced", () =>
    expect(() => assertBalancedEntries([e("a", 100), e("b", -100)])).not.toThrow());
  it("rejects one line", () =>
    expect(() => assertBalancedEntries([e("a", 100)])).toThrow(/two lines/));
  it("rejects unbalanced", () =>
    expect(() => assertBalancedEntries([e("a", 100), e("b", -90)])).toThrow(/not balanced/));
  it("rejects zero", () =>
    expect(() => assertBalancedEntries([e("a", 0), e("b", 0)])).toThrow(/zero/));
  it("rejects fractions", () =>
    expect(() => assertBalancedEntries([e("a", 1.5), e("b", -1.5)])).toThrow(/whole/));
});

describe("assertDateOpen", () => {
  it("blocks on/before lock", () => {
    expect(() => assertDateOpen("2026-03-31", "2026-03-31")).toThrow(/closed/);
    expect(() => assertDateOpen("2026-04-01", "2026-03-31")).not.toThrow();
    expect(() => assertDateOpen("2026-01-01", null)).not.toThrow();
  });
  it("rejects bad format", () => expect(() => assertDateOpen("4/1/2026", null)).toThrow(/YYYY/));
});

describe("assertAccountsUsable", () => {
  const acct = (id: string, orgId = "o", isActive = true) => ({ id, orgId, isActive });
  it("accepts active same-org", () =>
    expect(() => assertAccountsUsable("o", ["a", "b"], [acct("a"), acct("b")])).not.toThrow());
  it("rejects missing/foreign", () => {
    expect(() => assertAccountsUsable("o", ["a", "b"], [acct("a")])).toThrow(/organization/);
    expect(() => assertAccountsUsable("o", ["a"], [acct("a", "x")])).toThrow(/organization/);
  });
  it("rejects archived", () =>
    expect(() => assertAccountsUsable("o", ["a"], [acct("a", "o", false)])).toThrow(/active/));
});

describe("voidDecision / reconciliation", () => {
  it("void rules", () => {
    expect(voidDecision("posted", false)).toBe("void");
    expect(voidDecision("void", true)).toBe("already_void");
    expect(() => voidDecision("posted", true)).toThrow(/statement check/);
  });
  it("finish needs zero", () => {
    expect(() => assertReconciliationCanFinish(0)).not.toThrow();
    expect(() => assertReconciliationCanFinish(1)).toThrow();
  });
  it("newId is a uuid", () => expect(newId()).toMatch(/^[0-9a-f-]{36}$/));
});
