import { desktopAware } from "@/lib/desktop/bridge";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCan } from "./permissions";
import { createSupabaseRepositories } from "./adapters/supabase";
import { newId } from "./domain/ledger";
import { actualFromLedger, assertBudgetAmount, periodRange } from "./domain/budgets";
import { auditedWrite } from "./audited-write";

// Budgets are cloud and self-hosted only for now (no port yet), like pledges.
const isoDate = z.string().regex(/^\d{4}-\d{2}-01$/);
const period = z.enum(["year", "month"]);

export const budgetVsActual = desktopAware(
  "budgetVsActual",
  createServerFn({ method: "GET" })
    .middleware([requireSupabaseAuth])
    .validator((input) =>
      z.object({ orgId: z.string().uuid(), periodType: period, periodStart: isoDate }).parse(input),
    )
    .handler(async ({ data, context }) => {
      await assertCan(context.supabase, context.userId, data.orgId, "read");
      const { from, to } = periodRange(data.periodType, data.periodStart);
      const [{ data: accounts, error: aErr }, { data: budgets, error: bErr }, rows] =
        await Promise.all([
          context.supabase
            .from("accounts")
            .select("id, name, type, is_active")
            .eq("org_id", data.orgId)
            .in("type", ["revenue", "expense"])
            .order("type", { ascending: false })
            .order("name"),
          context.supabase
            .from("budgets")
            .select("account_id, amount_cents")
            .eq("org_id", data.orgId)
            .eq("period_type", data.periodType)
            .eq("period_start", data.periodStart),
          createSupabaseRepositories(context.supabase).transactions.ledgerRows(data.orgId, { to }),
        ]);
      if (aErr) throw new Error(aErr.message);
      if (bErr) throw new Error(bErr.message);
      const sums = new Map<string, number>();
      for (const r of rows)
        if (r.transactionDate >= from && r.transactionDate <= to)
          sums.set(r.accountId, (sums.get(r.accountId) ?? 0) + r.amountCents);
      const budgetBy = new Map((budgets ?? []).map((b) => [b.account_id, Number(b.amount_cents)]));
      const lines = (accounts ?? [])
        .map((a) => ({
          accountId: a.id,
          name: a.name,
          type: a.type as "revenue" | "expense",
          budgetCents: budgetBy.get(a.id) ?? null,
          actualCents: actualFromLedger(a.type, sums.get(a.id) ?? 0),
          isActive: a.is_active,
        }))
        .filter((l) => l.isActive || l.budgetCents !== null || l.actualCents !== 0);
      return { from, to, lines };
    }),
);

export const saveBudget = desktopAware(
  "saveBudget",
  createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .validator((input) =>
      z
        .object({
          orgId: z.string().uuid(),
          accountId: z.string().uuid(),
          periodType: period,
          periodStart: isoDate,
          amountCents: z.number().int().nullable(), // null clears the budget
        })
        .parse(input),
    )
    .handler(async ({ data, context }) => {
      await assertCan(context.supabase, context.userId, data.orgId, "write");
      const match = {
        org_id: data.orgId,
        account_id: data.accountId,
        period_type: data.periodType,
        period_start: data.periodStart,
      };
      const audit = {
        action: data.amountCents === null ? "budget.cleared" : "budget.set",
        entity: "budget",
        entityId: data.accountId,
        after: { ...match, amount_cents: data.amountCents },
      };
      if (data.amountCents === null) {
        await auditedWrite(
          context.supabase,
          data.orgId,
          [{ table: "budgets", op: "delete", match }],
          audit,
        );
      } else {
        assertBudgetAmount(data.amountCents);
        // Keep the record's app-generated ID stable: update if it exists, else insert.
        const { data: existing } = await context.supabase
          .from("budgets")
          .select("id")
          .match(match)
          .maybeSingle();
        await auditedWrite(
          context.supabase,
          data.orgId,
          [
            existing
              ? {
                  table: "budgets",
                  op: "update",
                  values: { amount_cents: data.amountCents },
                  match: { id: existing.id },
                }
              : {
                  table: "budgets",
                  op: "insert",
                  values: { id: newId(), ...match, amount_cents: data.amountCents },
                },
          ],
          audit,
        );
      }
      return { ok: true };
    }),
);
