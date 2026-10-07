// Nonprofit fund accounting rules. Pure TypeScript, no storage imports, so cloud and
// desktop compute fund balances and enforce release limits the same way.
import { LedgerRuleError } from "./ledger";
import type { AccountType, Id, TransactionSource } from "./models";

export interface FundRow {
  amountCents: number;
  accountType: AccountType;
  fundId: Id | null;
  source: TransactionSource;
}

export interface FundInfo {
  id: Id;
  name: string;
  isRestricted: boolean;
}

export interface FundBalance extends FundInfo {
  receivedCents: number; // contributions tagged to the fund (credits to revenue)
  spentCents: number; // expenses tagged to the fund
  releasedCents: number; // amounts released from restriction
  /** Restricted funds: received minus released. Unrestricted funds: received minus spent. */
  remainingCents: number;
}

export function computeFundBalances(rows: FundRow[], funds: FundInfo[]): FundBalance[] {
  const by = new Map<Id, { r: number; s: number; rel: number }>();
  for (const f of funds) by.set(f.id, { r: 0, s: 0, rel: 0 });
  for (const row of rows) {
    if (!row.fundId) continue;
    const b = by.get(row.fundId);
    if (!b) continue;
    if (row.source === "release") {
      if (row.amountCents > 0) b.rel += row.amountCents;
    } else if (row.accountType === "revenue") {
      b.r -= row.amountCents;
    } else if (row.accountType === "expense") {
      b.s += row.amountCents;
    }
  }
  return funds.map((f) => {
    const b = by.get(f.id)!;
    return {
      ...f,
      receivedCents: b.r,
      spentCents: b.s,
      releasedCents: b.rel,
      remainingCents: f.isRestricted ? b.r - b.rel : b.r - b.s,
    };
  });
}

/** Split total net assets (assets minus liabilities) into with / without donor restrictions. */
export function netAssetsByRestriction(rows: FundRow[], funds: FundInfo[]) {
  let total = 0;
  for (const r of rows) {
    if (r.accountType === "asset" || r.accountType === "liability") total += r.amountCents;
  }
  const withRestrictions = computeFundBalances(rows, funds)
    .filter((f) => f.isRestricted)
    .reduce((sum, f) => sum + Math.max(0, f.remainingCents), 0);
  return {
    totalCents: total,
    withRestrictionsCents: withRestrictions,
    withoutRestrictionsCents: total - withRestrictions,
  };
}

export function assertReleaseAllowed(fund: FundBalance | undefined, amountCents: number) {
  if (!fund) throw new LedgerRuleError("fund_missing", "Fund not found.");
  if (!fund.isRestricted) {
    throw new LedgerRuleError("fund_unrestricted", "Only restricted funds can be released.");
  }
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new LedgerRuleError("amount_invalid", "Release amount must be greater than zero.");
  }
  if (amountCents > fund.remainingCents) {
    throw new LedgerRuleError(
      "release_exceeds_balance",
      `This fund only has ${(fund.remainingCents / 100).toFixed(2)} left under restriction.`,
    );
  }
}

export type PledgeStatus = "open" | "paid" | "written_off";

/** How much of a pledge is still owed, and whether a new payment or write-off fits. */
export function pledgeOutstanding(amountCents: number, settledCents: number) {
  return Math.max(0, amountCents - settledCents);
}

export function assertPledgeSettlement(
  status: PledgeStatus,
  amountCents: number,
  settledCents: number,
  paymentCents: number,
) {
  if (status !== "open") {
    throw new LedgerRuleError("pledge_closed", "This pledge is already settled.");
  }
  if (!Number.isInteger(paymentCents) || paymentCents <= 0) {
    throw new LedgerRuleError("amount_invalid", "Amount must be greater than zero.");
  }
  if (paymentCents > pledgeOutstanding(amountCents, settledCents)) {
    throw new LedgerRuleError("pledge_overpaid", "That is more than the pledge has left.");
  }
}
