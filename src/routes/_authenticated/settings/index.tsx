import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useOrgContext } from "@/components/AppShell";
import { updateOrganization } from "@/lib/org.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/")({
  head: () => ({
    meta: [
      { title: "Organization Profile — Open Ledger" },
      { name: "description", content: "Organization name, type, currency, and fiscal year." },
      { property: "og:title", content: "Organization Profile — Open Ledger" },
      { property: "og:description", content: "Organization name, type, currency, and fiscal year." },
    ],
  }),
  component: OrgProfileSettings,
});

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "SEK", "NOK", "DKK", "JPY", "CHF"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function OrgProfileSettings() {
  const { org } = useOrgContext();
  const queryClient = useQueryClient();
  const [orgName, setOrgName] = useState<string | null>(null);
  const [orgType, setOrgType] = useState<"nonprofit" | "business" | null>(null);
  const [currency, setCurrency] = useState<string | null>(null);
  const [fyMonth, setFyMonth] = useState<number | null>(null);
  const [term, setTerm] = useState<"simplest" | "simple" | "accounting" | null>(null);
  const [saving, setSaving] = useState(false);

  if (!org) return null;

  const isAdmin = org.role === "admin";
  const dirty = orgName !== null || orgType !== null || currency !== null || fyMonth !== null || term !== null;

  async function saveOrg() {
    if (!org) return;
    setSaving(true);
    try {
      await updateOrganization({
        data: {
          orgId: org.id,
          name: (orgName ?? org.name).trim(),
          orgType: orgType ?? org.orgType,
          currency: currency ?? org.currency,
          fiscalYearStartMonth: fyMonth ?? org.fiscalYearStartMonth,
          terminology: term ?? (org as any).terminology ?? "simplest",
        },
      });
      queryClient.invalidateQueries({ queryKey: ["orgs"] });
      setOrgName(null);
      setOrgType(null);
      setCurrency(null);
      setFyMonth(null);
      setTerm(null);
      toast.success("Organization settings saved");
    } catch (err: any) {
      toast.error(err.message ?? "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-lg border bg-card p-5">
        <h2 className="font-display text-lg font-semibold">Organization profile</h2>
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
                  <div className="text-sm font-medium">{t === "nonprofit" ? "Nonprofit" : "Business"}</div>
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
          <div>
            <span className="text-sm font-medium">Wording</span>
            <p className="mt-1 text-xs text-muted-foreground">
              How the app and reports talk to everyone in this organization. The books underneath are always proper double-entry — this only changes the words.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {([
                { id: "simplest", label: "Simplest", hint: '"Money you have", "Money you owe", "Money in / out"' },
                { id: "simple", label: "Simple", hint: '"Accounts", "Income", "Expenses", "Transfers"' },
                { id: "accounting", label: "Double-entry", hint: '"Assets", "Liabilities", "Revenue", "Debits / Credits"' },
              ] as const).map((o) => (
                <button
                  key={o.id}
                  onClick={() => isAdmin && setTerm(o.id)}
                  disabled={!isAdmin}
                  className={`rounded-md border p-4 text-left transition-colors disabled:opacity-60 ${
                    (term ?? (org as any).terminology ?? "simplest") === o.id ? "border-primary bg-accent" : "border-input hover:bg-accent/50"
                  }`}
                >
                  <div className="text-sm font-medium">{o.label}</div>
                  <div className="text-xs text-muted-foreground">{o.hint}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium" htmlFor="org-currency">Currency</label>
              <select
                id="org-currency"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
                value={currency ?? org.currency}
                onChange={(e) => setCurrency(e.target.value)}
                disabled={!isAdmin}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="org-fy">Fiscal year starts</label>
              <select
                id="org-fy"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
                value={fyMonth ?? org.fiscalYearStartMonth}
                onChange={(e) => setFyMonth(Number(e.target.value))}
                disabled={!isAdmin}
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
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
        <h2 className="font-display text-lg font-semibold">About Open Ledger</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Free, open-source accounting. Your ledger is the source of truth — bank imports are just evidence.
          Every change is recorded in an audit history.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">Version 0.0.1</p>
      </div>
    </div>
  );
}
