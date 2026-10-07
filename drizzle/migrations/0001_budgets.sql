CREATE TABLE public.budgets (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  period_type text NOT NULL CHECK (period_type IN ('year','month')),
  period_start date NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, account_id, period_type, period_start)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budgets TO authenticated;
GRANT ALL ON public.budgets TO service_role;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view budgets" ON public.budgets FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Writers add budgets" ON public.budgets FOR INSERT TO authenticated WITH CHECK (public.can_write_org(auth.uid(), org_id));
CREATE POLICY "Writers update budgets" ON public.budgets FOR UPDATE TO authenticated USING (public.can_write_org(auth.uid(), org_id)) WITH CHECK (public.can_write_org(auth.uid(), org_id));
CREATE POLICY "Writers delete budgets" ON public.budgets FOR DELETE TO authenticated USING (public.can_write_org(auth.uid(), org_id));
CREATE OR REPLACE FUNCTION public.guard_budget_account() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = NEW.account_id AND a.org_id = NEW.org_id AND a.type IN ('revenue','expense')) THEN
    RAISE EXCEPTION 'Budget account must be an income or expense account in this organization';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER budgets_guard BEFORE INSERT OR UPDATE ON public.budgets FOR EACH ROW EXECUTE FUNCTION public.guard_budget_account();