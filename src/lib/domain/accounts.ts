// Account catalog rules: unique names, and delete only what was never used.
// Pure functions (no storage); the database repeats both checks as a backup.
import { duplicateNameMessage, sameName } from "@/lib/validation";

export type AccountUsage = {
  entries: number;
  bankRows: number;
  imports: number;
  reconciliations: number;
  budgets: number;
};

export const NO_USAGE: AccountUsage = {
  entries: 0,
  bankRows: 0,
  imports: 0,
  reconciliations: 0,
  budgets: 0,
};

export function isUnused(u: AccountUsage): boolean {
  return u.entries + u.bankRows + u.imports + u.reconciliations + u.budgets === 0;
}

/** Why an account can't be deleted, or null when it can. */
export function deleteBlocker(u: AccountUsage, opts: { required?: boolean } = {}): string | null {
  if (opts.required) return "This account is required, so it can't be deleted.";
  if (u.entries) return "This account has transactions, so it can only be archived.";
  if (u.bankRows || u.imports)
    return "This account has imported bank rows, so it can only be archived.";
  if (u.reconciliations) return "This account has statement checks, so it can only be archived.";
  if (u.budgets) return "This account has a budget. Remove the budget or archive the account.";
  return null;
}

/** Message when `name` is already taken by one of `existing`, else null. */
export function duplicateName(name: string, existing: { name: string }[]): string | null {
  return existing.some((e) => sameName(e.name, name)) ? duplicateNameMessage(name) : null;
}
