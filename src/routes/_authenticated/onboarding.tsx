import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BookOpen, Building2, HeartHandshake } from "lucide-react";
import { createOrganization } from "@/lib/org.functions";
import { setStoredOrgId } from "@/lib/current-org";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Set up your organization — Open Ledger" },
      { name: "description", content: "Create your organization and chart of accounts." },
      { property: "og:title", content: "Set up your organization — Open Ledger" },
      { property: "og:description", content: "Create your organization and chart of accounts." },
    ],
  }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const [name, setName] = useState("");
  const [orgType, setOrgType] = useState<"nonprofit" | "business">("business");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { id } = await createOrganization({ data: { name, orgType } });
      setStoredOrgId(id);
      await queryClient.invalidateQueries({ queryKey: ["orgs"] });
      navigate({ to: "/" });
    } catch (err: any) {
      setError(err.message ?? "Could not create organization");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-primary" />
          <h1 className="font-display mt-3 text-2xl font-bold">Set up your organization</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            We'll create a starter chart of accounts you can edit later.
          </p>
        </div>

        <form onSubmit={submit} className="rounded-lg border bg-card p-6 shadow-sm">
          <label className="block text-sm font-medium">Organization name</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Riverside Community Kitchen"
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />

          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setOrgType("business")}
              className={`rounded-md border p-4 text-left transition-colors ${
                orgType === "business" ? "border-primary bg-accent" : "border-input hover:bg-accent/50"
              }`}
            >
              <Building2 className="h-5 w-5 text-primary" />
              <div className="mt-2 text-sm font-medium">Small Business</div>
              <div className="text-xs text-muted-foreground">Profit & loss, owner's equity</div>
            </button>
            <button
              type="button"
              onClick={() => setOrgType("nonprofit")}
              className={`rounded-md border p-4 text-left transition-colors ${
                orgType === "nonprofit" ? "border-primary bg-accent" : "border-input hover:bg-accent/50"
              }`}
            >
              <HeartHandshake className="h-5 w-5 text-primary" />
              <div className="mt-2 text-sm font-medium">Nonprofit</div>
              <div className="text-xs text-muted-foreground">Funds, net assets, grants</div>
            </button>
          </div>

          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="mt-6 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create organization"}
          </button>
        </form>
      </div>
    </div>
  );
}
