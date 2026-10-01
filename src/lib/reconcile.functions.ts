import { addDays, daysBetween } from "./dates";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Reconciliation compares bank evidence to the ledger. It never edits amounts —
 * it only stamps entries.reconciliation_id. Balances are stored in "statement sign"
 * (what the bank shows: cash on hand for assets, amount owed for liabilities).
 */
const uuid = z.string().uuid();
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const MATCH_WINDOW_DAYS = 5;

type Supa = any;

function dayDiff(a: string, b: string) {
  return Math.abs(daysBetween(a, b));
}
function shiftDate(d: string, days: number) {
  return addDays(d, days);
}

async function audit(supabase: Supa, orgId: string, userId: string, action: string, id: string, before: unknown, after: unknown) {
  await supabase.from("audit_log").insert({ org_id: orgId, user_id: userId, action, entity: "reconciliation", entity_id: id, before, after });
}

async function loadRec(supabase: Supa, id: string) {
  const { data, error } = await supabase
    .from("reconciliations")
    .select("*, accounts(name, type)")
    .eq("id", id)
    .single();
  if (error || !data) throw new Error("Reconciliation not found");
  return data as any;
}

async function loadWorkspace(supabase: Supa, rec: any) {
  const { data: entries, error } = await supabase
    .from("entries")
    .select("id, amount_cents, memo, reconciliation_id, transaction_id, transactions!inner(id, transaction_date, description, status)")
    .eq("account_id", rec.account_id)
    .eq("transactions.status", "posted")
    .lte("transactions.transaction_date", rec.period_end)
    .or(`reconciliation_id.is.null,reconciliation_id.eq.${rec.id}`);
  if (error) throw new Error(error.message);

  const { data: bank, error: bErr } = await supabase
    .from("bank_transactions")
    .select("id, bank_date, description, amount_cents, transaction_id")
    .eq("account_id", rec.account_id)
    .gte("bank_date", rec.period_start)
    .lte("bank_date", rec.period_end)
    .order("bank_date");
  if (bErr) throw new Error(bErr.message);

  const ents = ((entries ?? []) as any[])
    .map((e) => ({
      id: e.id as string,
      transactionId: e.transaction_id as string,
      date: e.transactions.transaction_date as string,
      description: (e.memo || e.transactions.description) as string,
      amountCents: e.amount_cents as number,
      cleared: e.reconciliation_id === rec.id,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Match bank evidence → ledger entries. Linked rows first, then amount + date window.
  const used = new Set<string>();
  const matches: { bankId: string; entryId: string }[] = [];
  const bankRows = ((bank ?? []) as any[]).map((b) => ({
    id: b.id as string,
    date: b.bank_date as string,
    description: b.description as string,
    amountCents: b.amount_cents as number,
    linkedTransactionId: b.transaction_id as string | null,
  }));
  for (const b of bankRows) {
    if (!b.linkedTransactionId) continue;
    const e = ents.find((x) => !used.has(x.id) && x.transactionId === b.linkedTransactionId && x.amountCents === b.amountCents);
    if (e) { used.add(e.id); matches.push({ bankId: b.id, entryId: e.id }); }
  }
  const matchedBank = new Set(matches.map((m) => m.bankId));
  for (const b of bankRows) {
    if (matchedBank.has(b.id)) continue;
    const candidates = ents
      .filter((x) => !used.has(x.id) && x.amountCents === b.amountCents && dayDiff(x.date, b.date) <= MATCH_WINDOW_DAYS)
      .sort((x, y) => dayDiff(x.date, b.date) - dayDiff(y.date, b.date));
    const e = candidates[0];
    if (e) { used.add(e.id); matchedBank.add(b.id); matches.push({ bankId: b.id, entryId: e.id }); }
  }
  return { entries: ents, bankRows, matches };
}

function signFor(type: string) {
  return type === "asset" || type === "expense" ? 1 : -1;
}

function summarize(rec: any, entries: { amountCents: number; cleared: boolean }[]) {
  const sign = signFor(rec.accounts?.type ?? "asset");
  const clearedCents = sign * entries.filter((e) => e.cleared).reduce((s, e) => s + e.amountCents, 0);
  const clearedBalance = Number(rec.beginning_balance_cents) + clearedCents;
  return { clearedCents, clearedBalance, difference: Number(rec.ending_balance_cents) - clearedBalance };
}

function recDto(r: any) {
  return {
    id: r.id as string,
    accountId: r.account_id as string,
    accountName: (r.accounts?.name ?? "") as string,
    accountType: (r.accounts?.type ?? "asset") as string,
    periodStart: r.period_start as string,
    periodEnd: r.period_end as string,
    beginningBalanceCents: Number(r.beginning_balance_cents),
    endingBalanceCents: Number(r.ending_balance_cents),
    mode: r.mode as "simple" | "full",
    status: r.status as "in_progress" | "completed",
    completedAt: r.completed_at as string | null,
    createdAt: r.created_at as string,
  };
}

export const listReconciliations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ orgId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("reconciliations")
      .select("*, accounts(name, type), entries(id)")
      .eq("org_id", data.orgId)
      .order("period_end", { ascending: false });
    if (error) throw new Error(error.message);
    return ((rows ?? []) as any[]).map((r) => ({ ...recDto(r), itemCount: (r.entries ?? []).length }));
  });

/** Suggest defaults for a new reconciliation on an account. */
export const suggestReconciliation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ orgId: uuid, accountId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: account, error: accountError } = await context.supabase
      .from("accounts")
      .select("id, is_active")
      .eq("id", data.accountId)
      .eq("org_id", data.orgId)
      .maybeSingle();
    if (accountError || !account?.is_active) throw new Error("Choose an active account in this organization.");
    const { data: last } = await context.supabase
      .from("reconciliations")
      .select("period_end, ending_balance_cents")
      .eq("account_id", data.accountId)
      .eq("status", "completed")
      .order("period_end", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: batch } = await context.supabase
      .from("import_batches")
      .select("id, statement_start, statement_end, beginning_balance_cents, ending_balance_cents")
      .eq("account_id", data.accountId)
      .eq("status", "active")
      .not("statement_end", "is", null)
      .order("statement_end", { ascending: false })
      .limit(1)
      .maybeSingle();
    return {
      periodStart: last ? shiftDate(last.period_end, 1) : (batch?.statement_start ?? null),
      periodEnd: batch && (!last || batch.statement_end > last.period_end) ? batch.statement_end : null,
      beginningBalanceCents: last ? Number(last.ending_balance_cents) : (batch?.beginning_balance_cents ?? 0),
      endingBalanceCents: batch && (!last || batch.statement_end > last.period_end) ? batch.ending_balance_cents : null,
      batchId: batch?.id ?? null,
      hasPrevious: !!last,
    };
  });

export const startReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        orgId: uuid,
        accountId: uuid,
        periodStart: dateStr,
        periodEnd: dateStr,
        beginningBalanceCents: z.number().int(),
        endingBalanceCents: z.number().int(),
        mode: z.enum(["simple", "full"]),
        batchId: uuid.nullish(),
      })
      .refine((v) => v.periodEnd >= v.periodStart, "End date must be on or after start date")
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: account, error: accountError } = await context.supabase
      .from("accounts")
      .select("id, is_active")
      .eq("id", data.accountId)
      .eq("org_id", data.orgId)
      .maybeSingle();
    if (accountError || !account?.is_active) throw new Error("Choose an active account in this organization.");
    const { supabase, userId } = context;
    const { data: open } = await supabase
      .from("reconciliations")
      .select("id")
      .eq("account_id", data.accountId)
      .eq("status", "in_progress")
      .limit(1);
    if ((open ?? []).length) throw new Error("This account already has a reconciliation in progress. Finish or discard it first.");
    const id = crypto.randomUUID();
    const row = {
      id,
      org_id: data.orgId,
      account_id: data.accountId,
      period_start: data.periodStart,
      period_end: data.periodEnd,
      beginning_balance_cents: data.beginningBalanceCents,
      ending_balance_cents: data.endingBalanceCents,
      mode: data.mode,
      batch_id: data.batchId ?? null,
      created_by: userId,
    };
    const { error } = await supabase.from("reconciliations").insert(row);
    if (error) throw new Error(error.message);
    await audit(supabase, data.orgId, userId, "reconcile_start", id, null, row);
    return { id };
  });

export const getReconciliation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const rec = await loadRec(context.supabase, data.id);
    let ws: Awaited<ReturnType<typeof loadWorkspace>>;
    if (rec.status === "completed") {
      const { data: entries } = await context.supabase
        .from("entries")
        .select("id, amount_cents, memo, transaction_id, transactions(transaction_date, description)")
        .eq("reconciliation_id", rec.id);
      ws = {
        entries: ((entries ?? []) as any[])
          .map((e) => ({
            id: e.id, transactionId: e.transaction_id, date: e.transactions?.transaction_date ?? "",
            description: e.memo || e.transactions?.description || "", amountCents: e.amount_cents, cleared: true,
          }))
          .sort((a, b) => a.date.localeCompare(b.date)),
        bankRows: [],
        matches: [],
      };
    } else ws = await loadWorkspace(context.supabase, rec);
    const { data: history } = await context.supabase
      .from("audit_log")
      .select("action, created_at, user_id, after")
      .eq("entity", "reconciliation")
      .eq("entity_id", rec.id)
      .order("created_at", { ascending: false })
      .limit(50);
    return {
      reconciliation: recDto(rec),
      ...ws,
      summary: summarize(rec, ws.entries),
      history: ((history ?? []) as any[]).map((h) => ({ action: h.action as string, at: h.created_at as string, after: h.after as any })),
    };
  });

export const setCleared = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: uuid, entryIds: z.array(uuid).min(1).max(1000), cleared: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const rec = await loadRec(supabase, data.id);
    if (rec.status !== "in_progress") throw new Error("This reconciliation is completed. Reopen it to make changes.");
    let q = supabase
      .from("entries")
      .update({ reconciliation_id: data.cleared ? rec.id : null })
      .in("id", data.entryIds)
      .eq("account_id", rec.account_id);
    q = data.cleared ? q.is("reconciliation_id", null) : q.eq("reconciliation_id", rec.id);
    const { error } = await q;
    if (error) throw new Error(error.message);
    await audit(supabase, rec.org_id, userId, data.cleared ? "reconcile_clear" : "reconcile_unclear", rec.id, null, { entryIds: data.entryIds });
    return { ok: true };
  });

/** Simple mode: clear every entry that matches a bank row in the period. */
export const acceptMatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const rec = await loadRec(supabase, data.id);
    if (rec.status !== "in_progress") throw new Error("This reconciliation is completed.");
    const ws = await loadWorkspace(supabase, rec);
    const ids = ws.matches.map((m) => m.entryId).filter((id) => !ws.entries.find((e) => e.id === id)?.cleared);
    if (ids.length) {
      const { error } = await supabase.from("entries").update({ reconciliation_id: rec.id }).in("id", ids).is("reconciliation_id", null);
      if (error) throw new Error(error.message);
      await audit(supabase, rec.org_id, userId, "reconcile_accept_matches", rec.id, null, { entryIds: ids });
    }
    return { cleared: ids.length };
  });

export const completeReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const rec = await loadRec(supabase, data.id);
    if (rec.status !== "in_progress") throw new Error("Already completed");
    const ws = await loadWorkspace(supabase, rec);
    const s = summarize(rec, ws.entries);
    if (s.difference !== 0) throw new Error("The difference must be zero before you can finish.");
    const { error } = await supabase
      .from("reconciliations")
      .update({ status: "completed", completed_by: userId, completed_at: new Date().toISOString() })
      .eq("id", rec.id);
    if (error) throw new Error(error.message);
    await audit(supabase, rec.org_id, userId, "reconcile_complete", rec.id, { status: "in_progress" }, {
      status: "completed", items: ws.entries.filter((e) => e.cleared).length, clearedBalance: s.clearedBalance,
    });
    return { ok: true };
  });

/** Admin-only. Only the most recent completed reconciliation for an account can be reopened. */
export const reopenReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const rec = await loadRec(supabase, data.id);
    const { data: role } = await supabase
      .from("user_roles").select("role").eq("org_id", rec.org_id).eq("user_id", userId).maybeSingle();
    if (role?.role !== "admin") throw new Error("Only admins can reopen a reconciliation.");
    if (rec.status !== "completed") throw new Error("Not completed");
    const { data: later } = await supabase
      .from("reconciliations").select("id").eq("account_id", rec.account_id).gt("period_end", rec.period_end).limit(1);
    if ((later ?? []).length) throw new Error("Only the most recent reconciliation for this account can be reopened.");
    const { data: open } = await supabase
      .from("reconciliations").select("id").eq("account_id", rec.account_id).eq("status", "in_progress").limit(1);
    if ((open ?? []).length) throw new Error("Discard the in-progress reconciliation for this account first.");
    const { error } = await supabase
      .from("reconciliations").update({ status: "in_progress", completed_at: null, completed_by: null }).eq("id", rec.id);
    if (error) throw new Error(error.message);
    await audit(supabase, rec.org_id, userId, "reconcile_reopen", rec.id, { status: "completed" }, { status: "in_progress" });
    return { ok: true };
  });

export const discardReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const rec = await loadRec(supabase, data.id);
    if (rec.status !== "in_progress") throw new Error("Completed reconciliations can't be discarded — reopen instead.");
    await supabase.from("entries").update({ reconciliation_id: null }).eq("reconciliation_id", rec.id);
    const { error } = await supabase.from("reconciliations").delete().eq("id", rec.id);
    if (error) throw new Error(error.message);
    await audit(supabase, rec.org_id, userId, "reconcile_discard", rec.id, recDto(rec), null);
    return { ok: true };
  });
