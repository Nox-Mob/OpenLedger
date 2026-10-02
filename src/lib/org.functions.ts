import { writeAudit } from "./audit";
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

export const getMyOrgs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_roles")
      .select(
        "role, organizations(id, name, org_type, currency, fiscal_year_start_month, timezone, terminology, term_overrides, ai_pdf_enabled)",
      )
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return (data ?? [])
      .map((row: any) => ({
        id: row.organizations?.id as string,
        name: row.organizations?.name as string,
        orgType: row.organizations?.org_type as "nonprofit" | "business",
        currency: (row.organizations?.currency ?? "USD") as string,
        fiscalYearStartMonth: (row.organizations?.fiscal_year_start_month ?? 1) as number,
        timezone: (row.organizations?.timezone ?? "America/Chicago") as string,
        terminology: normalizeTerminology(row.organizations?.terminology),
        termOverrides: cleanOverrides(row.organizations?.term_overrides),
        aiPdfEnabled: !!row.organizations?.ai_pdf_enabled,
        role: row.role as string,
      }))
      .filter((o) => o.id);
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("display_name, terminology, term_overrides")
      .eq("id", context.userId)
      .maybeSingle();
    return {
      displayName: (data as any)?.display_name ?? null,
      terminology: normalizeTerminology((data as any)?.terminology),
      termOverrides: cleanOverrides((data as any)?.term_overrides),
    };
  });

export const setMyTermOverrides = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ termOverrides: overridesSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .upsert({ id: context.userId, term_overrides: data.termOverrides as any });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function requireOrgAdmin(supabase: any, userId: string, orgId: string) {
  await assertCan(supabase, userId, orgId, "manage_settings");
}

export const updateOrganization = createServerFn({ method: "POST" })
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

    const { data: before } = await supabase
      .from("organizations")
      .select(
        "name, org_type, currency, fiscal_year_start_month, timezone, terminology, term_overrides, ai_pdf_enabled",
      )
      .eq("id", data.orgId)
      .single();

    const { error } = await supabase
      .from("organizations")
      .update({
        name: data.name,
        org_type: data.orgType,
        currency: data.currency,
        fiscal_year_start_month: data.fiscalYearStartMonth,
        timezone: data.timezone,
        terminology: data.terminology,
        term_overrides: data.termOverrides as any,
        ...(data.aiPdfEnabled !== undefined ? { ai_pdf_enabled: data.aiPdfEnabled } : {}),
      })
      .eq("id", data.orgId);
    if (error) throw new Error(error.message);

    await writeAudit({
      org_id: data.orgId,
      user_id: userId,
      action: "update",
      entity: "organization",
      entity_id: data.orgId,
      before: before ?? null,
      after: {
        name: data.name,
        org_type: data.orgType,
        currency: data.currency,
        fiscal_year_start_month: data.fiscalYearStartMonth,
        timezone: data.timezone,
        terminology: data.terminology,
        term_overrides: data.termOverrides,
        ai_pdf_enabled: data.aiPdfEnabled ?? before?.ai_pdf_enabled ?? false,
      },
    });

    return { ok: true };
  });

export const listOrgMembers = createServerFn({ method: "GET" })
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

    const userIds = (rows ?? []).map((r: any) => r.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    const nameById = new Map((profiles ?? []).map((p: any) => [p.id, p.display_name]));

    return (rows ?? []).map((r: any) => ({
      id: r.id as string,
      userId: r.user_id as string,
      role: r.role as string,
      displayName: (nameById.get(r.user_id) as string | null) ?? null,
      isYou: r.user_id === userId,
    }));
  });

export const updateMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        orgId: z.string().uuid(),
        userId: z.string().uuid(),
        role: z.enum(["admin", "member", "viewer"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCan(supabase, userId, data.orgId, "manage_members");
    if (data.userId === userId && data.role !== "admin") {
      throw new Error("You can't demote yourself — ask another admin to do it.");
    }

    const { data: before } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId)
      .eq("org_id", data.orgId)
      .maybeSingle();

    const { error } = await supabase
      .from("user_roles")
      .update({ role: data.role })
      .eq("user_id", data.userId)
      .eq("org_id", data.orgId);
    if (error) throw new Error(error.message);

    await writeAudit({
      org_id: data.orgId,
      user_id: userId,
      action: "update",
      entity: "user_role",
      entity_id: data.userId,
      before: before ?? null,
      after: { role: data.role },
    });

    return { ok: true };
  });

export const createOrganization = createServerFn({ method: "POST" })
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
    const org = { id: crypto.randomUUID() };
    const { error: orgError } = await supabase.from("organizations").insert({
      id: org.id,
      name: data.name,
      org_type: data.orgType,
      created_by: userId,
      ...(data.currency ? { currency: data.currency } : {}),
      ...(data.fiscalYearStartMonth ? { fiscal_year_start_month: data.fiscalYearStartMonth } : {}),
      ...(data.terminology ? { terminology: data.terminology } : {}),
      ...(data.timezone ? { timezone: data.timezone } : {}),
    });
    if (orgError) throw new Error(orgError.message);

    // The creator's admin row is added by the organizations_add_creator DB trigger.

    const keys = data.accountKeys ? new Set(data.accountKeys) : null;
    const accounts = catalogFor(data.orgType)
      .filter((c) => c.required || (keys ? keys.has(c.key) : c.defaultOn))
      .map((c) => ({ name: c.name, type: c.type, subtype: c.subtype ?? null, org_id: org.id }));
    const { error: accError } = await supabase.from("accounts").insert(accounts);
    if (accError) throw new Error(accError.message);

    await supabase.from("profiles").upsert({ id: userId });

    await writeAudit({
      org_id: org.id,
      user_id: userId,
      action: "create",
      entity: "organization",
      entity_id: org.id,
      after: { name: data.name, org_type: data.orgType },
    });

    return { id: org.id as string };
  });

// ---------- Account setup (which accounts the org uses) ----------

export const getAccountSetup = createServerFn({ method: "GET" })
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
    const counts = new Map<string, number>();
    for (const e of (used ?? []) as any[])
      counts.set(e.account_id, (counts.get(e.account_id) ?? 0) + 1);
    return ((accounts ?? []) as any[]).map((a) => ({
      id: a.id as string,
      name: a.name as string,
      type: a.type as string,
      subtype: (a.subtype ?? null) as string | null,
      isActive: a.is_active as boolean,
      entryCount: counts.get(a.id) ?? 0,
    }));
  });

export const setAccountEnabled = createServerFn({ method: "POST" })
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
      ? (existing ?? []).find((a: any) => a.id === data.accountId)
      : item
        ? (existing ?? []).find((a: any) => matchesCatalog(a, item))
        : undefined;

    if (data.enabled) {
      if (target) {
        if (target.is_active) return { ok: true };
        const { error } = await supabase
          .from("accounts")
          .update({ is_active: true })
          .eq("id", target.id)
          .eq("org_id", data.orgId);
        if (error) throw new Error(error.message);
        await writeAudit({
          org_id: data.orgId,
          user_id: userId,
          action: "reactivate",
          entity: "account",
          entity_id: target.id,
          before: { is_active: false },
          after: { is_active: true },
        });
        return { ok: true };
      }
      if (!item) throw new Error("Unknown account.");
      const { data: created, error } = await supabase
        .from("accounts")
        .insert({
          org_id: data.orgId,
          name: item.name,
          type: item.type,
          subtype: item.subtype ?? null,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      await writeAudit({
        org_id: data.orgId,
        user_id: userId,
        action: "create",
        entity: "account",
        entity_id: created.id,
        after: { name: item.name, type: item.type },
      });
      return { ok: true };
    }

    if (!target) return { ok: true };
    if (item?.required) throw new Error(`${item.name} is required and can't be removed.`);
    if (!target.is_active) return { ok: true };
    const { error } = await supabase
      .from("accounts")
      .update({ is_active: false })
      .eq("id", target.id)
      .eq("org_id", data.orgId);
    if (error) throw new Error(error.message);
    await writeAudit({
      org_id: data.orgId,
      user_id: userId,
      action: "archive",
      entity: "account",
      entity_id: target.id,
      before: { name: target.name, type: target.type, is_active: true },
      after: { is_active: false },
    });
    return { ok: true };
  });
