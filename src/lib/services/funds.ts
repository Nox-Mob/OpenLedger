// Fund accounting workflows, written once against the repository ports.
import {
  assertPledgeSettlement,
  assertReleaseAllowed,
  computeFundBalances,
  netAssetsByRestriction,
  type FundInfo,
  type PledgeStatus,
} from "@/lib/domain/funds";
import { LedgerRuleError } from "@/lib/domain/ledger";
import type { Id, IsoDate } from "@/lib/domain/models";
import type { Repositories } from "@/lib/ports";
import { postTransaction } from "./ledger";

export async function fundSummary(repos: Repositories, orgId: Id, funds: FundInfo[]) {
  const rows = await repos.transactions.ledgerRows(orgId);
  return {
    funds: computeFundBalances(rows, funds),
    netAssets: netAssetsByRestriction(rows, funds),
  };
}

/** Net assets account used for releases: prefer one named "Net Assets", else first equity. */
async function netAssetsAccount(repos: Repositories, orgId: Id) {
  const equity = (await repos.accounts.list(orgId)).filter((a) => a.type === "equity");
  const acct = equity.find((a) => /net assets/i.test(a.name)) ?? equity[0];
  if (!acct) {
    throw new LedgerRuleError("equity_missing", "Turn on a Net Assets account in Account setup.");
  }
  return acct;
}

export async function releaseFund(
  repos: Repositories,
  input: {
    orgId: Id;
    userId: Id;
    fundId: Id;
    funds: FundInfo[];
    amountCents: number;
    date: IsoDate;
    note?: string | undefined;
    idempotencyKey: string;
  },
) {
  const { funds } = await fundSummary(repos, input.orgId, input.funds);
  const fund = funds.find((f) => f.id === input.fundId);
  assertReleaseAllowed(fund, input.amountCents);
  const acct = await netAssetsAccount(repos, input.orgId);
  // Both legs hit Net Assets, so total equity is unchanged; the fund tag records the release.
  return postTransaction(repos, {
    orgId: input.orgId,
    userId: input.userId,
    transactionDate: input.date,
    description: `Release from restriction: ${fund!.name}${input.note ? `. ${input.note}` : ""}`,
    source: "release",
    idempotencyKey: input.idempotencyKey,
    entries: [
      { accountId: acct.id, amountCents: input.amountCents, fundId: input.fundId },
      { accountId: acct.id, amountCents: -input.amountCents, fundId: null },
    ],
  });
}

export async function postPledge(
  repos: Repositories,
  input: {
    orgId: Id;
    userId: Id;
    receivableAccountId: Id;
    revenueAccountId: Id;
    fundId: Id | null;
    donorName: string;
    amountCents: number;
    date: IsoDate;
    idempotencyKey: string;
  },
) {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new LedgerRuleError("amount_invalid", "Pledge amount must be greater than zero.");
  }
  return postTransaction(repos, {
    orgId: input.orgId,
    userId: input.userId,
    transactionDate: input.date,
    description: `Pledge from ${input.donorName}`,
    source: "pledge",
    idempotencyKey: input.idempotencyKey,
    entries: [
      { accountId: input.receivableAccountId, amountCents: input.amountCents },
      { accountId: input.revenueAccountId, amountCents: -input.amountCents, fundId: input.fundId },
    ],
  });
}

/** A payment moves money from Pledges Receivable into cash; a write-off reverses revenue. */
export async function settlePledge(
  repos: Repositories,
  input: {
    orgId: Id;
    userId: Id;
    kind: "payment" | "write_off";
    status: PledgeStatus;
    pledgeAmountCents: number;
    settledCents: number;
    amountCents: number;
    receivableAccountId: Id;
    /** Cash account for payments, the original revenue account for write-offs. */
    debitAccountId: Id;
    fundId: Id | null;
    donorName: string;
    date: IsoDate;
    idempotencyKey: string;
  },
) {
  assertPledgeSettlement(input.status, input.pledgeAmountCents, input.settledCents, input.amountCents);
  return postTransaction(repos, {
    orgId: input.orgId,
    userId: input.userId,
    transactionDate: input.date,
    description:
      input.kind === "payment"
        ? `Pledge payment from ${input.donorName}`
        : `Pledge write-off: ${input.donorName}`,
    source: "pledge",
    idempotencyKey: input.idempotencyKey,
    entries: [
      {
        accountId: input.debitAccountId,
        amountCents: input.amountCents,
        fundId: input.kind === "write_off" ? input.fundId : null,
      },
      { accountId: input.receivableAccountId, amountCents: -input.amountCents },
    ],
  });
}
