import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  computeBalance, computeIncome, computeProjectSpend, computeTrialBalance, inRange,
  type LedgerRow,
} from "./report-math";
import { fiscalYearStart, todayISO } from "./dates";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// Only posted transactions — voided ones are excluded from every report.
async function fetchLedger(supabase: any, orgId: string, to?: string): Promise<LedgerRow[]> {
  let query = supabase
    .from("entries")
    .select("amount_cents, project_id, accounts(name, type), transactions!inner(org_id, status, transaction_date)")
    .eq("transactions.org_id", orgId)
    .eq("transactions.status", "posted");
  if (to) query = query.lte("transactions.transaction_date", to);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((e) => ({
    amountCents: e.amount_cents,
    accountName: e.accounts?.name ?? "",
    accountType: e.accounts?.type,
    projectId: e.project_id,
    transactionDate: e.transactions.transaction_date,
  }));
}

async function fiscalStartMonth(supabase: any, orgId: string): Promise<number> {
  const { data } = await supabase.from("organizations").select("fiscal_year_start_month").eq("id", orgId).single();
  return data?.fiscal_year_start_month ?? 1;
}

export const incomeStatement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ orgId: z.string().uuid(), from: isoDate.optional(), to: isoDate.optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const rows = await fetchLedger(context.supabase, data.orgId, data.to);
    return computeIncome(inRange(rows, data.from, data.to));
  });

export const balanceSheet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ orgId: z.string().uuid(), asOf: isoDate.optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const asOf = data.asOf ?? todayISO();
    const [rows, month] = await Promise.all([
      fetchLedger(context.supabase, data.orgId, asOf),
      fiscalStartMonth(context.supabase, data.orgId),
    ]);
    return { asOf, ...computeBalance(rows, asOf, fiscalYearStart(asOf, month)) };
  });

export const trialBalance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ orgId: z.string().uuid(), asOf: isoDate.optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const asOf = data.asOf ?? todayISO();
    const rows = await fetchLedger(context.supabase, data.orgId, asOf);
    return { asOf, ...computeTrialBalance(rows, asOf) };
  });

export const projectSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ orgId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: projects, error } = await context.supabase
      .from("projects")
      .select("id, name, budget_cents, status")
      .eq("org_id", data.orgId)
      .order("name");
    if (error) throw new Error(error.message);
    const spent = computeProjectSpend(await fetchLedger(context.supabase, data.orgId));
    return ((projects ?? []) as any[]).map((p) => ({
      id: p.id as string,
      name: p.name as string,
      status: p.status as string,
      budgetCents: p.budget_cents as number,
      spentCents: spent.get(p.id) ?? 0,
    }));
  });
