ALTER TABLE public.organizations ADD COLUMN ai_pdf_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.import_batches ADD COLUMN balance_mismatch_cents bigint;

CREATE TABLE public.ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'pdf_extract' CHECK (kind IN ('pdf_extract')),
  page_count integer,
  ok boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ai_usage TO authenticated;
GRANT ALL ON public.ai_usage TO service_role;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read org ai usage" ON public.ai_usage FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Writers log own ai usage" ON public.ai_usage FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_write_org(auth.uid(), org_id));
CREATE INDEX ai_usage_user_time ON public.ai_usage (org_id, user_id, created_at DESC);