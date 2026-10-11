import { desktopAware } from "@/lib/desktop/bridge";
import type { Db } from "@/lib/db";
import { auditedWrite } from "./audited-write";
import { isValidTimeZone } from "./dates";
import { normalizeTerminology, cleanOverrides } from "./terminology";
const overridesSchema = z
  .record(z.string(), z.enum(["simplest", "simple", "accounting"]))
  .transform(cleanOverrides);
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { catalogFor, matchesCatalog, type OrgType } from "./account-catalog";
import { assertCan } from "./permissions";
import { createSupabaseRepositories } from "./adapters/supabase";
import { newId } from "./domain/ledger";
import { updateOrganization as updateOrgSettings } from "./services/settings";
import { requireMfaBlocker } from "./domain/members";
import { deleteBlocker, NO_USAGE, type AccountUsage } from "./domain/accounts";

/** Non-ledger records that point at each account (entries are counted separately). */
async function accountUsage(supabase: Db, orgId: string) {
  const out = new Map<string, AccountUsage>();
  const bump = (id: string, k: keyof AccountUsage) => {
    const u = out.get(id) ?? { ...NO_USAGE };
    u[k] += 1;
    out.set(id, u);
  };
  const [bank, imports, recs, budgets] = await Promise.all([
    supabase.from("bank_transactions").select("account_id").eq("org_id", orgId),
    supabase.from("import_batches").select("account_id").eq("org_id", orgId),
    supabase.from("reconciliations").select("account_id").eq("org_id", orgId),
    supabase.from("budgets").select("account_id").eq("org_id", orgId),
  ]);
  for (const r of [bank, imports, recs, budgets]) if (r.error) throw new Error(r.error.message);
  for (const r of bank.data ?? []) bump(r.account_id, "bankRows");
  for (const r of imports.data ?? []) bump(r.account_id, "imports");
  for (const r of recs.data ?? []) bump(r.account_id, "reconciliations");
  for (const r of budgets.data ?? []) bump(r.account_id, "budgets");
  return out;
}

export const getMyOrgs = desktopAware(
  "getMyOrgs",
  createServerFn({ method: "GET" })
    .middleware([requireSupabaseAuth])
    .handler(async ({ context }) => {
      const { data, error } = await context.supabase
        .from("user_roles")
        .select(
          "role, organizations(id, name, org_type, currency, fiscal_year_start_month, timezone, terminology, term_overrides, ai_pdf_enabled, require_mfa)",
        )
        .eq("user_id", context.userId);
      if (error) throw new Error(error.message);
      return (data ?? [])
        .map((row) => ({
          id: row.organizations?.id as string,
          name: row.organizations?.name as string,
          orgType: row.organizations?.org_type as "nonprofit" | "business",
          currency: (row.organizations?.currency ?? "USD") as string,
          fiscalYearStartMonth: (row.organizations?.fiscal_year_start_month ?? 1) as number,
          timezone: (row.organizations?.timezone ?? "America/Chicago") as string,
          terminology: normalizeTerminology(row.organizations?.terminology),
          termOverrides: cleanOverrides(row.organizations?.term_overrides),
          aiPdfEnabled: !!row.organizations?.ai_pdf_enabled,
          requireMfa: !!row.organizations?.require_mfa,
          role: row.role as string,
        }))
        .filter((o) => o.id);
    }),
);

export const getMyProfile = desktopAware(
  "getMyProfile",
  createServerFn({ method: "GET" })
    .middleware([requireSupabaseAuth])
    .handler(async ({ context }) => {
      const { data } = await context.supabase
        .from("profiles")
        .select("display_name, terminology, term_overrides")
        .eq("id", context.userId)
        .maybeSingle();
      return {
        displayName: data?.display_name ?? null,
        terminology: normalizeTerminology(data?.terminology),
        termOverrides: cleanOverrides(data?.term_overrides),
      };
    }),
);

export const setMyTermOverrides = desktopAware(
  "setMyTermOverrides",
  createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .validator((input) => z.object({ termOverrides: overridesSchema }).parse(input))
    .handler(async ({ data, context }) => {
      const { error } = await context.supabase
        .from("profiles")
        // cloud-only-write: per-user or service record, not organization books
        .upsert({ id: context.userId, term_overrides: data.termOverrides });
      if (error) throw new Error(error.message);
      return { ok: true };
    }),
);

async function requireOrgAdmin(supabase: Db, userId: string, orgId: string) {
  await assertCan(supabase, userId, orgId, "manage_settings");
}

export const updateOrganization = desktopAware(
  "updateOrganization",
  createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .validator((input) =>
      z
        .object({
          orgId: z.string().uuid(),
          name: z.string().min(1).max(120),
          orgType: z.enum(["nonprofit", "business"]),
          currency: z.string().regex(/^[A-Z]{3}$/),
          fiscalYearStartMonth: z.number().int().min(1).max(12),
          timezone: z.string().max(64).refine(isValidTimeZone, "Unknown timezone"),
          terminology: z.enum(["simplest", "simple", "accounting"]),
          termOverrides: overridesSchema,
          aiPdfEnabled: z.boolean().optional(),
        })
        .parse(input),
    )
    .handler(async ({ data, context }) => {
      const { supabase, userId } = context;
      await requireOrgAdmin(supabase, userId, data.orgId);
      return updateOrgSettings(createSupabaseRepositories(supabase), data.orgId, userId, {
        name: data.name,
        orgType: data.orgType,
        currency: data.currency,
        fiscalYearStartMonth: data.fiscalYearStartMonth,
        timezone: data.timezone,
        terminology: data.terminology,
        termOverrides: data.termOverrides as Record<string, string>,
        aiPdfEnabled: data.aiPdfEnabled,
      });
    }),
);

export const listOrgMembers = desktopAware(
  "listOrgMembers",
  createServerFn({ method: "GET" })
    .middleware([requireSupabaseAuth])
    .validator((input) => z.object({ orgId: z.string().uuid() }).parse(input))
    .handler(async ({ data, context }) => {
      const { supabase, userId } = context;
      // Any member can see the member list; RLS scopes user_roles to org members.
      const { data: rows, error } = await supabase
        .from("user_roles")
        .select("id, user_id, role")
        .eq("org_id", data.orgId);
      if (error) throw new Error(error.message);

      const userIds = (rows ?? []).map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
      const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

      return (rows ?? []).map((r) => ({
        id: r.id as string,
        userId: r.user_id as string,
        role: r.role as string,
        displayName: (nameById.get(r.user_id) as string | null) ?? null,
        isYou: r.user_id === userId,
      }));
    }),
);

export const updateMemberRole = desktopAware(
  "updateMemberRole",
  createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .validator((input) =>
      z
        .object({
          orgId: z.string().uuid(),
          userId: z.string().uuid(),
          role: z.enum(["admin", "treasurer", "member", "viewer"]),
        })
        .parse(input),
    )
    .handler(async ({ data, context }) => {
      const { supabase, userId } = context;
      await assertCan(supabase, userId, data.orgId, "manage_members");
      if (data.userId === userId && data.role !== "admin") {
        throw new Error("You can't demote yourself. Ask another admin to do it.");
      }

      const { data: before } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.userId)
        .eq("org_id", data.orgId)
        .maybeSingle();

      await auditedWrite(
        supabase,
        data.orgId,
        [
          {
            table: "user_roles",
            op: "update",
            values: { role: data.role },
            match: { user_id: data.userId },
            minRows: 1,
          },
        ],
        {
          action: "update",
          entity: "user_role",
          entityId: data.userId,
          before: before ?? null,
          after: { role: data.role },
          kind: "system",
        },
      );

      return { ok: true };
    }),
);

export const createOrganization = desktopAware(
  "createOrganization",
  createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .validator((input) =>
      z
        .object({
          name: z.string().min(1).max(120),
          orgType: z.enum(["nonprofit", "business"]),
          accountKeys: z.array(z.string().max(60)).max(100).optional(),
          currency: z
            .string()
            .regex(/^[A-Z]{3}$/)
            .optional(),
          fiscalYearStartMonth: z.number().int().min(1).max(12).optional(),
          timezone: z.string().max(64).refine(isValidTimeZone, "Unknown timezone").optional(),
          terminology: z.enum(["simplest", "simple", "accounting"]).optional(),
        })
        .parse(input),
    )
    .handler(async ({ data, context }) => {
      const { supabase, userId } = context;

      // Generate the id here: reading the row back (insert().select()) would be
      // blocked by RLS because the user isn't a member until user_roles exists.
      const org = { id: newId() };
      const orgRow = {
        id: org.id,
        name: data.name,
        org_type: data.orgType,
        created_by: userId,
        ...(data.currency ? { currency: data.currency } : {}),
        ...(data.fiscalYearStartMonth
          ? { fiscal_year_start_month: data.fiscalYearStartMonth }
          : {}),
        ...(data.terminology ? { terminology: data.terminology } : {}),
        ...(data.timezone ? { timezone: data.timezone } : {}),
      };

      // The creator's admin row is added by the organizations_add_creator DB trigger.

      const keys = data.accountKeys ? new Set(data.accountKeys) : null;
      const accounts = catalogFor(data.orgType)
        .filter((c) => c.required || (keys ? keys.has(c.key) : c.defaultOn))
        .map((c) => ({
          id: newId(),
          name: c.name,
          type: c.type,
          subtype: c.subtype ?? null,
          org_id: org.id,
        }));
      // cloud-only-write: per-user or service record, not organization books
      await supabase.from("profiles").upsert({ id: userId });

      // Organization, starter accounts and history are saved together.
      await auditedWrite(
        supabase,
        org.id,
        [
          { table: "organizations", op: "insert", values: orgRow },
          { table: "accounts", op: "insert", values: accounts },
        ],
        {
          action: "create",
          entity: "organization",
          entityId: org.id,
          after: { name: data.name, org_type: data.orgType },
        },
      );

      return { id: org.id as string };
    }),
);

// ---------- Account setup (which accounts the org uses) ----------

export const getAccountSetup = desktopAware(
  "getAccountSetup",
  createServerFn({ method: "GET" })
    .middleware([requireSupabaseAuth])
    .validator((input) => z.object({ orgId: z.string().uuid() }).parse(input))
    .handler(async ({ data, context }) => {
      const { supabase } = context;
      const { data: accounts, error } = await supabase
        .from("accounts")
        .select("id, name, type, subtype, is_active")
        .eq("org_id", data.orgId)
        .order("type")
        .order("name");
      if (error) throw new Error(error.message);
      const { data: used, error: uErr } = await supabase
        .from("entries")
        .select("account_id, transactions!inner(org_id)")
        .eq("transactions.org_id", data.orgId);
      if (uErr) throw new Error(uErr.message);
      const usage = await accountUsage(supabase, data.orgId);
      const counts = new Map<string, number>();
      for (const e of used ?? []) counts.set(e.account_id, (counts.get(e.account_id) ?? 0) + 1);
      return (accounts ?? []).map((a) => {
        const u = { ...(usage.get(a.id) ?? NO_USAGE), entries: counts.get(a.id) ?? 0 };
        return {
          id: a.id as string,
          name: a.name as string,
          type: a.type as string,
          subtype: (a.subtype ?? null) as string | null,
          isActive: a.is_active as boolean,
          entryCount: u.entries,
          deleteBlocker: deleteBlocker(u),
        };
      });
    }),
);

export const setAccountEnabled = desktopAware(
  "setAccountEnabled",
  createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .validator((input) =>
      z
        .object({
          orgId: z.string().uuid(),
          catalogKey: z.string().max(60).optional(),
          accountId: z.string().uuid().optional(),
          enabled: z.boolean(),
        })
        .parse(input),
    )
    .handler(async ({ data, context }) => {
      const { supabase, userId } = context;
      await requireOrgAdmin(supabase, userId, data.orgId);

      const { data: org } = await supabase
        .from("organizations")
        .select("org_type")
        .eq("id", data.orgId)
        .single();
      const catalog = catalogFor((org?.org_type ?? "business") as OrgType);
      const item = data.catalogKey ? catalog.find((c) => c.key === data.catalogKey) : undefined;

      const { data: existing } = await supabase
        .from("accounts")
        .select("id, name, type, is_active")
        .eq("org_id", data.orgId);
      const target = data.accountId
        ? (existing ?? []).find((a) => a.id === data.accountId)
        : item
          ? (existing ?? []).find((a) => matchesCatalog(a, item))
          : undefined;

      if (data.enabled) {
        if (target) {
          if (target.is_active) return { ok: true };
          await auditedWrite(
            supabase,
            data.orgId,
            [
              {
                table: "accounts",
                op: "update",
                values: { is_active: true },
                match: { id: target.id },
              },
            ],
            {
              action: "reactivate",
              entity: "account",
              entityId: target.id,
              before: { is_active: false },
              after: { is_active: true },
            },
          );
          return { ok: true };
        }
        if (!item) throw new Error("Unknown account.");
        const accountId = newId();
        await auditedWrite(
          supabase,
          data.orgId,
          [
            {
              table: "accounts",
              op: "insert",
              values: {
                id: accountId,
                name: item.name,
                type: item.type,
                subtype: item.subtype ?? null,
              },
            },
          ],
          {
            action: "create",
            entity: "account",
            entityId: accountId,
            after: { name: item.name, type: item.type },
          },
        );
        return { ok: true };
      }

      if (!target) return { ok: true };
      if (item?.required) throw new Error(`${item.name} is required and can't be removed.`);
      if (!target.is_active) return { ok: true };
      await auditedWrite(
        supabase,
        data.orgId,
        [
          {
            table: "accounts",
            op: "update",
            values: { is_active: false },
            match: { id: target.id },
          },
        ],
        {
          action: "archive",
          entity: "account",
          entityId: target.id,
          before: { name: target.name, type: target.type, is_active: true },
          after: { is_active: false },
        },
      );
      return { ok: true };
    }),
);

/** Permanently removes an account that was never used. Anything with history is archived instead. */
export const deleteUnusedAccount = desktopAware(
  "deleteUnusedAccount",
  createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .validator((input) =>
      z.object({ orgId: z.string().uuid(), accountId: z.string().uuid() }).parse(input),
    )
    .handler(async ({ data, context }) => {
      const { supabase, userId } = context;
      await requireOrgAdmin(supabase, userId, data.orgId);
      const [{ data: acct, error }, { data: org }] = await Promise.all([
        supabase
          .from("accounts")
          .select("id, name, type, subtype")
          .eq("org_id", data.orgId)
          .eq("id", data.accountId)
          .maybeSingle(),
        supabase.from("organizations").select("org_type").eq("id", data.orgId).single(),
      ]);
      if (error) throw new Error(error.message);
      if (!acct) throw new Error("Account not found.");
      const { count, error: cErr } = await supabase
        .from("entries")
        .select("id", { count: "exact", head: true })
        .eq("account_id", acct.id);
      if (cErr) throw new Error(cErr.message);
      const usage = {
        ...((await accountUsage(supabase, data.orgId)).get(acct.id) ?? NO_USAGE),
        entries: count ?? 0,
      };
      const required = catalogFor((org?.org_type ?? "business") as OrgType).some(
        (c) => c.required && matchesCatalog(acct, c),
      );
      const blocker = deleteBlocker(usage, { required });
      if (blocker) throw new Error(blocker);
      await auditedWrite(
        supabase,
        data.orgId,
        [{ table: "accounts", op: "delete", match: { id: acct.id }, minRows: 1 }],
        {
          action: "delete",
          entity: "account",
          entityId: acct.id,
          before: { name: acct.name, type: acct.type, subtype: acct.subtype },
        },
      );
      return { ok: true };
    }),
);

export const setRequireMfa = desktopAware(
  "setRequireMfa",
  createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .validator((input) => z.object({ orgId: z.string().uuid(), enabled: z.boolean() }).parse(input))
    .handler(async ({ data, context }) => {
      const { supabase, userId, claims } = context;
      await requireOrgAdmin(supabase, userId, data.orgId);
      const blocker = requireMfaBlocker(data.enabled, (claims as { aal?: string }).aal);
      if (blocker) throw new Error(blocker);
      await auditedWrite(
        supabase,
        data.orgId,
        [
          {
            table: "organizations",
            op: "update",
            values: { require_mfa: data.enabled },
            minRows: 1,
          },
        ],
        {
          action: data.enabled ? "require_mfa_on" : "require_mfa_off",
          entity: "organization",
          entityId: data.orgId,
          after: { requireMfa: data.enabled },
          kind: "system",
        },
      );
      return { ok: true };
    }),
);
