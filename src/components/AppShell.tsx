import { normalizeTerminology } from "@/lib/terminology";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  ArrowLeftRight,
  PlusCircle,
  Landmark,
  Upload,
  FolderKanban,
  PiggyBank,
  FileBarChart,
  Settings,
  LogOut,
  BookOpen,
} from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getMyOrgs, getMyProfile } from "@/lib/org.functions";
import { useCurrentOrgId, setStoredOrgId } from "@/lib/current-org";
import { getTerms, type OrgType, type Terminology } from "@/lib/terminology";

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
  const org = orgs.find((o) => o.id === currentOrgId) ?? orgs[0] ?? null;
  // Wording is an organization-wide setting; the personal preference is only a fallback.
  const terminology: Terminology =
    normalizeTerminology((org as any)?.terminology ?? profileQuery.data?.terminology);
  const orgType = (org?.orgType ?? "business") as OrgType;
  const orgOverrides = (org as any)?.termOverrides ?? {};
  // Reports and PDFs always use the org's wording; screens layer the user's personal choices on top.
  const reportTerms = getTerms(orgType, terminology, orgOverrides);
  const terms = getTerms(orgType, terminology, { ...orgOverrides, ...(profileQuery.data?.termOverrides ?? {}) });

  return {
    org,
    orgs,
    terms,
    reportTerms,
    terminology,
    userOverrides: profileQuery.data?.termOverrides ?? {},
    isLoading: orgsQuery.isLoading || profileQuery.isLoading,
  };
}

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/transactions/new", label: "New Transaction", icon: PlusCircle },
  { to: "/accounts", label: "Accounts", icon: Landmark },
  { to: "/import", label: "Import Bank File", icon: Upload },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/funds", label: "Funds", icon: PiggyBank },
  { to: "/reports", label: "Reports", icon: FileBarChart },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { org, orgs, terms } = useOrgContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await supabase.auth.signOut();
    queryClient.clear();
    navigate({ to: "/auth" });
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="flex w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-2 px-5 py-5">
          <BookOpen className="h-5 w-5 text-sidebar-primary" />
          <span className="font-display text-lg font-bold">Open Ledger</span>
        </div>

        {orgs.length > 1 && (
          <div className="px-4 pb-3">
            <select
              className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-2 py-1.5 text-sm text-sidebar-accent-foreground"
              value={org?.id ?? ""}
              onChange={(e) => setStoredOrgId(e.target.value)}
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {orgs.length === 1 && org && (
          <div className="px-5 pb-3 text-sm text-sidebar-foreground/70">
            {org.name}
            <span className="ml-2 text-xs text-sidebar-foreground/50">{terms.orgLabel}</span>
          </div>
        )}

        <div className="px-5 pb-3">
          <Link
            to="/onboarding"
            className="text-xs text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground"
          >
            + New organization
          </Link>
        </div>

        <nav className="flex-1 space-y-0.5 px-3">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === "/" }}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium" }}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="p-3">
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
    </div>
  );
}
