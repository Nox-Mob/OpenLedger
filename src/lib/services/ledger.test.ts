import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepositories } from "@/lib/adapters/memory";
import { postBankRow, postOpeningBalance, postTransaction, voidTransaction } from "./ledger";

const ORG = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const USER = "00000000-0000-4000-8000-0000000000aa";
const CASH = "00000000-0000-4000-8000-0000000000c1";
const SALES = "00000000-0000-4000-8000-0000000000c2";
const EQUITY = "00000000-0000-4000-8000-0000000000c3";
const OLD = "00000000-0000-4000-8000-0000000000c4";
const FOREIGN = "00000000-0000-4000-8000-0000000000c5";

let repos: ReturnType<typeof createMemoryRepositories>;

beforeEach(async () => {
  repos = createMemoryRepositories();
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
  const acct = (
    id: string,
    name: string,
    type: "asset" | "revenue" | "equity",
    orgId = ORG,
    isActive = true,
  ) => ({
    id,
    orgId,
    name,
    type,
    subtype: null,
    isActive,
  });
  await repos.accounts.create([
    acct(CASH, "Cash", "asset"),
    acct(SALES, "Sales", "revenue"),
    acct(EQUITY, "Owner equity", "equity"),
    acct(OLD, "Old", "asset", ORG, false),
    acct(FOREIGN, "Cash", "asset", OTHER),
  ]);
});

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

describe("postTransaction", () => {
  it("posts with app-generated ids and writes an audit row", async () => {
    const { id } = await postTransaction(repos, sale());
    const tx = await repos.transactions.get(ORG, id);
    expect(tx?.entries).toHaveLength(2);
    expect(tx?.entries.every((e) => /^[0-9a-f-]{36}$/.test(e.id))).toBe(true);
    expect(repos.store.audit.map((a) => a.action)).toEqual(["create"]);
  });

  it("rejects unbalanced, archived, foreign accounts and locked dates before writing", async () => {
    await expect(
      postTransaction(
        repos,
        sale({
          entries: [
            { accountId: CASH, amountCents: 1000 },
            { accountId: SALES, amountCents: -900 },
          ],
        }),
      ),
    ).rejects.toThrow(/not balanced/);
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
    await expect(
      postTransaction(
        repos,
        sale({
          entries: [
            { accountId: FOREIGN, amountCents: 1 },
            { accountId: SALES, amountCents: -1 },
          ],
        }),
      ),
    ).rejects.toThrow(/organization/);
    await repos.orgs.setBooksLockedThrough(ORG, "2026-03-31");
    await expect(postTransaction(repos, sale())).rejects.toThrow(/closed through/);
    expect(repos.store.transactions.size).toBe(0);
    expect(repos.store.audit).toHaveLength(0);
  });

  it("returns the first transaction for a repeated idempotency key", async () => {
    const a = await postTransaction(repos, sale({ idempotencyKey: "form-123456" }));
    const b = await postTransaction(repos, sale({ idempotencyKey: "form-123456" }));
    expect(b).toEqual({ id: a.id, duplicate: true });
    expect(repos.store.transactions.size).toBe(1);
  });
});

describe("voidTransaction", () => {
  it("voids once, unticks in-progress check, unlinks bank rows", async () => {
    const { id } = await postTransaction(repos, sale());
    await repos.reconciliations.start({
      id: "r1",
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
    const cashEntry = repos.store.transactions.get(id)!.entries[0]!;
    await repos.reconciliations.setTicked("r1", [cashEntry.id], true);

    expect(await voidTransaction(repos, { orgId: ORG, userId: USER, transactionId: id })).toEqual({
      ok: true,
    });
    expect(repos.store.transactions.get(id)!.status).toBe("void");
    expect(cashEntry.reconciliationId).toBeNull();
    expect(await voidTransaction(repos, { orgId: ORG, userId: USER, transactionId: id })).toEqual({
      ok: true,
      alreadyVoid: true,
    });
    expect(repos.store.audit.filter((a) => a.action === "void")).toHaveLength(1);
  });

  it("is blocked by a completed statement check", async () => {
    const { id } = await postTransaction(repos, sale());
    await repos.reconciliations.start({
      id: "r2",
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
    await repos.reconciliations.setTicked(
      "r2",
      [repos.store.transactions.get(id)!.entries[0]!.id],
      true,
    );
    await repos.reconciliations.finish(ORG, "r2", USER);
    await expect(
      voidTransaction(repos, { orgId: ORG, userId: USER, transactionId: id }),
    ).rejects.toThrow(/statement check/);
  });

  it("does not see other orgs' transactions", async () => {
    const { id } = await postTransaction(repos, sale());
    await expect(
      voidTransaction(repos, { orgId: OTHER, userId: USER, transactionId: id }),
    ).rejects.toThrow(/not found/);
  });
});

describe("postOpeningBalance", () => {
  const ob = {
    orgId: ORG,
    userId: USER,
    accountId: CASH,
    equityAccountId: EQUITY,
    amountCents: 5000,
    date: "2026-01-01",
  };
  it("posts once; a retry is a duplicate; a different amount is refused", async () => {
    expect(await postOpeningBalance(repos, ob)).toEqual({ ok: true });
    await expect(postOpeningBalance(repos, { ...ob, amountCents: 7000 })).rejects.toThrow(
      /already has an opening balance/,
    );
    const rows = await repos.transactions.ledgerRows(ORG);
    expect(rows.reduce((s, r) => s + r.amountCents, 0)).toBe(0);
  });
});

describe("postBankRow", () => {
  beforeEach(async () => {
    await repos.bank.insertMany([
      {
        id: "b1",
        orgId: ORG,
        accountId: CASH,
        bankDate: "2026-02-03",
        description: "Deposit",
        amountCents: 2500,
        externalId: "FIT1",
        fingerprint: "f1",
        rowSeq: 1,
        batchId: null,
      },
    ]);
  });
  it("posts a bank row once and links it", async () => {
    const { id } = await postBankRow(repos, {
      orgId: ORG,
      userId: USER,
      bankTransactionId: "b1",
      offsetAccountId: SALES,
    });
    expect(repos.store.bank.get("b1")!.transactionId).toBe(id);
    await expect(
      postBankRow(repos, {
        orgId: ORG,
        userId: USER,
        bankTransactionId: "b1",
        offsetAccountId: SALES,
      }),
    ).rejects.toThrow(/Already posted/);
    expect(repos.store.transactions.size).toBe(1);
  });
  it("voiding the posted transaction returns the bank row to unmatched", async () => {
    const { id } = await postBankRow(repos, {
      orgId: ORG,
      userId: USER,
      bankTransactionId: "b1",
      offsetAccountId: SALES,
    });
    await voidTransaction(repos, { orgId: ORG, userId: USER, transactionId: id });
    expect((await repos.bank.listUnmatched(ORG)).map((b) => b.id)).toEqual(["b1"]);
  });
  it("dedupes re-imported rows by FITID", async () => {
    const r = await repos.bank.insertMany([
      {
        id: "b2",
        orgId: ORG,
        accountId: CASH,
        bankDate: "2026-02-03",
        description: "Deposit",
        amountCents: 2500,
        externalId: "FIT1",
        fingerprint: "f1",
        rowSeq: 1,
        batchId: null,
      },
    ]);
    expect(r).toEqual({ inserted: 0, duplicates: 1 });
  });
});
