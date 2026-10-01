import { describe, expect, it } from "vitest";
import { formatCents, parseToCents } from "./money";

describe("formatCents", () => {
  it("formats whole and fractional amounts with two decimals", () => {
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(5)).toBe("$0.05");
    expect(formatCents(123456)).toBe("$1,234.56");
  });
  it("puts the minus sign before the dollar sign", () => {
    expect(formatCents(-2500)).toBe("-$25.00");
  });
  it("only shows a plus sign when asked", () => {
    expect(formatCents(100)).toBe("$1.00");
    expect(formatCents(100, { sign: true })).toBe("+$1.00");
    expect(formatCents(0, { sign: true })).toBe("$0.00");
  });
  it("handles very large ledgers without losing cents", () => {
    expect(formatCents(99999999999)).toBe("$999,999,999.99");
  });
});

describe("parseToCents", () => {
  it("parses plain, dollar-signed and comma-grouped input", () => {
    expect(parseToCents("12.34")).toBe(1234);
    expect(parseToCents("$1,234.50")).toBe(123450);
    expect(parseToCents(" 7 ")).toBe(700);
  });
  it("rounds floating point safely (0.1 + 0.2 style traps)", () => {
    expect(parseToCents("0.29")).toBe(29);
    expect(parseToCents("1.005")).toBe(101);
    expect(parseToCents("19.99")).toBe(1999);
  });
  it("keeps negatives negative", () => {
    expect(parseToCents("-4.20")).toBe(-420);
  });
  it("rejects empty and non-numeric input", () => {
    expect(parseToCents("")).toBeNull();
    expect(parseToCents("   ")).toBeNull();
    expect(parseToCents("abc")).toBeNull();
    expect(parseToCents("Infinity")).toBeNull();
  });
  it("round-trips with formatCents", () => {
    for (const c of [1, 99, 100, 123456, -98765]) expect(parseToCents(formatCents(c))).toBe(c);
  });
});
