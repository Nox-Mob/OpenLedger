ALTER TYPE public.transaction_source ADD VALUE IF NOT EXISTS 'release';
ALTER TYPE public.transaction_source ADD VALUE IF NOT EXISTS 'pledge';

CREATE TABLE public.pledges (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  donor_name text NOT NULL,
  fund_id uuid REFERENCES public.funds(id),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  pledge_date date NOT NULL,
  expected_date date,
  note text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','paid','written_off')),
  transaction_id uuid REFERENCES public.transactions(id),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.pledges TO authenticated;
GRANT ALL ON public.pledges TO service_role;
ALTER TABLE public.pledges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view pledges" ON public.pledges FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Writers insert pledges" ON public.pledges FOR INSERT TO authenticated WITH CHECK (public.can_write_org(auth.uid(), org_id));
CREATE POLICY "Writers update pledges" ON public.pledges FOR UPDATE TO authenticated USING (public.can_write_org(auth.uid(), org_id));
CREATE INDEX pledges_org_idx ON public.pledges(org_id);

CREATE TABLE public.pledge_payments (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pledge_id uuid NOT NULL REFERENCES public.pledges(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES public.transactions(id),
  kind text NOT NULL DEFAULT 'payment' CHECK (kind IN ('payment','write_off')),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  paid_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.pledge_payments TO authenticated;
GRANT ALL ON public.pledge_payments TO service_role;
ALTER TABLE public.pledge_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view pledge payments" ON public.pledge_payments FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Writers insert pledge payments" ON public.pledge_payments FOR INSERT TO authenticated WITH CHECK (public.can_write_org(auth.uid(), org_id));
CREATE INDEX pledge_payments_pledge_idx ON public.pledge_payments(pledge_id);

CREATE TABLE public.org_invites (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  role public.app_role NOT NULL,
  created_by uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  used_by uuid,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.org_invites TO authenticated;
GRANT ALL ON public.org_invites TO service_role;
ALTER TABLE public.org_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view invites" ON public.org_invites FOR SELECT TO authenticated USING (public.has_org_role(auth.uid(), org_id, 'admin'));
CREATE POLICY "Admins create invites" ON public.org_invites FOR INSERT TO authenticated WITH CHECK (public.has_org_role(auth.uid(), org_id, 'admin') AND created_by = auth.uid());
CREATE POLICY "Admins revoke invites" ON public.org_invites FOR UPDATE TO authenticated USING (public.has_org_role(auth.uid(), org_id, 'admin'));

CREATE TABLE public.deleted_organizations (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL,
  name text NOT NULL,
  deleted_by uuid NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.deleted_organizations TO service_role;
ALTER TABLE public.deleted_organizations ENABLE ROW LEVEL SECURITY;

-- Allow entries locked by a completed reconciliation to go only when the whole org is deleted.
CREATE OR REPLACE FUNCTION public.guard_reconciled_entry()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE rid uuid; tx_org uuid;
BEGIN
  rid := OLD.reconciliation_id;
  IF TG_OP = 'DELETE' THEN
    SELECT org_id INTO tx_org FROM public.reconciliations WHERE id = rid;
    IF rid IS NOT NULL AND (tx_org IS NULL OR NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = tx_org)) THEN
      RETURN OLD;
    END IF;
  END IF;
  IF rid IS NOT NULL AND EXISTS (SELECT 1 FROM public.reconciliations WHERE id = rid AND status = 'completed') THEN
    IF TG_OP = 'DELETE' OR NEW.amount_cents <> OLD.amount_cents OR NEW.account_id <> OLD.account_id
       OR NEW.reconciliation_id IS DISTINCT FROM OLD.reconciliation_id THEN
      RAISE EXCEPTION 'Entry % is locked by a completed reconciliation', OLD.id;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $function$;