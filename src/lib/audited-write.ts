// Save a change and its history entry in one database transaction (audited_write RPC).
// Use the caller's RLS client for normal writes; pass the admin client plus `asUser` only
// for the few service-role paths (invite claim, member removal, ownership transfer).
import { newId } from "./domain/ledger";
import { DuplicateKeyError } from "./ports";

export type AuditKind = "change" | "ledger" | "system";

export interface WriteOp {
  table: string;
  op: "insert" | "update" | "delete";
  /** insert: one row or many; update: columns to set. */
  values?: Record<string, unknown> | Record<string, unknown>[];
  /** Exact matches (null matches IS NULL). org_id is always forced to the org. */
  match?: Record<string, unknown>;
  /** Column IN (...) filters. */
  in?: Record<string, readonly unknown[]>;
  /** insert only: skip rows that hit a unique constraint. */
  conflict?: "nothing";
  /** Fail (and roll back everything) when fewer rows are affected. */
  minRows?: number;
  minRowsMessage?: string;
}

export interface AuditEntry {
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  kind?: AuditKind;
}

export interface WriteResult {
  count: number;
  ids: string[];
}

// Loose on purpose: works with both the typed user client and the admin client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RpcClient = { rpc: (...args: any[]) => any };

export function toAuditJson(a: AuditEntry) {
  return {
    id: newId(),
    action: a.action,
    entity: a.entity,
    entity_id: a.entityId ?? null,
    before: a.before ?? null,
    after: a.after ?? null,
    kind: a.kind ?? "change",
  };
}

export function toOpJson(o: WriteOp) {
  return {
    table: o.table,
    op: o.op,
    ...(o.values !== undefined ? { values: o.values } : {}),
    ...(o.match ? { match: o.match } : {}),
    ...(o.in ? { in: o.in } : {}),
    ...(o.conflict ? { conflict: o.conflict } : {}),
    ...(o.minRows !== undefined ? { min_rows: o.minRows } : {}),
    ...(o.minRowsMessage ? { min_rows_message: o.minRowsMessage } : {}),
  };
}

export async function auditedWrite(
  db: RpcClient,
  orgId: string,
  ops: WriteOp[],
  audit: AuditEntry | AuditEntry[],
  asUser?: string,
): Promise<WriteResult[]> {
  const entries = Array.isArray(audit) ? audit : [audit];
  const { data, error } = (await db.rpc("audited_write", {
    p_org: orgId,
    p_ops: ops.map(toOpJson),
    p_audit: entries.map(toAuditJson),
    ...(asUser ? { p_user: asUser } : {}),
  })) as { data: unknown; error: { message: string } | null };
  if (error) {
    if (/duplicate key/i.test(error.message)) {
      throw new DuplicateKeyError(error.message);
    }
    throw new Error(error.message);
  }
  return (data ?? []) as WriteResult[];
}
