// Member lifecycle rules. Pure TypeScript so they can be unit tested without a database.
import type { Role } from "./models";

export class MemberRuleError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "MemberRuleError";
  }
}

export interface InviteState {
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
}

export type InviteStatus = "active" | "used" | "revoked" | "expired";

export function inviteStatus(invite: InviteState, now: Date = new Date()): InviteStatus {
  if (invite.revokedAt) return "revoked";
  if (invite.usedAt) return "used";
  if (new Date(invite.expiresAt).getTime() <= now.getTime()) return "expired";
  return "active";
}

export function assertInviteUsable(invite: InviteState | null, now: Date = new Date()) {
  if (!invite) throw new MemberRuleError("invite_missing", "This invite link is not valid.");
  const s = inviteStatus(invite, now);
  if (s === "used") throw new MemberRuleError("invite_used", "This invite link was already used.");
  if (s === "revoked") throw new MemberRuleError("invite_revoked", "This invite link was revoked.");
  if (s === "expired") throw new MemberRuleError("invite_expired", "This invite link has expired.");
}

export interface MemberRef {
  userId: string;
  role: Role;
}

/** Removing someone (or leaving) must keep at least one admin and never remove the owner. */
export function assertCanRemove(members: MemberRef[], targetUserId: string, ownerId: string) {
  const target = members.find((m) => m.userId === targetUserId);
  if (!target) throw new MemberRuleError("not_member", "That person is not a member.");
  if (targetUserId === ownerId) {
    throw new MemberRuleError(
      "owner",
      "The owner cannot be removed. Transfer ownership to another admin first.",
    );
  }
  if (target.role === "admin" && members.filter((m) => m.role === "admin").length <= 1) {
    throw new MemberRuleError("last_admin", "An organization must keep at least one admin.");
  }
}

export function assertCanTransfer(
  members: MemberRef[],
  callerId: string,
  ownerId: string,
  to: string,
) {
  if (callerId !== ownerId) {
    throw new MemberRuleError("not_owner", "Only the owner can transfer ownership.");
  }
  if (to === ownerId) throw new MemberRuleError("same_owner", "That person is already the owner.");
  const target = members.find((m) => m.userId === to);
  if (!target || target.role !== "admin") {
    throw new MemberRuleError("not_admin", "Ownership can only go to another admin.");
  }
}

export function assertCanDeleteOrg(
  callerId: string,
  ownerId: string,
  orgName: string,
  confirmName: string,
) {
  if (callerId !== ownerId) {
    throw new MemberRuleError("not_owner", "Only the owner can delete the organization.");
  }
  if (confirmName.trim() !== orgName.trim()) {
    throw new MemberRuleError("confirm_mismatch", "Type the organization name exactly to confirm.");
  }
}
