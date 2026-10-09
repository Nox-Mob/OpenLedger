// Reports, written once against the repository ports. Pure math lives in report-math;
// this only gathers ledger rows and org settings (fiscal year, timezone).
import { addDays, fiscalYearStart, todayISO } from "@/lib/dates";
import type { Id, IsoDate } from "@/lib/domain/models";
import type { Repositories } from "@/lib/ports";
import {
  computeBalance,
  computeCashSeries,
  computeIncome,
  computeProjectSpend,
  computeTrialBalance,
  inRange,
  type LedgerRow,
} from "@/lib/report-math";
import { computeGeneralLedger } from "@/lib/report-detail";

/** Posted ledger rows only (void and legacy 'closing' are excluded by the port). */
export async function ledger(repos: Repositories, orgId: Id, to?: IsoDate): Promise<LedgerRow[]> {
  const rows = await repos.transactions.ledgerRows(orgId, to ? { to } : undefined);
  return rows.map((r) => ({
    amountCents: r.amountCents,
    accountId: r.accountId,
    transactionId: r.transactionId,
    description: r.description,
    fundId: r.fundId,
    accountName: r.accountName,
    accountType: r.accountType,
    projectId: r.projectId,
    transactionDate: r.transactionDate,
  }));
}

async function orgOrThrow(repos: Repositories, orgId: Id) {
  const org = await repos.orgs.get(orgId);
  if (!org) throw new Error("Organization not found");
  return org;
}

/** "Today" in the organization's timezone — never the server's clock day. */
export async function orgToday(repos: Repositories, orgId: Id, now = new Date()) {
  const org = await orgOrThrow(repos, orgId);
  return todayISO(now, org.timezone || "America/Chicago");
}

export async function incomeStatement(
  repos: Repositories,
  orgId: Id,
  range: { from?: IsoDate | undefined; to?: IsoDate | undefined },
) {
  return computeIncome(inRange(await ledger(repos, orgId, range.to), range.from, range.to));
}

export async function balanceSheet(repos: Repositories, orgId: Id, asOf?: IsoDate) {
  const org = await orgOrThrow(repos, orgId);
  const day = asOf ?? todayISO(new Date(), org.timezone || "America/Chicago");
  const rows = await ledger(repos, orgId, day);
  return {
    asOf: day,
    ...computeBalance(rows, day, fiscalYearStart(day, org.fiscalYearStartMonth || 1)),
  };
}

export async function trialBalance(repos: Repositories, orgId: Id, asOf?: IsoDate) {
  const day = asOf ?? (await orgToday(repos, orgId));
  return { asOf: day, ...computeTrialBalance(await ledger(repos, orgId, day), day) };
}

export async function projectSummary(repos: Repositories, orgId: Id) {
  const [projects, rows] = await Promise.all([repos.projects.list(orgId), ledger(repos, orgId)]);
  const spent = computeProjectSpend(rows);
  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    budgetCents: p.budgetCents,
    spentCents: spent.get(p.id) ?? 0,
  }));
}

export async function cashHistory(repos: Repositories, orgId: Id, days: number) {
  const to = await orgToday(repos, orgId);
  return computeCashSeries(await ledger(repos, orgId, to), addDays(to, -days), to);
}

/** General ledger, or account activity when `accountName` is given. */
export async function generalLedger(
  repos: Repositories,
  orgId: Id,
  f: { from: IsoDate; to: IsoDate; accountName?: string | undefined; fundId?: string | undefined },
) {
  const org = await orgOrThrow(repos, orgId);
  const rows = await ledger(repos, orgId, f.to);
  return {
    from: f.from,
    to: f.to,
    accounts: computeGeneralLedger(rows, {
      ...f,
      accountName: f.accountName,
      fundId: f.fundId,
      fiscalYearStart: fiscalYearStart(f.to, org.fiscalYearStartMonth || 1),
    }),
  };
}
