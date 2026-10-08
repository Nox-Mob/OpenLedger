import { newId } from "./domain/ledger";
import { createSupabaseRepositories } from "./adapters/supabase";
import { postOpeningBalance } from "./services/ledger";
import { auditedWrite } from "./audited-write";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCan } from "./permissions";
import type { Db } from "./db";
import { nameField } from "./validation";
import { duplicateName } from "./domain/accounts";
import { toColumns } from "./columns";

/** Names are unique per organization, ignoring case and extra spaces. */
async function assertNameAvailable(
  supabase: Db,
  table: CrudTable | "accounts",
  orgId: string,
  name: string,
) {
  const { data, error } = await supabase.from(table).select("name").eq("org_id", orgId);
  if (error) throw new Error(error.message);
  const dup = duplicateName(name, data ?? []);
  if (dup) throw new Error(dup);
}

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
    for (const e of entries ?? []) {
      balances.set(e.account_id, (balances.get(e.account_id) ?? 0) + e.amount_cents);
    }

    return (accounts ?? []).map((a) => ({
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
        name: nameField("Account name"),
        type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
        subtype: z.string().max(60).nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCan(context.supabase, context.userId, data.orgId, "manage_settings");
    await assertNameAvailable(context.supabase, "accounts", data.orgId, data.name);
    const id = newId();
    await auditedWrite(
      context.supabase,
      data.orgId,
      [
        {
          table: "accounts",
          op: "insert",
          values: { id, name: data.name.trim(), type: data.type, subtype: data.subtype ?? null },
        },
      ],
      {
        action: "create",
        entity: "account",
        entityId: id,
        after: { name: data.name, type: data.type },
      },
    );
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
    return postOpeningBalance(createSupabaseRepositories(context.supabase), {
      ...data,
      userId: context.userId,
    });
  });

type CrudTable = "categories" | "tags" | "projects" | "funds";

function makeCrud(table: CrudTable, extraSchema?: z.ZodRawShape) {
  const create = createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .validator((input) =>
      z.object({ orgId: z.string().uuid(), name: nameField(), ...extraSchema }).parse(input),
    )
    .handler(async ({ data, context }) => {
      const { orgId, name, ...rest } = data as { orgId: string; name: string } & Record<
        string,
        unknown
      >;
      await assertNameAvailable(context.supabase, table, orgId, name);
      await assertCan(context.supabase, context.userId, orgId, "write");
      const id = newId();
      await auditedWrite(
        context.supabase,
        orgId,
        [{ table, op: "insert", values: { id, name: name.trim(), ...toColumns(rest) } }],
        {
          action: "create",
          entity: table.replace(/s$/, "").replace(/ie$/, "y"),
          entityId: id,
          after: { name },
        },
      );
      return { ok: true };
    });

  return { create };
}

const categories = makeCrud("categories", {
  type: z.enum(["revenue", "expense"]).default("expense"),
});
export const listCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => orgInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("categories")
      .select("*")
      .eq("org_id", data.orgId)
      .order("name");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
export const createCategory = categories.create;

const tags = makeCrud("tags");
export const listTags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => orgInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("tags")
      .select("*")
      .eq("org_id", data.orgId)
      .order("name");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
export const createTag = tags.create;

const projects = makeCrud("projects", { budgetCents: z.number().int().min(0).default(0) });
export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => orgInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("projects")
      .select("*")
      .eq("org_id", data.orgId)
      .order("name");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
export const createProject = projects.create;

const funds = makeCrud("funds", { isRestricted: z.boolean().default(false) });
export const listFunds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => orgInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("funds")
      .select("*")
      .eq("org_id", data.orgId)
      .order("name");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
export const createFund = funds.create;
