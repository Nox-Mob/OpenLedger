CREATE TYPE public.import_format AS ENUM ('csv','ofx','qfx','pdf');
CREATE TYPE public.reconcile_mode AS ENUM ('simple','full');
CREATE TYPE public.reconcile_status AS ENUM ('in_progress','completed');

CREATE TABLE public.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id),
  file_name text NOT NULL,
  format public.import_format NOT NULL,
  statement_start date,
  statement_end date,
  beginning_balance_cents bigint,
  ending_balance_cents bigint,
  rows_total int NOT NULL DEFAULT 0,
  rows_imported int NOT NULL DEFAULT 0,
  rows_duplicate int NOT NULL DEFAULT 0,
  rows_error int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','undone')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_batches TO authenticated;
GRANT ALL ON public.import_batches TO service_role;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view import batches" ON public.import_batches FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Writers insert import batches" ON public.import_batches FOR INSERT TO authenticated WITH CHECK (public.can_write_org(auth.uid(), org_id));
CREATE POLICY "Writers update import batches" ON public.import_batches FOR UPDATE TO authenticated USING (public.can_write_org(auth.uid(), org_id));
CREATE POLICY "Writers delete import batches" ON public.import_batches FOR DELETE TO authenticated USING (public.can_write_org(auth.uid(), org_id));
CREATE TRIGGER update_import_batches_updated_at BEFORE UPDATE ON public.import_batches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.import_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_profiles TO authenticated;
GRANT ALL ON public.import_profiles TO service_role;
ALTER TABLE public.import_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view import profiles" ON public.import_profiles FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Writers insert import profiles" ON public.import_profiles FOR INSERT TO authenticated WITH CHECK (public.can_write_org(auth.uid(), org_id));
CREATE POLICY "Writers update import profiles" ON public.import_profiles FOR UPDATE TO authenticated USING (public.can_write_org(auth.uid(), org_id));
CREATE POLICY "Writers delete import profiles" ON public.import_profiles FOR DELETE TO authenticated USING (public.can_write_org(auth.uid(), org_id));
CREATE TRIGGER update_import_profiles_updated_at BEFORE UPDATE ON public.import_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.bank_transactions ADD COLUMN batch_id uuid REFERENCES public.import_batches(id) ON DELETE SET NULL;
ALTER TABLE public.bank_transactions ADD COLUMN needs_review boolean NOT NULL DEFAULT false;

CREATE TABLE public.reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  beginning_balance_cents bigint NOT NULL DEFAULT 0,
  ending_balance_cents bigint NOT NULL DEFAULT 0,
  mode public.reconcile_mode NOT NULL DEFAULT 'full',
  status public.reconcile_status NOT NULL DEFAULT 'in_progress',
  batch_id uuid REFERENCES public.import_batches(id) ON DELETE SET NULL,
  created_by uuid,
  completed_by uuid,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reconciliations TO authenticated;
GRANT ALL ON public.reconciliations TO service_role;
ALTER TABLE public.reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view reconciliations" ON public.reconciliations FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Writers insert reconciliations" ON public.reconciliations FOR INSERT TO authenticated WITH CHECK (public.can_write_org(auth.uid(), org_id));
CREATE POLICY "Writers update reconciliations" ON public.reconciliations FOR UPDATE TO authenticated USING (public.can_write_org(auth.uid(), org_id));
CREATE POLICY "Writers delete in-progress reconciliations" ON public.reconciliations FOR DELETE TO authenticated USING (public.can_write_org(auth.uid(), org_id) AND status = 'in_progress');
CREATE TRIGGER update_reconciliations_updated_at BEFORE UPDATE ON public.reconciliations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.entries ADD COLUMN reconciliation_id uuid REFERENCES public.reconciliations(id) ON DELETE SET NULL;
CREATE INDEX entries_reconciliation_idx ON public.entries(reconciliation_id);

CREATE OR REPLACE FUNCTION public.guard_reconciled_transaction()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.entries e JOIN public.reconciliations r ON r.id = e.reconciliation_id
    WHERE e.transaction_id = OLD.id AND r.status = 'completed'
  ) AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.transaction_date IS DISTINCT FROM OLD.transaction_date) THEN
    RAISE EXCEPTION 'Transaction % is part of a completed reconciliation; reopen it first', OLD.id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER transactions_guard_reconciled BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.guard_reconciled_transaction();

CREATE OR REPLACE FUNCTION public.guard_reconciled_entry()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE rid uuid;
BEGIN
  rid := OLD.reconciliation_id;
  IF rid IS NOT NULL AND EXISTS (SELECT 1 FROM public.reconciliations WHERE id = rid AND status = 'completed') THEN
    IF TG_OP = 'DELETE' OR NEW.amount_cents <> OLD.amount_cents OR NEW.account_id <> OLD.account_id
       OR NEW.reconciliation_id IS DISTINCT FROM OLD.reconciliation_id THEN
      RAISE EXCEPTION 'Entry % is locked by a completed reconciliation', OLD.id;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER entries_guard_reconciled BEFORE UPDATE OR DELETE ON public.entries FOR EACH ROW EXECUTE FUNCTION public.guard_reconciled_entry();