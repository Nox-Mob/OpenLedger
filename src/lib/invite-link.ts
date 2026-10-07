// Browser-safe helpers for invite links (no server imports).
export const PENDING_INVITE_KEY = "openledgerapp-pending-invite";

export function inviteUrl(token: string) {
  return `${window.location.origin}/invite/${token}`;
}
