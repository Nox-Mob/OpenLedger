import { describe, expect, it } from "vitest";
import { deleteBlocker, duplicateName, isUnused, NO_USAGE } from "./accounts";
import { pickCurrentOrg, roleLabel } from "@/lib/current-org";

describe("account deletion", () => {
  it("allows deleting an account nothing ever used", () => {
    expect(isUnused(NO_USAGE)).toBe(true);
    expect(deleteBlocker(NO_USAGE)).toBeNull();
  });
  it("refuses an account with transactions", () => {
    expect(deleteBlocker({ ...NO_USAGE, entries: 1 })).toBe(
      "This account has transactions, so it can only be archived.",
    );
  });
  it("refuses an account with imported bank rows or imports", () => {
    expect(deleteBlocker({ ...NO_USAGE, bankRows: 3 })).toMatch(/imported bank rows/);
    expect(deleteBlocker({ ...NO_USAGE, imports: 1 })).toMatch(/imported bank rows/);
  });
  it("refuses an account with statement checks or budgets", () => {
    expect(deleteBlocker({ ...NO_USAGE, reconciliations: 1 })).toMatch(/statement checks/);
    expect(deleteBlocker({ ...NO_USAGE, budgets: 1 })).toMatch(/budget/);
  });
  it("refuses a required account even if unused", () => {
    expect(deleteBlocker(NO_USAGE, { required: true })).toMatch(/required/);
  });
});

describe("duplicate names", () => {
  const existing = [{ name: "Main Checking" }, { name: "Petty Cash" }];
  it("catches the same name typed differently", () => {
    expect(duplicateName("main checking", existing)).toBe(
      '"main checking" already exists. Choose a different name.',
    );
    expect(duplicateName("  Petty   Cash ", existing)).not.toBeNull();
  });
  it("allows a new name", () => {
    expect(duplicateName("Savings", existing)).toBeNull();
  });
});

describe("organization switcher", () => {
  const orgs = [{ id: "a" }, { id: "b" }];
  it("keeps the stored organization when the user still belongs to it", () => {
    expect(pickCurrentOrg(orgs, "b")).toEqual({ id: "b" });
  });
  it("falls back to the first organization when the stored one is gone", () => {
    expect(pickCurrentOrg(orgs, "removed")).toEqual({ id: "a" });
    expect(pickCurrentOrg(orgs, null)).toEqual({ id: "a" });
  });
  it("shows nothing when the user has no organizations", () => {
    expect(pickCurrentOrg([], "a")).toBeNull();
  });
  it("labels roles in plain words", () => {
    expect([roleLabel("admin"), roleLabel("member"), roleLabel("viewer")]).toEqual([
      "Admin",
      "Member",
      "View only",
    ]);
  });
});
