import { describe, expect, it } from "vitest";
import { ACCOUNT_CATALOG, catalogFor, matchesCatalog } from "./account-catalog";

const TYPES = ["asset", "liability", "equity", "revenue", "expense"];

describe("account catalog", () => {
  for (const org of ["business", "nonprofit"] as const) {
    describe(org, () => {
      const list = catalogFor(org);
      it("has unique keys and unique name+type pairs", () => {
        expect(new Set(list.map((a) => a.key)).size).toBe(list.length);
        expect(new Set(list.map((a) => `${a.type}:${a.name.toLowerCase()}`)).size).toBe(list.length);
      });
      it("uses only valid account types", () => {
        for (const a of list) expect(TYPES).toContain(a.type);
      });
      it("includes a required bank account and a required equity account", () => {
        expect(list.some((a) => a.required && a.type === "asset")).toBe(true);
        expect(list.some((a) => a.required && a.type === "equity")).toBe(true);
      });
      it("marks every required account as on by default", () => {
        for (const a of list.filter((x) => x.required)) expect(a.defaultOn, a.key).toBe(true);
      });
      it("explains every account both ways", () => {
        for (const a of list) {
          expect(a.why.length, a.key).toBeGreaterThan(10);
          expect(a.whyNot.length, a.key).toBeGreaterThan(10);
        }
      });
      it("has at least one default revenue and expense account", () => {
        expect(list.some((a) => a.defaultOn && a.type === "revenue")).toBe(true);
        expect(list.some((a) => a.defaultOn && a.type === "expense")).toBe(true);
      });
    });
  }

  it("nonprofits get Fundraising Sales separate from Donations", () => {
    const names = ACCOUNT_CATALOG.nonprofit.map((a) => a.name);
    expect(names).toContain("Donations");
    expect(names).toContain("Fundraising Sales");
  });

  it("matchesCatalog ignores case and surrounding spaces but not type", () => {
    const c = catalogFor("business")[0]!;
    expect(matchesCatalog({ name: `  ${c.name.toUpperCase()} `, type: c.type }, c)).toBe(true);
    expect(matchesCatalog({ name: c.name, type: c.type === "asset" ? "expense" : "asset" }, c)).toBe(false);
  });
});
