// In-memory adapter for the repository ports. Used by tests today and as the
// reference behavior a future SQLite/desktop adapter must match.
import type {
  Account,
  AuditEvent,
  BankTransaction,
  Organization,
  Reconciliation,
  Role,
  Transaction,
} from "@/lib/domain/models";
import { DuplicateKeyError, type Repositories } from "@/lib/ports";

export interface MemoryStore {
  orgs: Map<string, Organization>;
  roles: { userId: string; orgId: string; role: Role }[];
  accounts: Map<string, Account>;
  transactions: Map<string, Transaction>;
  bank: Map<string, BankTransaction>;
  reconciliations: Map<string, Reconciliation>;
  audit: AuditEvent[];
}

export function createMemoryStore(): MemoryStore {
  return {
    orgs: new Map(),
    roles: [],
    accounts: new Map(),
    transactions: new Map(),
    bank: new Map(),
    reconciliations: new Map(),
    audit: [],
  };
}

const NOW = "2026-01-01T00:00:00.000Z";

export function createMemoryRepositories(s: MemoryStore = createMemoryStore()): Repositories & {
  store: MemoryStore;
} {
  const allEntries = () => [...s.transactions.values()].flatMap((t) => t.entries);
  return {
    store: s,
    orgs: {
      async get(id) {
        return s.orgs.get(id) ?? null;
      },
      async listForUser(userId) {
        return s.roles
          .filter((r) => r.userId === userId && s.orgs.has(r.orgId))
          .map((r) => ({ ...s.orgs.get(r.orgId)!, role: r.role }));
      },
      async create(org) {
        if (s.orgs.has(org.id)) throw new DuplicateKeyError();
        s.orgs.set(org.id, { ...org, createdAt: NOW });
        s.roles.push({ userId: org.createdBy, orgId: org.id, role: "admin" });
      },
      async updateSettings(id, patch) {
        const o = s.orgs.get(id);
        if (o) s.orgs.set(id, { ...o, ...patch });
      },
      async setBooksLockedThrough(id, date) {
        const o = s.orgs.get(id);
        if (o) s.orgs.set(id, { ...o, booksLockedThrough: date });
      },
      async roleOf(userId, orgId) {
        return s.roles.find((r) => r.userId === userId && r.orgId === orgId)?.role ?? null;
      },
      async listMembers(orgId) {
        return s.roles
          .filter((r) => r.orgId === orgId)
          .map((r) => ({ ...r, displayName: null }));
      },
    },
    accounts: {
      async list(orgId, opts) {
        return [...s.accounts.values()].filter(
          (a) => a.orgId === orgId && (opts?.includeArchived || a.isActive),
        );
      },
      async getMany(orgId, ids) {
        return ids.map((id) => s.accounts.get(id)).filter((a): a is Account => !!a && a.orgId === orgId);
      },
      async create(list) {
        for (const a of list) {
          if (s.accounts.has(a.id)) throw new DuplicateKeyError();
          s.accounts.set(a.id, { ...a, createdAt: NOW });
        }
      },
      async rename(orgId, id, name) {
        const a = s.accounts.get(id);
        if (a?.orgId === orgId) s.accounts.set(id, { ...a, name });
      },
      async setActive(orgId, id, isActive) {
        const a = s.accounts.get(id);
        if (a?.orgId === orgId) s.accounts.set(id, { ...a, isActive });
      },
      async hasOpeningBalance(orgId, accountId) {
        return [...s.transactions.values()].some(
          (t) =>
            t.orgId === orgId &&
            t.source === "opening_balance" &&
            t.status === "posted" &&
            t.entries.some((e) => e.accountId === accountId),
        );
      },
    },
    transactions: {
      async post(tx) {
        if (s.transactions.has(tx.id)) throw new DuplicateKeyError();
        if (
          tx.idempotencyKey &&
          [...s.transactions.values()].some(
            (t) => t.orgId === tx.orgId && t.idempotencyKey === tx.idempotencyKey,
          )
        )
          throw new DuplicateKeyError("idempotency_key");
        s.transactions.set(tx.id, {
          id: tx.id,
          orgId: tx.orgId,
          transactionDate: tx.transactionDate,
          postedDate: tx.postedDate,
          description: tx.description,
          source: tx.source,
          status: "posted",
          createdBy: tx.createdBy,
          idempotencyKey: tx.idempotencyKey,
          createdAt: NOW,
          tagIds: tx.tagIds ?? [],
          entries: tx.entries.map((e) => ({
            id: e.id,
            transactionId: tx.id,
            accountId: e.accountId,
            amountCents: e.amountCents,
            categoryId: e.categoryId ?? null,
            projectId: e.projectId ?? null,
            fundId: e.fundId ?? null,
            memo: e.memo ?? null,
            reconciliationId: null,
          })),
        });
      },
      async findByIdempotencyKey(orgId, key) {
        for (const t of s.transactions.values())
          if (t.orgId === orgId && t.idempotencyKey === key) return t.id;
        return null;
      },
      async get(orgId, id) {
        const t = s.transactions.get(id);
        return t && t.orgId === orgId ? structuredClone(t) : null;
      },
      async list(orgId, opts) {
        return [...s.transactions.values()]
          .filter(
            (t) =>
              t.orgId === orgId &&
              (opts?.includeVoid || t.status === "posted") &&
              (!opts?.from || t.transactionDate >= opts.from) &&
              (!opts?.to || t.transactionDate <= opts.to) &&
              (!opts?.accountId || t.entries.some((e) => e.accountId === opts.accountId)),
          )
          .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate))
          .slice(0, opts?.limit ?? 100);
      },
      async markVoid(orgId, id) {
        const t = s.transactions.get(id);
        if (!t || t.orgId !== orgId || t.status !== "posted") return false;
        t.status = "void";
        return true;
      },
      async clearReconciliation(ids) {
        for (const e of allEntries()) if (ids.includes(e.id)) e.reconciliationId = null;
      },
      async ledgerRows(orgId, opts) {
        return [...s.transactions.values()]
          .filter(
            (t) =>
              t.orgId === orgId &&
              t.status === "posted" &&
              t.source !== "closing" &&
              (!opts?.to || t.transactionDate <= opts.to),
          )
          .flatMap((t) =>
            t.entries.map((e) => {
              const a = s.accounts.get(e.accountId)!;
              return {
                amountCents: e.amountCents,
                accountId: e.accountId,
                accountName: a.name,
                accountType: a.type,
                projectId: e.projectId,
                transactionDate: t.transactionDate,
              };
            }),
          );
      },
    },
    bank: {
      async insertMany(rows) {
        let inserted = 0;
        let duplicates = 0;
        for (const r of rows) {
          const dup = [...s.bank.values()].some(
            (b) =>
              b.accountId === r.accountId &&
              (r.externalId
                ? b.externalId === r.externalId
                : b.fingerprint === r.fingerprint && b.rowSeq === r.rowSeq),
          );
          if (dup) duplicates++;
          else {
            s.bank.set(r.id, { ...r, transactionId: null, needsReview: false });
            inserted++;
          }
        }
        return { inserted, duplicates };
      },
      async get(orgId, id) {
        const b = s.bank.get(id);
        return b && b.orgId === orgId ? { ...b } : null;
      },
      async listUnmatched(orgId, accountId) {
        return [...s.bank.values()].filter(
          (b) => b.orgId === orgId && !b.transactionId && (!accountId || b.accountId === accountId),
        );
      },
      async claim(orgId, id, transactionId) {
        const b = s.bank.get(id);
        if (!b || b.orgId !== orgId || b.transactionId) return false;
        b.transactionId = transactionId;
        b.needsReview = false;
        return true;
      },
      async unlinkTransaction(orgId, transactionId) {
        let n = 0;
        for (const b of s.bank.values())
          if (b.orgId === orgId && b.transactionId === transactionId) {
            b.transactionId = null;
            n++;
          }
        return n;
      },
    },
    reconciliations: {
      async start(r) {
        s.reconciliations.set(r.id, {
          id: r.id,
          orgId: r.orgId,
          accountId: r.accountId,
          periodStart: r.periodStart,
          periodEnd: r.periodEnd,
          beginningBalanceCents: r.beginningBalanceCents,
          endingBalanceCents: r.endingBalanceCents,
          mode: r.mode,
          status: "in_progress",
          batchId: r.batchId,
          completedBy: null,
          completedAt: null,
        });
      },
      async get(orgId, id) {
        const r = s.reconciliations.get(id);
        return r && r.orgId === orgId ? { ...r } : null;
      },
      async list(orgId, accountId) {
        return [...s.reconciliations.values()].filter(
          (r) => r.orgId === orgId && (!accountId || r.accountId === accountId),
        );
      },
      async setTicked(rid, ids, ticked) {
        for (const e of allEntries()) if (ids.includes(e.id)) e.reconciliationId = ticked ? rid : null;
      },
      async clearedTotalCents(rid) {
        return allEntries()
          .filter((e) => e.reconciliationId === rid)
          .reduce((a, e) => a + e.amountCents, 0);
      },
      async finish(orgId, id, userId) {
        const r = s.reconciliations.get(id);
        if (r?.orgId === orgId) Object.assign(r, { status: "completed", completedBy: userId, completedAt: NOW });
      },
      async reopen(orgId, id) {
        const r = s.reconciliations.get(id);
        if (r?.orgId === orgId) Object.assign(r, { status: "in_progress", completedBy: null, completedAt: null });
      },
    },
    audit: {
      async append(e) {
        s.audit.push(e);
      },
    },
  };
}
