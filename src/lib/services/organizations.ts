import type { Repositories } from "@/lib/ports";
import type { Id } from "@/lib/domain/models";
import { newId } from "@/lib/domain/ledger";
import { catalogFor, type OrgType } from "@/lib/account-catalog";

export interface NewOrganizationInput {
  name: string;
  orgType: OrgType;
  accountKeys: string[];
  currency: string;
  fiscalYearStartMonth: number;
  terminology: string;
  timezone: string;
}

/** Creates an organization with its starter accounts. The creator becomes its admin. */
export async function createOrganizationWithAccounts(
  repos: Repositories,
  userId: Id,
  input: NewOrganizationInput,
): Promise<Id> {
  const name = input.name.trim();
  if (!name) throw new Error("Enter a name for your organization.");
  const id = newId();
  await repos.orgs.create({
    id,
    name,
    orgType: input.orgType,
    currency: input.currency,
    fiscalYearStartMonth: input.fiscalYearStartMonth,
    timezone: input.timezone,
    terminology: input.terminology,
    termOverrides: {},
    aiPdfEnabled: false,
    booksLockedThrough: null,
    createdBy: userId,
  });
  const keys = new Set(input.accountKeys);
  await repos.accounts.create(
    catalogFor(input.orgType)
      .filter((c) => c.required || keys.has(c.key))
      .map((c) => ({
        id: newId(),
        orgId: id,
        name: c.name,
        type: c.type,
        subtype: c.subtype ?? null,
        isActive: true,
      })),
  );
  return id;
}
