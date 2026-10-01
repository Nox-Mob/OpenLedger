-- QA hardening: database enforces the full immutable ledger model.

-- 1. Transactions: after posting, only posted -> void may change.
CREATE OR REPLACE FUNCTION public.guard_transaction_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW.id, NEW.org_id, NEW.transaction_date, NEW.posted_date, NEW.description, NEW.source,
           NEW.created_by, NEW.created_at, NEW.idempotency_key)
       IS DISTINCT FROM
       ROW(OLD.id, OLD.org_id, OLD.transaction_date, OLD.posted_date, OLD.description, OLD.source,
           OLD.created_by, OLD.created_at, OLD.idempotency_key) THEN
      RAISE EXCEPTION 'Posted transactions cannot be edited. Void and re-enter.';
    END IF;
    IF NEW.status <> OLD.status AND NOT (OLD.status = 'posted' AND NEW.status = 'void') THEN
      RAISE EXCEPTION 'A voided transaction cannot be restored. Enter a new one.';
    END IF;
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.organizations WHERE id = OLD.org_id)
     AND (OLD.status = 'void' OR EXISTS (SELECT 1 FROM public.entries WHERE transaction_id = OLD.id)) THEN
    RAISE EXCEPTION 'Transactions with entries (or voided ones) cannot be deleted; they are part of the audit trail.';
  END IF;
  RETURN OLD;
END $$;

-- 2. Entries: only the statement-check stamp may change. Reclassify = void + recreate.
CREATE OR REPLACE FUNCTION public.guard_entry_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF ROW(NEW.id, NEW.transaction_id, NEW.account_id, NEW.amount_cents, NEW.category_id,
         NEW.project_id, NEW.fund_id, NEW.memo, NEW.created_at)
     IS DISTINCT FROM
     ROW(OLD.id, OLD.transaction_id, OLD.account_id, OLD.amount_cents, OLD.category_id,
         OLD.project_id, OLD.fund_id, OLD.memo, OLD.created_at) THEN
    RAISE EXCEPTION 'Ledger entries cannot be edited. Void the transaction and record a new one.';
  END IF;
  RETURN NEW;
END $$;

-- 3. Reconciliation can only be completed when the difference is zero.
CREATE OR REPLACE FUNCTION public.guard_reconciliation_complete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE acct_type public.account_type; cleared bigint; sgn int;
BEGIN
  IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    SELECT type INTO acct_type FROM public.accounts WHERE id = NEW.account_id;
    sgn := CASE WHEN acct_type IN ('asset','expense') THEN 1 ELSE -1 END;
    SELECT COALESCE(SUM(e.amount_cents), 0) INTO cleared
      FROM public.entries e JOIN public.transactions t ON t.id = e.transaction_id
     WHERE e.reconciliation_id = NEW.id AND t.status = 'posted';
    IF NEW.ending_balance_cents <> NEW.beginning_balance_cents + sgn * cleared THEN
      RAISE EXCEPTION 'Statement check cannot be finished: difference is % cents, it must be zero.',
        NEW.ending_balance_cents - (NEW.beginning_balance_cents + sgn * cleared);
    END IF;
    IF NEW.completed_by IS DISTINCT FROM auth.uid() AND auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'completed_by must be the current user';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reconciliations_guard_complete BEFORE UPDATE ON public.reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.guard_reconciliation_complete();

-- 4. Bank rows are immutable evidence; only the ledger link and review flag move, under rules.
CREATE OR REPLACE FUNCTION public.guard_bank_evidence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.transaction_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.organizations WHERE id = OLD.org_id) THEN
      RAISE EXCEPTION 'Bank rows posted to the ledger cannot be deleted.';
    END IF;
    RETURN OLD;
  END IF;
  IF ROW(NEW.id, NEW.org_id, NEW.account_id, NEW.bank_date, NEW.description, NEW.amount_cents,
         NEW.external_id, NEW.fingerprint, NEW.raw, NEW.batch_id, NEW.row_seq, NEW.created_at)
     IS DISTINCT FROM
     ROW(OLD.id, OLD.org_id, OLD.account_id, OLD.bank_date, OLD.description, OLD.amount_cents,
         OLD.external_id, OLD.fingerprint, OLD.raw, OLD.batch_id, OLD.row_seq, OLD.created_at) THEN
    RAISE EXCEPTION 'Imported bank rows are evidence and cannot be edited.';
  END IF;
  IF NEW.transaction_id IS DISTINCT FROM OLD.transaction_id THEN
    IF OLD.transaction_id IS NOT NULL AND NEW.transaction_id IS NULL THEN
      IF EXISTS (SELECT 1 FROM public.transactions WHERE id = OLD.transaction_id AND status = 'posted') THEN
        RAISE EXCEPTION 'A bank row can only be unlinked after its transaction is voided.';
      END IF;
    ELSIF OLD.transaction_id IS NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.entries e JOIN public.transactions t ON t.id = e.transaction_id
                     WHERE t.id = NEW.transaction_id AND t.status = 'posted'
                       AND e.account_id = NEW.account_id AND e.amount_cents = NEW.amount_cents) THEN
        RAISE EXCEPTION 'A bank row can only link to a posted transaction with a matching amount on the same account.';
      END IF;
    ELSE
      RAISE EXCEPTION 'A linked bank row cannot be re-pointed to another transaction.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bank_transactions_guard_evidence BEFORE UPDATE OR DELETE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.guard_bank_evidence();

-- 5. Currency: two-decimal currencies only, and frozen once transactions exist.
CREATE OR REPLACE FUNCTION public.guard_org_currency()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.currency IS DISTINCT FROM OLD.currency THEN
    IF NEW.currency NOT IN ('USD','EUR','GBP','CAD','AUD','SEK','NOK','DKK','CHF') THEN
      RAISE EXCEPTION 'Currency % is not supported (amounts are stored with two decimals).', NEW.currency;
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.currency IS DISTINCT FROM OLD.currency
     AND EXISTS (SELECT 1 FROM public.transactions WHERE org_id = OLD.id) THEN
    RAISE EXCEPTION 'Currency cannot change once the organization has transactions.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER organizations_guard_currency BEFORE INSERT OR UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.guard_org_currency();

-- 6. Audit log is written only by trusted server code, never directly by users.
DROP POLICY IF EXISTS "Writers add audit log" ON public.audit_log;
REVOKE INSERT ON public.audit_log FROM authenticated, anon;
GRANT ALL ON public.audit_log TO service_role;

-- 7. Year-end close no longer posts a closing transaction (reports derive retained earnings).
ALTER TABLE public.period_closes ALTER COLUMN transaction_id DROP NOT NULL;
