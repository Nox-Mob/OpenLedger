// Signed backups: pure, storage-free. Uses only WebCrypto (available in browsers, Node,
// Node and the worker runtime).
//
// Row fingerprints show *which* rows changed; they prove nothing alone, because anyone
// can recompute them. The Ed25519 signature over the manifest is what proves the file
// is unchanged since a key holder signed it.
import { assertBalancedEntries, LedgerRuleError } from "./ledger";
import { APP_VERSION } from "../version";

export const BACKUP_FORMAT = "openledgerapp-backup";
export const BACKUP_VERSION = 3;
/** Versions this build can still restore. v2 has no appVersion or attachments. */
export const SUPPORTED_BACKUP_VERSIONS: readonly number[] = [2, 3];
export const MAX_BACKUP_BYTES = 25 * 1024 * 1024;

type Row = Record<string, unknown>;

/** Restore order; every table's references point only at tables earlier in this list. */
export const TABLES = [
  "accounts",
  "categories",
  "tags",
  "projects",
  "funds",
  "transactions",
  "entries",
  "transaction_tags",
  "import_batches",
  "import_profiles",
  "bank_transactions",
  "reconciliations",
  "period_closes",
  "pledges",
  "pledge_payments",
  "budgets",
  "user_roles",
  "audit_log",
] as const;
export type BackupTable = (typeof TABLES)[number];

/** Columns that point at other backed-up records (remapped to new IDs on restore). */
export const REFS: Partial<Record<BackupTable, Record<string, BackupTable>>> = {
  entries: {
    transaction_id: "transactions",
    account_id: "accounts",
    category_id: "categories",
    project_id: "projects",
    fund_id: "funds",
    reconciliation_id: "reconciliations",
  },
  transaction_tags: { transaction_id: "transactions", tag_id: "tags" },
  import_batches: { account_id: "accounts" },
  import_profiles: { account_id: "accounts" },
  bank_transactions: {
    account_id: "accounts",
    batch_id: "import_batches",
    transaction_id: "transactions",
  },
  reconciliations: { account_id: "accounts", batch_id: "import_batches" },
  period_closes: { transaction_id: "transactions" },
  pledges: { fund_id: "funds", transaction_id: "transactions" },
  pledge_payments: { pledge_id: "pledges", transaction_id: "transactions" },
  budgets: { account_id: "accounts" },
};

export interface TableDigest {
  count: number;
  chain: string;
}
export interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  version: number;
  /** v3+: app version that wrote the file. */
  appVersion?: string;
  exportedAt: string;
  orgId: string;
  orgName: string;
  organizationHash: string;
  tables: Record<string, TableDigest>;
  publicKey: string; // base64url raw Ed25519 public key
  installFingerprint: string;
  /** v3+: reserved for future receipt attachments (digests only); always empty for now. */
  attachments?: AttachmentDigest[];
}
export interface AttachmentDigest {
  id: string;
  sha256: string;
  bytes: number;
}
export interface SignedBackup {
  manifest: BackupManifest;
  signature: string; // base64url
  organization: Row;
  tables: Record<string, Row[]>;
}

// ---------- encoding ----------

/** Deterministic JSON: object keys sorted at every level. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Row;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
    .join(",")}}`;
}

const enc = new TextEncoder();
function hex(buf: ArrayBuffer) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
export async function sha256(text: string | Uint8Array): Promise<string> {
  const data = typeof text === "string" ? enc.encode(text) : text;
  return hex(await crypto.subtle.digest("SHA-256", data as BufferSource));
}

export function rowFingerprint(row: Row) {
  return sha256(canonical(row));
}

/** Chained table fingerprint: order, additions and removals all change it. */
export async function tableDigest(name: string, rows: Row[]): Promise<TableDigest> {
  let chain = await sha256(`table:${name}`);
  for (const r of rows) chain = await sha256(chain + (await rowFingerprint(r)));
  return { count: rows.length, chain };
}

// ---------- keys ----------

export interface SigningKeys {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicRaw: string; // base64url
  fingerprint: string;
}

const PKCS8_ED25519_PREFIX = new Uint8Array([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
]);

export async function installFingerprint(publicRaw: string) {
  return (await sha256(fromB64url(publicRaw))).slice(0, 16).match(/.{4}/g)!.join("-");
}

/** Derive a stable Ed25519 key pair from a secret seed string (32 bytes via SHA-256). */
export async function keysFromSeed(seed: string): Promise<SigningKeys> {
  if (!seed || seed.length < 32)
    throw new Error("Backup signing is not configured on this server.");
  const raw = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(seed)));
  const pkcs8 = new Uint8Array(PKCS8_ED25519_PREFIX.length + 32);
  pkcs8.set(PKCS8_ED25519_PREFIX);
  pkcs8.set(raw, PKCS8_ED25519_PREFIX.length);
  const privateKey = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, true, [
    "sign",
  ]);
  const jwk = await crypto.subtle.exportKey("jwk", privateKey);
  const publicRaw = jwk.x!;
  const publicKey = await importPublicKey(publicRaw);
  return { privateKey, publicKey, publicRaw, fingerprint: await installFingerprint(publicRaw) };
}

function importPublicKey(publicRaw: string) {
  return crypto.subtle.importKey(
    "raw",
    fromB64url(publicRaw) as BufferSource,
    { name: "Ed25519" },
    true,
    ["verify"],
  );
}

// ---------- sign / verify ----------

export async function signBackup(
  keys: SigningKeys,
  organization: Row,
  tables: Record<string, Row[]>,
  exportedAt: string,
): Promise<SignedBackup> {
  const digests: Record<string, TableDigest> = {};
  for (const t of TABLES) digests[t] = await tableDigest(t, tables[t] ?? []);
  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    appVersion: APP_VERSION,
    exportedAt,
    orgId: String(organization["id"]),
    orgName: String(organization["name"]),
    organizationHash: await rowFingerprint(organization),
    tables: digests,
    publicKey: keys.publicRaw,
    installFingerprint: keys.fingerprint,
    attachments: [],
  };
  const sig = await crypto.subtle.sign(
    { name: "Ed25519" },
    keys.privateKey,
    enc.encode(canonical(manifest)),
  );
  return { manifest, signature: b64url(sig), organization, tables };
}

export class BackupRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupRejected";
  }
}

export interface VerifiedBackup {
  backup: SignedBackup;
  sameInstall: boolean;
  installFingerprint: string;
  counts: Record<string, number>;
}

/** Check format, signature and every fingerprint. Throws BackupRejected on any mismatch. */
export async function verifyBackup(
  input: unknown,
  localPublicRaw: string,
): Promise<VerifiedBackup> {
  const b = input as SignedBackup;
  if (!b || typeof b !== "object" || !b.manifest || typeof b.signature !== "string")
    throw new BackupRejected(
      "This file is not a signed OpenLedgerApp backup. Backups made before signing was added can't be restored. Download a new backup.",
    );
  const m = b.manifest;
  if (m.format !== BACKUP_FORMAT) throw new BackupRejected("This is not an OpenLedgerApp backup.");
  if (!SUPPORTED_BACKUP_VERSIONS.includes(m.version))
    throw new BackupRejected(`Unsupported backup version ${String(m.version)}.`);
  if (m.version >= 3 && (!Array.isArray(m.attachments) || typeof m.appVersion !== "string"))
    throw new BackupRejected("The backup manifest is incomplete.");
  if (m.attachments && m.attachments.length > 0)
    throw new BackupRejected(
      "This backup contains attachments, which this version can't restore yet.",
    );
  if (typeof m.publicKey !== "string" || !m.publicKey)
    throw new BackupRejected("The backup has no signing key.");

  let ok: boolean;
  try {
    ok = await crypto.subtle.verify(
      { name: "Ed25519" },
      await importPublicKey(m.publicKey),
      fromB64url(b.signature) as BufferSource,
      enc.encode(canonical(m)),
    );
  } catch {
    ok = false;
  }
  if (!ok)
    throw new BackupRejected(
      "The backup's signature doesn't match. It was changed after it was created.",
    );
  if ((await installFingerprint(m.publicKey)) !== m.installFingerprint)
    throw new BackupRejected("The backup's install fingerprint doesn't match its key.");

  if ((await rowFingerprint(b.organization)) !== m.organizationHash)
    throw new BackupRejected("The organization details were changed after the backup was created.");
  const counts: Record<string, number> = {};
  for (const t of TABLES) {
    const rows = b.tables?.[t];
    if (!Array.isArray(rows)) throw new BackupRejected(`The backup is missing the ${t} table.`);
    const d = await tableDigest(t, rows);
    const expected = m.tables[t];
    if (!expected || d.chain !== expected.chain || d.count !== expected.count)
      throw new BackupRejected(
        `Records in "${t.replace(/_/g, " ")}" were changed, added or removed after the backup was created.`,
      );
    counts[t] = rows.length;
  }
  return {
    backup: b,
    sameInstall: m.publicKey === localPublicRaw,
    installFingerprint: m.installFingerprint,
    counts,
  };
}

// ---------- restore planning ----------

export type IdMap = Map<string, string>;

/**
 * Give every record a new ID and rewrite references. Throws if a reference points at a
 * record that isn't in the backup (a sign of a hand-built file).
 */
export function remapTables(
  tables: Record<string, Row[]>,
  newId: () => string,
): { tables: Record<string, Row[]>; ids: Record<BackupTable, IdMap> } {
  const ids = Object.fromEntries(TABLES.map((t) => [t, new Map<string, string>()])) as Record<
    BackupTable,
    IdMap
  >;
  for (const t of TABLES)
    for (const r of tables[t] ?? []) if (typeof r["id"] === "string") ids[t].set(r["id"], newId());
  const out: Record<string, Row[]> = {};
  for (const t of TABLES) {
    const refs = REFS[t] ?? {};
    out[t] = (tables[t] ?? []).map((r) => {
      const n: Row = { ...r };
      if (typeof r["id"] === "string") n["id"] = ids[t].get(r["id"]);
      for (const [col, target] of Object.entries(refs)) {
        const v = r[col];
        if (v === null || v === undefined) continue;
        const mapped = ids[target].get(String(v));
        if (!mapped)
          throw new LedgerRuleError(
            "restore_ref",
            `A ${t.replace(/_/g, " ")} record points at a missing ${target.replace(/_/g, " ")} record.`,
          );
        n[col] = mapped;
      }
      return n;
    });
  }
  return { tables: out, ids };
}

/** Re-run the bookkeeping rules over the restored data before anything is written. */
export function checkRestorable(tables: Record<string, Row[]>): void {
  const accounts = new Map((tables["accounts"] ?? []).map((a) => [String(a["id"]), a]));
  const byTx = new Map<string, { accountId: string; amountCents: number }[]>();
  for (const e of tables["entries"] ?? []) {
    const amount = Number(e["amount_cents"]);
    const tx = String(e["transaction_id"]);
    if (!accounts.has(String(e["account_id"])))
      throw new LedgerRuleError(
        "restore_ref",
        "An entry uses an account that isn't in the backup.",
      );
    const list = byTx.get(tx) ?? [];
    list.push({ accountId: String(e["account_id"]), amountCents: amount });
    byTx.set(tx, list);
  }
  for (const t of tables["transactions"] ?? []) {
    const lines = byTx.get(String(t["id"])) ?? [];
    if (t["status"] === "void" && lines.length === 0) continue;
    try {
      assertBalancedEntries(lines);
    } catch (err) {
      throw new LedgerRuleError(
        "restore_balance",
        `Transaction "${String(t["description"])}" on ${String(t["transaction_date"])}: ${(err as Error).message}`,
      );
    }
  }
  // Bank evidence must link to a matching line on the same account.
  for (const b of tables["bank_transactions"] ?? []) {
    if (!b["transaction_id"]) continue;
    const lines = byTx.get(String(b["transaction_id"])) ?? [];
    if (
      !lines.some(
        (l) =>
          l.accountId === String(b["account_id"]) && l.amountCents === Number(b["amount_cents"]),
      )
    )
      throw new LedgerRuleError(
        "restore_bank_link",
        "A bank row is linked to a transaction with a different amount or account.",
      );
  }
}
