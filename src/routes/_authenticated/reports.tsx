import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, useOrgContext } from "@/components/AppShell";
import { incomeStatement, balanceSheet, trialBalance } from "@/lib/reports.functions";
import { fiscalYearStart } from "@/lib/dates";
import { formatCents, todayISO } from "@/lib/money";
import { Download } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Open Ledger" },
      { name: "description", content: "Income statement and balance sheet reports." },
      { property: "og:title", content: "Reports — Open Ledger" },
      { property: "og:description", content: "Income statement and balance sheet reports." },
    ],
  }),
  component: ReportsPage,
});

const inputCls =
  "rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring";

function ReportTable({ rows, total, totalLabel }: { rows: Array<{ name: string; totalCents: number }>; total: number; totalLabel: string }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((r) => (
          <tr key={r.name} className="border-b last:border-0">
            <td className="px-4 py-2.5">{r.name}</td>
            <td className="tnum px-4 py-2.5 text-right">{formatCents(r.totalCents)}</td>
          </tr>
        ))}
        <tr className="bg-muted/50 font-semibold">
          <td className="px-4 py-2.5">{totalLabel}</td>
          <td className="tnum px-4 py-2.5 text-right">{formatCents(total)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function ReportsPage() {
  const { org, reportTerms: terms, terminology } = useOrgContext();
  const [tab, setTab] = useState<"income" | "balance" | "trial">("income");
  const yearStart = fiscalYearStart(todayISO(), org?.fiscalYearStartMonth ?? 1);
  const [from, setFrom] = useState(yearStart);
  const [to, setTo] = useState(todayISO());
  const [asOf, setAsOf] = useState(todayISO());

  const incomeQuery = useQuery({
    queryKey: ["income", org?.id, from, to],
    queryFn: () => incomeStatement({ data: { orgId: org!.id, from, to } }),
    enabled: !!org && tab === "income",
  });
  const balanceQuery = useQuery({
    queryKey: ["balance", org?.id, asOf],
    queryFn: () => balanceSheet({ data: { orgId: org!.id, asOf } }),
    enabled: !!org && tab === "balance",
  });
  const trialQuery = useQuery({
    queryKey: ["trial", org?.id, asOf],
    queryFn: () => trialBalance({ data: { orgId: org!.id, asOf } }),
    enabled: !!org && tab === "trial",
  });

  const [exporting, setExporting] = useState(false);
  if (!org) return null;

  const income = incomeQuery.data;
  const balance = balanceQuery.data;

  async function exportPdf() {
    if (!org) return;
    setExporting(true);
    try {
      const pdf = await import("@/lib/report-pdf");
      if (tab === "income" && income) await pdf.exportIncomePdf({ org, terms, pref: terminology, from, to, data: income });
      else if (tab === "balance" && balance) await pdf.exportBalancePdf({ org, terms, pref: terminology, asOf, data: balance });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not create PDF");
    } finally {
      setExporting(false);
    }
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Reports</h1>
        <button
          onClick={exportPdf}
          disabled={exporting || tab === "trial" || (tab === "income" ? !income : !balance)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {exporting ? "Preparing…" : "Export PDF"}
        </button>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={() => setTab("income")}
          className={`rounded-md border px-4 py-2 text-sm font-medium ${tab === "income" ? "border-primary bg-accent" : "border-input hover:bg-accent/50"}`}
        >
          {terms.incomeStatement}
        </button>
        <button
          onClick={() => setTab("balance")}
          className={`rounded-md border px-4 py-2 text-sm font-medium ${tab === "balance" ? "border-primary bg-accent" : "border-input hover:bg-accent/50"}`}
        >
          {terms.balanceSheet}
        </button>
        <button
          onClick={() => setTab("trial")}
          className={`rounded-md border px-4 py-2 text-sm font-medium ${tab === "trial" ? "border-primary bg-accent" : "border-input hover:bg-accent/50"}`}
        >
          Trial balance
        </button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Cash basis · voided transactions are excluded.</p>

      {tab !== "income" && (
        <div className="mt-4 flex items-center gap-3 text-sm">
          <label className="text-muted-foreground">As of</label>
          <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className={inputCls} />
        </div>
      )}

      {tab === "income" && (
        <div className="mt-6 max-w-2xl">
          <div className="flex items-center gap-3 text-sm">
            <label className="text-muted-foreground">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
            <label className="text-muted-foreground">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
          </div>

          <div className="mt-4 space-y-4">
            <div className="overflow-hidden rounded-lg border bg-card">
              <h2 className="border-b bg-muted/50 px-4 py-2 text-sm font-semibold">{terms.revenue}</h2>
              <ReportTable rows={income?.revenue ?? []} total={income?.totalRevenueCents ?? 0} totalLabel={`Total ${terms.revenue.toLowerCase()}`} />
            </div>
            <div className="overflow-hidden rounded-lg border bg-card">
              <h2 className="border-b bg-muted/50 px-4 py-2 text-sm font-semibold">{terms.expenses}</h2>
              <ReportTable rows={income?.expenses ?? []} total={income?.totalExpensesCents ?? 0} totalLabel={`Total ${terms.expenses.toLowerCase()}`} />
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="font-display text-lg font-semibold">{terms.netIncome}</span>
                <span className={`tnum text-lg font-semibold ${(income?.netCents ?? 0) < 0 ? "text-destructive" : "text-primary"}`}>
                  {formatCents(income?.netCents ?? 0)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "balance" && balance && (
        <div className="mt-6 max-w-2xl space-y-4">
          <div className="overflow-hidden rounded-lg border bg-card">
            <h2 className="border-b bg-muted/50 px-4 py-2 text-sm font-semibold">Assets</h2>
            <ReportTable rows={balance.assets} total={balance.totalAssetsCents} totalLabel="Total assets" />
          </div>
          <div className="overflow-hidden rounded-lg border bg-card">
            <h2 className="border-b bg-muted/50 px-4 py-2 text-sm font-semibold">Liabilities</h2>
            <ReportTable rows={balance.liabilities} total={balance.totalLiabilitiesCents} totalLabel="Total liabilities" />
          </div>
          <div className="overflow-hidden rounded-lg border bg-card">
            <h2 className="border-b bg-muted/50 px-4 py-2 text-sm font-semibold">{terms.equity}</h2>
            <table className="w-full text-sm">
              <tbody>
                {balance.equity.map((r) => (
                  <tr key={r.name} className="border-b">
                    <td className="px-4 py-2.5">{r.name}</td>
                    <td className="tnum px-4 py-2.5 text-right">{formatCents(r.totalCents)}</td>
                  </tr>
                ))}
                <tr className="border-b">
                  <td className="px-4 py-2.5 italic text-muted-foreground">{org.orgType === "nonprofit" ? "Net assets from prior years" : "Retained earnings (prior years)"}</td>
                  <td className="tnum px-4 py-2.5 text-right">{formatCents(balance.retainedEarningsCents)}</td>
                </tr>
                <tr className="border-b">
                  <td className="px-4 py-2.5 italic text-muted-foreground">{terms.netIncome} (this fiscal year)</td>
                  <td className="tnum px-4 py-2.5 text-right">{formatCents(balance.netIncomeCents)}</td>
                </tr>
                <tr className="bg-muted/50 font-semibold">
                  <td className="px-4 py-2.5">Total {terms.equity.toLowerCase()}</td>
                  <td className="tnum px-4 py-2.5 text-right">{formatCents(balance.totalEquityCents)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Check: assets {formatCents(balance.totalAssetsCents)} = liabilities {formatCents(balance.totalLiabilitiesCents)} + {terms.equity.toLowerCase()} {formatCents(balance.totalEquityCents)}
          </p>
        </div>
      )}

      {tab === "trial" && trialQuery.data && (
        <div className="mt-6 max-w-2xl overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr><th className="px-4 py-2">Account</th><th className="px-4 py-2 text-right">Debit</th><th className="px-4 py-2 text-right">Credit</th></tr>
            </thead>
            <tbody>
              {trialQuery.data.lines.map((l) => (
                <tr key={l.type + l.name} className="border-b">
                  <td className="px-4 py-2.5">{l.name}</td>
                  <td className="tnum px-4 py-2.5 text-right">{l.debitCents ? formatCents(l.debitCents) : ""}</td>
                  <td className="tnum px-4 py-2.5 text-right">{l.creditCents ? formatCents(l.creditCents) : ""}</td>
                </tr>
              ))}
              <tr className="bg-muted/50 font-semibold">
                <td className="px-4 py-2.5">Totals {trialQuery.data.balanced ? "(balanced)" : "(NOT balanced)"}</td>
                <td className="tnum px-4 py-2.5 text-right">{formatCents(trialQuery.data.totalDebitCents)}</td>
                <td className="tnum px-4 py-2.5 text-right">{formatCents(trialQuery.data.totalCreditCents)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
