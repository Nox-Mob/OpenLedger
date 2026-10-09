// Plain-language explanations for the failures people hit most often.
// Every change in OpenLedgerApp is all-or-nothing, so a failure always means
// nothing was recorded. Each message says so plainly.
import { errorMessage } from "./errors";

export type FailureKind =
  | "unbalanced"
  | "period_closed"
  | "statement_off"
  | "bad_backup"
  | "no_permission"
  | "mfa_required"
  | "other";

export interface Explained {
  kind: FailureKind;
  title: string;
  detail: string;
}

function dollars(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Math.abs(cents) / 100,
  );
}

/**
 * Turn any error into a short title and a plain explanation.
 * `fallback` names the action for unknown errors ("Could not save transaction").
 * `outcome` is what did not happen ("Nothing was saved.").
 */
export function explainError(
  err: unknown,
  fallback = "Something went wrong",
  outcome = "Nothing was saved.",
): Explained {
  const msg = errorMessage(err, "");
  const name = err instanceof Error ? err.name : "";

  if (
    /not balanced|at least (two|2) (lines|entries)|both a debit and a credit|one positive and one negative/i.test(
      msg,
    )
  ) {
    const sum = msg.match(/sum to (-?\d+) cents/i);
    const off = sum ? ` It is off by ${dollars(Number(sum[1]))}.` : "";
    return {
      kind: "unbalanced",
      title: "Not saved: the amounts don't balance",
      detail: `Money in must equal money out, and every transaction needs at least two lines.${off} Nothing was recorded. Fix the amounts and try again.`,
    };
  }

  const lock = msg.match(/(?:books are (?:closed|locked) through)\s+(\d{4}-\d{2}-\d{2})/i);
  if (lock) {
    return {
      kind: "period_closed",
      title: "Not saved: that date is in a closed period",
      detail: `The books are closed through ${lock[1]}, so nothing on or before that date can be added or changed. Nothing was recorded. Pick a later date, or ask an admin or treasurer to reopen the period.`,
    };
  }

  if (/difference (must be|is)/i.test(msg) && /statement|reconcil/i.test(msg)) {
    const cents = msg.match(/difference is (-?\d+) cents/i);
    const off = cents ? ` It is off by ${dollars(Number(cents[1]))}.` : "";
    return {
      kind: "statement_off",
      title: "Not finished: the statement check doesn't match yet",
      detail: `The difference must be $0.00 before you can finish.${off} The check is still open and your ticks are kept. Tick or add the missing items, then try again.`,
    };
  }

  if (name === "BackupRejected" || /backup/i.test(msg)) {
    return {
      kind: "bad_backup",
      title: "Not restored: this backup can't be used",
      detail: `${msg || "The file could not be checked."} Nothing was restored, and your current books are unchanged.`,
    };
  }

  if (name === "MfaRequiredError" || /two-step sign-in/i.test(msg)) {
    return {
      kind: "mfa_required",
      title: "Not allowed: two-step sign-in needed",
      detail: `This organization requires two-step sign-in. ${outcome} Turn it on in Settings, Security, then sign in again.`,
    };
  }

  if (
    name === "ForbiddenError" ||
    /role doesn't allow|row-level security|permission denied|only (organization )?admins|only admins and treasurers|not allowed/i.test(
      msg,
    )
  ) {
    return {
      kind: "no_permission",
      title: "Not allowed: your role can't do this",
      detail: `${outcome} Ask an organization admin if you need this.`,
    };
  }

  return {
    kind: "other",
    title: fallback,
    detail: msg ? `${msg} ${outcome}` : outcome,
  };
}
