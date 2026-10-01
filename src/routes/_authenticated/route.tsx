import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LegalGate } from "@/components/LegalGate";
import { DEMO_EMAIL, demoAllowedHere } from "@/lib/demo";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    // The shared sample account is for development/preview only.
    if (data.user.email?.toLowerCase() === DEMO_EMAIL && !demoAllowedHere()) {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }
    return { user: data.user };
  },
  component: () => (
    <LegalGate>
      <Outlet />
    </LegalGate>
  ),
});
