import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useOrgContext } from "@/components/AppShell";
import { AccountChecklist, type ChecklistRow } from "@/components/AccountChecklist";
import { getAccountSetup, setAccountEnabled } from "@/lib/org.functions";
import { catalogFor, matchesCatalog } from "@/lib/account-catalog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/accounts")({
  head: () => ({
    meta: [
      { title: "Accounts Setup — Open Ledger" },
      { name: "description", content: "Choose which accounts your organization uses." },
      { property: "og:title", content: "Accounts Setup — Open Ledger" },
      { property: "og:description", content: "Choose which accounts your organization uses." },
    ],
  }),
  component: AccountsSetup,
});

function AccountsSetup() {
  const { org, terms } = useOrgContext();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const setup = useQuery({
    queryKey: ["account-setup", org?.id],
    queryFn: () => getAccountSetup({ data: { orgId: org!.id } }),
    enabled: !!org,
  });

  if (!org) return null;
  const isAdmin = org.role === "admin";
  const existing = setup.data ?? [];
  const catalog = catalogFor(org.orgType);

  const rows: ChecklistRow[] = [
    ...catalog.map((c) => {
      const acc = existing.find((a) => matchesCatalog(a, c));
      const locked = c.required ? "Required" : null;
      return {
        id: `c:${c.key}`,
        name: c.name,
        type: c.type,
        catalog: c,
        checked: acc?.isActive ?? !!c.required,
        locked,
        note: acc?.entryCount
          ? `Used by ${acc.entryCount} transaction line${acc.entryCount === 1 ? "" : "s"}; those records stay intact if archived.`
          : null,
      };
    }),
    ...existing
      .filter((a) => !catalog.some((c) => matchesCatalog(a, c)))
      .map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        checked: a.isActive,
        locked: null,
        note: a.entryCount
          ? `Used by ${a.entryCount} transaction line${a.entryCount === 1 ? "" : "s"}; those records stay intact if archived.`
          : null,
      })),
  ];

  async function toggle(row: ChecklistRow, next: boolean) {
    if (!org) return;
    setBusy(row.id);
    try {
      await setAccountEnabled({
        data: row.catalog
          ? { orgId: org.id, catalogKey: row.catalog.key, enabled: next }
          : { orgId: org.id, accountId: row.id, enabled: next },
      });
      await queryClient.invalidateQueries({ queryKey: ["account-setup"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast.success(next ? `${row.name} active` : `${row.name} archived`);
    } catch (err: any) {
      toast.error(err.message ?? "Could not update account");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-2xl rounded-lg border bg-card p-5">
      <h2 className="font-display text-lg font-semibold">Accounts</h2>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">
        Tick the accounts {org.name} uses for new activity. Archiving never removes past
        transactions or reports.
        {!isAdmin && " Only admins can change these."}
      </p>
      <AccountChecklist
        rows={rows}
        terms={terms}
        onToggle={toggle}
        disabled={!isAdmin || !!busy || setup.isLoading}
      />
    </div>
  );
}
