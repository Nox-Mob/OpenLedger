// Audit rows are written only by trusted server code (users have no INSERT right on audit_log).
// Call only from server-function handlers, after the caller is authenticated and authorized.
import { newId } from "./domain/ledger";

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
  const { error } = await supabaseAdmin.from("audit_log").insert({ id: newId(), ...row } as never);
  // A change without its history entry is not acceptable in accounting software:
  // fail loudly so the caller's request errors instead of reporting success.
  if (error) {
    console.error("[audit] failed to record", row.action, error.message);
    throw new Error(`The change could not be recorded in history: ${error.message}`);
  }
  return { error: null };
}
