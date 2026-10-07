import { describe, expect, it } from "vitest";
import { actualFromLedger, periodRange, periodStartFor, shiftPeriod } from "./budgets";

describe("budget periods", () => {
  it("finds month and fiscal-year starts", () => {
    expect(periodStartFor("month", "2026-02-17", 7)).toBe("2026-02-01");
    expect(periodStartFor("year", "2026-02-17", 7)).toBe("2025-07-01");
    expect(periodStartFor("year", "2026-08-01", 7)).toBe("2026-07-01");
    expect(periodStartFor("year", "2026-08-01", 1)).toBe("2026-01-01");
  });
  it("computes inclusive ranges", () => {
    expect(periodRange("month", "2028-02-01")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(periodRange("year", "2025-07-01")).toEqual({ from: "2025-07-01", to: "2026-06-30" });
    expect(periodRange("month", "2026-12-01").to).toBe("2026-12-31");
  });
  it("shifts periods", () => {
    expect(shiftPeriod("month", "2026-12-01", 1)).toBe("2027-01-01");
    expect(shiftPeriod("year", "2026-07-01", -1)).toBe("2025-07-01");
  });
  it("signs actuals by account type", () => {
    expect(actualFromLedger("revenue", -5000)).toBe(5000);
    expect(actualFromLedger("expense", 3000)).toBe(3000);
  });
});
