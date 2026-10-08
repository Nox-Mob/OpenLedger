import { useQuery } from "@tanstack/react-query";
import { getMyOrgs, getMyProfile } from "@/lib/org.functions";
import { pickCurrentOrg, useCurrentOrgId } from "@/lib/current-org";
import { getTerms, normalizeTerminology, type OrgType, type Terminology } from "@/lib/terminology";

export function useOrgContext() {
  const currentOrgId = useCurrentOrgId();
  const orgsQuery = useQuery({
    queryKey: ["orgs"],
    queryFn: () => getMyOrgs(),
  });
  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: () => getMyProfile(),
  });

  const orgs = orgsQuery.data ?? [];
  const org = pickCurrentOrg(orgs, currentOrgId);
  // Wording is an organization-wide setting; the personal preference is only a fallback.
  const terminology: Terminology = normalizeTerminology(
    org?.terminology ?? profileQuery.data?.terminology,
  );
  const orgType = (org?.orgType ?? "business") as OrgType;
  const orgOverrides = org?.termOverrides ?? {};
  // Reports and PDFs always use the org's wording; screens layer the user's personal choices on top.
  const reportTerms = getTerms(orgType, terminology, orgOverrides);
  const terms = getTerms(orgType, terminology, {
    ...orgOverrides,
    ...(profileQuery.data?.termOverrides ?? {}),
  });

  return {
    org,
    orgs,
    terms,
    reportTerms,
    terminology,
    userOverrides: profileQuery.data?.termOverrides ?? {},
    isLoading: orgsQuery.isLoading || profileQuery.isLoading,
    error: orgsQuery.error,
    retry: () => orgsQuery.refetch(),
  };
}

