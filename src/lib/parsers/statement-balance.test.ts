import { describe, it, expect } from "vitest";
import { checkStatementBalance } from "./statement-balance";

describe("checkStatementBalance", () => {
  it("matches when opening + rows = closing", () => {
    expect(checkStatementBalance(10000, [-2500, 1000], 8500)).toEqual({
      status: "match",
      expectedCents: 8500,
    });
  });
  it("reports the gap", () => {
    expect(checkStatementBalance(10000, [-2500], 8500)).toEqual({
      status: "mismatch",
      expectedCents: 7500,
      gapCents: 1000,
    });
  });
  it("can't check without both balances", () => {
    expect(checkStatementBalance(null, [100], 200).status).toBe("unknown");
    expect(checkStatementBalance(100, [100], undefined).status).toBe("unknown");
  });
});
