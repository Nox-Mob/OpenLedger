// Portable accounting rules. Pure TypeScript, no storage imports, so every edition
// (cloud, self-hosted, future desktop/SQLite) enforces the same guarantees before writing.
// The Postgres triggers stay as a second line of defense; they are not the only one.

export class LedgerRuleError extends Error {
  constructor(
    public readonly rule: string,
    message: string,
  ) {
    super(message);
    this.name = "LedgerRuleError";
  }
}

/** Stable app-generated ID, so records keep identity across future offline sync. */
export function newId(): string {
  return crypto.randomUUID();
}

export interface DraftEntry {
  accountId: string;
  amountCents: number;
}

/** ≥2 entries, whole non-zero cents, sums to zero, at least one debit and one credit. */
export function assertBalancedEntries(entries: readonly DraftEntry[]): void {
  if (entries.length < 2)
    throw new LedgerRuleError("min_entries", "A transaction needs at least two lines.");
  for (const e of entries) {
    if (!Number.isSafeInteger(e.amountCents))
      throw new LedgerRuleError("whole_cents", "Amounts must be whole cents.");
    if (e.amountCents === 0)
      throw new LedgerRuleError("non_zero", "Amount cannot be zero.");
  }
  const sum = entries.reduce((s, e) => s + e.amountCents, 0);
  if (sum !== 0)
    throw new LedgerRuleError(
      "balanced",
      `Transaction is not balanced: entries sum to ${sum} cents. Money in must equal money out.`,
    );
  if (!entries.some((e) => e.amountCents > 0) || !entries.some((e) => e.amountCents < 0))
    throw new LedgerRuleError("both_signs", "A transaction needs both a debit and a credit.");
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Books lock: nothing may be dated on or before the locked-through date. */
export function assertDateOpen(date: string, booksLockedThrough: string | null | undefined): void {
  if (!ISO_DATE.test(date)) throw new LedgerRuleError("date_format", "Dates must be YYYY-MM-DD.");
  if (booksLockedThrough && date <= booksLockedThrough)
    throw new LedgerRuleError(
      "books_locked",
      `The books are closed through ${booksLockedThrough}. Choose a later date or reopen the period.`,
    );
}

export interface AccountRef {
  id: string;
  orgId: string;
  isActive: boolean;
}

/** Every referenced account must exist in this org and be active. */
export function assertAccountsUsable(
  orgId: string,
  accountIds: readonly string[],
  found: readonly AccountRef[],
): void {
  const byId = new Map(found.map((a) => [a.id, a]));
  for (const id of new Set(accountIds)) {
    const a = byId.get(id);
    if (!a || a.orgId !== orgId)
      throw new LedgerRuleError("account_org", "Accounts must belong to this organization.");
    if (!a.isActive)
      throw new LedgerRuleError("account_active", "New transactions can only use active accounts.");
  }
}

export type TransactionStatus = "posted" | "void";

/** posted → void only; void is idempotent; completed reconciliations block it. */
export function voidDecision(
  status: TransactionStatus,
  inCompletedReconciliation: boolean,
): "void" | "already_void" {
  if (status === "void") return "already_void";
  if (inCompletedReconciliation)
    throw new LedgerRuleError(
      "reconciled",
      "This transaction is part of a finished statement check. Reopen that statement check before voiding it.",
    );
  return "void";
}

/** A statement check can only be finished when the difference is exactly zero. */
export function assertReconciliationCanFinish(differenceCents: number): void {
  if (differenceCents !== 0)
    throw new LedgerRuleError(
      "reconcile_difference",
      "The difference must be $0.00 before finishing this statement check.",
    );
}
