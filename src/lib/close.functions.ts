import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCan } from "./permissions";

// ---------- Books lock + year-end close (admin only) ----------

export const getBooksStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ orgId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const role = await assertCan(supabase, userId, data.orgId, "read");
    const { data: org, error } = await supabase
      .from("organizations")
      .select("books_locked_through, fiscal_year_start_month")
      .eq("id", data.orgId)
      .single();
    if (error) throw new Error(error.message);
    const { data: closes, error: cErr } = await supabase
      .from("period_closes")
      .select("id, fiscal_year_end, net_income_cents, created_at")
      .eq("org_id", data.orgId)
      .order("fiscal_year_end", { ascending: false });
    if (cErr) throw new Error(cErr.message);
    return {
      role,
      booksLockedThrough: (org?.books_locked_through ?? null) as string | null,
      fiscalYearStartMonth: (org?.fiscal_year_start_month ?? 1) as number,
      closes: (closes ?? []) as any[],
    };
  });

export const setBooksLock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        orgId: z.string().uuid(),
        // null clears the lock (unlock)
        lockedThrough: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCan(supabase, userId, data.orgId, "close_books");

    const { data: before } = await supabase
      .from("organizations")
      .select("books_locked_through")
      .eq("id", data.orgId)
      .single();

    const { error } = await supabase
      .from("organizations")
      .update({ books_locked_through: data.lockedThrough })
      .eq("id", data.orgId);
    if (error) throw new Error(error.message);

    await supabase.from("audit_log").insert({
      org_id: data.orgId,
      user_id: userId,
      action: data.lockedThrough ? "lock_books" : "unlock_books",
      entity: "organization",
      entity_id: data.orgId,
      before: { books_locked_through: before?.books_locked_through ?? null },
      after: { books_locked_through: data.lockedThrough },
    });
    return { ok: true };
  });

/** Preview what a year-end close would do: net income for the fiscal year. */
export const previewYearEndClose = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ orgId: z.string().uuid(), fiscalYearEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCan(supabase, userId, data.orgId, "close_books");

    const { data: existing } = await supabase
      .from("period_closes")
      .select("id")
      .eq("org_id", data.orgId)
      .eq("fiscal_year_end", data.fiscalYearEnd)
      .maybeSingle();
    if (existing) throw new Error("That fiscal year is already closed.");

    // Sum revenue/expense entries for the fiscal year (posted only).
    const { data: org } = await supabase
      .from("organizations")
      .select("fiscal_year_start_month")
      .eq("id", data.orgId)
      .single();
    const startMonth = (org?.fiscal_year_start_month ?? 1) as number;
    const end = new Date(`${data.fiscalYearEnd}T00:00:00Z`);
    const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
    start.setUTCMonth(start.getUTCMonth() - 12);
    start.setUTCDate(start.getUTCDate() + 1);
    const startISO = start.toISOString().slice(0, 10);

    const { data: rows, error } = await supabase
      .from("entries")
      .select(
        "amount_cents, accounts!inner(type, org_id), transactions!inner(status, transaction_date, org_id)",
      )
      .eq("transactions.org_id", data.orgId)
      .eq("transactions.status", "posted")
      .gte("transactions.transaction_date", startISO)
      .lte("transactions.transaction_date", data.fiscalYearEnd)
      .in("accounts.type", ["revenue", "expense"]);
    if (error) throw new Error(error.message);

    let net = 0;
    for (const r of (rows ?? []) as any[]) {
      // revenue is credit-normal (negative = income), expense debit-normal
      net += r.accounts.type === "revenue" ? -r.amount_cents : r.amount_cents;
    }
    return {
      fiscalYearStart: startISO,
      fiscalYearEnd: data.fiscalYearEnd,
      netIncomeCents: net === 0 ? 0 : -net, // income positive; avoids returning -0
      startMonth,
    };
  });

/** Record the year-end close: one closing transaction + lock the books. */
export const closeFiscalYear = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        orgId: z.string().uuid(),
        fiscalYearEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        retainedEarningsAccountId: z.string().uuid(),
        idempotencyKey: z.string().min(8).max(120),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCan(supabase, userId, data.orgId, "close_books");

    const { data: existing } = await supabase
      .from("period_closes")
      .select("id")
      .eq("org_id", data.orgId)
      .eq("fiscal_year_end", data.fiscalYearEnd)
      .maybeSingle();
    if (existing) return { ok: true, duplicate: true };

    // Validate the equity account.
    const { data: equity } = await supabase
      .from("accounts")
      .select("id, type, is_active")
      .eq("id", data.retainedEarningsAccountId)
      .eq("org_id", data.orgId)
      .single();
    if (!equity || equity.type !== "equity" || !equity.is_active) {
      throw new Error("Choose an active equity account (retained earnings / net assets).");
    }

    // Net income for the year (same math as preview).
    const { data: org } = await supabase
      .from("organizations")
      .select("fiscal_year_start_month")
      .eq("id", data.orgId)
      .single();
    const end = new Date(`${data.fiscalYearEnd}T00:00:00Z`);
    const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
    start.setUTCMonth(start.getUTCMonth() - 12);
    start.setUTCDate(start.getUTCDate() + 1);
    const startISO = start.toISOString().slice(0, 10);

    const { data: rows, error } = await supabase
      .from("entries")
      .select(
        "account_id, amount_cents, accounts!inner(type), transactions!inner(status, transaction_date, org_id)",
      )
      .eq("transactions.org_id", data.orgId)
      .eq("transactions.status", "posted")
      .gte("transactions.transaction_date", startISO)
      .lte("transactions.transaction_date", data.fiscalYearEnd)
      .in("accounts.type", ["revenue", "expense"]);
    if (error) throw new Error(error.message);

    // One closing entry per income-statement account, zeroing it out into equity.
    const byAccount = new Map<string, number>();
    for (const r of (rows ?? []) as any[]) {
      byAccount.set(r.account_id, (byAccount.get(r.account_id) ?? 0) + r.amount_cents);
    }
    let netIncome = 0;
    const closingEntries: { account_id: string; amount_cents: number }[] = [];
    for (const [accountId, balance] of byAccount) {
      if (balance === 0) continue;
      closingEntries.push({ account_id: accountId, amount_cents: -balance });
      netIncome += -balance; // equity side
    }
    if (closingEntries.length === 0) {
      throw new Error("No income or expense activity in that fiscal year — nothing to close.");
    }
    closingEntries.push({ account_id: data.retainedEarningsAccountId, amount_cents: -netIncome });

    // Lock first so the closing transaction (dated on the last day) is the last one in.
    const { data: tx, error: txError } = await supabase
      .from("transactions")
      .insert({
        org_id: data.orgId,
        transaction_date: data.fiscalYearEnd,
        description: `Year-end close for fiscal year ending ${data.fiscalYearEnd}`,
        source: "closing",
        created_by: userId,
        idempotency_key: data.idempotencyKey,
      })
      .select("id")
      .single();
    if (txError) {
      if (txError.code === "23505") return { ok: true, duplicate: true };
      throw new Error(txError.message);
    }
    const { error: eErr } = await supabase
      .from("entries")
      .insert(closingEntries.map((e) => ({ ...e, transaction_id: tx.id })));
    if (eErr) {
      await supabase.from("transactions").delete().eq("id", tx.id);
      throw new Error(eErr.message);
    }

    const { error: cErr } = await supabase.from("period_closes").insert({
      org_id: data.orgId,
      fiscal_year_end: data.fiscalYearEnd,
      transaction_id: tx.id,
      net_income_cents: netIncome,
      closed_by: userId,
    });
    if (cErr) {
      if (cErr.code === "23505") return { ok: true, duplicate: true };
      throw new Error(cErr.message);
    }

    await supabase
      .from("organizations")
      .update({ books_locked_through: data.fiscalYearEnd })
      .eq("id", data.orgId);

    await supabase.from("audit_log").insert({
      org_id: data.orgId,
      user_id: userId,
      action: "close_fiscal_year",
      entity: "period_close",
      entity_id: tx.id,
      after: { fiscal_year_end: data.fiscalYearEnd, net_income_cents: netIncome },
    });
    return { ok: true, netIncomeCents: netIncome };
  });
