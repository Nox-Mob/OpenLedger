// Member lifecycle: invite links, remove/leave, transfer ownership, delete organization.
// Each handler checks the caller with the user's own client before any privileged write.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCan } from "./permissions";
import { newId } from "./domain/ledger";
import {
  assertCanDeleteOrg,
  assertCanRemove,
  assertCanTransfer,
  assertInviteUsable,
  inviteStatus,
  type MemberRef,
} from "./domain/members";
import { writeAudit } from "./audit";

const uuid = z.string().uuid();

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function orgMembers(supabase: any, orgId: string): Promise<MemberRef[]> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .eq("org_id", orgId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({ userId: r.user_id, role: r.role }));
}

async function orgRow(supabase: any, orgId: string) {
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, created_by")
    .eq("id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Organization not found.");
  return data as { id: string; name: string; created_by: string };
}

export const getOrgOwner = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ orgId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const org = await orgRow(context.supabase, data.orgId);
    return { ownerId: org.created_by, isOwner: org.created_by === context.userId };
  });

// ---------- Invites ----------

export const listInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ orgId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    await assertCan(context.supabase, context.userId, data.orgId, "manage_members");
    const { data: rows, error } = await context.supabase
      .from("org_invites")
      .select("id, role, expires_at, used_at, revoked_at, created_at")
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      id: r.id as string,
      role: r.role as string,
      expiresAt: r.expires_at as string,
      createdAt: r.created_at as string,
      status: inviteStatus({ expiresAt: r.expires_at, usedAt: r.used_at, revokedAt: r.revoked_at }),
    }));
  });

export const createInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        orgId: uuid,
        role: z.enum(["admin", "member", "viewer"]),
        days: z.number().int().min(1).max(30).default(7),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCan(context.supabase, context.userId, data.orgId, "manage_members");
    const token = randomToken();
    const id = newId();
    const expiresAt = new Date(Date.now() + data.days * 86400000).toISOString();
    const { error } = await context.supabase.from("org_invites").insert({
      id,
      org_id: data.orgId,
      token_hash: await sha256(token),
      role: data.role,
      created_by: context.userId,
      expires_at: expiresAt,
    });
    if (error) throw new Error(error.message);
    await writeAudit({
      org_id: data.orgId,
      user_id: context.userId,
      action: "create",
      entity: "invite",
      entity_id: id,
      after: { role: data.role, expiresAt },
    });
    // The raw token is returned once and never stored.
    return { id, token, expiresAt };
  });

export const revokeInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ orgId: uuid, inviteId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    await assertCan(context.supabase, context.userId, data.orgId, "manage_members");
    const { error } = await context.supabase
      .from("org_invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.inviteId)
      .eq("org_id", data.orgId)
      .is("used_at", null);
    if (error) throw new Error(error.message);
    await writeAudit({
      org_id: data.orgId,
      user_id: context.userId,
      action: "revoke",
      entity: "invite",
      entity_id: data.inviteId,
    });
    return { ok: true };
  });

export const acceptInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ token: z.string().min(16).max(100) }).parse(input))
  .handler(async ({ data, context }) => {
    // The joining user is not a member yet, so lookup and role grant use the service role,
    // keyed only by the hash of a secret token the caller must possess.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const hash = await sha256(data.token);
    const { data: inv, error } = await supabaseAdmin
      .from("org_invites")
      .select("id, org_id, role, expires_at, used_at, revoked_at, organizations(name)")
      .eq("token_hash", hash)
      .maybeSingle();
    if (error) throw new Error(error.message);
    assertInviteUsable(
      inv ? { expiresAt: inv.expires_at, usedAt: inv.used_at, revokedAt: inv.revoked_at } : null,
    );
    const invite = inv!;
    const orgName = (invite as any).organizations?.name ?? "the organization";

    const { data: existing } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("org_id", invite.org_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existing) return { orgId: invite.org_id, orgName, alreadyMember: true };

    // Claim the invite first so a link can never be used twice, even concurrently.
    const { data: claimed, error: claimErr } = await supabaseAdmin
      .from("org_invites")
      .update({ used_at: new Date().toISOString(), used_by: context.userId })
      .eq("id", invite.id)
      .is("used_at", null)
      .is("revoked_at", null)
      .select("id");
    if (claimErr) throw new Error(claimErr.message);
    if (!claimed?.length) throw new Error("This invite link was already used.");

    const { error: roleErr } = await supabaseAdmin.from("user_roles").insert({
      id: newId(),
      org_id: invite.org_id,
      user_id: context.userId,
      role: invite.role,
    });
    if (roleErr) throw new Error(roleErr.message);
    await writeAudit({
      org_id: invite.org_id,
      user_id: context.userId,
      action: "join",
      entity: "user_role",
      entity_id: context.userId,
      after: { role: invite.role, inviteId: invite.id },
    });
    return { orgId: invite.org_id, orgName, alreadyMember: false };
  });

// ---------- Remove, leave, transfer, delete ----------

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ orgId: uuid, userId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const leaving = data.userId === userId;
    await assertCan(supabase, userId, data.orgId, leaving ? "read" : "manage_members");
    const [members, org] = await Promise.all([
      orgMembers(supabase, data.orgId),
      orgRow(supabase, data.orgId),
    ]);
    assertCanRemove(members, data.userId, org.created_by);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("org_id", data.orgId)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    await writeAudit({
      org_id: data.orgId,
      user_id: userId,
      action: leaving ? "leave" : "remove",
      entity: "user_role",
      entity_id: data.userId,
      before: { role: members.find((m) => m.userId === data.userId)?.role },
    });
    return { ok: true };
  });

export const transferOwnership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ orgId: uuid, toUserId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [members, org] = await Promise.all([
      orgMembers(supabase, data.orgId),
      orgRow(supabase, data.orgId),
    ]);
    assertCanTransfer(members, userId, org.created_by, data.toUserId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("organizations")
      .update({ created_by: data.toUserId })
      .eq("id", data.orgId)
      .eq("created_by", userId);
    if (error) throw new Error(error.message);
    await writeAudit({
      org_id: data.orgId,
      user_id: userId,
      action: "transfer_ownership",
      entity: "organization",
      entity_id: data.orgId,
      before: { owner: userId },
      after: { owner: data.toUserId },
    });
    return { ok: true };
  });

export const deleteOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ orgId: uuid, confirmName: z.string().max(200) }).parse(input))
  .handler(async ({ data, context }) => {
    const org = await orgRow(context.supabase, data.orgId);
    assertCanDeleteOrg(context.userId, org.created_by, org.name, data.confirmName);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Keep a record outside the org (its own audit rows go with it).
    const { error: logErr } = await supabaseAdmin.from("deleted_organizations").insert({
      id: newId(),
      org_id: org.id,
      name: org.name,
      deleted_by: context.userId,
    });
    if (logErr) throw new Error(logErr.message);
    const { error } = await supabaseAdmin.from("organizations").delete().eq("id", org.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
