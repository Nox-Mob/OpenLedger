import { describe, expect, it } from "vitest";
import { desktopStartTarget } from "@/lib/desktop-start";
import { createMemoryRepositories } from "@/lib/adapters/memory";
import { createOrganizationWithAccounts } from "@/lib/services/organizations";
import { LOCAL_USER_ID } from "@/lib/edition";

describe("desktop start", () => {
  it("opens setup when there are no local organizations", () => {
    expect(desktopStartTarget([], null)).toEqual({ to: "/onboarding", orgId: null });
  });
  it("opens the ledger of the last-used organization", () => {
    expect(desktopStartTarget([{ id: "a" }, { id: "b" }], "b")).toEqual({
      to: "/ledger",
      orgId: "b",
    });
  });
  it("falls back to the first organization when the stored one is gone", () => {
    expect(desktopStartTarget([{ id: "a" }], "gone")).toEqual({ to: "/ledger", orgId: "a" });
  });
  it("after setup, the next start goes to the ledger", async () => {
    const repos = createMemoryRepositories();
    const id = await createOrganizationWithAccounts(repos, LOCAL_USER_ID, {
      name: "Corner Shop",
      orgType: "business",
      accountKeys: [],
      currency: "USD",
      fiscalYearStartMonth: 1,
      terminology: "simplest",
      timezone: "America/Chicago",
    });
    const orgs = await repos.orgs.listForUser(LOCAL_USER_ID);
    expect(orgs[0]?.role).toBe("admin");
    expect(desktopStartTarget(orgs, null)).toEqual({ to: "/ledger", orgId: id });
    expect((await repos.accounts.list(id)).length).toBeGreaterThan(0);
  });
});
