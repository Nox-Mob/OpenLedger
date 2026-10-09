import { describe, expect, it } from "vitest";
import { explainError } from "./friendly-errors";
import { ForbiddenError, MfaRequiredError } from "./permissions";
import { BackupRejected } from "./domain/backup";

describe("plain-language errors", () => {
  it("unbalanced transaction says nothing was recorded and how far off", () => {
    const e = explainError(new Error("Transaction is not balanced: entries sum to 1250 cents."));
    expect(e.kind).toBe("unbalanced");
    expect(e.detail).toContain("$12.50");
    expect(e.detail).toContain("Nothing was recorded");
  });

  it("database balance error is recognised too", () => {
    expect(explainError(new Error("Transaction abc must have at least 2 entries (has 1)")).kind).toBe(
      "unbalanced",
    );
  });

  it("closed period names the lock date", () => {
    const e = explainError(new Error("Books are locked through 2026-06-30. Choose a later date."));
    expect(e.kind).toBe("period_closed");
    expect(e.detail).toContain("2026-06-30");
    expect(e.detail).toContain("Nothing was recorded");
  });

  it("statement off keeps the check open", () => {
    const e = explainError(
      new Error("Statement check cannot be finished: difference is -500 cents, it must be zero."),
    );
    expect(e.kind).toBe("statement_off");
    expect(e.detail).toContain("$5.00");
    expect(e.detail).toContain("still open");
  });

  it("bad backup says nothing was restored", () => {
    const e = explainError(new BackupRejected("The backup's signature doesn't match."));
    expect(e.kind).toBe("bad_backup");
    expect(e.detail).toContain("Nothing was restored");
  });

  it("no permission", () => {
    expect(explainError(new ForbiddenError("close_books")).kind).toBe("no_permission");
    expect(explainError(new Error("new row violates row-level security policy")).kind).toBe(
      "no_permission",
    );
  });

  it("two-step sign-in", () => {
    expect(explainError(new MfaRequiredError()).kind).toBe("mfa_required");
  });

  it("unknown errors keep the action name and the outcome", () => {
    const e = explainError(new Error("Network down"), "Could not export", "No file was created.");
    expect(e).toEqual({
      kind: "other",
      title: "Could not export",
      detail: "Network down No file was created.",
    });
  });
});
