import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Open Ledger" },
      { name: "description", content: "Organization and personal settings." },
      { property: "og:title", content: "Settings — Open Ledger" },
      { property: "og:description", content: "Organization and personal settings." },
    ],
  }),
  component: SettingsLayout,
});

const SECTIONS = [
  { to: "/settings", label: "Organization profile", exact: true },
  { to: "/settings/members", label: "Users & roles", exact: false },
  { to: "/settings/preferences", label: "Your preferences", exact: false },
] as const;

function SettingsLayout() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  return (
    <AppShell>
      <h1 className="font-display text-2xl font-bold">Settings</h1>
      <div className="mt-6 flex flex-col gap-6 md:flex-row">
        <nav className="w-full shrink-0 md:w-52">
          <p className="px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Organization settings
          </p>
          <ul className="mt-2 space-y-1">
            {SECTIONS.map((s) => {
              const active = s.exact ? pathname === s.to : pathname.startsWith(s.to);
              return (
                <li key={s.to}>
                  <Link
                    to={s.to}
                    className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-accent font-medium text-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    }`}
                  >
                    {s.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </AppShell>
  );
}
