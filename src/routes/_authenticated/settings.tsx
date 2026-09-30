import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell, useOrgContext } from "@/components/AppShell";
import { setTerminology } from "@/lib/org.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Open Ledger" },
      { name: "description", content: "Organization and language preferences." },
      { property: "og:title", content: "Settings — Open Ledger" },
      { property: "og:description", content: "Organization and language preferences." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { org, terminology, terms } = useOrgContext();
  const queryClient = useQueryClient();

  async function changeTerminology(value: "simplified" | "accounting") {
    try {
      await setTerminology({ data: { terminology: value } });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Preference saved");
    } catch (err: any) {
      toast.error(err.message ?? "Could not save");
    }
  }

  if (!org) return null;

  return (
    <AppShell>
      <h1 className="font-display text-2xl font-bold">Settings</h1>

      <div className="mt-6 max-w-2xl space-y-4">
        <div className="rounded-lg border bg-card p-5">
          <h2 className="font-display text-lg font-semibold">Organization</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Name</dt>
              <dd className="font-medium">{org.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Type</dt>
              <dd className="font-medium">{terms.orgLabel}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Your role</dt>
              <dd className="font-medium capitalize">{org.role}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border bg-card p-5">
          <h2 className="font-display text-lg font-semibold">Language</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose how the app talks to you. The books underneath are always proper double-entry — this only changes the words.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button
              onClick={() => changeTerminology("simplified")}
              className={`rounded-md border p-4 text-left transition-colors ${
                terminology === "simplified" ? "border-primary bg-accent" : "border-input hover:bg-accent/50"
              }`}
            >
              <div className="text-sm font-medium">Plain language</div>
              <div className="text-xs text-muted-foreground">"Money in", "Money out", "Increase / Decrease"</div>
            </button>
            <button
              onClick={() => changeTerminology("accounting")}
              className={`rounded-md border p-4 text-left transition-colors ${
                terminology === "accounting" ? "border-primary bg-accent" : "border-input hover:bg-accent/50"
              }`}
            >
              <div className="text-sm font-medium">Accounting terms</div>
              <div className="text-xs text-muted-foreground">"Revenue", "Expenses", "Debit / Credit"</div>
            </button>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-5">
          <h2 className="font-display text-lg font-semibold">About Open Ledger</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Free, open-source accounting. Your ledger is the source of truth — bank imports are just evidence.
            Every change is recorded in an audit history.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Version 0.0.1</p>
        </div>
      </div>
    </AppShell>
  );
}
