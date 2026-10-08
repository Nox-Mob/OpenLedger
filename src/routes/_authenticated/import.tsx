import { errorMessage } from "@/lib/errors";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell, OrgPending } from "@/components/AppShell";
import { useOrgContext } from "@/hooks/use-org-context";
import { listAccounts } from "@/lib/taxonomy.functions";
import {
  checkDuplicates,
  extractPdfStatement,
  getPdfUsage,
  importBankRows,
  listBankTransactions,
  listImportBatches,
  listImportProfiles,
  postBankTransaction,
  saveImportProfile,
  undoImportBatch,
} from "@/lib/import.functions";
import {
  applyMapping,
  guessMapping,
  parseAmount,
  parseDate,
  tokenizeCsv,
  type CsvMapping,
  type ParsedRow,
} from "@/lib/parsers/csv";
import { parseOfx } from "@/lib/parsers/ofx";
import { checkStatementBalance, PDF_LIMITS } from "@/lib/parsers/statement-balance";
import { formatCents } from "@/lib/money";
import { Upload, CheckCircle2, AlertTriangle, Copy, Undo2, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({
    meta: [
      { title: "Import Bank File - OpenLedgerApp" },
      {
        name: "description",
        content: "Import CSV, OFX/QFX or PDF bank statements and post rows to your ledger.",
      },
      { property: "og:title", content: "Import Bank File - OpenLedgerApp" },
      {
        property: "og:description",
        content: "Import CSV, OFX/QFX or PDF bank statements and post rows to your ledger.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ImportPage,
});

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
const smallInput = "rounded border border-input bg-background px-2 py-1 text-xs";

type Format = "csv" | "ofx" | "qfx" | "pdf";
type RowStatus = "valid" | "duplicate" | "error";
interface PreviewRow extends ParsedRow {
  status: RowStatus;
}

interface Statement {
  start: string;
  end: string;
  beginning: string;
  ending: string;
}
const emptyStatement: Statement = { start: "", end: "", beginning: "", ending: "" };
const centsToInput = (c: number | null | undefined) => (c == null ? "" : (c / 100).toFixed(2));

function ImportPage() {
  const { org, terms } = useOrgContext();
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState("");
  const [fileName, setFileName] = useState("");
  const [format, setFormat] = useState<Format | null>(null);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<CsvMapping | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [statement, setStatement] = useState<Statement>(emptyStatement);
  const [busy, setBusy] = useState<string | null>(null);
  const [posting, setPosting] = useState<Set<string>>(new Set());
  const [offsets, setOffsets] = useState<Record<string, string>>({});
  const [profileName, setProfileName] = useState("");
  const [aiAck, setAiAck] = useState(false);
  const [acceptMismatch, setAcceptMismatch] = useState(false);

  const enabled = !!org;
  const accountsQuery = useQuery({
    queryKey: ["accounts", org?.id],
    queryFn: () => listAccounts({ data: { orgId: org!.id } }),
    enabled,
  });
  const bankQuery = useQuery({
    queryKey: ["bank", org?.id],
    queryFn: () => listBankTransactions({ data: { orgId: org!.id } }),
    enabled,
  });
  const batchQuery = useQuery({
    queryKey: ["batches", org?.id],
    queryFn: () => listImportBatches({ data: { orgId: org!.id } }),
    enabled,
  });
  const profileQuery = useQuery({
    queryKey: ["import-profiles", org?.id],
    queryFn: () => listImportProfiles({ data: { orgId: org!.id } }),
    enabled,
  });
  const pdfUsageQuery = useQuery({
    queryKey: ["pdf-usage", org?.id],
    queryFn: () => getPdfUsage({ data: { orgId: org!.id } }),
    enabled: enabled && !!org?.aiPdfEnabled,
  });

  const accounts = (accountsQuery.data ?? []).filter((account) => account.isActive);
  const bankAccounts = accounts.filter((a) => a.type === "asset" || a.type === "liability");
  const offsetAccounts = accounts.filter((a) => a.type === "revenue" || a.type === "expense");
  const profiles = (profileQuery.data ?? []).filter((p) => p.accountId === accountId);

  const counts = useMemo(
    () => ({
      valid: rows.filter((r) => r.status === "valid").length,
      duplicate: rows.filter((r) => r.status === "duplicate").length,
      error: rows.filter((r) => r.status === "error").length,
    }),
    [rows],
  );

  const balanceCheck = useMemo(() => {
    if (format !== "pdf") return null;
    const c = (v: string) => (v.trim() ? parseAmount(v) : null);
    return checkStatementBalance(
      c(statement.beginning),
      rows.filter((r) => r.status !== "error").map((r) => r.amountCents),
      c(statement.ending),
    );
  }, [format, rows, statement]);
  const blockedByBalance = balanceCheck?.status === "mismatch" && !acceptMismatch;

  function reset() {
    setFileName("");
    setFormat(null);
    setCsvRows([]);
    setMapping(null);
    setRows([]);
    setStatement(emptyStatement);
    setAcceptMismatch(false);
  }

  async function markDuplicates(parsed: ParsedRow[]): Promise<PreviewRow[]> {
    const withStatus: PreviewRow[] = parsed.map((r) => ({
      ...r,
      status: r.error ? "error" : "valid",
    }));
    if (!org || !accountId) return withStatus;
    const valid = withStatus.filter((r) => r.status === "valid");
    if (!valid.length) return withStatus;
    try {
      const { duplicates } = await checkDuplicates({
        data: {
          orgId: org.id,
          accountId,
          rows: valid.map(({ date, description, amountCents, externalId }) => ({
            date,
            description,
            amountCents,
            externalId,
          })),
        },
      });
      const dupSet = new Set(duplicates.map((i) => valid[i]));
      return withStatus.map((r) => (dupSet.has(r) ? { ...r, status: "duplicate" } : r));
    } catch (err) {
      toast.error(`Couldn't check for duplicates: ${errorMessage(err)}`);
      return withStatus;
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!accountId) {
      toast.error("Choose the bank account first");
      return;
    }
    reset();
    setFileName(file.name);
    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    try {
      if (ext === "ofx" || ext === "qfx") {
        setFormat(ext);
        const { rows: parsed, meta } = parseOfx(await file.text());
        if (!parsed.length) throw new Error("No transactions found in this file.");
        setStatement({
          start: meta.statementStart ?? "",
          end: meta.statementEnd ?? "",
          beginning: centsToInput(meta.beginningBalanceCents),
          ending: centsToInput(meta.endingBalanceCents),
        });
        setRows(await markDuplicates(parsed));
      } else if (ext === "pdf") {
        if (!org?.aiPdfEnabled)
          throw new Error(
            "Reading PDF statements uses AI and is off for this organization. An admin can turn it on in Settings.",
          );
        if (!aiAck)
          throw new Error("Tick the AI notice under the file box before uploading a PDF.");
        if (file.size > PDF_LIMITS.maxBytes) throw new Error("PDFs over 10 MB aren't supported.");
        if (pdfUsageQuery.data && pdfUsageQuery.data.remaining <= 0)
          throw new Error("You've reached your PDF reading limit for now.");
        setFormat("pdf");
        setBusy("Reading the PDF…");
        const { extractPdfText } = await import("@/lib/parsers/pdf-text");
        const text = await extractPdfText(file);
        if (text.replace(/--- Page \d+ ---/g, "").trim().length < 40)
          throw new Error(
            "This PDF has no readable text (it may be a scanned image). Try the bank's CSV or OFX download instead.",
          );
        setBusy("Finding transactions…");
        const pageCount = Math.max(1, (text.match(/--- Page \d+ ---/g) ?? []).length);
        const result = await extractPdfStatement({
          data: { orgId: org.id, text, pageCount, byteSize: file.size, acknowledged: true },
        }).finally(() => queryClient.invalidateQueries({ queryKey: ["pdf-usage"] }));
        setStatement({
          start: result.statementStart ?? "",
          end: result.statementEnd ?? "",
          beginning: centsToInput(result.beginningBalanceCents),
          ending: centsToInput(result.endingBalanceCents),
        });
        const parsed: ParsedRow[] = result.transactions.map((t, i) => {
          const date = parseDate(t.date, "auto");
          return {
            line: i + 1,
            date: date ?? "",
            description: t.description || "Bank transaction",
            amountCents: t.amountCents,
            error: !date ? "Can't read date" : t.amountCents === 0 ? "Amount is zero" : undefined,
          };
        });
        if (!parsed.length) throw new Error("No transactions found in this PDF.");
        setRows(await markDuplicates(parsed));
        toast.message(
          "Please check each row against your statement. PDF reading can make mistakes.",
        );
      } else {
        setFormat("csv");
        const tokens = tokenizeCsv(await file.text());
        if (!tokens.length) throw new Error("The file is empty.");
        setCsvRows(tokens);
        const saved = profiles[0]?.mapping as CsvMapping | undefined;
        const m = saved ?? guessMapping(tokens);
        if (saved) toast.message(`Using saved layout "${profiles[0]!.name}"`);
        setMapping(m);
        setRows(await markDuplicates(applyMapping(tokens, m)));
      }
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't read this file"));
      reset();
    } finally {
      setBusy(null);
    }
  }

  async function updateMapping(patch: Partial<CsvMapping>) {
    if (!mapping) return;
    const m = { ...mapping, ...patch };
    setMapping(m);
    setRows(await markDuplicates(applyMapping(csvRows, m)));
  }

  async function editRow(
    i: number,
    patch: Partial<Pick<ParsedRow, "date" | "description">> & { amount?: string },
  ) {
    const next = [...rows];
    const r = { ...next[i]! };
    if (patch.date !== undefined) r.date = parseDate(patch.date, "auto") ?? patch.date;
    if (patch.description !== undefined) r.description = patch.description;
    if (patch.amount !== undefined) r.amountCents = parseAmount(patch.amount) ?? NaN;
    const ok =
      /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(r.amountCents) && r.amountCents !== 0;
    r.error = ok ? undefined : "Check date and amount";
    r.status = ok ? "valid" : "error";
    next[i] = r;
    setRows(next);
  }

  function downloadErrors() {
    const bad = rows.filter((r) => r.status === "error");
    const csv = [
      "line,date,description,amount,problem",
      ...bad.map((r) =>
        [
          r.line,
          r.date,
          `"${r.description.replace(/"/g, '""')}"`,
          Number.isFinite(r.amountCents) ? (r.amountCents / 100).toFixed(2) : "",
          `"${r.error ?? ""}"`,
        ].join(","),
      ),
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `import-errors-${fileName || "file"}.csv`;
    a.click();
  }

  async function runImport() {
    if (!org || !accountId || !format || counts.valid === 0) return;
    setBusy("Importing…");
    try {
      const toCents = (v: string) =>
        v.trim() ? parseAmount(v, mapping?.decimalSeparator ?? "dot") : null;
      const result = await importBankRows({
        data: {
          orgId: org.id,
          accountId,
          fileName,
          format,
          rows: rows
            .filter((r) => r.status === "valid")
            .map(({ date, description, amountCents, externalId }) => ({
              date,
              description,
              amountCents,
              externalId,
            })),
          errorCount: counts.error,
          statementStart: statement.start || null,
          statementEnd: statement.end || null,
          beginningBalanceCents: toCents(statement.beginning),
          endingBalanceCents: toCents(statement.ending),
          acceptMismatch,
        },
      });
      toast.success(
        `Imported ${result.imported} rows (${result.duplicatesSkipped + counts.duplicate} duplicates, ${counts.error} errors skipped)`,
      );
      reset();
      queryClient.invalidateQueries({ queryKey: ["bank"] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
    } catch (err) {
      toast.error(errorMessage(err, "Import failed. Nothing was saved."));
    } finally {
      setBusy(null);
    }
  }

  async function saveProfile() {
    if (!org || !accountId || !mapping || !profileName.trim()) return;
    try {
      await saveImportProfile({
        data: { orgId: org.id, accountId, name: profileName.trim(), mapping: { ...mapping } },
      });
      toast.success("Layout saved for this account");
      setProfileName("");
      queryClient.invalidateQueries({ queryKey: ["import-profiles"] });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function undoBatch(batchId: string) {
    if (!org || !confirm("Remove every row from this file? Nothing in your ledger changes."))
      return;
    try {
      const r = await undoImportBatch({ data: { orgId: org.id, batchId } });
      toast.success(`Removed ${r.removed} imported rows`);
      queryClient.invalidateQueries({ queryKey: ["bank"] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function postRow(bankId: string) {
    if (!org) return;
    const offset = offsets[bankId];
    if (!offset) {
      toast.error("Choose what this row was for first");
      return;
    }
    if (posting.has(bankId)) return;
    setPosting((p) => new Set(p).add(bankId));
    try {
      await postBankTransaction({
        data: { orgId: org.id, bankTransactionId: bankId, offsetAccountId: offset },
      });
      toast.success("Posted to ledger");
      queryClient.invalidateQueries({ queryKey: ["bank"] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    } catch (err) {
      toast.error(errorMessage(err, "Could not post"));
    } finally {
      setPosting((p) => {
        const n = new Set(p);
        n.delete(bankId);
        return n;
      });
    }
  }

  if (!org) return <OrgPending />;
  const header = csvRows[0] ?? [];
  const colOptions = header.map((h, i) => ({
    i,
    label: mapping?.hasHeader ? h || `Column ${i + 1}` : `Column ${i + 1} (${h.slice(0, 16)})`,
  }));
  const ColSelect = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))} className={inputCls}>
      {colOptions.map((c) => (
        <option key={c.i} value={c.i}>
          {c.label}
        </option>
      ))}
    </select>
  );

  return (
    <AppShell>
      <h1 className="font-display text-2xl font-bold">Import Bank File</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Bank rows are evidence. Nothing enters your books until you post it to the ledger. Supports
        CSV, OFX/QFX and PDF statements.
      </p>

      <div className="mt-6 rounded-lg border bg-card p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium">1. Bank account</label>
            <select
              aria-label="1. Bank account"
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                reset();
              }}
              className={inputCls}
            >
              <option value="">Choose account…</option>
              {bankAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">2. Statement file</label>
            <label
              className={`flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-input px-4 py-2 text-sm text-muted-foreground hover:bg-accent/40 ${!accountId ? "opacity-50" : ""}`}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {busy ?? (fileName || "Choose CSV, OFX, QFX or PDF")}
              <input
                type="file"
                accept=".csv,.ofx,.qfx,.pdf,text/csv,application/pdf"
                className="hidden"
                onChange={onFile}
                disabled={!accountId || !!busy}
              />
            </label>
            {org.aiPdfEnabled ? (
              <div className="mt-2 text-xs text-muted-foreground">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={aiAck}
                    onChange={(e) => setAiAck(e.target.checked)}
                  />
                  <span>
                    For PDFs: I understand the statement's text is sent to an AI service to find
                    transactions (not used for training), and that I must check every row.
                  </span>
                </label>
                {pdfUsageQuery.data && (
                  <p className="mt-1">
                    {pdfUsageQuery.data.remaining} PDF reads left (limit {PDF_LIMITS.perDay}/day,{" "}
                    {PDF_LIMITS.perMonth}/30 days).
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                PDF reading uses AI and is off for this organization. An admin can turn it on in
                Settings.
              </p>
            )}
          </div>
        </div>

        {format === "csv" && mapping && (
          <div className="mt-6 rounded-md border p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">3. Match the columns</h3>
              {profiles.length > 0 && (
                <select
                  className={smallInput}
                  value=""
                  onChange={async (e) => {
                    const p = profiles.find((x) => x.id === e.target.value);
                    if (p) {
                      setMapping(p.mapping);
                      setRows(await markDuplicates(applyMapping(csvRows, p.mapping)));
                    }
                  }}
                >
                  <option value="">Use a saved layout…</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div>
                <label className="text-xs text-muted-foreground">Date column</label>
                <ColSelect
                  value={mapping.dateCol}
                  onChange={(v) => updateMapping({ dateCol: v })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Description column</label>
                <ColSelect
                  value={mapping.descCol}
                  onChange={(v) => updateMapping({ descCol: v })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Date format</label>
                <select
                  aria-label="Date format"
                  value={mapping.dateFormat}
                  onChange={(e) =>
                    updateMapping({ dateFormat: e.target.value as CsvMapping["dateFormat"] })
                  }
                  className={inputCls}
                >
                  <option value="auto">Detect automatically</option>
                  <option value="MDY">MM/DD/YYYY</option>
                  <option value="DMY">DD/MM/YYYY</option>
                  <option value="YMD">YYYY-MM-DD</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Amounts are in</label>
                <select
                  aria-label="Amounts are in"
                  value={mapping.amountMode}
                  onChange={(e) =>
                    updateMapping({ amountMode: e.target.value as CsvMapping["amountMode"] })
                  }
                  className={inputCls}
                >
                  <option value="single">One column (+ in, − out)</option>
                  <option value="split">Separate in / out columns</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Number format</label>
                <select
                  aria-label="Number format"
                  value={mapping.decimalSeparator ?? "dot"}
                  onChange={(e) =>
                    updateMapping({
                      decimalSeparator: e.target.value as CsvMapping["decimalSeparator"],
                    })
                  }
                  className={inputCls}
                >
                  <option value="dot">1,234.56 (dot decimals)</option>
                  <option value="comma">1.234,56 (comma decimals)</option>
                </select>
              </div>
              {mapping.amountMode === "single" ? (
                <div>
                  <label className="text-xs text-muted-foreground">Amount column</label>
                  <ColSelect
                    value={mapping.amountCol}
                    onChange={(v) => updateMapping({ amountCol: v })}
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-xs text-muted-foreground">Money in column</label>
                    <ColSelect
                      value={mapping.creditCol}
                      onChange={(v) => updateMapping({ creditCol: v })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Money out column</label>
                    <ColSelect
                      value={mapping.debitCol}
                      onChange={(v) => updateMapping({ debitCol: v })}
                    />
                  </div>
                </>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={mapping.hasHeader}
                  onChange={(e) => updateMapping({ hasHeader: e.target.checked })}
                />{" "}
                First row is a header
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={mapping.flipSign}
                  onChange={(e) => updateMapping({ flipSign: e.target.checked })}
                />{" "}
                Flip signs (common for credit cards)
              </label>
              <div className="ml-auto flex items-center gap-2">
                <input
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="Layout name, e.g. Chase"
                  className={smallInput}
                />
                <button
                  onClick={saveProfile}
                  disabled={!profileName.trim()}
                  className="rounded border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
                >
                  Save layout
                </button>
              </div>
            </div>
          </div>
        )}

        {format && rows.length > 0 && (
          <>
            <div className="mt-6 rounded-md border p-4">
              <h3 className="text-sm font-semibold">
                Statement period{" "}
                <span className="font-normal text-muted-foreground">
                  (optional, used to check against your statement later)
                </span>
              </h3>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <div>
                  <label className="text-xs text-muted-foreground">From</label>
                  <input
                    aria-label="From"
                    type="date"
                    value={statement.start}
                    onChange={(e) => setStatement({ ...statement, start: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">To</label>
                  <input
                    aria-label="To"
                    type="date"
                    value={statement.end}
                    onChange={(e) => setStatement({ ...statement, end: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Beginning balance</label>
                  <input
                    aria-label="Beginning balance"
                    inputMode="decimal"
                    value={statement.beginning}
                    onChange={(e) => setStatement({ ...statement, beginning: e.target.value })}
                    className={`${inputCls} tnum`}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Ending balance</label>
                  <input
                    aria-label="Ending balance"
                    inputMode="decimal"
                    value={statement.ending}
                    onChange={(e) => setStatement({ ...statement, ending: e.target.value })}
                    className={`${inputCls} tnum`}
                    placeholder="0.00"
                  />
                </div>
              </div>
              {balanceCheck?.status === "match" && (
                <p className="mt-3 flex items-center gap-1 text-sm text-primary">
                  <CheckCircle2 className="h-4 w-4" /> Opening balance + rows = closing balance. The
                  statement adds up.
                </p>
              )}
              {balanceCheck?.status === "unknown" && (
                <p className="mt-3 text-sm text-muted-foreground">
                  Enter both balances from the statement to check that the rows add up.
                </p>
              )}
              {balanceCheck?.status === "mismatch" && (
                <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                  <p className="flex items-center gap-1 font-medium text-destructive">
                    <AlertTriangle className="h-4 w-4" /> The rows don't add up: off by{" "}
                    {formatCents(balanceCheck.gapCents)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Opening balance + rows = {formatCents(balanceCheck.expectedCents)}, but the
                    statement's closing balance is different. A row may be missing, doubled or have
                    the wrong sign. Fix the rows below, or:
                  </p>
                  <label className="mt-2 flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={acceptMismatch}
                      onChange={(e) => setAcceptMismatch(e.target.checked)}
                    />
                    Import anyway. I'll review every row before posting
                  </label>
                </div>
              )}
            </div>

            <div className="mt-6">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="flex items-center gap-1 text-primary">
                  <CheckCircle2 className="h-4 w-4" /> {counts.valid} ready
                </span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Copy className="h-4 w-4" /> {counts.duplicate} already imported
                </span>
                <span className="flex items-center gap-1 text-destructive">
                  <AlertTriangle className="h-4 w-4" /> {counts.error} need fixing
                </span>
                {counts.error > 0 && (
                  <button
                    onClick={downloadErrors}
                    className="flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-accent"
                  >
                    <Download className="h-3 w-3" /> Download problem rows
                  </button>
                )}
              </div>
              <div className="mt-2 max-h-96 overflow-auto rounded border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted text-left text-muted-foreground">
                    <tr>
                      <th className="px-3 py-1.5">Line</th>
                      <th className="px-3 py-1.5">Date</th>
                      <th className="px-3 py-1.5">Description</th>
                      <th className="px-3 py-1.5 text-right">Amount</th>
                      <th className="px-3 py-1.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr
                        key={i}
                        className={`border-b last:border-0 ${r.status === "error" ? "bg-destructive/5" : r.status === "duplicate" ? "opacity-60" : ""}`}
                      >
                        <td className="tnum px-3 py-1 text-muted-foreground">{r.line}</td>
                        {r.status === "error" || format === "pdf" ? (
                          <>
                            <td className="px-3 py-1">
                              <input
                                defaultValue={r.date}
                                onBlur={(e) => editRow(i, { date: e.target.value })}
                                className={`${smallInput} w-28`}
                              />
                            </td>
                            <td className="px-3 py-1">
                              <input
                                defaultValue={r.description}
                                onBlur={(e) => editRow(i, { description: e.target.value })}
                                className={`${smallInput} w-full`}
                              />
                            </td>
                            <td className="px-3 py-1 text-right">
                              <input
                                defaultValue={
                                  Number.isFinite(r.amountCents)
                                    ? (r.amountCents / 100).toFixed(2)
                                    : ""
                                }
                                onBlur={(e) => editRow(i, { amount: e.target.value })}
                                className={`${smallInput} tnum w-24 text-right`}
                              />
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="tnum px-3 py-1">{r.date}</td>
                            <td className="px-3 py-1">{r.description}</td>
                            <td className="tnum px-3 py-1 text-right">
                              {formatCents(r.amountCents)}
                            </td>
                          </>
                        )}
                        <td className="px-3 py-1">
                          {r.status === "valid" && <span className="text-primary">Ready</span>}
                          {r.status === "duplicate" && <span>Already imported</span>}
                          {r.status === "error" && (
                            <span className="text-destructive">{r.error}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={runImport}
                  disabled={!!busy || counts.valid === 0 || blockedByBalance}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {busy ?? `Import ${counts.valid} rows`}
                </button>
                <button
                  onClick={reset}
                  className="rounded-md border px-4 py-2 text-sm hover:bg-accent"
                >
                  Cancel
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <h2 className="font-display mt-8 text-lg font-semibold">Imported files</h2>
      <div className="mt-3 overflow-hidden rounded-lg border bg-card">
        {(batchQuery.data ?? []).length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No files imported yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2">File</th>
                <th className="px-4 py-2">Account</th>
                <th className="px-4 py-2">Statement period</th>
                <th className="px-4 py-2 text-right">Rows</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {(batchQuery.data ?? []).map((b) => (
                <tr
                  key={b.id}
                  className={`border-b last:border-0 ${b.status === "undone" ? "text-muted-foreground line-through" : ""}`}
                >
                  <td className="px-4 py-2.5">
                    {b.fileName}{" "}
                    <span className="ml-1 rounded bg-muted px-1.5 text-[10px] uppercase">
                      {b.format}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">{b.accountName}</td>
                  <td className="tnum px-4 py-2.5 text-xs">
                    {b.statementStart && b.statementEnd
                      ? `${b.statementStart} → ${b.statementEnd}`
                      : "—"}
                    {b.endingBalanceCents != null && (
                      <span className="ml-2 text-muted-foreground">
                        ends {formatCents(b.endingBalanceCents)}
                      </span>
                    )}
                  </td>
                  <td className="tnum px-4 py-2.5 text-right text-xs">
                    {b.rowsImported} new · {b.rowsDuplicate} dup · {b.rowsError} err
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {b.status === "active" && (
                      <div className="flex justify-end gap-2">
                        {b.statementEnd && (
                          <Link
                            to="/reconcile"
                            search={{ account: b.accountId }}
                            className="rounded border px-2 py-1 text-xs hover:bg-accent"
                          >
                            {terms.reconcile}
                          </Link>
                        )}
                        {b.postedCount === 0 && (
                          <button
                            onClick={() => undoBatch(b.id)}
                            className="flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-accent"
                          >
                            <Undo2 className="h-3 w-3" /> Undo
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
                  <td className="px-4 py-2.5">
                    {r.description}
                    {r.needsReview && (
                      <span className="ml-2 rounded bg-accent px-1.5 text-[10px]">
                        check against PDF
                      </span>
                    )}
                  </td>
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
                        className={smallInput}
                      >
                        <option value="">
                          Choose{" "}
                          {r.amountCents >= 0
                            ? terms.revenue.toLowerCase()
                            : terms.expenses.toLowerCase()}
                          …
                        </option>
                        {offsetAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {!r.linkedTransactionId && (
                      <button
                        onClick={() => postRow(r.id)}
                        disabled={posting.has(r.id)}
                        className="disabled:opacity-50 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
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
