import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgContext } from "@/components/AppShell";
import {
  getBooksStatus,
  setBooksLock,
  previewYearEndClose,
  closeFiscalYear,
} from "@/lib/close.functions";
import { getAccountSetup } from "@/lib/org.functions";
import { formatCents } from "@/lib/money";
import { safeRandomUUID } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/close")({
  head: () => ({
    meta: [
      { title: "Close the Books — Open Ledger" },
      { name: "description", content: "Lock a period and close the fiscal year." },
      { property: "og:title", content: "Close the Books — Open Ledger" },
      { property: "og:description", content: "Lock a period and close the fiscal year." },
    ],
  }),
  component: CloseBooksSettings,
});

function CloseBooksSettings() {
  const { org } = useOrgContext();
  const queryClient = useQueryClient();
  const [lockDate, setLockDate] = useState("");
  const [equityAccountId, setEquityAccountId] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{
    fiscalYearStart: string;
    fiscalYearEnd: string;
    netIncomeCents: number;
  } | null>(null);
  const [fyEnd, setFyEnd] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ["books-status", org?.id],
    enabled: !!org,
    queryFn: () => getBooksStatus({ data: { orgId: org!.id } }),
  });
  const accountsQuery = useQuery({
    queryKey: ["account-setup", org?.id],
    enabled: !!org,
    queryFn: () => getAccountSetup({ data: { orgId: org!.id } }),
  });

  if (!org) return null;
  const isAdmin = org.role === "admin";
  const status = statusQuery.data;
  const accountsRaw: any = accountsQuery.data;
  const accounts = (
    Array.isArray(accountsRaw) ? accountsRaw : (accountsRaw?.accounts ?? [])
  ) as any[];
  const equityAccounts = accounts.filter((a) => a.type === "equity" && a.is_active !== false);
  const lockedThrough = status?.booksLockedThrough ?? null;

  // Default fiscal year end: the most recent fiscal year boundary before today.
  function defaultFiscalYearEnd(): string {
    const startMonth = status?.fiscalYearStartMonth ?? 1;
    const now = new Date();
    const year = now.getUTCFullYear();
    const endMonth = startMonth === 1 ? 12 : startMonth - 1;
    const endYear = startMonth === 1 ? year - 1 : year;
    const lastDay = new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate();
    return `${endYear}-${String(endMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  }
  const fiscalYearEnd = fyEnd ?? defaultFiscalYearEnd();

  async function saveLock(clear = false) {
    if (!org) return;
    setBusy(true);
    try {
      await setBooksLock({ data: { orgId: org.id, lockedThrough: clear ? null : lockDate } });
      queryClient.invalidateQueries({ queryKey: ["books-status", org.id] });
      toast.success(clear ? "Books unlocked" : "Books locked");
    } catch (err: any) {
      toast.error(err.message ?? "Could not update the lock");
    } finally {
      setBusy(false);
    }
  }

  async function runPreview() {
    if (!org) return;
    setBusy(true);
    setPreview(null);
    try {
      const p = await previewYearEndClose({ data: { orgId: org.id, fiscalYearEnd } });
      setPreview(p);
    } catch (err: any) {
      toast.error(err.message ?? "Could not preview the close");
    } finally {
      setBusy(false);
    }
  }

  async function runClose() {
    if (!org || !preview) return;
    setBusy(true);
    try {
      const r = await closeFiscalYear({
        data: {
          orgId: org.id,
          fiscalYearEnd,
          retainedEarningsAccountId: equityAccountId,
          idempotencyKey: safeRandomUUID(),
        },
      });
      if ((r as any).duplicate) toast.info("That fiscal year was already closed.");
      else toast.success("Fiscal year closed and books locked");
      setPreview(null);
      queryClient.invalidateQueries({ queryKey: ["books-status", org.id] });
    } catch (err: any) {
      toast.error(err.message ?? "Could not close the year");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-lg border bg-card p-5">
        <h2 className="font-display text-lg font-semibold">Lock the books</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Locking the books through a date stops anyone from adding or changing transactions on or
          before that date.
          {!isAdmin && " Only admins can change this."}
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-sm font-medium" htmlFor="lock-date">
              Locked through
            </label>
            <input
              id="lock-date"
              type="date"
              className="mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
              value={lockDate || lockedThrough || ""}
              onChange={(e) => setLockDate(e.target.value)}
              disabled={!isAdmin}
            />
          </div>
          {isAdmin && (
            <>
              <button
                onClick={() => saveLock(false)}
                disabled={busy || !lockDate}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                Lock
              </button>
              {lockedThrough && (
                <button
                  onClick={() => saveLock(true)}
                  disabled={busy}
                  className="rounded-md border border-input px-4 py-2 text-sm hover:bg-accent disabled:opacity-50"
                >
                  Unlock
                </button>
              )}
            </>
          )}
        </div>
        {lockedThrough && (
          <p className="mt-3 text-sm text-muted-foreground">
            Currently locked through{" "}
            <span className="font-medium text-foreground">{lockedThrough}</span>.
          </p>
        )}
      </div>

      <div className="rounded-lg border bg-card p-5">
        <h2 className="font-display text-lg font-semibold">Close a fiscal year</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This records one closing transaction that moves the year's{" "}
          {org.orgType === "nonprofit"
            ? "net result into Net Assets"
            : "profit into Retained Earnings"}
          , then locks the books through the year's last day. It can't be undone — the closing entry
          becomes part of the audit trail.
        </p>
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-sm font-medium" htmlFor="fy-end">
                Fiscal year ends
              </label>
              <input
                id="fy-end"
                type="date"
                className="mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
                value={fiscalYearEnd}
                onChange={(e) => {
                  setFyEnd(e.target.value);
                  setPreview(null);
                }}
                disabled={!isAdmin}
              />
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="equity-account">
                {org.orgType === "nonprofit" ? "Net assets account" : "Retained earnings account"}
              </label>
              <select
                id="equity-account"
                className="mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
                value={equityAccountId}
                onChange={(e) => setEquityAccountId(e.target.value)}
                disabled={!isAdmin}
              >
                <option value="">Choose…</option>
                {equityAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            {isAdmin && (
              <button
                onClick={runPreview}
                disabled={busy || !equityAccountId}
                className="rounded-md border border-input px-4 py-2 text-sm hover:bg-accent disabled:opacity-50"
              >
                Preview close
              </button>
            )}
          </div>
          {preview && (
            <div className="rounded-md border bg-accent/40 p-4 text-sm">
              <p>
                Fiscal year {preview.fiscalYearStart} → {preview.fiscalYearEnd}:{" "}
                <span className="font-medium">
                  {formatCents(preview.netIncomeCents)} net{" "}
                  {preview.netIncomeCents >= 0 ? "income" : "loss"}
                </span>{" "}
                will move into the chosen equity account, and the books will lock through{" "}
                {preview.fiscalYearEnd}.
              </p>
              {isAdmin && (
                <button
                  onClick={runClose}
                  disabled={busy}
                  className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {busy ? "Closing…" : "Close this fiscal year"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border bg-card p-5">
        <h2 className="font-display text-lg font-semibold">Closed years</h2>
        {status?.closes?.length ? (
          <ul className="mt-3 divide-y text-sm">
            {status.closes.map((c: any) => (
              <li key={c.id} className="flex items-center justify-between py-2">
                <span>Fiscal year ending {c.fiscal_year_end}</span>
                <span className="text-muted-foreground">
                  {formatCents(c.net_income_cents)} · closed{" "}
                  {new Date(c.created_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            No fiscal years have been closed yet.
          </p>
        )}
      </div>
    </div>
  );
}
