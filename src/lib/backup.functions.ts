import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCan } from "./permissions";
import { writeAudit } from "./audit";

const orgId = z.string().uuid();
const PAGE = 1000;

type PageRow = Record<string, unknown>;
async function all(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: PageRow[] | null; error: { message: string } | null }>,
): Promise<PageRow[]> {
  const out: PageRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

/** Full JSON backup of one organization (admins only). Read through the caller's RLS client. */
export const exportBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ orgId }).parse(input))
  .handler(async ({ data, context }) => {
    await assertCan(context.supabase, context.userId, data.orgId, "manage_settings");
    const { readBackupData } = await import("./backup-export.server");
    const { organization: org, tables } = await readBackupData(context.supabase, data.orgId);
    const counts = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length]));
    await writeAudit({
      org_id: data.orgId,
      user_id: context.userId,
      action: "backup.exported",
      entity: "organization",
      entity_id: data.orgId,
      after: counts,
    });
    const { getSigningKeys } = await import("./backup-key.server");
    const { signBackup } = await import("./domain/backup");
    const signed = await signBackup(await getSigningKeys(), org, tables, new Date().toISOString());
    return signed as unknown as {
      manifest: typeof signed.manifest;
      signature: string;
      organization: any;
      tables: Record<string, any[]>;
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
        kind: z.enum(["change", "ledger", "system"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCan(context.supabase, context.userId, data.orgId, "manage_settings");
    const size = 50;
    let q = context.supabase
      .from("audit_log")
      .select("id, user_id, action, entity, entity_id, before, after, created_at, kind", {
        count: "exact",
      })
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: false })
      .range(data.page * size, data.page * size + size - 1);
    if (data.entity) q = q.eq("entity", data.entity);
    if (data.kind) q = q.eq("kind", data.kind);
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

const backupText = z
  .string()
  .min(2)
  .max(26 * 1024 * 1024);

async function verifyText(text: string) {
  const { MAX_BACKUP_BYTES, verifyBackup, BackupRejected } = await import("./domain/backup");
  if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES)
    throw new BackupRejected("The backup file is larger than 25 MB.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupRejected("This file isn't a valid backup (it couldn't be read).");
  }
  const { getSigningKeys } = await import("./backup-key.server");
  return verifyBackup(parsed, (await getSigningKeys()).publicRaw);
}

/** Check a backup without writing anything. Any signed-in user may restore into a new org. */
export const checkBackupFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ text: backupText }).parse(input))
  .handler(async ({ data }) => {
    const v = await verifyText(data.text);
    const m = v.backup.manifest;
    return {
      orgName: m.orgName,
      exportedAt: m.exportedAt,
      sameInstall: v.sameInstall,
      installFingerprint: v.installFingerprint,
      counts: v.counts,
    };
  });

export const restoreBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ text: backupText, confirmName: z.string().max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const v = await verifyText(data.text);
    if (data.confirmName.trim() !== v.backup.manifest.orgName.trim())
      throw new Error("Type the organization name exactly as shown to confirm.");
    const { restoreIntoNewOrg } = await import("./restore.server");
    return restoreIntoNewOrg(context.supabase, context.userId, v);
  });

/** This install's backup fingerprint, so admins can compare it with a file's source. */
export const getInstallFingerprint = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { getSigningKeys } = await import("./backup-key.server");
    try {
      return { fingerprint: (await getSigningKeys()).fingerprint };
    } catch {
      return { fingerprint: null };
    }
  });
