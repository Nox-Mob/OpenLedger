// Audit rows are written only by trusted server code (users have no INSERT right on audit_log).
// Call only from server-function handlers, after the caller is authenticated and authorized.
export interface AuditRow {
  org_id: string;
  user_id: string;
  action: string;
  entity: string;
  entity_id?: string | null;
  before?: unknown;
  after?: unknown;
}

export async function writeAudit(row: AuditRow) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("audit_log").insert(row as any);
  if (error) console.error("[audit] failed to record", row.action, error.message);
  return { error };
}
