import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepositories } from "@/lib/adapters/memory";
import { postTransaction } from "./ledger";
import { closeMonth, isMonthEnd, previewMonthClose, reopenPeriod } from "./periods";
import { setBooksLock } from "./settings";

const ORG = "00000000-0000-4000-8000-000000000001";
const USER = "00000000-0000-4000-8000-0000000000aa";
const BANK = "00000000-0000-4000-8000-0000000000b1";
const SALES = "00000000-0000-4000-8000-0000000000b2";
const RECON = "00000000-0000-4000-8000-0000000000d1";

let repos: ReturnType<typeof createMemoryRepositories>;

beforeEach(async () => {
  repos = createMemoryRepositories();
  await repos.orgs.create({
    id: ORG,
    name: "Org",
    orgType: "business",
    currency: "USD",
    fiscalYearStartMonth: 1,
    timezone: "America/Chicago",
    terminology: "simple",
    termOverrides: {},
    aiPdfEnabled: false,
    booksLockedThrough: null,
    createdBy: USER,
  });
  await repos.accounts.create([
    { id: BANK, orgId: ORG, name: "Checking", type: "asset", subtype: "bank", isActive: true },
    { id: SALES, orgId: ORG, name: "Sales", type: "revenue", subtype: null, isActive: true },
  ]);
  await postTransaction(repos, {
    orgId: ORG,
    userId: USER,
    transactionDate: "2026-09-10",
    description: "Sale",
    source: "manual",
    entries: [
      { accountId: BANK, amountCents: 5000 },
      { accountId: SALES, amountCents: -5000 },
    ],
  });
});

const lock = async () => (await repos.orgs.get(ORG))?.booksLockedThrough ?? null;
const startCheck = () =>
  repos.reconciliations.start({
    id: RECON,
    orgId: ORG,
    accountId: BANK,
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    beginningBalanceCents: 0,
    endingBalanceCents: 5000,
    mode: "simple",
    batchId: null,
    createdBy: USER,
  });

describe("month-end close", () => {
  it("only accepts the last day of a month", async () => {
    expect(isMonthEnd("2026-09-30")).toBe(true);
    expect(isMonthEnd("2026-02-28")).toBe(true);
    expect(isMonthEnd("2028-02-28")).toBe(false);
    expect(isMonthEnd("2026-09-15")).toBe(false);
    await expect(previewMonthClose(repos, ORG, "2026-09-15")).rejects.toThrow(/last day/);
  });

  it("warns when a bank account with activity was never checked against a statement", async () => {
    const p = await previewMonthClose(repos, ORG, "2026-09-30");
    expect(p.warnings.map((w) => w.kind)).toEqual(["unreconciled_account"]);
  });

  it("warns about an unfinished statement check", async () => {
    await startCheck();
    const p = await previewMonthClose(repos, ORG, "2026-09-30");
    expect(p.warnings.map((w) => w.kind).sort()).toEqual([
      "open_statement_check",
      "unreconciled_account",
    ]);
  });

  it("has no warnings once the statement check is finished", async () => {
    await startCheck();
    await repos.reconciliations.finish(ORG, RECON, USER);
    expect((await previewMonthClose(repos, ORG, "2026-09-30")).warnings).toEqual([]);
  });

  it("refuses to close with unacknowledged warnings and changes nothing", async () => {
    const before = repos.store.audit.length;
    await expect(
      closeMonth(repos, { orgId: ORG, userId: USER, monthEnd: "2026-09-30", acknowledgeWarnings: false }),
    ).rejects.toThrow(/warning/);
    expect(await lock()).toBeNull();
    expect(repos.store.audit.length).toBe(before);
  });

  it("closes with acknowledged warnings and records them in history", async () => {
    await closeMonth(repos, { orgId: ORG, userId: USER, monthEnd: "2026-09-30", acknowledgeWarnings: true });
    expect(await lock()).toBe("2026-09-30");
    const last = repos.store.audit.at(-1)!;
    expect(last.action).toBe("close_month");
    expect(JSON.stringify(last.after)).toContain("Checking");
  });

  it("closing the same month twice is a no-op", async () => {
    const input = { orgId: ORG, userId: USER, monthEnd: "2026-09-30", acknowledgeWarnings: true };
    await closeMonth(repos, input);
    const n = repos.store.audit.length;
    expect(await closeMonth(repos, input)).toEqual({ ok: true, duplicate: true });
    expect(repos.store.audit.length).toBe(n);
  });
});

describe("audited reopen", () => {
  beforeEach(async () => {
    await closeMonth(repos, { orgId: ORG, userId: USER, monthEnd: "2026-09-30", acknowledgeWarnings: true });
  });

  it("requires a written reason of at least 10 characters", async () => {
    await expect(
      reopenPeriod(repos, { orgId: ORG, userId: USER, reopenThrough: null, reason: "  oops  " }),
    ).rejects.toThrow(/reason/);
    expect(await lock()).toBe("2026-09-30");
  });

  it("must move the lock backward", async () => {
    await expect(
      reopenPeriod(repos, { orgId: ORG, userId: USER, reopenThrough: "2026-10-31", reason: "Missed bank fee" }),
    ).rejects.toThrow(/before 2026-09-30/);
  });

  it("reopens and saves who and why in history", async () => {
    await reopenPeriod(repos, {
      orgId: ORG,
      userId: USER,
      reopenThrough: "2026-08-31",
      reason: "Missed September bank fee",
    });
    expect(await lock()).toBe("2026-08-31");
    const last = repos.store.audit.at(-1)!;
    expect(last.action).toBe("reopen_books");
    expect(last.userId).toBe(USER);
    expect(last.after).toMatchObject({ reason: "Missed September bank fee" });
  });

  it("the plain lock control can no longer move the lock backward without a reason", async () => {
    await expect(setBooksLock(repos, ORG, USER, null)).rejects.toThrow(/reason/);
    await expect(setBooksLock(repos, ORG, USER, "2026-08-31")).rejects.toThrow(/reason/);
    expect(await lock()).toBe("2026-09-30");
  });
});
