import { desktopAware } from "@/lib/desktop/bridge";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCan } from "./permissions";
import { createSupabaseRepositories } from "./adapters/supabase";
import { postTransaction, voidTransaction as voidTransactionService } from "./services/ledger";

const entrySchema = z.object({
  accountId: z.string().uuid(),
  amountCents: z
    .number()
    .int()
    .refine((v) => v !== 0, "Amount cannot be zero"),
  categoryId: z.string().uuid().nullish(),
  projectId: z.string().uuid().nullish(),
  fundId: z.string().uuid().nullish(),
  memo: z.string().max(500).nullish(),
});

const createSchema = z.object({
  orgId: z.string().uuid(),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  postedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  description: z.string().min(1).max(300),
  source: z
    .enum(["manual", "import", "opening_balance", "adjustment", "transfer"])
    .default("manual"),
  entries: z.array(entrySchema).min(2),
  tagIds: z.array(z.string().uuid()).optional(),
  /** One per form submission; a repeat with the same key returns the first transaction. */
  idempotencyKey: z.string().min(8).max(120).optional(),
});

export const listTransactions = desktopAware(
  "listTransactions",
  createServerFn({ method: "GET" })
    .middleware([requireSupabaseAuth])
    .validator((input) =>
      z
        .object({
          orgId: z.string().uuid(),
          accountId: z.string().uuid().optional(),
          limit: z.number().int().min(1).max(500).default(100),
        })
        .parse(input),
    )
    .handler(async ({ data, context }) => {
      const query = context.supabase
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

      let result = rows ?? [];
      if (data.accountId) {
        result = result.filter((t) => t.entries.some((e) => e.account_id === data.accountId));
      }
      return result.map((t) => ({
        id: t.id as string,
        transactionDate: t.transaction_date as string,
        postedDate: t.posted_date as string | null,
        description: t.description as string,
        source: t.source as string,
        status: t.status as string,
        entries: t.entries.map((e) => ({
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
    }),
);

export const createTransaction = desktopAware(
  "createTransaction",
  createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .validator((input) => createSchema.parse(input))
    .handler(async ({ data, context }) => {
      const { supabase, userId } = context;
      await assertCan(supabase, userId, data.orgId, "write");
      return postTransaction(createSupabaseRepositories(supabase), {
        orgId: data.orgId,
        userId,
        transactionDate: data.transactionDate,
        postedDate: data.postedDate ?? null,
        description: data.description,
        source: data.source,
        entries: data.entries,
        tagIds: data.tagIds,
        idempotencyKey: data.idempotencyKey ?? null,
      });
    }),
);

export const voidTransaction = desktopAware(
  "voidTransaction",
  createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .validator((input) =>
      z.object({ orgId: z.string().uuid(), transactionId: z.string().uuid() }).parse(input),
    )
    .handler(async ({ data, context }) => {
      const { supabase, userId } = context;
      await assertCan(supabase, userId, data.orgId, "write");
      return voidTransactionService(createSupabaseRepositories(supabase), {
        orgId: data.orgId,
        userId,
        transactionId: data.transactionId,
      });
    }),
);
