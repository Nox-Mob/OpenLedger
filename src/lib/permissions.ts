// Role authorization matrix — the single source of truth for who can do what.
// Server functions call assertCan() after requireSupabaseAuth; the database
// mirrors the same rules in RLS policies and triggers so nothing slips around.

export type OrgRole = "admin" | "member" | "viewer";

export type OrgAction =
  | "read" // view books, reports, exports
  | "write" // post/void transactions, import, reconcile
  | "reopen_reconciliation"
  | "manage_settings" // org settings, account setup, archive accounts
  | "manage_members" // change member roles
  | "close_books"; // lock books, year-end close, unlock

const MATRIX: Record<OrgAction, readonly OrgRole[]> = {
  read: ["admin", "member", "viewer"],
  write: ["admin", "member"],
  reopen_reconciliation: ["admin"],
  manage_settings: ["admin"],
  manage_members: ["admin"],
  close_books: ["admin"],
};

export function can(role: string | null | undefined, action: OrgAction): boolean {
  return !!role && (MATRIX[action] as readonly string[]).includes(role);
}

export class ForbiddenError extends Error {
  constructor(action: OrgAction) {
    super(`Your role doesn't allow this action (${action}). Ask an organization admin.`);
    this.name = "ForbiddenError";
  }
}

/** Look up the caller's role in an org and require it to allow `action`. */
export async function assertCan(
  supabase: any,
  userId: string,
  orgId: string,
  action: OrgAction,
): Promise<OrgRole> {
  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .maybeSingle();
  const role = roleRow?.role as OrgRole | undefined;
  if (!can(role, action)) throw new ForbiddenError(action);
  return role as OrgRole;
}
