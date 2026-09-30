import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useOrgContext } from "@/components/AppShell";
import { setTerminology } from "@/lib/org.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/preferences")({
  head: () => ({
    meta: [
      { title: "Your Preferences — Open Ledger" },
      { name: "description", content: "Personal display preferences that only affect what you see." },
      { property: "og:title", content: "Your Preferences — Open Ledger" },
      { property: "og:description", content: "Personal display preferences that only affect what you see." },
    ],
  }),
  component: PreferencesSettings,
});

function PreferencesSettings() {
  const { org, terminology } = useOrgContext();
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
    <div className="max-w-2xl space-y-4">
      <div className="rounded-lg border bg-card p-5">
        <h2 className="font-display text-lg font-semibold">Your preferences</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Only affects what you see — nobody else in the organization.
        </p>
        <h3 className="mt-4 text-sm font-medium">Language</h3>
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
    </div>
  );
}
