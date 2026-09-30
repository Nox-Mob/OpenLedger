import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useOrgContext } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/settings/preferences")({
  head: () => ({
    meta: [
      { title: "Your Preferences — Open Ledger" },
      { name: "description", content: "Personal display preferences that only affect what you see." },
      { property: "og:title", content: "Your Preferences — Open Ledger" },
      { property: "og:description", content: "Personal display preferences that only affect what you see." },
    ],
  }),
  component: PreferencesSettings,
});

function PreferencesSettings() {
  const { org, terminology } = useOrgContext();

  if (!org) return null;

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-lg border bg-card p-5">
        <h2 className="font-display text-lg font-semibold">Your preferences</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Nothing personal to set yet — the wording of the app and reports is an organization-wide
          setting, so everyone sees the same thing.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          This organization currently uses{" "}
          <span className="font-medium text-foreground">
            {terminology === "accounting" ? "accounting terms" : "plain language"}
          </span>
          . An admin can change it under{" "}
          <Link to="/settings" className="text-primary underline underline-offset-2">
            Organization profile
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
