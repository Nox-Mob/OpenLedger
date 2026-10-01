ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS books_locked_through date;

ALTER TYPE public.transaction_source ADD VALUE IF NOT EXISTS 'closing';

CREATE TABLE public.period_closes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  fiscal_year_end date NOT NULL,
  transaction_id uuid NOT NULL REFERENCES public.transactions(id),
  net_income_cents bigint NOT NULL,
  closed_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (org_id, fiscal_year_end)
);
GRANT SELECT ON public.period_closes TO authenticated;
GRANT ALL ON public.period_closes TO service_role;
ALTER TABLE public.period_closes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view closes" ON public.period_closes FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Admins can record closes" ON public.period_closes FOR INSERT TO authenticated WITH CHECK (public.has_org_role(auth.uid(), org_id, 'admin'));

CREATE OR REPLACE FUNCTION public.guard_books_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lock_date date;
  org uuid;
BEGIN
  org := COALESCE(NEW.org_id, OLD.org_id);
  SELECT books_locked_through INTO lock_date FROM public.organizations WHERE id = org;
  IF lock_date IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'INSERT' AND NEW.transaction_date <= lock_date THEN
    RAISE EXCEPTION 'Books are locked through %. Choose a later date or ask an admin to unlock.', lock_date;
  END IF;
  IF TG_OP = 'UPDATE' AND (OLD.transaction_date <= lock_date OR NEW.transaction_date <= lock_date)
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Books are locked through %. This transaction cannot be voided or changed.', lock_date;
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$$;

CREATE TRIGGER transactions_guard_books_lock
  BEFORE INSERT OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.guard_books_lock();