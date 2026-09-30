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
      .select("role, organizations(id, name, org_type)")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return (data ?? [])
      .map((row: any) => ({
        id: row.organizations?.id as string,
        name: row.organizations?.name as string,
        orgType: row.organizations?.org_type as "nonprofit" | "business",
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

    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .insert({ name: data.name, org_type: data.orgType, created_by: userId })
      .select("id")
      .single();
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
