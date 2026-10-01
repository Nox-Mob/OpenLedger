import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { LEGAL_VERSIONS, missingLegalDocuments } from "./legal";

export const getLegalStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("legal_acceptances")
      .select("document_type, version")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    const accepted = (data ?? []).map((row) => ({
      documentType: row.document_type,
      version: row.version,
    }));
    return { missing: missingLegalDocuments(accepted) };
  });

export const acceptCurrentLegalDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ terms: z.literal(true), privacy: z.literal(true), nonAdvice: z.literal(true) })
      .parse(input),
  )
  .handler(async ({ context }) => {
    const rows = [
      { user_id: context.userId, document_type: "terms", version: LEGAL_VERSIONS.terms },
      { user_id: context.userId, document_type: "privacy", version: LEGAL_VERSIONS.privacy },
      { user_id: context.userId, document_type: "non_advice", version: LEGAL_VERSIONS.non_advice },
    ];
    const { error } = await context.supabase
      .from("legal_acceptances")
      .upsert(rows, { onConflict: "user_id,document_type,version", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
