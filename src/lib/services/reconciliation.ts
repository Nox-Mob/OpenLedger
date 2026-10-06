// Statement checks (reconciliation), written once against the repository ports.
// Compares bank evidence to the ledger; never edits amounts — only ticks entries.
// Balances are in "statement sign" (cash on hand for assets, amount owed for liabilities).
import { addDays, daysBetween } from "@/lib/dates";
import { LedgerRuleError, assertReconciliationCanFinish, newId } from "@/lib/domain/ledger";
import type {
  AccountType,
  BankTransaction,
  Id,
  IsoDate,
  Reconciliation,
  ReconcileMode,
  ReconEntry,
} from "@/lib/domain/models";
import type { Repositories } from "@/lib/ports";

export const MATCH_WINDOW_DAYS = 5;

export interface WorkspaceEntry {
  id: Id;
  transactionId: Id;
  date: IsoDate;
  description: string;
  amountCents: number;
  cleared: boolean;
  beforePeriod: boolean;
}
export interface WorkspaceBankRow {
  id: Id;
  date: IsoDate;
  description: string;
  amountCents: number;
  linkedTransactionId: Id | null;
}
export interface Workspace {
  entries: WorkspaceEntry[];
  bankRows: WorkspaceBankRow[];
  matches: { bankId: Id; entryId: Id }[];
}

export interface ReconciliationView {
  id: Id;
  accountId: Id;
  accountName: string;
  accountType: AccountType;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  beginningBalanceCents: number;
  endingBalanceCents: number;
  mode: ReconcileMode;
  status: "in_progress" | "completed";
  completedAt: string | null;
  createdAt: string;
}

const dayDiff = (a: string, b: string) => Math.abs(daysBetween(a, b));
const signFor = (type: string) => (type === "asset" || type === "expense" ? 1 : -1);

/** Pure: builds the workspace and suggested bank↔ledger matches. */
export function buildWorkspace(
  rec: Pick<Reconciliation, "id" | "periodStart">,
  rawEntries: ReconEntry[],
  bank: BankTransaction[],
): Workspace {
  const entries = rawEntries
    .map((e) => ({
      id: e.id,
      transactionId: e.transactionId,
      date: e.date,
      description: e.description,
      amountCents: e.amountCents,
      cleared: e.reconciliationId === rec.id,
      // Uncleared items from earlier periods stay visible as outstanding, but are flagged.
      beforePeriod: e.date < rec.periodStart,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const bankRows = bank.map((b) => ({
    id: b.id,
    date: b.bankDate,
    description: b.description,
    amountCents: b.amountCents,
    linkedTransactionId: b.transactionId,
  }));

  // Linked rows first, then amount + date window.
  const used = new Set<string>();
  const matches: { bankId: string; entryId: string }[] = [];
  for (const b of bankRows) {
    if (!b.linkedTransactionId) continue;
    const e = entries.find(
      (x) =>
        !used.has(x.id) &&
        x.transactionId === b.linkedTransactionId &&
        x.amountCents === b.amountCents,
    );
    if (e) {
      used.add(e.id);
      matches.push({ bankId: b.id, entryId: e.id });
    }
  }
  const matchedBank = new Set(matches.map((m) => m.bankId));
  for (const b of bankRows) {
    if (matchedBank.has(b.id)) continue;
    const e = entries
      .filter(
        (x) =>
          !used.has(x.id) &&
          x.amountCents === b.amountCents &&
          dayDiff(x.date, b.date) <= MATCH_WINDOW_DAYS,
      )
      .sort((x, y) => dayDiff(x.date, b.date) - dayDiff(y.date, b.date))[0];
    if (e) {
      used.add(e.id);
      matchedBank.add(b.id);
      matches.push({ bankId: b.id, entryId: e.id });
    }
  }
  return { entries, bankRows, matches };
}

/** Pure: cleared balance and difference in statement sign. */
export function summarize(
  rec: Pick<Reconciliation, "beginningBalanceCents" | "endingBalanceCents">,
  accountType: AccountType,
  entries: { amountCents: number; cleared: boolean }[],
) {
  const sign = signFor(accountType);
  const clearedCents =
    sign * entries.filter((e) => e.cleared).reduce((s, e) => s + e.amountCents, 0);
  const clearedBalance = rec.beginningBalanceCents + clearedCents;
  return { clearedCents, clearedBalance, difference: rec.endingBalanceCents - clearedBalance };
}

async function accountOf(repos: Repositories, orgId: Id, accountId: Id) {
  const [a] = await repos.accounts.getMany(orgId, [accountId]);
  return a ?? null;
}

async function view(repos: Repositories, r: Reconciliation): Promise<ReconciliationView> {
  const a = await accountOf(repos, r.orgId, r.accountId);
  return toView(r, a?.name ?? "", a?.type ?? "asset");
}

function toView(r: Reconciliation, name: string, type: AccountType): ReconciliationView {
  return {
    id: r.id,
    accountId: r.accountId,
    accountName: name,
    accountType: type,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    beginningBalanceCents: r.beginningBalanceCents,
    endingBalanceCents: r.endingBalanceCents,
    mode: r.mode,
    status: r.status,
    completedAt: r.completedAt,
    createdAt: r.createdAt ?? "",
  };
}

/** Finds a check by id; callers then check permission on `orgId`. */
export async function locateReconciliation(repos: Repositories, id: Id) {
  const r = await repos.reconciliations.locate(id);
  if (!r) throw new LedgerRuleError("Reconciliation not found");
  return r;
}

async function loadWorkspace(repos: Repositories, r: Reconciliation) {
  const [entries, bank] = await Promise.all([
    repos.reconciliations.workspaceEntries(r.accountId, r.periodEnd, r.id),
    repos.bank.listInPeriod(r.orgId, r.accountId, r.periodStart, r.periodEnd),
  ]);
  return buildWorkspace(r, entries, bank);
}

async function audit(
  repos: Repositories,
  r: { orgId: Id; id: Id },
  userId: Id,
  action: string,
  before: unknown,
  after: unknown,
) {
  await repos.audit.append({
    orgId: r.orgId,
    userId,
    action,
    entity: "reconciliation",
    entityId: r.id,
    before,
    after,
  });
}

export async function listReconciliations(repos: Repositories, orgId: Id) {
  const [rows, counts, accounts] = await Promise.all([
    repos.reconciliations.list(orgId),
    repos.reconciliations.itemCounts(orgId),
    repos.accounts.list(orgId, { includeArchived: true }),
  ]);
  const byId = new Map(accounts.map((a) => [a.id, a]));
  return rows
    .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))
    .map((r) => {
      const a = byId.get(r.accountId);
      return { ...toView(r, a?.name ?? "", a?.type ?? "asset"), itemCount: counts[r.id] ?? 0 };
    });
}

async function requireActiveAccount(repos: Repositories, orgId: Id, accountId: Id) {
  const a = await accountOf(repos, orgId, accountId);
  if (!a?.isActive) throw new LedgerRuleError("Choose an active account in this organization.");
  return a;
}

export async function suggestReconciliation(repos: Repositories, orgId: Id, accountId: Id) {
  await requireActiveAccount(repos, orgId, accountId);
  const [all, batch] = await Promise.all([
    repos.reconciliations.list(orgId, accountId),
    repos.bank.latestStatement(orgId, accountId),
  ]);
  const last = all
    .filter((r) => r.status === "completed")
    .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))[0];
  const batchIsNewer = !!batch && (!last || batch.statementEnd > last.periodEnd);
  return {
    periodStart: last ? addDays(last.periodEnd, 1) : (batch?.statementStart ?? null),
    periodEnd: batchIsNewer ? batch!.statementEnd : null,
    beginningBalanceCents: last ? last.endingBalanceCents : (batch?.beginningBalanceCents ?? 0),
    endingBalanceCents: batchIsNewer ? batch!.endingBalanceCents : null,
    batchId: batch?.batchId ?? null,
    hasPrevious: !!last,
  };
}

export async function startReconciliation(
  repos: Repositories,
  input: {
    orgId: Id;
    accountId: Id;
    periodStart: IsoDate;
    periodEnd: IsoDate;
    beginningBalanceCents: number;
    endingBalanceCents: number;
    mode: ReconcileMode;
    batchId: Id | null;
    userId: Id;
  },
) {
  if (input.periodEnd < input.periodStart)
    throw new LedgerRuleError("End date must be on or after start date");
  await requireActiveAccount(repos, input.orgId, input.accountId);
  const open = (await repos.reconciliations.list(input.orgId, input.accountId)).some(
    (r) => r.status === "in_progress",
  );
  if (open)
    throw new LedgerRuleError(
      "This account already has a reconciliation in progress. Finish or discard it first.",
    );
  const row = {
    id: newId(),
    orgId: input.orgId,
    accountId: input.accountId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    beginningBalanceCents: input.beginningBalanceCents,
    endingBalanceCents: input.endingBalanceCents,
    mode: input.mode,
    batchId: input.batchId,
    createdBy: input.userId,
  };
  await repos.reconciliations.start(row);
  await audit(repos, row, input.userId, "reconcile_start", null, row);
  return { id: row.id };
}

export async function getReconciliation(repos: Repositories, r: Reconciliation) {
  let ws: Workspace;
  if (r.status === "completed") {
    const entries = await repos.reconciliations.entriesOf(r.id);
    ws = {
      entries: entries
        .map((e) => ({
          id: e.id,
          transactionId: e.transactionId,
          date: e.date,
          description: e.description,
          amountCents: e.amountCents,
          cleared: true,
          beforePeriod: false,
        }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      bankRows: [],
      matches: [],
    };
  } else ws = await loadWorkspace(repos, r);
  const [v, history] = await Promise.all([
    view(repos, r),
    repos.audit.listFor(r.orgId, "reconciliation", r.id, 50),
  ]);
  return {
    reconciliation: v,
    ...ws,
    summary: summarize(r, v.accountType, ws.entries),
    history,
  };
}

function requireInProgress(r: Reconciliation, msg: string) {
  if (r.status !== "in_progress") throw new LedgerRuleError(msg);
}

export async function setCleared(
  repos: Repositories,
  r: Reconciliation,
  entryIds: Id[],
  cleared: boolean,
  userId: Id,
) {
  requireInProgress(r, "This reconciliation is completed. Reopen it to make changes.");
  await repos.reconciliations.setTicked(r.id, entryIds, cleared);
  await audit(repos, r, userId, cleared ? "reconcile_clear" : "reconcile_unclear", null, {
    entryIds,
  });
  return { ok: true };
}

/** Simple mode: tick every entry that matches a bank row in the period. */
export async function acceptMatches(repos: Repositories, r: Reconciliation, userId: Id) {
  requireInProgress(r, "This reconciliation is completed.");
  const ws = await loadWorkspace(repos, r);
  const ids = ws.matches
    .map((m) => m.entryId)
    .filter((id) => !ws.entries.find((e) => e.id === id)?.cleared);
  if (ids.length) {
    await repos.reconciliations.setTicked(r.id, ids, true);
    await audit(repos, r, userId, "reconcile_accept_matches", null, { entryIds: ids });
  }
  return { cleared: ids.length };
}

export async function completeReconciliation(repos: Repositories, r: Reconciliation, userId: Id) {
  requireInProgress(r, "Already completed");
  const ws = await loadWorkspace(repos, r);
  const a = await accountOf(repos, r.orgId, r.accountId);
  const s = summarize(r, a?.type ?? "asset", ws.entries);
  assertReconciliationCanFinish(s.difference);
  await repos.reconciliations.finish(r.orgId, r.id, userId);
  await audit(
    repos,
    r,
    userId,
    "reconcile_complete",
    { status: "in_progress" },
    {
      status: "completed",
      items: ws.entries.filter((e) => e.cleared).length,
      clearedBalance: s.clearedBalance,
    },
  );
  return { ok: true };
}

/** Only the most recent completed check for an account can be reopened. */
export async function reopenReconciliation(repos: Repositories, r: Reconciliation, userId: Id) {
  if (r.status !== "completed") throw new LedgerRuleError("Not completed");
  const siblings = await repos.reconciliations.list(r.orgId, r.accountId);
  if (siblings.some((x) => x.periodEnd > r.periodEnd))
    throw new LedgerRuleError(
      "Only the most recent reconciliation for this account can be reopened.",
    );
  if (siblings.some((x) => x.status === "in_progress"))
    throw new LedgerRuleError("Discard the in-progress reconciliation for this account first.");
  await repos.reconciliations.reopen(r.orgId, r.id);
  await audit(
    repos,
    r,
    userId,
    "reconcile_reopen",
    { status: "completed" },
    {
      status: "in_progress",
    },
  );
  return { ok: true };
}

export async function discardReconciliation(repos: Repositories, r: Reconciliation, userId: Id) {
  requireInProgress(r, "Completed reconciliations can't be discarded — reopen instead.");
  const before = await view(repos, r);
  await repos.reconciliations.discard(r.orgId, r.id);
  await audit(repos, r, userId, "reconcile_discard", before, null);
  return { ok: true };
}
