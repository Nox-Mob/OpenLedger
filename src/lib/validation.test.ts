import { describe, expect, it } from "vitest";
import { checkAmount, checkDate, checkName, nameField, sameName, MAX_AMOUNT_CENTS } from "./validation";
import { errorMessage } from "./errors";
import { toColumns } from "./columns";

describe("checkAmount", () => {
  it("parses dollars and cents into whole cents", () => {
    expect(checkAmount("$1,234.56")).toEqual({ ok: true, value: 123456 });
    expect(checkAmount("1.005".slice(0, 4))).toEqual({ ok: true, value: 100 });
    expect(checkAmount("0.1")).toEqual({ ok: true, value: 10 });
  });
  it("rejects more than two decimal places instead of rounding", () => {
    expect(checkAmount("1.234")).toEqual({
      ok: false,
      error: "Amount can't have more than two decimal places.",
    });
  });
  it("rejects zero unless allowed", () => {
    expect(checkAmount("0").ok).toBe(false);
    expect(checkAmount("0", { allowZero: true })).toEqual({ ok: true, value: 0 });
  });
  it("rejects negatives unless allowed", () => {
    expect(checkAmount("-5")).toEqual({ ok: false, error: "Amount can't be negative." });
    expect(checkAmount("-5", { allowNegative: true })).toEqual({ ok: true, value: -500 });
  });
  it("rejects text and empty input", () => {
    expect(checkAmount("abc").ok).toBe(false);
    expect(checkAmount("1.2.3").ok).toBe(false);
    expect(checkAmount("")).toEqual({ ok: false, error: "Amount is required." });
  });
  it("rejects amounts over the limit", () => {
    expect(checkAmount("1000000000.00").ok).toBe(false);
    expect(checkAmount("999999999.99")).toEqual({ ok: true, value: MAX_AMOUNT_CENTS });
  });
  it("uses the field label in messages", () => {
    expect(checkAmount("", { label: "Budget" })).toEqual({ ok: false, error: "Budget is required." });
  });
});

describe("checkDate", () => {
  it("accepts real calendar dates only", () => {
    expect(checkDate("2026-02-28")).toEqual({ ok: true, value: "2026-02-28" });
    expect(checkDate("2026-02-30").ok).toBe(false);
    expect(checkDate("02/28/2026").ok).toBe(false);
    expect(checkDate("").ok).toBe(false);
  });
  it("refuses dates on or before the books lock", () => {
    expect(checkDate("2025-12-31", { booksLockedThrough: "2025-12-31" }).ok).toBe(false);
    expect(checkDate("2026-01-01", { booksLockedThrough: "2025-12-31" }).ok).toBe(true);
  });
});

describe("checkName", () => {
  it("trims and collapses spaces", () => {
    expect(checkName("  Main   Checking ")).toEqual({ ok: true, value: "Main Checking" });
  });
  it("requires a name of 120 characters or fewer", () => {
    expect(checkName("   ").ok).toBe(false);
    expect(checkName("a".repeat(120)).ok).toBe(true);
    expect(checkName("a".repeat(121)).ok).toBe(false);
  });
  it("refuses hidden control characters", () => {
    expect(checkName("Cash\u0000").ok).toBe(false);
  });
  it("server field gives the same message as the form", () => {
    const r = nameField("Account name").safeParse(" ");
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("Account name is required.");
    expect(nameField().parse(" Petty  cash ")).toBe("Petty cash");
  });
  it("compares names ignoring case and spacing", () => {
    expect(sameName("Petty Cash", " petty   cash")).toBe(true);
    expect(sameName("Petty Cash", "Petty Cash 2")).toBe(false);
  });
});

describe("errorMessage", () => {
  it("reads messages from any thrown value", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage({ message: "db said no" })).toBe("db said no");
    expect(errorMessage("plain")).toBe("plain");
    expect(errorMessage(undefined, "fallback")).toBe("fallback");
  });
});

describe("toColumns", () => {
  it("maps form fields to database columns", () => {
    expect(toColumns({ budgetCents: 500, isRestricted: true, type: "expense" })).toEqual({
      budget_cents: 500,
      is_restricted: true,
      type: "expense",
    });
  });
});
