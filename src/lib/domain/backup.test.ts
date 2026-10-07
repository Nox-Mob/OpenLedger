import { describe, expect, it } from "vitest";
import {
  BackupRejected,
  canonical,
  checkRestorable,
  keysFromSeed,
  remapTables,
  signBackup,
  TABLES,
  verifyBackup,
} from "./backup";
import { computeTrialBalance } from "@/lib/report-math";

const ORG = { id: "org-1", name: "Acme", currency: "USD" };
function sample() {
  const t: Record<string, Record<string, unknown>[]> = Object.fromEntries(
    TABLES.map((n) => [n, []]),
  );
  t["accounts"] = [
    { id: "a-cash", org_id: "org-1", name: "Cash", type: "asset" },
    { id: "a-rev", org_id: "org-1", name: "Sales", type: "revenue" },
  ];
  t["transactions"] = [
    {
      id: "t1",
      org_id: "org-1",
      description: "Sale",
      status: "posted",
      transaction_date: "2026-01-05",
    },
  ];
  t["entries"] = [
    { id: "e1", transaction_id: "t1", account_id: "a-cash", amount_cents: 1250 },
    { id: "e2", transaction_id: "t1", account_id: "a-rev", amount_cents: -1250 },
  ];
  t["bank_transactions"] = [
    { id: "b1", account_id: "a-cash", transaction_id: "t1", amount_cents: 1250, batch_id: null },
  ];
  return t;
}
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe("signed backups", async () => {
  const keys = await keysFromSeed("a".repeat(64));
  const other = await keysFromSeed("b".repeat(64));
  const signed = clone(await signBackup(keys, ORG, sample(), "2026-10-07T00:00:00Z"));

  it("canonical encoding ignores key order", () => {
    expect(canonical({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(canonical({ a: [{ c: 3, d: 2 }], b: 1 }));
  });

  it("verifies an untouched backup from the same install", async () => {
    const v = await verifyBackup(clone(signed), keys.publicRaw);
    expect(v.sameInstall).toBe(true);
    expect(v.counts["entries"]).toBe(2);
  });

  it("verifies but flags a backup from another install", async () => {
    const v = await verifyBackup(clone(signed), other.publicRaw);
    expect(v.sameInstall).toBe(false);
  });

  it.each([
    ["one cent changed", (b: any) => (b.tables.entries[0].amount_cents = 1251)],
    ["rows reordered", (b: any) => b.tables.entries.reverse()],
    ["row dropped", (b: any) => b.tables.entries.pop()],
    ["row added", (b: any) => b.tables.tags.push({ id: "x" })],
    ["org renamed", (b: any) => (b.organization.name = "Evil")],
    ["manifest edited", (b: any) => (b.manifest.orgName = "Evil")],
    ["key swapped", (b: any) => (b.manifest.publicKey = other.publicRaw)],
    ["wrong version", (b: any) => (b.manifest.version = 1)],
    ["unsigned v1 file", (b: any) => delete b.signature],
  ])("rejects: %s", async (_label, mutate) => {
    const b = clone(signed);
    mutate(b);
    await expect(verifyBackup(b, keys.publicRaw)).rejects.toBeInstanceOf(BackupRejected);
  });

  it("rejects a file re-signed after editing only if the signature is wrong", async () => {
    // Someone with their own install can re-sign: it verifies, but as another install.
    const t = sample();
    t["entries"]![0]!["amount_cents"] = 999;
    const forged = clone(await signBackup(other, ORG, t, "2026-10-07T00:00:00Z"));
    const v = await verifyBackup(forged, keys.publicRaw);
    expect(v.sameInstall).toBe(false);
    // ...and the bookkeeping re-check still catches the unbalanced result.
    expect(() =>
      checkRestorable(remapTables(v.backup.tables, () => crypto.randomUUID()).tables),
    ).toThrow();
  });
});

describe("restore planning", () => {
  it("remaps every ID and keeps reports identical", () => {
    const src = sample();
    const { tables } = remapTables(src, () => crypto.randomUUID());
    expect(tables["accounts"]![0]!["id"]).not.toBe("a-cash");
    expect(tables["bank_transactions"]![0]!["transaction_id"]).toBe(
      tables["transactions"]![0]!["id"],
    );
    checkRestorable(tables);
    const rows = (t: Record<string, Record<string, unknown>[]>) =>
      t["entries"]!.map((e) => {
        const a = t["accounts"]!.find((x) => x["id"] === e["account_id"])!;
        return {
          amountCents: Number(e["amount_cents"]),
          accountName: String(a["name"]),
          accountType: a["type"] as any,
          projectId: null,
          transactionDate: "2026-01-05",
        };
      });
    expect(computeTrialBalance(rows(tables))).toEqual(computeTrialBalance(rows(src)));
  });

  it("refuses dangling references and mismatched bank links", () => {
    const bad = sample();
    bad["entries"]![0]!["account_id"] = "missing";
    expect(() => remapTables(bad, () => crypto.randomUUID())).toThrow(/missing/);
    const link = sample();
    link["bank_transactions"]![0]!["amount_cents"] = 5;
    expect(() => checkRestorable(remapTables(link, () => crypto.randomUUID()).tables)).toThrow(
      /bank row/,
    );
  });
});
