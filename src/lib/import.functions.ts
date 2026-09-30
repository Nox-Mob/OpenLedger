import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const rowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(1).max(300),
  amountCents: z.number().int(),
});

async function fingerprint(orgId: string, accountId: string, row: z.infer<typeof rowSchema>) {
  const raw = `${orgId}|${accountId}|${row.date}|${row.description}|${row.amountCents}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const importBankRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        orgId: z.string().uuid(),
        accountId: z.string().uuid(),
        rows: z.array(rowSchema).min(1).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const records = await Promise.all(
      data.rows.map(async (row) => ({
        org_id: data.orgId,
        account_id: data.accountId,
        bank_date: row.date,
        description: row.description,
        amount_cents: row.amountCents,
        fingerprint: await fingerprint(data.orgId, data.accountId, row),
      })),
    );

    const { data: inserted, error } = await supabase
      .from("bank_transactions")
      .upsert(records, { onConflict: "org_id,account_id,fingerprint", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(error.message);

    await supabase.from("audit_log").insert({
      org_id: data.orgId,
      user_id: userId,
      action: "import",
      entity: "bank_transactions",
      after: { attempted: data.rows.length, imported: inserted?.length ?? 0 },
    });

    return {
      imported: inserted?.length ?? 0,
      duplicatesSkipped: data.rows.length - (inserted?.length ?? 0),
    };
  });

export const listBankTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        orgId: z.string().uuid(),
        accountId: z.string().uuid().optional(),
        unlinkedOnly: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("bank_transactions")
      .select("id, bank_date, description, amount_cents, transaction_id, accounts(name)")
      .eq("org_id", data.orgId)
      .order("bank_date", { ascending: false })
      .limit(300);
    if (data.accountId) query = query.eq("account_id", data.accountId);
    if (data.unlinkedOnly) query = query.is("transaction_id", null);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return ((rows ?? []) as any[]).map((r) => ({
      id: r.id as string,
      date: r.bank_date as string,
      description: r.description as string,
      amountCents: r.amount_cents as number,
      linkedTransactionId: r.transaction_id as string | null,
      accountName: r.accounts?.name ?? "",
    }));
  });

/**
 * Turn an imported bank row into a real ledger transaction.
 * The bank row is evidence; the ledger transaction is the source of truth.
 */
export const postBankTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        orgId: z.string().uuid(),
        bankTransactionId: z.string().uuid(),
        offsetAccountId: z.string().uuid(),
        categoryId: z.string().uuid().nullish(),
        projectId: z.string().uuid().nullish(),
        fundId: z.string().uuid().nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: bank, error: bError } = await supabase
      .from("bank_transactions")
      .select("id, account_id, bank_date, description, amount_cents, transaction_id")
      .eq("id", data.bankTransactionId)
      .eq("org_id", data.orgId)
      .single();
    if (bError || !bank) throw new Error("Bank transaction not found");
    if (bank.transaction_id) throw new Error("Already posted to the ledger");

    const { data: tx, error: txError } = await supabase
      .from("transactions")
      .insert({
        org_id: data.orgId,
        transaction_date: bank.bank_date,
        posted_date: bank.bank_date,
        description: bank.description,
        source: "import",
        created_by: userId,
      })
      .select("id")
      .single();
    if (txError) throw new Error(txError.message);

    const { error: eError } = await supabase.from("entries").insert([
      { transaction_id: tx.id, account_id: bank.account_id, amount_cents: bank.amount_cents },
      {
        transaction_id: tx.id,
        account_id: data.offsetAccountId,
        amount_cents: -bank.amount_cents,
        category_id: data.categoryId ?? null,
        project_id: data.projectId ?? null,
        fund_id: data.fundId ?? null,
      },
    ]);
    if (eError) {
      await supabase.from("transactions").delete().eq("id", tx.id);
      throw new Error(eError.message);
    }

    await supabase
      .from("bank_transactions")
      .update({ transaction_id: tx.id })
      .eq("id", data.bankTransactionId);

    await supabase.from("audit_log").insert({
      org_id: data.orgId,
      user_id: userId,
      action: "post_from_bank",
      entity: "transaction",
      entity_id: tx.id,
      after: { bank_transaction_id: data.bankTransactionId },
    });

    return { id: tx.id as string };
  });
