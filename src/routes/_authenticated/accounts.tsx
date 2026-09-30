import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, useOrgContext } from "@/components/AppShell";
import { listAccounts, createAccount, setOpeningBalance } from "@/lib/taxonomy.functions";
import { formatCents, parseToCents, todayISO } from "@/lib/money";
import { accountTypeLabel, displayBalance } from "@/lib/terminology";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/accounts")({
  head: () => ({
    meta: [
      { title: "Accounts — Open Ledger" },
      { name: "description", content: "Your chart of accounts and balances." },
      { property: "og:title", content: "Accounts — Open Ledger" },
      { property: "og:description", content: "Your chart of accounts and balances." },
    ],
  }),
  component: AccountsPage,
});

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

function AccountsPage() {
  const { org, terminology } = useOrgContext();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("asset");
  const [opening, setOpening] = useState("");

  const accountsQuery = useQuery({
    queryKey: ["accounts", org?.id],
    queryFn: () => listAccounts({ data: { orgId: org!.id } }),
    enabled: !!org,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!org) return;
    try {
      await createAccount({ data: { orgId: org.id, name, type: type as any } });
      const cents = parseToCents(opening);
      if (cents && cents !== 0 && (type === "asset" || type === "liability")) {
        const accounts = accountsQuery.data ?? [];
        const equity = accounts.find((a) => a.type === "equity");
        if (equity) {
          const { data: fresh } = await accountsQuery.refetch();
          const newAcc = (fresh ?? []).find((a) => a.name === name);
          if (newAcc) {
            await setOpeningBalance({
              data: {
                orgId: org.id,
                accountId: newAcc.id,
                equityAccountId: equity.id,
                amountCents: type === "liability" ? -cents : cents,
                date: todayISO(),
              },
            });
          }
        }
      }
      toast.success("Account created");
      setName("");
      setOpening("");
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    } catch (err: any) {
      toast.error(err.message ?? "Could not create account");
    }
  }

  if (!org) return null;

  const accounts = accountsQuery.data ?? [];
  const groups = ["asset", "liability", "equity", "revenue", "expense"]
    .map((t) => ({ type: t, accounts: accounts.filter((a) => a.type === t) }))
    .filter((g) => g.accounts.length > 0);

  return (
    <AppShell>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Accounts</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Add Account
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="mt-4 grid max-w-2xl grid-cols-4 items-end gap-3 rounded-lg border bg-card p-4">
          <div className="col-span-2">
            <label className="text-sm font-medium">Name</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. PayPal" />
          </div>
          <div>
            <label className="text-sm font-medium">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
              <option value="asset">{accountTypeLabel("asset", terminology)}</option>
              <option value="liability">{accountTypeLabel("liability", terminology)}</option>
              <option value="equity">{accountTypeLabel("equity", terminology)}</option>
              <option value="revenue">{accountTypeLabel("revenue", terminology)}</option>
              <option value="expense">{accountTypeLabel("expense", terminology)}</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Opening balance</label>
            <input inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} className={`${inputCls} tnum`} placeholder="0.00" />
          </div>
          <button type="submit" className="col-span-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Create account
          </button>
        </form>
      )}

      <div className="mt-6 space-y-6">
        {groups.map((g) => (
          <div key={g.type}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {accountTypeLabel(g.type, terminology)}
            </h2>
            <div className="mt-2 overflow-hidden rounded-lg border bg-card">
              <table className="w-full text-sm">
                <tbody>
                  {g.accounts.map((a) => (
                    <tr key={a.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{a.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{a.subtype ?? ""}</td>
                      <td className="tnum px-4 py-3 text-right">
                        {formatCents(displayBalance(a.type, a.balanceCents))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
