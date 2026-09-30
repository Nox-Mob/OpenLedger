import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";
const DEFAULT_ACCOUNTS: Record<
  "nonprofit" | "business",
  Array<{ name: string; type: AccountType; subtype?: string }>
> = {
  nonprofit: [
    { name: "Checking", type: "asset", subtype: "bank" },
    { name: "Savings", type: "asset", subtype: "bank" },
    { name: "Petty Cash", type: "asset", subtype: "cash" },
    { name: "Credit Card", type: "liability", subtype: "credit_card" },
    { name: "Net Assets", type: "equity" },
    { name: "Contributions", type: "revenue" },
    { name: "Grants", type: "revenue" },
    { name: "Program Revenue", type: "revenue" },
    { name: "Program Expenses", type: "expense" },
    { name: "Fundraising Expenses", type: "expense" },
    { name: "Operating Expenses", type: "expense" },
  ],
  business: [
    { name: "Checking", type: "asset", subtype: "bank" },
    { name: "Savings", type: "asset", subtype: "bank" },
    { name: "Petty Cash", type: "asset", subtype: "cash" },
    { name: "Credit Card", type: "liability", subtype: "credit_card" },
    { name: "Owner's Equity", type: "equity" },
    { name: "Revenue", type: "revenue" },
    { name: "Other Income", type: "revenue" },
    { name: "Operating Expenses", type: "expense" },
    { name: "Cost of Goods Sold", type: "expense" },
  ],
};

export const getMyOrgs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_roles")
      .select("role, organizations(id, name, org_type, currency, fiscal_year_start_month)")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return (data ?? [])
      .map((row: any) => ({
        id: row.organizations?.id as string,
        name: row.organizations?.name as string,
        orgType: row.organizations?.org_type as "nonprofit" | "business",
        currency: (row.organizations?.currency ?? "USD") as string,
        fiscalYearStartMonth: (row.organizations?.fiscal_year_start_month ?? 1) as number,
        role: row.role as string,
      }))
      .filter((o) => o.id);
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("display_name, terminology")
      .eq("id", context.userId)
      .maybeSingle();
    return {
      displayName: (data as any)?.display_name ?? null,
      terminology: ((data as any)?.terminology ?? "simplified") as "simplified" | "accounting",
    };
  });

export const setTerminology = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ terminology: z.enum(["simplified", "accounting"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .upsert({ id: context.userId, terminology: data.terminology });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function requireOrgAdmin(supabase: any, userId: string, orgId: string) {
  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (roleRow?.role !== "admin") {
    throw new Error("Only organization admins can change these settings.");
  }
}

export const updateOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        orgId: z.string().uuid(),
        name: z.string().min(1).max(120),
        orgType: z.enum(["nonprofit", "business"]),
        currency: z.string().regex(/^[A-Z]{3}$/),
        fiscalYearStartMonth: z.number().int().min(1).max(12),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgAdmin(supabase, userId, data.orgId);

    const { data: before } = await supabase
      .from("organizations")
      .select("name, org_type, currency, fiscal_year_start_month")
      .eq("id", data.orgId)
      .single();

    const { error } = await supabase
      .from("organizations")
      .update({
        name: data.name,
        org_type: data.orgType,
        currency: data.currency,
        fiscal_year_start_month: data.fiscalYearStartMonth,
      })
      .eq("id", data.orgId);
    if (error) throw new Error(error.message);

    await supabase.from("audit_log").insert({
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
      },
    });

    return { ok: true };
  });

export const listOrgMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ orgId: z.string().uuid() }).parse(input))
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
  .inputValidator((input) =>
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
    await requireOrgAdmin(supabase, userId, data.orgId);
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

    await supabase.from("audit_log").insert({
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
  .inputValidator((input) =>
    z
      .object({
        name: z.string().min(1).max(120),
        orgType: z.enum(["nonprofit", "business"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Generate the id here: reading the row back (insert().select()) would be
    // blocked by RLS because the user isn't a member until user_roles exists.
    const org = { id: crypto.randomUUID() };
    const { error: orgError } = await supabase
      .from("organizations")
      .insert({ id: org.id, name: data.name, org_type: data.orgType, created_by: userId });
    if (orgError) throw new Error(orgError.message);

    const { error: roleError } = await supabase
      .from("user_roles")
      .insert({ user_id: userId, org_id: org.id, role: "admin" });
    if (roleError) throw new Error(roleError.message);

    const accounts = DEFAULT_ACCOUNTS[data.orgType].map((a) => ({ ...a, org_id: org.id }));
    const { error: accError } = await supabase.from("accounts").insert(accounts);
    if (accError) throw new Error(accError.message);

    await supabase.from("profiles").upsert({ id: userId });

    await supabase.from("audit_log").insert({
      org_id: org.id,
      user_id: userId,
      action: "create",
      entity: "organization",
      entity_id: org.id,
      after: { name: data.name, org_type: data.orgType },
    });

    return { id: org.id as string };
  });
