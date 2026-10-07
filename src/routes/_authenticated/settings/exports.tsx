import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useOrgContext } from "@/components/AppShell";
import { exportBackup, exportTransactions } from "@/lib/backup.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/exports")({
  head: () => ({
    meta: [
      { title: "Exports and backup - OpenLedgerApp" },
      { name: "description", content: "Download your books as spreadsheets or a full backup." },
      { property: "og:title", content: "Exports and backup - OpenLedgerApp" },
      {
        property: "og:description",
        content: "Download your books as spreadsheets or a full backup.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExportsPage,
});

const btn =
  "rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50";

function ExportsPage() {
  const { org } = useOrgContext();
  const [busy, setBusy] = useState<string | null>(null);
  if (!org) return null;
  const isAdmin = org.role === "admin";

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed");
    } finally {
      setBusy(null);
    }
  }

  async function transactions(kind: "csv" | "xlsx") {
    const ex = await import("@/lib/export");
    const rows = await exportTransactions({ data: { orgId: org!.id } });
    const sheet = {
      name: "Transactions",
      rows: [
        [
          "Date",
          "Description",
          "Status",
          "Source",
          "Account",
          "Account type",
          "Debit",
          "Credit",
          "Category",
          "Project",
          "Fund",
          "Memo",
        ],
        ...rows.map((r) => [
          r.date,
          r.description,
          r.status,
          r.source,
          r.account,
          r.accountType,
          ex.centsToNumber(r.debitCents),
          ex.centsToNumber(r.creditCents),
          r.category,
          r.project,
          r.fund,
          r.memo,
        ]),
      ],
    };
    const base = ex.safeFileName(`${org!.name}-transactions`);
    if (kind === "csv") ex.downloadCsv(sheet, `${base}.csv`);
    else await ex.downloadXlsx([sheet], `${base}.xlsx`);
  }

  async function backup() {
    const ex = await import("@/lib/export");
    const data = await exportBackup({ data: { orgId: org!.id } });
    ex.downloadJson(
      data,
      `${ex.safeFileName(org!.name)}-backup-${data.exportedAt.slice(0, 10)}.json`,
    );
    toast.success("Backup downloaded");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-card p-5">
        <h2 className="font-display text-lg font-semibold">Transactions</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every transaction line, including voided ones, with debit and credit columns. Text that
          looks like a spreadsheet formula is made safe.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            className={btn}
            disabled={!!busy}
            onClick={() => run("csv", () => transactions("csv"))}
          >
            {busy === "csv" ? "Preparing…" : "Download CSV"}
          </button>
          <button
            className={btn}
            disabled={!!busy}
            onClick={() => run("xlsx", () => transactions("xlsx"))}
          >
            {busy === "xlsx" ? "Preparing…" : "Download Excel"}
          </button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Reports can be exported as CSV, Excel or PDF from the Reports page.
        </p>
      </section>

      <section className="rounded-lg border bg-card p-5">
        <h2 className="font-display text-lg font-semibold">Full backup</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          One file with everything in this organization: accounts, transactions, bank imports,
          statement checks, funds, pledges, budgets, members and history. Keep it somewhere safe.
          Restoring from a backup is not available yet.
        </p>
        <div className="mt-4">
          <button
            className={btn}
            disabled={!!busy || !isAdmin}
            onClick={() => run("backup", backup)}
          >
            {busy === "backup" ? "Preparing…" : "Download backup"}
          </button>
          {!isAdmin && (
            <p className="mt-2 text-xs text-muted-foreground">Only admins can download a backup.</p>
          )}
        </div>
      </section>
    </div>
  );
}
