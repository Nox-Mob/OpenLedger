import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const entrySchema = z.object({
  accountId: z.string().uuid(),
  amountCents: z.number().int().refine((v) => v !== 0, "Amount cannot be zero"),
  categoryId: z.string().uuid().nullish(),
  projectId: z.string().uuid().nullish(),
  fundId: z.string().uuid().nullish(),
  memo: z.string().max(500).nullish(),
});

const createSchema = z.object({
  orgId: z.string().uuid(),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  postedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  description: z.string().min(1).max(300),
  source: z.enum(["manual", "import", "opening_balance", "adjustment", "transfer"]).default("manual"),
  entries: z.array(entrySchema).min(2),
  tagIds: z.array(z.string().uuid()).optional(),
});

export const listTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        orgId: z.string().uuid(),
        accountId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(500).default(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("transactions")
      .select(
        "id, transaction_date, posted_date, description, source, status, created_at, entries(id, account_id, amount_cents, memo, accounts(name, type), categories(name), projects(name), funds(name))",
      )
      .eq("org_id", data.orgId)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(data.limit);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    let result = (rows ?? []) as any[];
    if (data.accountId) {
      result = result.filter((t) => t.entries.some((e: any) => e.account_id === data.accountId));
    }
    return result.map((t) => ({
      id: t.id as string,
      transactionDate: t.transaction_date as string,
      postedDate: t.posted_date as string | null,
      description: t.description as string,
      source: t.source as string,
      status: t.status as string,
      entries: (t.entries as any[]).map((e) => ({
        id: e.id as string,
        accountId: e.account_id as string,
        accountName: e.accounts?.name ?? "",
        accountType: e.accounts?.type ?? "",
        amountCents: e.amount_cents as number,
        memo: e.memo as string | null,
        categoryName: e.categories?.name ?? null,
        projectName: e.projects?.name ?? null,
        fundName: e.funds?.name ?? null,
      })),
    }));
  });

export const createTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const sum = data.entries.reduce((acc, e) => acc + e.amountCents, 0);
    if (sum !== 0) {
      throw new Error(
        `Transaction is not balanced: entries sum to ${sum} cents. Money in must equal money out.`,
      );
    }

    const { data: tx, error: txError } = await supabase
      .from("transactions")
      .insert({
        org_id: data.orgId,
        transaction_date: data.transactionDate,
        posted_date: data.postedDate ?? null,
        description: data.description,
        source: data.source,
        created_by: userId,
      })
      .select("id")
      .single();
    if (txError) throw new Error(txError.message);

    const entries = data.entries.map((e) => ({
      transaction_id: tx.id,
      account_id: e.accountId,
      amount_cents: e.amountCents,
      category_id: e.categoryId ?? null,
      project_id: e.projectId ?? null,
      fund_id: e.fundId ?? null,
      memo: e.memo ?? null,
    }));
    const { error: entriesError } = await supabase.from("entries").insert(entries);
    if (entriesError) {
      await supabase.from("transactions").delete().eq("id", tx.id);
      throw new Error(entriesError.message);
    }

    if (data.tagIds?.length) {
      await supabase
        .from("transaction_tags")
        .insert(data.tagIds.map((tagId) => ({ transaction_id: tx.id, tag_id: tagId })));
    }

    await supabase.from("audit_log").insert({
      org_id: data.orgId,
      user_id: userId,
      action: "create",
      entity: "transaction",
      entity_id: tx.id,
      after: { description: data.description, entries },
    });

    return { id: tx.id as string };
  });

export const voidTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ orgId: z.string().uuid(), transactionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: before } = await supabase
      .from("transactions")
      .select("id, description, status")
      .eq("id", data.transactionId)
      .eq("org_id", data.orgId)
      .single();
    if (!before) throw new Error("Transaction not found");

    const { error } = await supabase
      .from("transactions")
      .update({ status: "void" })
      .eq("id", data.transactionId);
    if (error) throw new Error(error.message);

    await supabase.from("audit_log").insert({
      org_id: data.orgId,
      user_id: userId,
      action: "void",
      entity: "transaction",
      entity_id: data.transactionId,
      before,
      after: { status: "void" },
    });
    return { ok: true };
  });
