import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, useOrgContext } from "@/components/AppShell";
import { listAccounts } from "@/lib/taxonomy.functions";
import { importBankRows, listBankTransactions, postBankTransaction } from "@/lib/import.functions";
import { formatCents } from "@/lib/money";
import { Upload, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({
    meta: [
      { title: "Import Bank File — Open Ledger" },
      { name: "description", content: "Import a bank CSV and post rows to your ledger." },
      { property: "og:title", content: "Import Bank File — Open Ledger" },
      { property: "og:description", content: "Import a bank CSV and post rows to your ledger." },
    ],
  }),
  component: ImportPage,
});

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

interface ParsedRow {
  date: string;
  description: string;
  amountCents: number;
}

function parseCsv(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const rows: ParsedRow[] = [];
  for (const line of lines) {
    const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cols.length < 3) continue;
    const [dateRaw = "", descRaw = "", amountRaw = ""] = cols;
    const date = new Date(dateRaw);
    if (isNaN(date.getTime())) continue; // skips header row too
    const amount = Number(amountRaw.replace(/[$,]/g, ""));
    if (!Number.isFinite(amount)) continue;
    rows.push({
      date: date.toISOString().slice(0, 10),
      description: descRaw || "Bank transaction",
      amountCents: Math.round(amount * 100),
    });
  }
  return rows;
}

function ImportPage() {
  const { org, terms } = useOrgContext();
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState("");
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [offsets, setOffsets] = useState<Record<string, string>>({});

  const accountsQuery = useQuery({
    queryKey: ["accounts", org?.id],
    queryFn: () => listAccounts({ data: { orgId: org!.id } }),
    enabled: !!org,
  });
  const bankQuery = useQuery({
    queryKey: ["bank", org?.id],
    queryFn: () => listBankTransactions({ data: { orgId: org!.id } }),
    enabled: !!org,
  });

  const accounts = accountsQuery.data ?? [];
  const bankAccounts = accounts.filter((a) => a.type === "asset" || a.type === "liability");
  const offsetAccounts = accounts.filter((a) => a.type === "revenue" || a.type === "expense");

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) {
      toast.error("No rows found. Expected CSV columns: date, description, amount.");
      return;
    }
    setParsed(rows);
  }

  async function runImport() {
    if (!org || !accountId || parsed.length === 0) return;
    setBusy(true);
    try {
      const result = await importBankRows({ data: { orgId: org.id, accountId, rows: parsed } });
      toast.success(`Imported ${result.imported} rows (${result.duplicatesSkipped} duplicates skipped)`);
      setParsed([]);
      queryClient.invalidateQueries({ queryKey: ["bank"] });
    } catch (err: any) {
      toast.error(err.message ?? "Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function postRow(bankId: string) {
    if (!org) return;
    const offset = offsets[bankId];
    if (!offset) {
      toast.error("Choose what this row was for first");
      return;
    }
    try {
      await postBankTransaction({ data: { orgId: org.id, bankTransactionId: bankId, offsetAccountId: offset } });
      toast.success("Posted to ledger");
      queryClient.invalidateQueries({ queryKey: ["bank"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    } catch (err: any) {
      toast.error(err.message ?? "Could not post");
    }
  }

  if (!org) return null;

  return (
    <AppShell>
      <h1 className="font-display text-2xl font-bold">Import Bank File</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Bank rows are evidence — nothing enters your books until you post it to the ledger.
      </p>

      <div className="mt-6 max-w-2xl rounded-lg border bg-card p-6">
        <label className="text-sm font-medium">Bank account</label>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputCls}>
          <option value="">Choose account…</option>
          {bankAccounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>

        <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-input px-4 py-8 text-sm text-muted-foreground hover:bg-accent/40">
          <Upload className="h-4 w-4" />
          Choose a CSV file (date, description, amount)
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
        </label>

        {parsed.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-medium">{parsed.length} rows ready to import</p>
            <div className="mt-2 max-h-48 overflow-auto rounded border">
              <table className="w-full text-xs">
                <tbody>
                  {parsed.slice(0, 20).map((r, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="tnum px-3 py-1.5">{r.date}</td>
                      <td className="px-3 py-1.5">{r.description}</td>
                      <td className="tnum px-3 py-1.5 text-right">{formatCents(r.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.length > 20 && <p className="px-3 py-1 text-xs text-muted-foreground">…and {parsed.length - 20} more</p>}
            </div>
            <button
              onClick={runImport}
              disabled={busy || !accountId}
              className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {busy ? "Importing…" : "Import rows"}
            </button>
          </div>
        )}
      </div>

      <h2 className="font-display mt-8 text-lg font-semibold">Imported rows</h2>
      <div className="mt-3 overflow-hidden rounded-lg border bg-card">
        {(bankQuery.data ?? []).length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Nothing imported yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Description</th>
                <th className="px-4 py-2">Account</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2">Post as</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {(bankQuery.data ?? []).map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="tnum px-4 py-2.5 text-muted-foreground">{r.date}</td>
                  <td className="px-4 py-2.5">{r.description}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.accountName}</td>
                  <td className="tnum px-4 py-2.5 text-right">{formatCents(r.amountCents)}</td>
                  <td className="px-4 py-2.5">
                    {r.linkedTransactionId ? (
                      <span className="flex items-center gap-1 text-xs text-primary">
                        <CheckCircle2 className="h-3.5 w-3.5" /> In ledger
                      </span>
                    ) : (
                      <select
                        value={offsets[r.id] ?? ""}
                        onChange={(e) => setOffsets({ ...offsets, [r.id]: e.target.value })}
                        className="rounded border border-input bg-background px-2 py-1 text-xs"
                      >
                        <option value="">Choose {r.amountCents >= 0 ? terms.revenue.toLowerCase() : terms.expenses.toLowerCase()}…</option>
                        {offsetAccounts.map((a) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {!r.linkedTransactionId && (
                      <button
                        onClick={() => postRow(r.id)}
                        className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                      >
                        Post
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
