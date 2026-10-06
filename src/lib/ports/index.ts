// Repository ports: the only way application code may read or write ledger data.
// Adapters (Supabase/Postgres now, SQLite/Tauri later) implement these.
// Contract for every adapter:
// - Callers pass app-generated IDs (newId()); adapters never invent IDs.
// - Callers run src/lib/domain rules first; adapters may also enforce them (DB triggers).
// - Adapters throw on storage errors; `DuplicateKeyError` signals an idempotency/unique hit.
// - Every method is scoped by orgId; cloud adapters additionally rely on RLS.

import type {
  Account,
  AccountType,
  AuditEvent,
  BankTransaction,
  Id,
  IsoDate,
  Member,
  Organization,
  Reconciliation,
  ReconcileMode,
  Role,
  Transaction,
  TransactionSource,
} from "../domain/models";

export class DuplicateKeyError extends Error {
  constructor(message = "Duplicate key") {
    super(message);
    this.name = "DuplicateKeyError";
  }
}

export interface OrgRepository {
  get(orgId: Id): Promise<Organization | null>;
  listForUser(userId: Id): Promise<(Organization & { role: Role })[]>;
  create(org: Omit<Organization, "createdAt">): Promise<void>;
  updateSettings(
    orgId: Id,
    patch: Partial<
      Pick<
        Organization,
        | "name"
        | "currency"
        | "fiscalYearStartMonth"
        | "timezone"
        | "terminology"
        | "termOverrides"
        | "aiPdfEnabled"
      >
    >,
  ): Promise<void>;
  setBooksLockedThrough(orgId: Id, date: IsoDate | null): Promise<void>;
  roleOf(userId: Id, orgId: Id): Promise<Role | null>;
  listMembers(orgId: Id): Promise<Member[]>;
}

export interface AccountRepository {
  list(orgId: Id, opts?: { includeArchived?: boolean }): Promise<Account[]>;
  getMany(orgId: Id, ids: Id[]): Promise<Account[]>;
  create(accounts: Omit<Account, "createdAt">[]): Promise<void>;
  rename(orgId: Id, id: Id, name: string): Promise<void>;
  setActive(orgId: Id, id: Id, isActive: boolean): Promise<void>;
  hasOpeningBalance(orgId: Id, accountId: Id): Promise<boolean>;
}

export interface NewTransaction {
  id: Id;
  orgId: Id;
  transactionDate: IsoDate;
  postedDate: IsoDate | null;
  description: string;
  source: Exclude<TransactionSource, "closing">;
  createdBy: Id;
  idempotencyKey: string | null;
  entries: {
    id: Id;
    accountId: Id;
    amountCents: number;
    categoryId?: Id | null;
    projectId?: Id | null;
    fundId?: Id | null;
    memo?: string | null;
  }[];
  tagIds?: Id[];
}

export interface TransactionRepository {
  /** Writes header + entries atomically (or compensates). Throws DuplicateKeyError on idempotency hit. */
  post(tx: NewTransaction): Promise<void>;
  findByIdempotencyKey(orgId: Id, key: string): Promise<Id | null>;
  get(orgId: Id, id: Id): Promise<Transaction | null>;
  list(
    orgId: Id,
    opts?: { accountId?: Id; from?: IsoDate; to?: IsoDate; limit?: number; includeVoid?: boolean },
  ): Promise<Transaction[]>;
  /** posted → void only. Returns false if it was already void (lost a race). */
  markVoid(orgId: Id, id: Id): Promise<boolean>;
  clearReconciliation(entryIds: Id[]): Promise<void>;
  /** Signed ledger rows for report math (posted only, legacy 'closing' excluded). */
  ledgerRows(
    orgId: Id,
    opts?: { to?: IsoDate },
  ): Promise<
    {
      amountCents: number;
      accountId: Id;
      accountName: string;
      accountType: AccountType;
      projectId: Id | null;
      transactionDate: IsoDate;
    }[]
  >;
}

export interface BankTransactionRepository {
  insertMany(
    rows: Omit<BankTransaction, "transactionId" | "needsReview">[],
  ): Promise<{ inserted: number; duplicates: number }>;
  get(orgId: Id, id: Id): Promise<BankTransaction | null>;
  listUnmatched(orgId: Id, accountId?: Id): Promise<BankTransaction[]>;
  /** Links only if still unlinked; false means someone else claimed it. */
  claim(orgId: Id, id: Id, transactionId: Id): Promise<boolean>;
  unlinkTransaction(orgId: Id, transactionId: Id): Promise<number>;
}

export interface ReconciliationRepository {
  start(r: {
    id: Id;
    orgId: Id;
    accountId: Id;
    periodStart: IsoDate;
    periodEnd: IsoDate;
    beginningBalanceCents: number;
    endingBalanceCents: number;
    mode: ReconcileMode;
    batchId: Id | null;
    createdBy: Id;
  }): Promise<void>;
  get(orgId: Id, id: Id): Promise<Reconciliation | null>;
  list(orgId: Id, accountId?: Id): Promise<Reconciliation[]>;
  setTicked(reconciliationId: Id, entryIds: Id[], ticked: boolean): Promise<void>;
  clearedTotalCents(reconciliationId: Id): Promise<number>;
  finish(orgId: Id, id: Id, userId: Id): Promise<void>;
  reopen(orgId: Id, id: Id): Promise<void>;
}

export interface AuditRepository {
  /** Append-only. Cloud adapter writes with the service role. */
  append(event: AuditEvent): Promise<void>;
}

/** Everything a request needs, built per request by the active adapter. */
export interface Repositories {
  orgs: OrgRepository;
  accounts: AccountRepository;
  transactions: TransactionRepository;
  bank: BankTransactionRepository;
  reconciliations: ReconciliationRepository;
  audit: AuditRepository;
}
