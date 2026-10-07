import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCan } from "./permissions";
import { writeAudit } from "./audit";

const orgId = z.string().uuid();
const PAGE = 1000;

async function all(build: (from: number, to: number) => PromiseLike<{ data: any; error: any }>) {
  const out: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

const ORG_TABLES = [
  "accounts",
  "categories",
  "tags",
  "projects",
  "funds",
  "transactions",
  "import_batches",
  "import_profiles",
  "bank_transactions",
  "reconciliations",
  "period_closes",
  "pledges",
  "pledge_payments",
  "budgets",
  "user_roles",
  "audit_log",
] as const;

/** Full JSON backup of one organization (admins only). Read through the caller's RLS client. */
export const exportBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ orgId }).parse(input))
  .handler(async ({ data, context }) => {
    await assertCan(context.supabase, context.userId, data.orgId, "manage_settings");
    const db = context.supabase as any;
    const { data: org, error } = await db
      .from("organizations")
      .select("*")
      .eq("id", data.orgId)
      .single();
    if (error) throw new Error(error.message);
    const tables: Record<string, unknown[]> = {};
    for (const t of ORG_TABLES)
      tables[t] = await all((f, to) =>
        db.from(t).select("*").eq("org_id", data.orgId).order("id").range(f, to),
      );
    tables["entries"] = (
      await all((f, to) =>
        db
          .from("entries")
          .select("*, transactions!inner(org_id)")
          .eq("transactions.org_id", data.orgId)
          .order("id")
          .range(f, to),
      )
    ).map(({ transactions: _t, ...e }: any) => e);
    tables["transaction_tags"] = (
      await all((f, to) =>
        db
          .from("transaction_tags")
          .select("*, transactions!inner(org_id)")
          .eq("transactions.org_id", data.orgId)
          .order("transaction_id")
          .range(f, to),
      )
    ).map(({ transactions: _t, ...e }: any) => e);
    const counts = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length]));
    await writeAudit({
      org_id: data.orgId,
      user_id: context.userId,
      action: "backup.exported",
      entity: "organization",
      entity_id: data.orgId,
      after: counts,
    });
    return {
      format: "openledgerapp-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      organization: org,
      tables,
    };
  });

/** Every posted and voided transaction line, for spreadsheet export. */
export const exportTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ orgId }).parse(input))
  .handler(async ({ data, context }) => {
    await assertCan(context.supabase, context.userId, data.orgId, "read");
    const db = context.supabase as any;
    const rows = await all((f, to) =>
      db
        .from("entries")
        .select(
          "id, amount_cents, memo, accounts(name, type), categories(name), projects(name), funds(name), transactions!inner(org_id, transaction_date, description, source, status)",
        )
        .eq("transactions.org_id", data.orgId)
        .order("id")
        .range(f, to),
    );
    return (rows as any[])
      .map((r) => ({
        date: r.transactions.transaction_date as string,
        description: r.transactions.description as string,
        status: r.transactions.status as string,
        source: r.transactions.source as string,
        account: r.accounts?.name ?? "",
        accountType: r.accounts?.type ?? "",
        debitCents: r.amount_cents > 0 ? Number(r.amount_cents) : 0,
        creditCents: r.amount_cents < 0 ? -Number(r.amount_cents) : 0,
        category: r.categories?.name ?? "",
        project: r.projects?.name ?? "",
        fund: r.funds?.name ?? "",
        memo: r.memo ?? "",
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  });

/** Organization history (audit log), newest first. Admins only. */
export const listHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        orgId,
        page: z.number().int().min(0).max(10000),
        entity: z.string().max(40).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCan(context.supabase, context.userId, data.orgId, "manage_settings");
    const size = 50;
    let q = context.supabase
      .from("audit_log")
      .select("id, user_id, action, entity, entity_id, before, after, created_at", {
        count: "exact",
      })
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: false })
      .range(data.page * size, data.page * size + size - 1);
    if (data.entity) q = q.eq("entity", data.entity);
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    const ids = [...new Set((rows ?? []).map((r) => r.user_id).filter(Boolean))] as string[];
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: profiles } = await context.supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", ids);
      for (const p of profiles ?? []) if (p.display_name) names.set(p.id, p.display_name);
    }
    return {
      total: count ?? 0,
      pageSize: size,
      rows: (rows ?? []).map((r) => ({
        ...r,
        who: r.user_id ? (names.get(r.user_id) ?? `User ${r.user_id.slice(0, 8)}`) : "System",
      })),
    };
  });
