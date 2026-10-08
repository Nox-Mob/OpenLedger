// Application services: accounting workflows written once against the repository ports.
// Server functions handle auth/permissions, then call these with the active adapter.
import {
  assertAccountsUsable,
  assertBalancedEntries,
  assertDateOpen,
  LedgerRuleError,
  newId,
  voidDecision,
} from "@/lib/domain/ledger";
import type { Id, IsoDate } from "@/lib/domain/models";
import { DuplicateKeyError, type NewTransaction, type Repositories } from "@/lib/ports";

async function checkAccountsAndDate(
  repos: Repositories,
  orgId: Id,
  accountIds: Id[],
  date: IsoDate,
) {
  const accounts = await repos.accounts.getMany(orgId, [...new Set(accountIds)]);
  assertAccountsUsable(orgId, accountIds, accounts);
  const org = await repos.orgs.get(orgId);
  if (!org) throw new LedgerRuleError("org_missing", "Organization not found.");
  assertDateOpen(date, org.booksLockedThrough);
}

export interface PostTransactionInput {
  orgId: Id;
  userId: Id;
  transactionDate: IsoDate;
  postedDate?: IsoDate | null | undefined;
  description: string;
  source: NewTransaction["source"];
  entries: Omit<NewTransaction["entries"][number], "id">[];
  tagIds?: Id[] | undefined;
  idempotencyKey?: string | null | undefined;
}

export async function postTransaction(
  repos: Repositories,
  input: PostTransactionInput,
): Promise<{ id: Id; duplicate?: true }> {
  assertBalancedEntries(input.entries);
  await checkAccountsAndDate(
    repos,
    input.orgId,
    input.entries.map((e) => e.accountId),
    input.transactionDate,
  );

  const key = input.idempotencyKey ?? null;
  if (key) {
    const prior = await repos.transactions.findByIdempotencyKey(input.orgId, key);
    if (prior) return { id: prior, duplicate: true };
  }

  const tx: NewTransaction = {
    id: newId(),
    orgId: input.orgId,
    transactionDate: input.transactionDate,
    postedDate: input.postedDate ?? null,
    description: input.description,
    source: input.source,
    createdBy: input.userId,
    idempotencyKey: key,
    entries: input.entries.map((e) => ({ ...e, id: newId() })),
    tagIds: input.tagIds,
  };
  const audit = {
    orgId: input.orgId,
    userId: input.userId,
    action: "create",
    entity: "transaction",
    entityId: tx.id,
    after: { description: tx.description, entries: tx.entries },
  };
  try {
    await repos.transactions.post(tx, audit);
  } catch (err) {
    // Lost a race with an identical concurrent submit: return the winner.
    if (err instanceof DuplicateKeyError && key) {
      const prior = await repos.transactions.findByIdempotencyKey(input.orgId, key);
      if (prior) return { id: prior, duplicate: true };
    }
    throw err;
  }
  return { id: tx.id };
}

export async function voidTransaction(
  repos: Repositories,
  input: { orgId: Id; userId: Id; transactionId: Id },
): Promise<{ ok: true; alreadyVoid?: true }> {
  const tx = await repos.transactions.get(input.orgId, input.transactionId);
  if (!tx) throw new Error("Transaction not found");
  if (tx.status === "void") return { ok: true, alreadyVoid: true };

  const reconIds = [...new Set(tx.entries.map((e) => e.reconciliationId).filter(Boolean))] as Id[];
  let lockedByCompleted = false;
  for (const rid of reconIds) {
    const r = await repos.reconciliations.get(input.orgId, rid);
    if (r?.status === "completed") lockedByCompleted = true;
  }
  voidDecision("posted", lockedByCompleted);

  const stamped = tx.entries.filter((e) => e.reconciliationId).map((e) => e.id);
  // Only flips posted -> void, so a concurrent void can't run the side effects twice.
  // The void and its history entry are saved together.
  const voided = await repos.transactions.markVoid(input.orgId, tx.id, {
    orgId: input.orgId,
    userId: input.userId,
    action: "void",
    entity: "transaction",
    entityId: tx.id,
    before: { id: tx.id, description: tx.description, status: tx.status },
    after: { status: "void", unticked: stamped.length },
  });
  if (!voided) return { ok: true, alreadyVoid: true };

  await repos.transactions.clearReconciliation(stamped);
  await repos.bank.unlinkTransaction(input.orgId, tx.id);
  return { ok: true };
}

export async function postOpeningBalance(
  repos: Repositories,
  input: {
    orgId: Id;
    userId: Id;
    accountId: Id;
    equityAccountId: Id;
    amountCents: number;
    date: IsoDate;
  },
): Promise<{ ok: true; duplicate?: true }> {
  // One live opening balance per account: retries/double-clicks can't stack them.
  if (await repos.accounts.hasOpeningBalance(input.orgId, input.accountId))
    throw new LedgerRuleError(
      "one_opening_balance",
      "This account already has an opening balance. Void it first if it needs to change.",
    );
  try {
    await postTransaction(repos, {
      orgId: input.orgId,
      userId: input.userId,
      transactionDate: input.date,
      description: "Opening balance",
      source: "opening_balance",
      entries: [
        { accountId: input.accountId, amountCents: input.amountCents },
        { accountId: input.equityAccountId, amountCents: -input.amountCents },
      ],
      idempotencyKey: `opening:${input.accountId}:${input.date}:${input.amountCents}`,
    }).then((r) => {
      if (r.duplicate) throw new DuplicateKeyError();
    });
  } catch (err) {
    if (err instanceof DuplicateKeyError) return { ok: true, duplicate: true };
    throw err;
  }
  return { ok: true };
}

export async function postBankRow(
  repos: Repositories,
  input: {
    orgId: Id;
    userId: Id;
    bankTransactionId: Id;
    offsetAccountId: Id;
    categoryId?: Id | null | undefined;
    projectId?: Id | null | undefined;
    fundId?: Id | null | undefined;
  },
): Promise<{ id: Id }> {
  const bank = await repos.bank.get(input.orgId, input.bankTransactionId);
  if (!bank) throw new Error("Bank transaction not found");
  if (bank.transactionId) throw new Error("Already posted to the ledger");

  // One ledger transaction per bank row, enforced by the idempotency key.
  const res = await postTransaction(repos, {
    orgId: input.orgId,
    userId: input.userId,
    transactionDate: bank.bankDate,
    postedDate: bank.bankDate,
    description: bank.description,
    source: "import",
    entries: [
      { accountId: bank.accountId, amountCents: bank.amountCents },
      {
        accountId: input.offsetAccountId,
        amountCents: -bank.amountCents,
        categoryId: input.categoryId ?? null,
        projectId: input.projectId ?? null,
        fundId: input.fundId ?? null,
      },
    ],
    idempotencyKey: `bank:${bank.id}`,
  });
  if (res.duplicate) throw new Error("Already posted to the ledger");

  if (!(await repos.bank.claim(input.orgId, bank.id, res.id))) {
    // Someone else linked it first: undo our copy so the row is posted once.
    await repos.transactions.markVoid(input.orgId, res.id);
    throw new Error("Already posted to the ledger");
  }
  await repos.audit.append({
    orgId: input.orgId,
    userId: input.userId,
    action: "post_from_bank",
    entity: "transaction",
    entityId: res.id,
    after: { bank_transaction_id: bank.id },
  });
  return { id: res.id };
}
