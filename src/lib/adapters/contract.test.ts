// Adapter contract: every storage adapter must pass the same workflows through the ports.
// Add a new adapter here and it is held to the same behavior as the others.
import { beforeEach, describe, expect, it } from "vitest";
import initSqlJs from "sql.js";
import type { Repositories } from "@/lib/ports";
import { createMemoryRepositories } from "./memory";
import { createSqliteRepositories, migrateSqlite } from "./sqlite";
import { sqlJsDriver } from "./sqlite/sqljs-driver";
import {
  postBankRow,
  postOpeningBalance,
  postTransaction,
  voidTransaction,
} from "@/lib/services/ledger";

const ORG = "10000000-0000-4000-8000-000000000001";
const OTHER = "10000000-0000-4000-8000-000000000002";
const USER = "10000000-0000-4000-8000-0000000000aa";
const CASH = "10000000-0000-4000-8000-0000000000c1";
const SALES = "10000000-0000-4000-8000-0000000000c2";
const EQUITY = "10000000-0000-4000-8000-0000000000c3";
const OLD = "10000000-0000-4000-8000-0000000000c4";

const SQL = await initSqlJs();
let sqliteDriver: ReturnType<typeof sqlJsDriver>;

const adapters: [string, () => Promise<Repositories>][] = [
  ["memory", async () => createMemoryRepositories()],
  [
    "sqlite",
    async () => {
      sqliteDriver = sqlJsDriver(new SQL.Database());
      await migrateSqlite(sqliteDriver);
      return createSqliteRepositories(sqliteDriver);
    },
  ],
];

describe.each(adapters)("%s adapter", (name, make) => {
  let repos: Repositories;
  const sale = (over: Partial<Parameters<typeof postTransaction>[1]> = {}) => ({
    orgId: ORG,
    userId: USER,
    transactionDate: "2026-02-01",
    description: "Sale",
    source: "manual" as const,
    entries: [
      { accountId: CASH, amountCents: 1000 },
      { accountId: SALES, amountCents: -1000 },
    ],
    ...over,
  });

  beforeEach(async () => {
    repos = await make();
    const base = {
      orgType: "business" as const,
      currency: "USD",
      fiscalYearStartMonth: 1,
      timezone: "America/Chicago",
      terminology: "simple",
      termOverrides: {},
      aiPdfEnabled: false,
      booksLockedThrough: null,
      createdBy: USER,
    };
    await repos.orgs.create({ ...base, id: ORG, name: "Org" });
    await repos.orgs.create({ ...base, id: OTHER, name: "Other" });
    const a = (id: string, n: string, type: "asset" | "revenue" | "equity", isActive = true) => ({
      id,
      orgId: ORG,
      name: n,
      type,
      subtype: null,
      isActive,
    });
    await repos.accounts.create([
      a(CASH, "Cash", "asset"),
      a(SALES, "Sales", "revenue"),
      a(EQUITY, "Equity", "equity"),
      a(OLD, "Old", "asset", false),
    ]);
  });

  it("creator becomes admin; orgs are listed per user", async () => {
    expect(await repos.orgs.roleOf(USER, ORG)).toBe("admin");
    expect((await repos.orgs.listForUser(USER)).map((o) => o.id).sort()).toEqual([ORG, OTHER].sort());
  });

  it("archived accounts hide from list unless asked", async () => {
    expect((await repos.accounts.list(ORG)).map((x) => x.name)).not.toContain("Old");
    expect((await repos.accounts.list(ORG, { includeArchived: true })).map((x) => x.name)).toContain("Old");
  });

  it("posts, reads back and sums to zero", async () => {
    const { id } = await postTransaction(repos, sale());
    const tx = await repos.transactions.get(ORG, id);
    expect(tx?.status).toBe("posted");
    expect(tx?.entries.reduce((s, e) => s + e.amountCents, 0)).toBe(0);
    expect(await repos.transactions.get(OTHER, id)).toBeNull();
    expect((await repos.transactions.list(ORG, { accountId: CASH })).map((t) => t.id)).toEqual([id]);
  });

  it("idempotency key returns the original", async () => {
    const a = await postTransaction(repos, sale({ idempotencyKey: "form-abcdef" }));
    const b = await postTransaction(repos, sale({ idempotencyKey: "form-abcdef" }));
    expect(b).toEqual({ id: a.id, duplicate: true });
    expect(await repos.transactions.list(ORG)).toHaveLength(1);
  });

  it("books lock and archived accounts are refused", async () => {
    await expect(
      postTransaction(
        repos,
        sale({
          entries: [
            { accountId: OLD, amountCents: 1 },
            { accountId: SALES, amountCents: -1 },
          ],
        }),
      ),
    ).rejects.toThrow(/active/);
    await repos.orgs.setBooksLockedThrough(ORG, "2026-12-31");
    await expect(postTransaction(repos, sale())).rejects.toThrow(/closed through/);
  });

  it("void is idempotent, unticks in-progress check, blocked by a completed one", async () => {
    const { id } = await postTransaction(repos, sale());
    const entryId = (await repos.transactions.get(ORG, id))!.entries.find((e) => e.accountId === CASH)!.id;
    await repos.reconciliations.start({
      id: "20000000-0000-4000-8000-000000000001",
      orgId: ORG,
      accountId: CASH,
      periodStart: "2026-02-01",
      periodEnd: "2026-02-28",
      beginningBalanceCents: 0,
      endingBalanceCents: 1000,
      mode: "simple",
      batchId: null,
      createdBy: USER,
    });
    await repos.reconciliations.setTicked("20000000-0000-4000-8000-000000000001", [entryId], true);
    expect(await repos.reconciliations.clearedTotalCents("20000000-0000-4000-8000-000000000001")).toBe(1000);
    await voidTransaction(repos, { orgId: ORG, userId: USER, transactionId: id });
    const after = await repos.transactions.get(ORG, id);
    expect(after?.status).toBe("void");
    expect(after?.entries.every((e) => e.reconciliationId === null)).toBe(true);
    expect(await voidTransaction(repos, { orgId: ORG, userId: USER, transactionId: id })).toEqual({
      ok: true,
      alreadyVoid: true,
    });

    const second = await postTransaction(repos, sale());
    const e2 = (await repos.transactions.get(ORG, second.id))!.entries[0]!.id;
    await repos.reconciliations.setTicked("20000000-0000-4000-8000-000000000001", [e2], true);
    await repos.reconciliations.finish(ORG, "20000000-0000-4000-8000-000000000001", USER);
    await expect(
      voidTransaction(repos, { orgId: ORG, userId: USER, transactionId: second.id }),
    ).rejects.toThrow(/statement check/);
  });

  it("one opening balance per account", async () => {
    const ob = {
      orgId: ORG,
      userId: USER,
      accountId: CASH,
      equityAccountId: EQUITY,
      amountCents: 5000,
      date: "2026-01-01",
    };
    expect(await postOpeningBalance(repos, ob)).toEqual({ ok: true });
    await expect(postOpeningBalance(repos, { ...ob, amountCents: 1 })).rejects.toThrow(/already/);
    const rows = await repos.transactions.ledgerRows(ORG);
    expect(rows.find((r) => r.accountId === CASH)?.amountCents).toBe(5000);
  });

  it("bank rows: dedupe, post once, void returns to unmatched", async () => {
    const row = {
      id: "30000000-0000-4000-8000-000000000001",
      orgId: ORG,
      accountId: CASH,
      bankDate: "2026-02-03",
      description: "Deposit",
      amountCents: 2500,
      externalId: "FIT1",
      fingerprint: "f1",
      rowSeq: 1,
      batchId: null,
    };
    expect(await repos.bank.insertMany([row])).toEqual({ inserted: 1, duplicates: 0 });
    expect(
      await repos.bank.insertMany([{ ...row, id: "30000000-0000-4000-8000-000000000002" }]),
    ).toEqual({ inserted: 0, duplicates: 1 });
    const { id } = await postBankRow(repos, {
      orgId: ORG,
      userId: USER,
      bankTransactionId: row.id,
      offsetAccountId: SALES,
    });
    expect((await repos.bank.get(ORG, row.id))?.transactionId).toBe(id);
    await expect(
      postBankRow(repos, { orgId: ORG, userId: USER, bankTransactionId: row.id, offsetAccountId: SALES }),
    ).rejects.toThrow(/Already posted/);
    await voidTransaction(repos, { orgId: ORG, userId: USER, transactionId: id });
    expect((await repos.bank.listUnmatched(ORG)).map((b) => b.id)).toEqual([row.id]);
  });

  if (name === "sqlite") {
    it("database guards block edits, deletes, un-void and unbalanced writes", async () => {
      const { id } = await postTransaction(repos, sale());
      const bad = (sql: string, p: (string | number)[] = []) =>
        expect(sqliteDriver.execute(sql, p)).rejects.toThrow();
      await bad("UPDATE entries SET amount_cents = 5 WHERE transaction_id = ?", [id]);
      await bad("DELETE FROM entries WHERE transaction_id = ?", [id]);
      await bad("UPDATE transactions SET description = 'x' WHERE id = ?", [id]);
      await bad("DELETE FROM transactions WHERE id = ?", [id]);
      await repos.transactions.markVoid(ORG, id);
      await bad("UPDATE transactions SET status = 'posted' WHERE id = ?", [id]);
      await bad("DELETE FROM audit_log");
      await expect(
        repos.transactions.post({
          id: "40000000-0000-4000-8000-000000000001",
          orgId: ORG,
          transactionDate: "2026-02-01",
          postedDate: null,
          description: "bad",
          source: "manual",
          createdBy: USER,
          idempotencyKey: null,
          entries: [
            { id: "40000000-0000-4000-8000-000000000002", accountId: CASH, amountCents: 100 },
            { id: "40000000-0000-4000-8000-000000000003", accountId: SALES, amountCents: -90 },
          ],
        }),
      ).rejects.toThrow(/not balanced/);
      expect(await repos.transactions.get(ORG, "40000000-0000-4000-8000-000000000001")).toBeNull();
    });

    it("migrations are idempotent", async () => {
      expect(await migrateSqlite(sqliteDriver)).toBe(0);
    });
  }
});
