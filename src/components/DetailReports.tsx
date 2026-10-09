// General ledger / account activity, fund activity and statement check reports.
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { EmptyState, ErrorState, LoadingState } from "@/components/PageStates";
import { generalLedger } from "@/lib/reports.functions";
import { getFundActivity } from "@/lib/funds.functions";
import { getReconciliation, listReconciliations } from "@/lib/reconcile.functions";
import { listAccounts } from "@/lib/taxonomy.functions";
import { computeStatementCheck } from "@/lib/report-detail";
import { formatCents } from "@/lib/money";
import { errorMessage } from "@/lib/errors";
import type { Terminology, Terms } from "@/lib/terminology";

interface Org {
  id: string;
  name: string;
  orgType: string;
  currency: string;
  fiscalYearStartMonth: number;
}

const inputCls =
  "rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring";
const btn =
  "inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50";
const MAX_LINES = 500;

type Exporter = {
  title: string;
  subtitle: string;
  head: string[];
  body: (string | number)[][];
  sheet: () => Promise<import("@/lib/export").Sheet>;
  file: string;
};

function ExportBar({ org, pref, make }: { org: Org; pref: Terminology; make: Exporter | null }) {
  const [busy, setBusy] = useState(false);
  async function run(kind: "csv" | "xlsx" | "pdf") {
    if (!make) return;
    setBusy(true);
    try {
      const ex = await import("@/lib/export");
      const base = ex.safeFileName(`${org.name}-${make.file}`);
      if (kind === "pdf") {
        const pdf = await import("@/lib/report-pdf");
        await pdf.exportTablePdf({ org, pref, ...make, fileName: `${base}.pdf` });
      } else if (kind === "csv") ex.downloadCsv(await make.sheet(), `${base}.csv`);
      else await ex.downloadXlsx([await make.sheet()], `${base}.xlsx`);
    } catch (e) {
      toast.error(errorMessage(e, "Could not export"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      <button className={btn} disabled={!make || busy} onClick={() => run("csv")}>
        CSV
      </button>
      <button className={btn} disabled={!make || busy} onClick={() => run("xlsx")}>
        Excel
      </button>
      <button
        disabled={!make || busy}
        onClick={() => run("pdf")}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        <Download className="h-4 w-4" /> Export PDF
      </button>
    </div>
  );
}

function Range(p: {
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
}) {
  return (
    <>
      <label className="text-muted-foreground" htmlFor="rep-from">
        From
      </label>
      <input
        id="rep-from"
        type="date"
        value={p.from}
        onChange={(e) => p.setFrom(e.target.value)}
        className={inputCls}
      />
      <label className="text-muted-foreground" htmlFor="rep-to">
        To
      </label>
      <input
        id="rep-to"
        type="date"
        value={p.to}
        onChange={(e) => p.setTo(e.target.value)}
        className={inputCls}
      />
    </>
  );
}

const basis = (from: string, to: string) =>
  `${from} to ${to} · Cash basis · voided transactions excluded`;

export function LedgerReport(p: {
  org: Org;
  terms: Terms;
  pref: Terminology;
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  accountName: string;
  setAccountName: (v: string) => void;
}) {
  const { org, from, to, accountName } = p;
  const accountsQ = useQuery({
    queryKey: ["accounts", org.id],
    queryFn: () => listAccounts({ data: { orgId: org.id } }),
  });
  const q = useQuery({
    queryKey: ["general-ledger", org.id, from, to, accountName],
    queryFn: () =>
      generalLedger({
        data: { orgId: org.id, from, to, ...(accountName ? { accountName } : {}) },
      }),
  });
  const title = accountName ? p.terms.accountActivity(accountName) : p.terms.generalLedger;
  const accounts = q.data?.accounts ?? [];
  const make: Exporter | null = q.data
    ? {
        title,
        subtitle: basis(from, to),
        head: ["Account", "Date", "Description", "Debit", "Credit", "Balance"],
        body: [],
        file: `${accountName ? "account-activity" : "general-ledger"}-${from}-to-${to}`,
        sheet: async () => (await import("@/lib/report-sheets")).ledgerSheet(title, accounts),
      }
    : null;
  if (make) {
    make.body = accounts.flatMap((a) => [
      [a.accountName, "", "Starting balance", "", "", a.openingCents],
      ...a.lines.map((l) => [
        a.accountName,
        l.date,
        l.description,
        l.debitCents || "",
        l.creditCents || "",
        l.balanceCents,
      ]),
      [a.accountName, "", "Ending balance", "", "", a.closingCents],
    ]);
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Range {...p} />
        <label className="text-muted-foreground" htmlFor="rep-account">
          Account
        </label>
        <select
          id="rep-account"
          value={accountName}
          onChange={(e) => p.setAccountName(e.target.value)}
          className={inputCls}
        >
          <option value="">All accounts</option>
          {(accountsQ.data ?? []).map((a) => (
            <option key={a.id} value={a.name}>
              {a.name}
            </option>
          ))}
        </select>
        <div className="ml-auto">
          <ExportBar org={org} pref={p.pref} make={make} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {title} · {basis(from, to)}
      </p>
      {q.isLoading ? (
        <LoadingState label="Loading ledger" />
      ) : q.error ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : accounts.length === 0 ? (
        <EmptyState title="No activity" description="Nothing was posted in this period." />
      ) : (
        accounts.map((a) => (
          <div
            key={a.accountType + a.accountName}
            className="overflow-x-auto rounded-lg border bg-card"
          >
            <h2 className="border-b bg-muted/50 px-4 py-2 text-sm font-semibold">
              {a.accountName}
            </h2>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Description</th>
                  <th className="px-4 py-2 text-right">Debit</th>
                  <th className="px-4 py-2 text-right">Credit</th>
                  <th className="px-4 py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b italic text-muted-foreground">
                  <td className="px-4 py-2" colSpan={4}>
                    Starting balance
                  </td>
                  <td className="tnum px-4 py-2 text-right">{formatCents(a.openingCents)}</td>
                </tr>
                {a.lines.slice(0, MAX_LINES).map((l, i) => (
                  <tr key={l.transactionId + i} className="border-b">
                    <td className="tnum px-4 py-2">{l.date}</td>
                    <td className="px-4 py-2">{l.description}</td>
                    <td className="tnum px-4 py-2 text-right">
                      {l.debitCents ? formatCents(l.debitCents) : ""}
                    </td>
                    <td className="tnum px-4 py-2 text-right">
                      {l.creditCents ? formatCents(l.creditCents) : ""}
                    </td>
                    <td className="tnum px-4 py-2 text-right">{formatCents(l.balanceCents)}</td>
                  </tr>
                ))}
                {a.lines.length > MAX_LINES && (
                  <tr className="border-b text-xs text-muted-foreground">
                    <td className="px-4 py-2" colSpan={5}>
                      Showing the first {MAX_LINES} of {a.lines.length} lines. Export to see them
                      all.
                    </td>
                  </tr>
                )}
                <tr className="bg-muted/50 font-semibold">
                  <td className="px-4 py-2" colSpan={2}>
                    Ending balance
                  </td>
                  <td className="tnum px-4 py-2 text-right">{formatCents(a.totalDebitCents)}</td>
                  <td className="tnum px-4 py-2 text-right">{formatCents(a.totalCreditCents)}</td>
                  <td className="tnum px-4 py-2 text-right">{formatCents(a.closingCents)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
}

export function FundReport(p: {
  org: Org;
  terms: Terms;
  pref: Terminology;
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
}) {
  const { org, from, to } = p;
  const q = useQuery({
    queryKey: ["fund-activity", org.id, from, to],
    queryFn: () => getFundActivity({ data: { orgId: org.id, from, to } }),
  });
  const funds = q.data?.funds ?? [];
  const make: Exporter | null = q.data
    ? {
        title: p.terms.fundActivity,
        subtitle: basis(from, to),
        head: ["Fund", "Restricted", "Opening", "Received", "Spent", "Released", "Closing"],
        body: funds.map((f) => [
          f.name,
          f.isRestricted ? "Yes" : "No",
          f.openingCents,
          f.receivedCents,
          f.spentCents,
          f.releasedCents,
          f.closingCents,
        ]),
        file: `fund-activity-${from}-to-${to}`,
        sheet: async () =>
          (await import("@/lib/report-sheets")).fundActivitySheet(funds, p.terms.fundActivity),
      }
    : null;
  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Range {...p} />
        <div className="ml-auto">
          <ExportBar org={org} pref={p.pref} make={make} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {p.terms.fundActivity} · {basis(from, to)}
      </p>
      {q.isLoading ? (
        <LoadingState label="Loading funds" />
      ) : q.error ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : funds.length === 0 ? (
        <EmptyState title="No funds yet" description="Add a fund on the Funds page first." />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Fund</th>
                <th className="px-4 py-2 text-right">Opening</th>
                <th className="px-4 py-2 text-right">Received</th>
                <th className="px-4 py-2 text-right">Spent</th>
                <th className="px-4 py-2 text-right">Released</th>
                <th className="px-4 py-2 text-right">Closing</th>
              </tr>
            </thead>
            <tbody>
              {funds.map((f) => (
                <tr key={f.id} className="border-b last:border-0">
                  <td className="px-4 py-2.5">
                    {f.name}
                    {f.isRestricted && (
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">
                        Restricted
                      </span>
                    )}
                  </td>
                  <td className="tnum px-4 py-2.5 text-right">{formatCents(f.openingCents)}</td>
                  <td className="tnum px-4 py-2.5 text-right">{formatCents(f.receivedCents)}</td>
                  <td className="tnum px-4 py-2.5 text-right">{formatCents(f.spentCents)}</td>
                  <td className="tnum px-4 py-2.5 text-right">{formatCents(f.releasedCents)}</td>
                  <td className="tnum px-4 py-2.5 text-right font-semibold">
                    {formatCents(f.closingCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function StatementCheckReport(p: { org: Org; terms: Terms; pref: Terminology }) {
  const { org } = p;
  const listQ = useQuery({
    queryKey: ["reconciliations", org.id],
    queryFn: () => listReconciliations({ data: { orgId: org.id } }),
  });
  const [picked, setPicked] = useState("");
  const id = picked || listQ.data?.[0]?.id || "";
  const q = useQuery({
    queryKey: ["reconciliation", id],
    queryFn: () => getReconciliation({ data: { id } }),
    enabled: !!id,
  });
  const r = q.data?.reconciliation;
  const rep = r ? computeStatementCheck(r.accountType, r, q.data?.entries ?? []) : null;
  const sub = r
    ? `${r.accountName} · ${r.periodStart} to ${r.periodEnd} · ${r.status === "completed" ? "Finished" : "In progress"}`
    : "";
  const make: Exporter | null =
    r && rep
      ? {
          title: p.terms.statementCheck,
          subtitle: sub,
          head: ["Status", "Date", "Description", "Amount"],
          body: [
            ["Statement", "", "Beginning balance", r.beginningBalanceCents],
            ...rep.cleared.map((e) => ["Matched", e.date, e.description, e.amountCents]),
            ...rep.outstanding.map((e) => ["Outstanding", e.date, e.description, e.amountCents]),
            ["Statement", "", "Cleared balance", rep.clearedBalanceCents],
            ["Statement", "", "Ending balance", r.endingBalanceCents],
            ["Statement", "", "Difference", rep.differenceCents],
          ],
          file: `statement-check-${r.accountName}-${r.periodEnd}`,
          sheet: async () =>
            (await import("@/lib/report-sheets")).statementCheckSheet(
              { ...r, ...rep },
              p.terms.statementCheck,
            ),
        }
      : null;

  const items = (
    title: string,
    list: { date: string; description: string; amountCents: number }[],
  ) => (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <h2 className="border-b bg-muted/50 px-4 py-2 text-sm font-semibold">
        {title} ({list.length})
      </h2>
      {list.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">None.</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {list.map((e, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="tnum px-4 py-2">{e.date}</td>
                <td className="px-4 py-2">{e.description}</td>
                <td className="tnum px-4 py-2 text-right">{formatCents(e.amountCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  if (listQ.isLoading) return <LoadingState label="Loading statement checks" />;
  if (listQ.error)
    return <ErrorState message={errorMessage(listQ.error)} onRetry={() => listQ.refetch()} />;
  if ((listQ.data ?? []).length === 0)
    return (
      <div className="mt-6">
        <EmptyState
          title="No statement checks yet"
          description="Start one on the Reconcile page to see it here."
        />
      </div>
    );
  return (
    <div className="mt-6 max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="text-muted-foreground" htmlFor="rep-check">
          {p.terms.statementCheck}
        </label>
        <select
          id="rep-check"
          value={id}
          onChange={(e) => setPicked(e.target.value)}
          className={inputCls}
        >
          {(listQ.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.accountName}, {c.periodEnd} (
              {c.status === "completed" ? "finished" : "in progress"})
            </option>
          ))}
        </select>
        <div className="ml-auto">
          <ExportBar org={org} pref={p.pref} make={make} />
        </div>
      </div>
      {q.isLoading || !r || !rep ? (
        <LoadingState label="Loading statement check" />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{sub} · Cash basis</p>
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              ["Beginning", r.beginningBalanceCents],
              ["Cleared balance", rep.clearedBalanceCents],
              ["Ending (statement)", r.endingBalanceCents],
              ["Difference", rep.differenceCents],
            ].map(([label, v]) => (
              <div key={label as string} className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="tnum font-semibold">{formatCents(v as number)}</div>
              </div>
            ))}
          </div>
          {items("Matched items", rep.cleared)}
          {items("Outstanding items", rep.outstanding)}
        </>
      )}
    </div>
  );
}
