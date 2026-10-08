import type { Db } from "@/lib/db";
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
import { auditedWrite } from "./audited-write";

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

async function orgMembers(supabase: Db, orgId: string): Promise<MemberRef[]> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .eq("org_id", orgId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ userId: r.user_id, role: r.role }));
}

async function orgRow(supabase: Db, orgId: string) {
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
    return (rows ?? []).map((r) => ({
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
    await auditedWrite(
      context.supabase,
      data.orgId,
      [
        {
          table: "org_invites",
          op: "insert",
          values: {
            id,
            token_hash: await sha256(token),
            role: data.role,
            created_by: context.userId,
            expires_at: expiresAt,
          },
        },
      ],
      {
        action: "create",
        entity: "invite",
        entityId: id,
        after: { role: data.role, expiresAt },
        kind: "system",
      },
    );
    // The raw token is returned once and never stored.
    return { id, token, expiresAt };
  });

export const revokeInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ orgId: uuid, inviteId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    await assertCan(context.supabase, context.userId, data.orgId, "manage_members");
    await auditedWrite(
      context.supabase,
      data.orgId,
      [
        {
          table: "org_invites",
          op: "update",
          values: { revoked_at: new Date().toISOString() },
          match: { id: data.inviteId, used_at: null },
        },
      ],
      { action: "revoke", entity: "invite", entityId: data.inviteId, kind: "system" },
    );
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
    const orgName = invite.organizations?.name ?? "the organization";

    const { data: existing } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("org_id", invite.org_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existing) return { orgId: invite.org_id, orgName, alreadyMember: true };

    // Claim the invite first so a link can never be used twice, even concurrently.
    // Claim, role grant and history are one transaction: all happen or none do.
    await auditedWrite(
      supabaseAdmin,
      invite.org_id,
      [
        {
          table: "org_invites",
          op: "update",
          values: { used_at: new Date().toISOString(), used_by: context.userId },
          match: { id: invite.id, used_at: null, revoked_at: null },
          minRows: 1,
          minRowsMessage: "This invite link was already used.",
        },
        {
          table: "user_roles",
          op: "insert",
          values: { id: newId(), user_id: context.userId, role: invite.role },
        },
      ],
      {
        action: "join",
        entity: "user_role",
        entityId: context.userId,
        after: { role: invite.role, inviteId: invite.id },
        kind: "system",
      },
      context.userId,
    );
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
    await auditedWrite(
      supabaseAdmin,
      data.orgId,
      [{ table: "user_roles", op: "delete", match: { user_id: data.userId } }],
      {
        action: leaving ? "leave" : "remove",
        entity: "user_role",
        entityId: data.userId,
        before: { role: members.find((m) => m.userId === data.userId)?.role },
        kind: "system",
      },
      userId,
    );
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
    await auditedWrite(
      supabaseAdmin,
      data.orgId,
      [
        {
          table: "organizations",
          op: "update",
          values: { created_by: data.toUserId },
          match: { created_by: userId },
          minRows: 1,
        },
      ],
      {
        action: "transfer_ownership",
        entity: "organization",
        entityId: data.orgId,
        before: { owner: userId },
        after: { owner: data.toUserId },
        kind: "system",
      },
      userId,
    );
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
    // cloud-only-write: per-user or service record, not organization books
    const { error: logErr } = await supabaseAdmin.from("deleted_organizations").insert({
      id: newId(),
      org_id: org.id,
      name: org.name,
      deleted_by: context.userId,
    });
    if (logErr) throw new Error(logErr.message);
    // cloud-only-write: per-user or service record, not organization books
    const { error } = await supabaseAdmin.from("organizations").delete().eq("id", org.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
