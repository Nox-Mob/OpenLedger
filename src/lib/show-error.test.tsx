// @vitest-environment jsdom
// Renders the real pop-up area and checks each common failure shows on screen,
// with a clear statement that nothing was recorded.
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Toaster, toast } from "sonner";
import { showError } from "./show-error";
import { ForbiddenError } from "./permissions";
import { BackupRejected } from "./domain/backup";

afterEach(() => {
  act(() => toast.dismiss());
  cleanup();
});

async function popUp(err: unknown, fallback?: string, outcome?: string) {
  render(<Toaster />);
  act(() => showError(err, fallback, outcome));
}

describe("error pop-ups appear on screen", () => {
  it("unbalanced transaction", async () => {
    await popUp(new Error("Transaction is not balanced: entries sum to 1250 cents."));
    expect(await screen.findByText("Not saved: the amounts don't balance")).toBeTruthy();
    expect(await screen.findByText(/off by \$12\.50.*Nothing was recorded/)).toBeTruthy();
  });

  it("closed period", async () => {
    await popUp(new Error("Books are locked through 2026-09-30. Choose a later date."));
    expect(await screen.findByText("Not saved: that date is in a closed period")).toBeTruthy();
    expect(await screen.findByText(/closed through 2026-09-30.*Nothing was recorded/)).toBeTruthy();
  });

  it("statement check off", async () => {
    await popUp(new Error("Statement check cannot be finished: difference is 500 cents, it must be zero."));
    expect(await screen.findByText("Not finished: the statement check doesn't match yet")).toBeTruthy();
    expect(await screen.findByText(/still open/)).toBeTruthy();
  });

  it("bad backup", async () => {
    await popUp(new BackupRejected("The backup's signature doesn't match."));
    expect(await screen.findByText("Not restored: this backup can't be used")).toBeTruthy();
    expect(await screen.findByText(/Nothing was restored/)).toBeTruthy();
  });

  it("no permission", async () => {
    await popUp(new ForbiddenError("close_books"));
    expect(await screen.findByText("Not allowed: your role can't do this")).toBeTruthy();
    expect(await screen.findByText(/Nothing was saved/)).toBeTruthy();
  });

  it("other failure keeps the action name and outcome", async () => {
    await popUp(new Error("Network down"), "Could not export", "No file was created.");
    expect(await screen.findByText("Could not export")).toBeTruthy();
    expect(await screen.findByText("Network down No file was created.")).toBeTruthy();
  });
});
