CREATE TABLE public.legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('terms', 'privacy', 'non_advice')),
  version text NOT NULL CHECK (char_length(version) BETWEEN 1 AND 40),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, document_type, version)
);

GRANT SELECT, INSERT ON public.legal_acceptances TO authenticated;
GRANT ALL ON public.legal_acceptances TO service_role;

ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own legal acceptances"
ON public.legal_acceptances
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can accept legal documents for themselves"
ON public.legal_acceptances
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.guard_account_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.type <> OLD.type AND EXISTS (SELECT 1 FROM public.entries WHERE account_id = OLD.id) THEN
    RAISE EXCEPTION 'Account type cannot change once the account has transactions';
  END IF;
  IF NEW.org_id <> OLD.org_id THEN
    RAISE EXCEPTION 'Account cannot move between organizations';
  END IF;
  IF NEW.is_active <> OLD.is_active AND NOT public.has_org_role(auth.uid(), OLD.org_id, 'admin') THEN
    RAISE EXCEPTION 'Only organization admins can archive or reactivate accounts';
  END IF;
  RETURN NEW;
END
$function$;