import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, useOrgContext } from "@/components/AppShell";
import { setTerminology, updateOrganization } from "@/lib/org.functions";
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
  const { org, terminology } = useOrgContext();
  const queryClient = useQueryClient();
  const [orgName, setOrgName] = useState<string | null>(null);
  const [orgType, setOrgType] = useState<"nonprofit" | "business" | null>(null);
  const [saving, setSaving] = useState(false);

  async function changeTerminology(value: "simplified" | "accounting") {
    try {
      await setTerminology({ data: { terminology: value } });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Preference saved");
    } catch (err: any) {
      toast.error(err.message ?? "Could not save");
    }
  }

  async function saveOrg() {
    if (!org) return;
    setSaving(true);
    try {
      await updateOrganization({
        data: {
          orgId: org.id,
          name: (orgName ?? org.name).trim(),
          orgType: orgType ?? org.orgType,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["orgs"] });
      setOrgName(null);
      setOrgType(null);
      toast.success("Organization settings saved");
    } catch (err: any) {
      toast.error(err.message ?? "Could not save");
    } finally {
      setSaving(false);
    }
  }

  if (!org) return null;

  const isAdmin = org.role === "admin";
  const dirty = orgName !== null || orgType !== null;

  return (
    <AppShell>
      <h1 className="font-display text-2xl font-bold">Settings</h1>

      <div className="mt-6 max-w-2xl space-y-4">
        <div className="rounded-lg border bg-card p-5">
          <h2 className="font-display text-lg font-semibold">Organization settings</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            These apply to everyone in {org.name}.
            {!isAdmin && " Only admins can change them."}
          </p>
          <div className="mt-4 space-y-4">
            <div>
              <label className="text-sm font-medium" htmlFor="org-name">Organization name</label>
              <input
                id="org-name"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
                value={orgName ?? org.name}
                onChange={(e) => setOrgName(e.target.value)}
                disabled={!isAdmin}
              />
            </div>
            <div>
              <span className="text-sm font-medium">Organization type</span>
              <div className="mt-2 grid grid-cols-2 gap-3">
                {(["business", "nonprofit"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => isAdmin && setOrgType(t)}
                    disabled={!isAdmin}
                    className={`rounded-md border p-4 text-left transition-colors disabled:opacity-60 ${
                      (orgType ?? org.orgType) === t ? "border-primary bg-accent" : "border-input hover:bg-accent/50"
                    }`}
                  >
                    <div className="text-sm font-medium capitalize">{t === "nonprofit" ? "Nonprofit" : "Business"}</div>
                    <div className="text-xs text-muted-foreground">
                      {t === "nonprofit"
                        ? "Funds, donations, Statement of Activities"
                        : "Profit & Loss, Owner's Equity"}
                    </div>
                  </button>
                ))}
              </div>
              {orgType !== null && orgType !== org.orgType && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Changing type only changes labels and report names — your accounts and transactions stay as they are.
                </p>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Your role: <span className="font-medium capitalize text-foreground">{org.role}</span>
              </span>
              {isAdmin && (
                <button
                  onClick={saveOrg}
                  disabled={!dirty || saving || !(orgName ?? org.name).trim()}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save organization settings"}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-5">
          <h2 className="font-display text-lg font-semibold">Your preferences</h2>
          <p className="mt-1 text-sm text-muted-foreground">Only affects what you see — nobody else in the organization.</p>
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
