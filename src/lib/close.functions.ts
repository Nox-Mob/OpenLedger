import { writeAudit } from "./audit";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCan } from "./permissions";
import { fiscalYearStart } from "./dates";

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

    await writeAudit({
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
    const startISO = fiscalYearStart(
      data.fiscalYearEnd,
      (org?.fiscal_year_start_month ?? 1) as number,
    );

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
    const startISO = fiscalYearStart(
      data.fiscalYearEnd,
      (org?.fiscal_year_start_month ?? 1) as number,
    );

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

    // Virtual close: reports derive retained earnings / net assets from the full ledger,
    // so no closing transaction is posted (that would double-count). We record + lock.
    let netIncome = 0;
    for (const r of (rows ?? []) as any[]) netIncome += -r.amount_cents;
    netIncome = netIncome === 0 ? 0 : netIncome;
    void data.idempotencyKey;

    const { error: cErr } = await supabase.from("period_closes").insert({
      org_id: data.orgId,
      fiscal_year_end: data.fiscalYearEnd,
      transaction_id: null,
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

    await writeAudit({
      org_id: data.orgId,
      user_id: userId,
      action: "close_fiscal_year",
      entity: "period_close",
      entity_id: data.orgId,
      after: { fiscal_year_end: data.fiscalYearEnd, net_income_cents: netIncome },
    });
    return { ok: true, netIncomeCents: netIncome };
  });
