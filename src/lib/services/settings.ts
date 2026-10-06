// Organization settings, books lock and year-end close, written against the ports.
// Callers (server functions or the desktop shell) check permissions first.
import { fiscalYearStart } from "@/lib/dates";
import { LedgerRuleError, newId } from "@/lib/domain/ledger";
import type { Id, IsoDate, Organization } from "@/lib/domain/models";
import { DuplicateKeyError, type Repositories } from "@/lib/ports";
import { netIncomeFromEntries } from "@/lib/report-math";

export type OrgSettings = Pick<
  Organization,
  | "name"
  | "orgType"
  | "currency"
  | "fiscalYearStartMonth"
  | "timezone"
  | "terminology"
  | "termOverrides"
> & { aiPdfEnabled?: boolean | undefined };

const snapshot = (o: Organization) => ({
  name: o.name,
  org_type: o.orgType,
  currency: o.currency,
  fiscal_year_start_month: o.fiscalYearStartMonth,
  timezone: o.timezone,
  terminology: o.terminology,
  term_overrides: o.termOverrides,
  ai_pdf_enabled: o.aiPdfEnabled,
});

export async function updateOrganization(
  repos: Repositories,
  orgId: Id,
  userId: Id,
  s: OrgSettings,
) {
  const before = await repos.orgs.get(orgId);
  if (!before) throw new LedgerRuleError("settings", "Organization not found");
  const { aiPdfEnabled, ...rest } = s;
  await repos.orgs.updateSettings(orgId, {
    ...rest,
    ...(aiPdfEnabled !== undefined ? { aiPdfEnabled } : {}),
  });
  await repos.audit.append({
    orgId,
    userId,
    action: "update",
    entity: "organization",
    entityId: orgId,
    before: snapshot(before),
    after: snapshot({ ...before, ...rest, aiPdfEnabled: aiPdfEnabled ?? before.aiPdfEnabled }),
  });
  return { ok: true };
}

export async function getBooksStatus(repos: Repositories, orgId: Id) {
  const [org, closes] = await Promise.all([repos.orgs.get(orgId), repos.periodCloses.list(orgId)]);
  if (!org) throw new LedgerRuleError("settings", "Organization not found");
  return {
    booksLockedThrough: org.booksLockedThrough,
    fiscalYearStartMonth: org.fiscalYearStartMonth || 1,
    closes: closes.map((c) => ({
      id: c.id,
      fiscal_year_end: c.fiscalYearEnd,
      net_income_cents: c.netIncomeCents,
      created_at: c.createdAt,
    })),
  };
}

export async function setBooksLock(
  repos: Repositories,
  orgId: Id,
  userId: Id,
  lockedThrough: IsoDate | null,
) {
  const before = await repos.orgs.get(orgId);
  await repos.orgs.setBooksLockedThrough(orgId, lockedThrough);
  await repos.audit.append({
    orgId,
    userId,
    action: lockedThrough ? "lock_books" : "unlock_books",
    entity: "organization",
    entityId: orgId,
    before: { books_locked_through: before?.booksLockedThrough ?? null },
    after: { books_locked_through: lockedThrough },
  });
  return { ok: true };
}

/** Net income for the fiscal year ending on `fiscalYearEnd` (posted only). */
export async function fiscalYearNetIncome(repos: Repositories, orgId: Id, fiscalYearEnd: IsoDate) {
  const org = await repos.orgs.get(orgId);
  const startMonth = org?.fiscalYearStartMonth || 1;
  const start = fiscalYearStart(fiscalYearEnd, startMonth);
  const rows = await repos.transactions.ledgerRows(orgId, { to: fiscalYearEnd });
  const net = netIncomeFromEntries(
    rows
      .filter((r) => r.transactionDate >= start)
      .filter((r) => r.accountType === "revenue" || r.accountType === "expense"),
  );
  return { fiscalYearStart: start, fiscalYearEnd, netIncomeCents: net, startMonth };
}

export async function previewYearEndClose(repos: Repositories, orgId: Id, fiscalYearEnd: IsoDate) {
  if (await repos.periodCloses.find(orgId, fiscalYearEnd))
    throw new LedgerRuleError("settings", "That fiscal year is already closed.");
  return fiscalYearNetIncome(repos, orgId, fiscalYearEnd);
}

/**
 * Virtual close: reports derive retained earnings from the full ledger, so no closing
 * transaction is posted (that would double-count). We record the close and lock the books.
 */
export async function closeFiscalYear(
  repos: Repositories,
  input: { orgId: Id; userId: Id; fiscalYearEnd: IsoDate; retainedEarningsAccountId: Id },
) {
  const { orgId, userId, fiscalYearEnd } = input;
  if (await repos.periodCloses.find(orgId, fiscalYearEnd)) return { ok: true, duplicate: true };
  const [equity] = await repos.accounts.getMany(orgId, [input.retainedEarningsAccountId]);
  if (!equity || equity.type !== "equity" || !equity.isActive)
    throw new LedgerRuleError(
      "settings",
      "Choose an active equity account (retained earnings / net assets).",
    );
  const { netIncomeCents } = await fiscalYearNetIncome(repos, orgId, fiscalYearEnd);
  try {
    await repos.periodCloses.create({
      id: newId(),
      orgId,
      fiscalYearEnd,
      netIncomeCents,
      closedBy: userId,
    });
  } catch (e) {
    if (e instanceof DuplicateKeyError) return { ok: true, duplicate: true };
    throw e;
  }
  await repos.orgs.setBooksLockedThrough(orgId, fiscalYearEnd);
  await repos.audit.append({
    orgId,
    userId,
    action: "close_fiscal_year",
    entity: "period_close",
    entityId: orgId,
    after: { fiscal_year_end: fiscalYearEnd, net_income_cents: netIncomeCents },
  });
  return { ok: true, netIncomeCents };
}
