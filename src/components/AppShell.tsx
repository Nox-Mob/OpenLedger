import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  ArrowLeftRight,
  PlusCircle,
  Landmark,
  Upload,
  ListChecks,
  FolderKanban,
  Target,
  PiggyBank,
  HandCoins,
  FileBarChart,
  Settings,
  LogOut,
  BookOpen,
} from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ThemeToggle } from "@/components/ThemeToggle";
import { OrgSwitcher } from "@/components/OrgSwitcher";
import { useOrgContext } from "@/hooks/use-org-context";
import { ErrorState, LoadingState } from "@/components/PageStates";
import { errorMessage } from "@/lib/errors";

const NAV = [
  { to: "/ledger", label: "Dashboard", icon: LayoutDashboard },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/transactions/new", label: "New Transaction", icon: PlusCircle, write: true },
  { to: "/accounts", label: "Accounts", icon: Landmark },
  { to: "/import", label: "Import Bank File", icon: Upload, write: true },
  { to: "/reconcile", label: "Reconcile", icon: ListChecks },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/budgets", label: "Budgets", icon: Target },
  { to: "/funds", label: "Funds", icon: PiggyBank },
  { to: "/pledges", label: "Pledges", icon: HandCoins },
  { to: "/reports", label: "Reports", icon: FileBarChart },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { org, orgs, terms, error, retry } = useOrgContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await supabase.auth.signOut();
    queryClient.clear();
    navigate({ to: "/auth" });
  }

  return (
    <div className="flex min-h-screen bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <aside className="flex w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-2 px-5 py-5">
          <BookOpen className="h-5 w-5 text-sidebar-primary" />
          <span className="font-display text-lg font-bold">OpenLedgerApp</span>
        </div>

        {orgs.length > 1 && (
          <div className="px-4 pb-3">
            <OrgSwitcher orgs={orgs} current={org} />
          </div>
        )}
        {orgs.length === 1 && org && (
          <div className="px-5 pb-3 text-sm text-sidebar-foreground">
            {org.name}
            <span className="ml-2 text-xs text-sidebar-foreground/80">{terms.orgLabel}</span>
          </div>
        )}
        {orgs.length <= 1 && (
          <div className="px-5 pb-3">
            <Link
              to="/onboarding"
              className="text-xs text-sidebar-foreground/80 transition-colors hover:text-sidebar-foreground"
            >
              + New organization
            </Link>
          </div>
        )}

        <nav aria-label="Main" className="flex-1 space-y-0.5 px-3">
          {NAV.filter((item) => !("write" in item && item.write) || org?.role !== "viewer").map(
            (item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === "/ledger" }}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/90 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                activeProps={{
                  className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
                }}
              >
                <item.icon className="h-4 w-4" aria-hidden="true" />
                {item.to === "/reconcile" ? terms.reconcile : item.label}
              </Link>
            ),
          )}
        </nav>

        <div className="p-3">
          <div className="mb-2 flex items-center justify-between gap-2 px-3">
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-sidebar-foreground/80">
              <Link to="/terms" className="hover:text-sidebar-foreground">
                Terms
              </Link>
              <Link to="/privacy" className="hover:text-sidebar-foreground">
                Privacy
              </Link>
              <Link to="/not-advice" className="hover:text-sidebar-foreground">
                Not advice
              </Link>
            </div>
            <ThemeToggle className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground" />
          </div>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </button>
        </div>
      </aside>

      <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-8 py-8 outline-none">
        {error && !org ? (
          <ErrorState
            title="Your organizations didn't load"
            message={errorMessage(error)}
            onRetry={retry}
          />
        ) : (
          children
        )}
      </main>
    </div>
  );
}

/** Shown by pages while the current organization is still loading. */
export function OrgPending({ inShell = true }: { inShell?: boolean }) {
  const body = <LoadingState label="Loading your organization" />;
  return inShell ? <AppShell>{body}</AppShell> : body;
}
