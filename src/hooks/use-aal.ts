import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Current and possible sign-in level: "aal2" means two-step sign-in was used this session. */
export function useAal() {
  return useQuery({
    queryKey: ["aal"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error) throw error;
      return { current: data.currentLevel, next: data.nextLevel };
    },
  });
}
