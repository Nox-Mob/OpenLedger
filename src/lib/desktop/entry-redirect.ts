import { redirect } from "@tanstack/react-router";
import { isDesktop, LOCAL_USER_ID } from "@/lib/edition";
import { desktopStartTarget } from "@/lib/desktop-start";
import { getStoredOrgId, setStoredOrgId } from "@/lib/current-org";

/** beforeLoad for website and sign-in pages: on desktop, skip them and open setup or the ledger. */
export async function desktopEntryRedirect(): Promise<void> {
  if (!isDesktop()) return;
  const { localRepos } = await import("@/lib/desktop/local-repos");
  const orgs = await (await localRepos()).orgs.listForUser(LOCAL_USER_ID);
  const target = desktopStartTarget(orgs, getStoredOrgId());
  if (target.orgId) setStoredOrgId(target.orgId);
  throw redirect({ to: target.to });
}
