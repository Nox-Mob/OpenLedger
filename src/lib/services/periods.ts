// Month-end close and audited reopen, written against the ports.
// Closing a month moves the books lock forward to the month's last day; reopening moves it
// back and always records who did it and why. Callers check "close_books" permission first.
import { LedgerRuleError } from "@/lib/domain/ledger";
import type { Account, Id, IsoDate } from "@/lib/domain/models";
import type { Repositories } from "@/lib/ports";

export const MIN_REOPEN_REASON = 10;

export interface MonthCloseWarning {
  kind: "unreconciled_account" | "open_statement_check";
  accountId: Id;
  accountName: string;
  message: string;
}

/** True when `iso` is the last calendar day of its month. */
export function isMonthEnd(iso: IsoDate): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const last = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
  return Number(m[3]) === last;
}

/** Bank, cash and credit card accounts are the ones a statement check should cover. */
export function isStatementAccount(a: Pick<Account, "type" | "subtype">): boolean {
  return (
    (a.type === "asset" && (a.subtype === "bank" || a.subtype === "cash")) ||
    (a.type === "liability" && a.subtype === "credit_card")
  );
}

export async function monthCloseWarnings(
  repos: Repositories,
  orgId: Id,
  monthEnd: IsoDate,
): Promise<MonthCloseWarning[]> {
  const [accounts, recons, rows] = await Promise.all([
    repos.accounts.list(orgId, { includeArchived: true }),
    repos.reconciliations.list(orgId),
    repos.transactions.ledgerRows(orgId, { to: monthEnd }),
  ]);
  const used = new Set(rows.map((r) => r.accountId));
  const warnings: MonthCloseWarning[] = [];
  for (const a of accounts.filter(isStatementAccount)) {
    const mine = recons.filter((r) => r.accountId === a.id);
    for (const r of mine.filter((r) => r.status === "in_progress" && r.periodStart <= monthEnd)) {
      warnings.push({
        kind: "open_statement_check",
        accountId: a.id,
        accountName: a.name,
        message: `${a.name} has an unfinished statement check (${r.periodStart} to ${r.periodEnd}).`,
      });
    }
    if (!used.has(a.id)) continue;
    const covered = mine.some((r) => r.status === "completed" && r.periodEnd >= monthEnd);
    if (!covered)
      warnings.push({
        kind: "unreconciled_account",
        accountId: a.id,
        accountName: a.name,
        message: `${a.name} has not been checked against a statement through ${monthEnd}.`,
      });
  }
  return warnings;
}

export async function previewMonthClose(repos: Repositories, orgId: Id, monthEnd: IsoDate) {
  if (!isMonthEnd(monthEnd))
    throw new LedgerRuleError("settings", "Pick the last day of a month to close it.");
  const org = await repos.orgs.get(orgId);
  if (!org) throw new LedgerRuleError("settings", "Organization not found");
  const alreadyClosed = !!org.booksLockedThrough && org.booksLockedThrough >= monthEnd;
  return {
    monthEnd,
    alreadyClosed,
    lockedThrough: org.booksLockedThrough,
    warnings: alreadyClosed ? [] : await monthCloseWarnings(repos, orgId, monthEnd),
  };
}

/**
 * Close a month: lock the books through its last day. Warnings must be acknowledged;
 * the acknowledged warnings are saved in history with the lock, in one step.
 */
export async function closeMonth(
  repos: Repositories,
  input: { orgId: Id; userId: Id; monthEnd: IsoDate; acknowledgeWarnings: boolean },
) {
  const { orgId, userId, monthEnd } = input;
  const p = await previewMonthClose(repos, orgId, monthEnd);
  if (p.alreadyClosed) return { ok: true as const, duplicate: true as const };
  if (p.warnings.length && !input.acknowledgeWarnings)
    throw new LedgerRuleError(
      "settings",
      `This month has ${p.warnings.length} warning(s). Review them and confirm to close anyway.`,
    );
  await repos.orgs.setBooksLockedThrough(orgId, monthEnd, {
    orgId,
    userId,
    action: "close_month",
    entity: "organization",
    entityId: orgId,
    before: { books_locked_through: p.lockedThrough },
    after: {
      books_locked_through: monthEnd,
      warnings_acknowledged: p.warnings.map((w) => w.message),
    },
  });
  return { ok: true as const, warnings: p.warnings.length };
}

/**
 * Reopen closed books back to `reopenThrough` (null opens everything). A written reason is
 * required and saved in history together with the change.
 */
export async function reopenPeriod(
  repos: Repositories,
  input: { orgId: Id; userId: Id; reopenThrough: IsoDate | null; reason: string },
) {
  const { orgId, userId, reopenThrough } = input;
  const reason = input.reason.trim();
  if (reason.length < MIN_REOPEN_REASON)
    throw new LedgerRuleError(
      "settings",
      `Write a reason for reopening (at least ${MIN_REOPEN_REASON} characters). It is saved in history.`,
    );
  const org = await repos.orgs.get(orgId);
  if (!org) throw new LedgerRuleError("settings", "Organization not found");
  const current = org.booksLockedThrough;
  if (!current) throw new LedgerRuleError("settings", "The books are not closed, so there is nothing to reopen.");
  if (reopenThrough && reopenThrough >= current)
    throw new LedgerRuleError(
      "settings",
      `Pick a date before ${current} to reopen, or close more months instead.`,
    );
  const closes = await repos.periodCloses.list(orgId);
  const reopenedYears = closes
    .filter((c) => !reopenThrough || c.fiscalYearEnd > reopenThrough)
    .map((c) => c.fiscalYearEnd);
  await repos.orgs.setBooksLockedThrough(orgId, reopenThrough, {
    orgId,
    userId,
    action: "reopen_books",
    entity: "organization",
    entityId: orgId,
    before: { books_locked_through: current },
    after: { books_locked_through: reopenThrough, reason, reopened_closed_years: reopenedYears },
  });
  return { ok: true as const, reopenedClosedYears: reopenedYears };
}
