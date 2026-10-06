import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCan } from "./permissions";

const orgInput = z.object({ orgId: z.string().uuid(), includeArchived: z.boolean().optional() });

export const listAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => orgInput.parse(input))
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("accounts")
      .select("id, name, type, subtype, is_active")
      .eq("org_id", data.orgId)
      .order("type")
      .order("name");
    if (!data.includeArchived) query = query.eq("is_active", true);
    const { data: accounts, error } = await query;
    if (error) throw new Error(error.message);

    const { data: entries, error: eError } = await context.supabase
      .from("entries")
      .select("account_id, amount_cents, transactions!inner(org_id, status)")
      .eq("transactions.org_id", data.orgId)
      .eq("transactions.status", "posted");
    if (eError) throw new Error(eError.message);

    const balances = new Map<string, number>();
    for (const e of (entries ?? []) as any[]) {
      balances.set(e.account_id, (balances.get(e.account_id) ?? 0) + e.amount_cents);
    }

    return ((accounts ?? []) as any[]).map((a) => ({
      id: a.id as string,
      name: a.name as string,
      type: a.type as string,
      subtype: a.subtype as string | null,
      isActive: a.is_active as boolean,
      balanceCents: balances.get(a.id) ?? 0,
    }));
  });

export const createAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        orgId: z.string().uuid(),
        name: z.string().min(1).max(120),
        type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
        subtype: z.string().max(60).nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCan(context.supabase, context.userId, data.orgId, "manage_settings");
    const { error } = await context.supabase.from("accounts").insert({
      org_id: data.orgId,
      name: data.name,
      type: data.type,
      subtype: data.subtype ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setOpeningBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        orgId: z.string().uuid(),
        accountId: z.string().uuid(),
        equityAccountId: z.string().uuid(),
        amountCents: z.number().int(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCan(context.supabase, context.userId, data.orgId, "write");
    const { data: selected, error: selectedError } = await context.supabase
      .from("accounts")
      .select("id, is_active")
      .eq("org_id", data.orgId)
      .in("id", [data.accountId, data.equityAccountId]);
    if (selectedError) throw new Error(selectedError.message);
    if ((selected ?? []).length !== 2 || selected?.some((account) => !account.is_active)) {
      throw new Error("Opening balances can only use active accounts in this organization.");
    }
    const { supabase, userId } = context;
    // One live opening balance per account: retries/double-clicks can't stack them.
    const { data: existing } = await supabase
      .from("entries")
      .select("id, transactions!inner(id, source, status, org_id)")
      .eq("account_id", data.accountId)
      .eq("transactions.org_id", data.orgId)
      .eq("transactions.source", "opening_balance")
      .eq("transactions.status", "posted")
      .limit(1);
    if (existing?.length) {
      throw new Error(
        "This account already has an opening balance. Void it first if it needs to change.",
      );
    }
    const openingEntries = [
      { accountId: data.accountId, amountCents: data.amountCents },
      { accountId: data.equityAccountId, amountCents: -data.amountCents },
    ];
    assertBalancedEntries(openingEntries);
    const { data: tx, error: txError } = await supabase
      .from("transactions")
      .insert({
        id: newId(),
        org_id: data.orgId,
        transaction_date: data.date,
        description: "Opening balance",
        source: "opening_balance",
        created_by: userId,
        idempotency_key: `opening:${data.accountId}:${data.date}:${data.amountCents}`,
      })
      .select("id")
      .single();
    if (txError) {
      if (txError.code === "23505") return { ok: true, duplicate: true };
      throw new Error(txError.message);
    }

    const { error } = await supabase.from("entries").insert(
      openingEntries.map((e) => ({
        id: newId(),
        transaction_id: tx.id,
        account_id: e.accountId,
        amount_cents: e.amountCents,
      })),
    );
    if (error) {
      await supabase.from("transactions").delete().eq("id", tx.id);
      throw new Error(error.message);
    }
    return { ok: true };
  });

function makeCrud(
  table: "categories" | "tags" | "projects" | "funds",
  extraSchema?: z.ZodRawShape,
) {
  const list = createServerFn({ method: "GET" })
    .middleware([requireSupabaseAuth])
    .validator((input) => orgInput.parse(input))
    .handler(async ({ data, context }) => {
      const { data: rows, error } = await context.supabase
        .from(table)
        .select("*")
        .eq("org_id", data.orgId)
        .order("name");
      if (error) throw new Error(error.message);
      return rows ?? [];
    });

  const create = createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .validator((input) =>
      z
        .object({ orgId: z.string().uuid(), name: z.string().min(1).max(120), ...extraSchema })
        .parse(input),
    )
    .handler(async ({ data, context }) => {
      const { orgId, name, ...rest } = data as any;
      await assertCan(context.supabase, context.userId, orgId, "write");
      const { error } = await context.supabase.from(table).insert({ org_id: orgId, name, ...rest });
      if (error) throw new Error(error.message);
      return { ok: true };
    });

  return { list, create };
}

const categories = makeCrud("categories", {
  type: z.enum(["revenue", "expense"]).default("expense"),
});
export const listCategories = categories.list;
export const createCategory = categories.create;

const tags = makeCrud("tags");
export const listTags = tags.list;
export const createTag = tags.create;

const projects = makeCrud("projects", { budgetCents: z.number().int().min(0).default(0) });
export const listProjects = projects.list;
export const createProject = projects.create;

const funds = makeCrud("funds", { isRestricted: z.boolean().default(false) });
export const listFunds = funds.list;
export const createFund = funds.create;
