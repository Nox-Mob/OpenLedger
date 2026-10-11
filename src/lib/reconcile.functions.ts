import { desktopAware } from "@/lib/desktop/bridge";
import type { Db } from "@/lib/db";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createSupabaseRepositories } from "./adapters/supabase";
import { assertCan } from "./permissions";
import * as recon from "./services/reconciliation";

// Statement checks: auth + permission here, workflow in src/lib/services/reconciliation.ts.
const uuid = z.string().uuid();
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

type Ctx = { supabase: Db; userId: string };

async function load(context: Ctx, id: string, action: Parameters<typeof assertCan>[3]) {
  const repos = createSupabaseRepositories(context.supabase);
  const rec = await recon.locateReconciliation(repos, id);
  await assertCan(context.supabase, context.userId, rec.orgId, action);
  return { repos, rec };
}

const listReconciliationsCloud = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i) => z.object({ orgId: uuid }).parse(i))
  .handler(async ({ data, context }) =>
    recon.listReconciliations(createSupabaseRepositories(context.supabase), data.orgId),
  );
export const listReconciliations = desktopAware("listReconciliations", listReconciliationsCloud);

/** Suggest defaults for a new reconciliation on an account. */
const suggestReconciliationCloud = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i) => z.object({ orgId: uuid, accountId: uuid }).parse(i))
  .handler(async ({ data, context }) =>
    recon.suggestReconciliation(
      createSupabaseRepositories(context.supabase),
      data.orgId,
      data.accountId,
    ),
  );
export const suggestReconciliation = desktopAware(
  "suggestReconciliation",
  suggestReconciliationCloud,
);

const startReconciliationCloud = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) =>
    z
      .object({
        orgId: uuid,
        accountId: uuid,
        periodStart: dateStr,
        periodEnd: dateStr,
        beginningBalanceCents: z.number().int(),
        endingBalanceCents: z.number().int(),
        mode: z.enum(["simple", "full"]),
        batchId: uuid.nullish(),
      })
      .refine((v) => v.periodEnd >= v.periodStart, "End date must be on or after start date")
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertCan(context.supabase, context.userId, data.orgId, "write");
    return recon.startReconciliation(createSupabaseRepositories(context.supabase), {
      ...data,
      batchId: data.batchId ?? null,
      userId: context.userId,
    });
  });
export const startReconciliation = desktopAware("startReconciliation", startReconciliationCloud);

const getReconciliationCloud = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i) => z.object({ id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { repos, rec } = await load(context, data.id, "read");
    return recon.getReconciliation(repos, rec);
  });
export const getReconciliation = desktopAware("getReconciliation", getReconciliationCloud);

const setClearedCloud = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) =>
    z.object({ id: uuid, entryIds: z.array(uuid).min(1).max(1000), cleared: z.boolean() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { repos, rec } = await load(context, data.id, "write");
    return recon.setCleared(repos, rec, data.entryIds, data.cleared, context.userId);
  });
export const setCleared = desktopAware("setCleared", setClearedCloud);

/** Simple mode: clear every entry that matches a bank row in the period. */
const acceptMatchesCloud = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) => z.object({ id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { repos, rec } = await load(context, data.id, "write");
    return recon.acceptMatches(repos, rec, context.userId);
  });
export const acceptMatches = desktopAware("acceptMatches", acceptMatchesCloud);

const completeReconciliationCloud = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) => z.object({ id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { repos, rec } = await load(context, data.id, "write");
    return recon.completeReconciliation(repos, rec, context.userId);
  });
export const completeReconciliation = desktopAware(
  "completeReconciliation",
  completeReconciliationCloud,
);

/** Admin-only. Only the most recent completed reconciliation for an account can be reopened. */
const reopenReconciliationCloud = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) => z.object({ id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { repos, rec } = await load(context, data.id, "reopen_reconciliation");
    return recon.reopenReconciliation(repos, rec, context.userId);
  });
export const reopenReconciliation = desktopAware("reopenReconciliation", reopenReconciliationCloud);

const discardReconciliationCloud = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) => z.object({ id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { repos, rec } = await load(context, data.id, "write");
    return recon.discardReconciliation(repos, rec, context.userId);
  });
export const discardReconciliation = desktopAware(
  "discardReconciliation",
  discardReconciliationCloud,
);
