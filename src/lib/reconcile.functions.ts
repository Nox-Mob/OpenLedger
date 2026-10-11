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

export const listReconciliations = desktopAware(
  "listReconciliations",
  createServerFn({ method: "GET" })
    .middleware([requireSupabaseAuth])
    .validator((i) => z.object({ orgId: uuid }).parse(i))
    .handler(async ({ data, context }) =>
      recon.listReconciliations(createSupabaseRepositories(context.supabase), data.orgId),
    ),
);

/** Suggest defaults for a new reconciliation on an account. */
export const suggestReconciliation = desktopAware(
  "suggestReconciliation",
  createServerFn({ method: "GET" })
    .middleware([requireSupabaseAuth])
    .validator((i) => z.object({ orgId: uuid, accountId: uuid }).parse(i))
    .handler(async ({ data, context }) =>
      recon.suggestReconciliation(
        createSupabaseRepositories(context.supabase),
        data.orgId,
        data.accountId,
      ),
    ),
);

export const startReconciliation = desktopAware(
  "startReconciliation",
  createServerFn({ method: "POST" })
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
    }),
);

export const getReconciliation = desktopAware(
  "getReconciliation",
  createServerFn({ method: "GET" })
    .middleware([requireSupabaseAuth])
    .validator((i) => z.object({ id: uuid }).parse(i))
    .handler(async ({ data, context }) => {
      const { repos, rec } = await load(context, data.id, "read");
      return recon.getReconciliation(repos, rec);
    }),
);

export const setCleared = desktopAware(
  "setCleared",
  createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .validator((i) =>
      z
        .object({ id: uuid, entryIds: z.array(uuid).min(1).max(1000), cleared: z.boolean() })
        .parse(i),
    )
    .handler(async ({ data, context }) => {
      const { repos, rec } = await load(context, data.id, "write");
      return recon.setCleared(repos, rec, data.entryIds, data.cleared, context.userId);
    }),
);

/** Simple mode: clear every entry that matches a bank row in the period. */
export const acceptMatches = desktopAware(
  "acceptMatches",
  createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .validator((i) => z.object({ id: uuid }).parse(i))
    .handler(async ({ data, context }) => {
      const { repos, rec } = await load(context, data.id, "write");
      return recon.acceptMatches(repos, rec, context.userId);
    }),
);

export const completeReconciliation = desktopAware(
  "completeReconciliation",
  createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .validator((i) => z.object({ id: uuid }).parse(i))
    .handler(async ({ data, context }) => {
      const { repos, rec } = await load(context, data.id, "write");
      return recon.completeReconciliation(repos, rec, context.userId);
    }),
);

/** Admin-only. Only the most recent completed reconciliation for an account can be reopened. */
export const reopenReconciliation = desktopAware(
  "reopenReconciliation",
  createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .validator((i) => z.object({ id: uuid }).parse(i))
    .handler(async ({ data, context }) => {
      const { repos, rec } = await load(context, data.id, "reopen_reconciliation");
      return recon.reopenReconciliation(repos, rec, context.userId);
    }),
);

export const discardReconciliation = desktopAware(
  "discardReconciliation",
  createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .validator((i) => z.object({ id: uuid }).parse(i))
    .handler(async ({ data, context }) => {
      const { repos, rec } = await load(context, data.id, "write");
      return recon.discardReconciliation(repos, rec, context.userId);
    }),
);
