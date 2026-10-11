import { pickCurrentOrg } from "@/lib/current-org";

/** Where desktop opens: setup when there are no local books, otherwise the ledger of the chosen org. */
export function desktopStartTarget<T extends { id: string }>(
  orgs: T[],
  storedId: string | null,
): { to: "/onboarding" | "/ledger"; orgId: string | null } {
  const org = pickCurrentOrg(orgs, storedId);
  return org ? { to: "/ledger", orgId: org.id } : { to: "/onboarding", orgId: null };
}
