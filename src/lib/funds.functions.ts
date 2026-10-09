import type { Db } from "@/lib/db";
// Fund accounting server functions: auth + assertCan, then the shared services.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCan } from "./permissions";
import { createSupabaseRepositories } from "./adapters/supabase";
import { newId } from "./domain/ledger";
import { pledgeOutstanding, type PledgeStatus } from "./domain/funds";
import { fundActivity, fundSummary, postPledge, releaseFund, settlePledge } from "./services/funds";
import { auditedWrite } from "./audited-write";

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function loadFunds(supabase: Db, orgId: string) {
  const { data, error } = await supabase
    .from("funds")
    .select("id, name, is_restricted")
    .eq("org_id", orgId)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((f) => ({
    id: f.id as string,
    name: f.name as string,
    isRestricted: !!f.is_restricted,
  }));
}

export const getFundSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ orgId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    await assertCan(context.supabase, context.userId, data.orgId, "read");
    const funds = await loadFunds(context.supabase, data.orgId);
    return fundSummary(createSupabaseRepositories(context.supabase), data.orgId, funds);
  });

export const setFundRestricted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ orgId: uuid, fundId: uuid, isRestricted: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCan(context.supabase, context.userId, data.orgId, "write");
    const { count } = await context.supabase
      .from("entries")
      .select("id, transactions!inner(org_id, status)", { count: "exact", head: true })
      .eq("fund_id", data.fundId)
      .eq("transactions.status", "posted");
    if ((count ?? 0) > 0) {
      throw new Error("A fund with transactions cannot change restriction. Create a new fund.");
    }
    await auditedWrite(
      context.supabase,
      data.orgId,
      [
        {
          table: "funds",
          op: "update",
          values: { is_restricted: data.isRestricted },
          match: { id: data.fundId },
          minRows: 1,
        },
      ],
      {
        action: "update",
        entity: "fund",
        entityId: data.fundId,
        after: { isRestricted: data.isRestricted },
      },
    );
    return { ok: true };
  });

export const releaseFromRestriction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        orgId: uuid,
        fundId: uuid,
        amountCents: z.number().int().positive(),
        date,
        note: z.string().max(200).optional(),
        idempotencyKey: z.string().min(8).max(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCan(context.supabase, context.userId, data.orgId, "write");
    const funds = await loadFunds(context.supabase, data.orgId);
    return releaseFund(createSupabaseRepositories(context.supabase), {
      ...data,
      userId: context.userId,
      funds,
      idempotencyKey: `release:${data.idempotencyKey}`,
    });
  });

// ---------- Pledges ----------

async function receivableAccount(
  repos: ReturnType<typeof createSupabaseRepositories>,
  orgId: string,
) {
  const all = await repos.accounts.list(orgId, { includeArchived: true });
  const existing = all.find((a) => a.subtype === "pledges_receivable");
  if (existing) {
    if (!existing.isActive) {
      throw new Error("Pledges Receivable is archived. Turn it back on in Account setup.");
    }
    return existing.id;
  }
  const id = newId();
  await repos.accounts.create([
    {
      id,
      orgId,
      name: "Pledges Receivable",
      type: "asset",
      subtype: "pledges_receivable",
      isActive: true,
    },
  ]);
  return id;
}

export const listPledges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ orgId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    await assertCan(context.supabase, context.userId, data.orgId, "read");
    const [{ data: pledges, error }, { data: payments, error: e2 }] = await Promise.all([
      context.supabase
        .from("pledges")
        .select("*, funds(name)")
        .eq("org_id", data.orgId)
        .order("pledge_date", { ascending: false }),
      context.supabase
        .from("pledge_payments")
        .select("pledge_id, kind, amount_cents")
        .eq("org_id", data.orgId),
    ]);
    if (error) throw new Error(error.message);
    if (e2) throw new Error(e2.message);
    return (pledges ?? []).map((p) => {
      const mine = (payments ?? []).filter((x) => x.pledge_id === p.id);
      const paid = mine
        .filter((x) => x.kind === "payment")
        .reduce((s: number, x) => s + Number(x.amount_cents), 0);
      const writtenOff = mine
        .filter((x) => x.kind === "write_off")
        .reduce((s: number, x) => s + Number(x.amount_cents), 0);
      return {
        id: p.id as string,
        donorName: p.donor_name as string,
        fundName: (p.funds?.name as string | undefined) ?? null,
        amountCents: Number(p.amount_cents),
        paidCents: paid,
        writtenOffCents: writtenOff,
        outstandingCents: pledgeOutstanding(Number(p.amount_cents), paid + writtenOff),
        pledgeDate: p.pledge_date as string,
        expectedDate: (p.expected_date as string | null) ?? null,
        note: (p.note as string | null) ?? null,
        status: p.status as PledgeStatus,
      };
    });
  });

export const createPledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        orgId: uuid,
        donorName: z.string().trim().min(1).max(120),
        fundId: uuid.nullable(),
        revenueAccountId: uuid,
        amountCents: z.number().int().positive(),
        pledgeDate: date,
        expectedDate: date.nullable(),
        note: z.string().max(300).nullable(),
        idempotencyKey: z.string().min(8).max(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCan(context.supabase, context.userId, data.orgId, "write");
    const repos = createSupabaseRepositories(context.supabase);
    const [rev] = await repos.accounts.getMany(data.orgId, [data.revenueAccountId]);
    if (!rev || rev.type !== "revenue") throw new Error("Choose an income account.");
    const receivableAccountId = await receivableAccount(repos, data.orgId);
    const tx = await postPledge(repos, {
      orgId: data.orgId,
      userId: context.userId,
      receivableAccountId,
      revenueAccountId: data.revenueAccountId,
      fundId: data.fundId,
      donorName: data.donorName,
      amountCents: data.amountCents,
      date: data.pledgeDate,
      idempotencyKey: `pledge:${data.idempotencyKey}`,
    });
    if (tx.duplicate) {
      // A retry after the ledger posting saved but the pledge record didn't: finish it now.
      const { data: done, error: e3 } = await context.supabase
        .from("pledges")
        .select("id")
        .eq("org_id", data.orgId)
        .eq("transaction_id", tx.id)
        .maybeSingle();
      if (e3) throw new Error(e3.message);
      if (done) return { ok: true };
    }
    const pledgeId = newId();
    await auditedWrite(
      context.supabase,
      data.orgId,
      [
        {
          table: "pledges",
          op: "insert",
          values: {
            id: pledgeId,
            donor_name: data.donorName,
            fund_id: data.fundId,
            amount_cents: data.amountCents,
            pledge_date: data.pledgeDate,
            expected_date: data.expectedDate,
            note: data.note,
            transaction_id: tx.id,
            created_by: context.userId,
          },
        },
      ],
      {
        action: "create",
        entity: "pledge",
        entityId: pledgeId,
        after: { donorName: data.donorName, amountCents: data.amountCents },
      },
    );
    return { ok: true, id: pledgeId };
  });

export const settlePledgeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        orgId: uuid,
        pledgeId: uuid,
        kind: z.enum(["payment", "write_off"]),
        amountCents: z.number().int().positive(),
        cashAccountId: uuid.nullable(),
        date,
        idempotencyKey: z.string().min(8).max(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCan(supabase, userId, data.orgId, "write");
    const repos = createSupabaseRepositories(supabase);
    const { data: p, error } = await supabase
      .from("pledges")
      .select("*")
      .eq("id", data.pledgeId)
      .eq("org_id", data.orgId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!p) throw new Error("Pledge not found.");
    const { data: pays } = await supabase
      .from("pledge_payments")
      .select("amount_cents")
      .eq("pledge_id", p.id);
    const settled = (pays ?? []).reduce((s: number, x) => s + Number(x.amount_cents), 0);
    const receivableAccountId = await receivableAccount(repos, data.orgId);

    let debitAccountId: string;
    if (data.kind === "payment") {
      if (!data.cashAccountId) throw new Error("Choose where the money went.");
      const [cash] = await repos.accounts.getMany(data.orgId, [data.cashAccountId]);
      if (!cash || cash.type !== "asset") throw new Error("Choose a bank or cash account.");
      debitAccountId = cash.id;
    } else {
      const { data: orig } = await supabase
        .from("entries")
        .select("account_id, amount_cents")
        .eq("transaction_id", p.transaction_id as string)
        .lt("amount_cents", 0)
        .limit(1)
        .maybeSingle();
      if (!orig) throw new Error("Original pledge entry not found.");
      debitAccountId = orig.account_id;
    }

    const tx = await settlePledge(repos, {
      orgId: data.orgId,
      userId,
      kind: data.kind,
      status: p.status as PledgeStatus,
      pledgeAmountCents: Number(p.amount_cents),
      settledCents: settled,
      amountCents: data.amountCents,
      receivableAccountId,
      debitAccountId,
      fundId: (p.fund_id as string | null) ?? null,
      donorName: p.donor_name,
      date: data.date,
      idempotencyKey: `pledge-${data.kind}:${data.idempotencyKey}`,
    });
    if (tx.duplicate) {
      // A retry after the ledger posting saved but the payment record didn't: finish it now.
      const { data: done, error: e3 } = await supabase
        .from("pledge_payments")
        .select("id")
        .eq("org_id", data.orgId)
        .eq("transaction_id", tx.id)
        .maybeSingle();
      if (e3) throw new Error(e3.message);
      if (done) return { ok: true };
    }
    // The payment record, any status change and their history are saved together.
    const paymentId = newId();
    const remaining = pledgeOutstanding(Number(p.amount_cents), settled + data.amountCents);
    const status = remaining === 0 ? (data.kind === "write_off" ? "written_off" : "paid") : null;
    await auditedWrite(
      supabase,
      data.orgId,
      [
        {
          table: "pledge_payments",
          op: "insert",
          values: {
            id: paymentId,
            pledge_id: p.id,
            transaction_id: tx.id,
            kind: data.kind,
            amount_cents: data.amountCents,
            paid_date: data.date,
          },
        },
        ...(status
          ? [
              {
                table: "pledges",
                op: "update" as const,
                values: { status },
                match: { id: p.id },
              },
            ]
          : []),
      ],
      {
        action: data.kind === "write_off" ? "write_off" : "payment",
        entity: "pledge",
        entityId: p.id,
        before: { status: p.status },
        after: { amountCents: data.amountCents, status: status ?? p.status },
      },
    );
    return { ok: true };
  });

export const getFundActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ orgId: uuid, from: date, to: date }).parse(input))
  .handler(async ({ data, context }) => {
    await assertCan(context.supabase, context.userId, data.orgId, "read");
    const funds = await loadFunds(context.supabase, data.orgId);
    return fundActivity(
      createSupabaseRepositories(context.supabase),
      data.orgId,
      funds,
      data.from,
      data.to,
    );
  });
