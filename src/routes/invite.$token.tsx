import { desktopEntryRedirect } from "@/lib/desktop/entry-redirect";
import { errorMessage } from "@/lib/errors";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { acceptInvite } from "@/lib/members.functions";
import { PENDING_INVITE_KEY } from "@/lib/invite-link";

export const Route = createFileRoute("/invite/$token")({
  beforeLoad: desktopEntryRedirect,
  head: () => ({
    meta: [
      { title: "Join Organization - OpenLedgerApp" },
      { name: "description", content: "Accept an invitation to join an organization's books." },
      { property: "og:title", content: "Join Organization - OpenLedgerApp" },
      {
        property: "og:description",
        content: "Accept an invitation to join an organization's books.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InvitePage,
});

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [state, setState] = useState<"checking" | "signin" | "joining" | "error">("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (!data.session) {
        sessionStorage.setItem(PENDING_INVITE_KEY, token);
        setState("signin");
        return;
      }
      setState("joining");
      try {
        await acceptInvite({ data: { token } });
        sessionStorage.removeItem(PENDING_INVITE_KEY);
        await queryClient.invalidateQueries();
        void navigate({ to: "/ledger" });
      } catch (err) {
        sessionStorage.removeItem(PENDING_INVITE_KEY);
        if (active) {
          setError(errorMessage(err, "Could not accept the invite."));
          setState("error");
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [token, navigate, queryClient]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md rounded-lg border bg-card p-8 text-center">
        <h1 className="font-display text-2xl font-bold">Join an organization</h1>
        {state === "checking" && (
          <p className="mt-3 text-muted-foreground">Checking your invite.</p>
        )}
        {state === "joining" && <p className="mt-3 text-muted-foreground">Adding you now.</p>}
        {state === "signin" && (
          <>
            <p className="mt-3 text-muted-foreground">
              Sign in or create an account to accept this invite. You will come right back here.
            </p>
            <Link
              to="/auth"
              className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Sign in to join
            </Link>
          </>
        )}
        {state === "error" && (
          <>
            <p className="mt-3 text-destructive">{error}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Ask an admin of the organization for a new link.
            </p>
            <Link to="/ledger" className="mt-6 inline-flex text-sm font-medium text-primary">
              Go to your books
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
