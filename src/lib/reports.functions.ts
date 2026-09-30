import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function fetchPostedEntries(supabase: any, orgId: string, from?: string, to?: string) {
  let query = supabase
    .from("entries")
    .select(
      "amount_cents, account_id, project_id, fund_id, accounts(name, type), transactions!inner(org_id, status, transaction_date)",
    )
    .eq("transactions.org_id", orgId)
    .eq("transactions.status", "posted");
  if (from) query = query.gte("transactions.transaction_date", from);
  if (to) query = query.lte("transactions.transaction_date", to);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as any[];
}

const rangeSchema = z.object({
  orgId: z.string().uuid(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const incomeStatement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => rangeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const entries = await fetchPostedEntries(context.supabase, data.orgId, data.from, data.to);

    const group = (type: string) => {
      const map = new Map<string, number>();
      for (const e of entries) {
        if (e.accounts?.type !== type) continue;
        const name = e.accounts.name as string;
        map.set(name, (map.get(name) ?? 0) + e.amount_cents);
      }
      return [...map.entries()]
        .map(([name, sum]) => ({ name, totalCents: Math.abs(sum) }))
        .sort((a, b) => b.totalCents - a.totalCents);
    };

    const revenue = group("revenue");
    const expenses = group("expense");
    const totalRevenue = revenue.reduce((a, r) => a + r.totalCents, 0);
    const totalExpenses = expenses.reduce((a, r) => a + r.totalCents, 0);
    return { revenue, expenses, totalRevenueCents: totalRevenue, totalExpensesCents: totalExpenses, netCents: totalRevenue - totalExpenses };
  });

export const balanceSheet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ orgId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const entries = await fetchPostedEntries(context.supabase, data.orgId);

    const group = (type: string, creditNormal: boolean) => {
      const map = new Map<string, number>();
      for (const e of entries) {
        if (e.accounts?.type !== type) continue;
        const name = e.accounts.name as string;
        map.set(name, (map.get(name) ?? 0) + e.amount_cents);
      }
      return [...map.entries()]
        .map(([name, sum]) => ({ name, totalCents: creditNormal ? -sum : sum }))
        .sort((a, b) => b.totalCents - a.totalCents);
    };

    const assets = group("asset", false);
    const liabilities = group("liability", true);
    const equity = group("equity", true);

    // Retained net income flows into equity
    let netIncome = 0;
    for (const e of entries) {
      if (e.accounts?.type === "revenue") netIncome += -e.amount_cents;
      if (e.accounts?.type === "expense") netIncome -= e.amount_cents;
    }

    const totalAssets = assets.reduce((a, r) => a + r.totalCents, 0);
    const totalLiabilities = liabilities.reduce((a, r) => a + r.totalCents, 0);
    const totalEquity = equity.reduce((a, r) => a + r.totalCents, 0) + netIncome;

    return {
      assets,
      liabilities,
      equity,
      netIncomeCents: netIncome,
      totalAssetsCents: totalAssets,
      totalLiabilitiesCents: totalLiabilities,
      totalEquityCents: totalEquity,
    };
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

    const entries = await fetchPostedEntries(context.supabase, data.orgId);
    const spent = new Map<string, number>();
    for (const e of entries) {
      if (!e.project_id || e.accounts?.type !== "expense") continue;
      spent.set(e.project_id, (spent.get(e.project_id) ?? 0) + e.amount_cents);
    }

    return ((projects ?? []) as any[]).map((p) => ({
      id: p.id as string,
      name: p.name as string,
      status: p.status as string,
      budgetCents: p.budget_cents as number,
      spentCents: spent.get(p.id) ?? 0,
    }));
  });
