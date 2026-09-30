-- Open Ledger — security & integrity hardening
-- Closes gaps that let any signed-in browser session bypass the server-function rules,
-- because the app's ONLY real enforcement layer is RLS + triggers (the browser holds a
-- valid Supabase session and can call the tables directly).
--
-- Tested against a replay of the repo's own migrations. Requires ONE app change:
--   createOrganization (src/lib/org.functions.ts) must STOP inserting the creator's
--   user_roles row — the trigger in section 1 now does it.

-- ---------------------------------------------------------------------------
-- 1. user_roles: nobody can grant themselves a role on an org they don't belong to.
--    Old INSERT policy allowed (auth.uid() = user_id AND role = 'admin') for ANY org_id.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins manage org roles" ON public.user_roles;
CREATE POLICY "Admins manage org roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(auth.uid(), org_id, 'admin'));

-- The creator becomes admin via a trigger (runs as owner, so no self-insert policy is needed).
CREATE OR REPLACE FUNCTION public.add_creator_as_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, org_id, role) VALUES (NEW.created_by, NEW.id, 'admin');
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.add_creator_as_admin() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS organizations_add_creator ON public.organizations;
CREATE TRIGGER organizations_add_creator AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.add_creator_as_admin();

-- ---------------------------------------------------------------------------
-- 2. Last admin can never be demoted or removed (enforced in the database).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_last_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.role = 'admin' AND (TG_OP = 'DELETE' OR NEW.role <> 'admin') THEN
    -- Allow when the whole org is being deleted (cascade).
    IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = OLD.org_id) THEN
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.user_roles
                   WHERE org_id = OLD.org_id AND role = 'admin' AND id <> OLD.id) THEN
      RAISE EXCEPTION 'An organization must keep at least one admin';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_last_admin() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS user_roles_guard_last_admin ON public.user_roles;
CREATE TRIGGER user_roles_guard_last_admin BEFORE UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.guard_last_admin();

-- ---------------------------------------------------------------------------
-- 3. Ledger immutability ("never edit in place; void + recreate").
--    The app only ever changes entries.reconciliation_id and flips transactions posted -> void.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_entry_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.amount_cents <> OLD.amount_cents
     OR NEW.account_id <> OLD.account_id
     OR NEW.transaction_id <> OLD.transaction_id THEN
    RAISE EXCEPTION 'Ledger entries cannot be edited. Void the transaction and record a new one.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS entries_guard_immutable ON public.entries;
CREATE TRIGGER entries_guard_immutable BEFORE UPDATE ON public.entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_entry_immutable();

-- Entries are never deleted by users (cascade from an org/transaction delete bypasses RLS).
DROP POLICY IF EXISTS "Writers delete entries" ON public.entries;

CREATE OR REPLACE FUNCTION public.guard_transaction_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.org_id <> OLD.org_id OR NEW.transaction_date <> OLD.transaction_date
       OR NEW.source <> OLD.source OR NEW.description <> OLD.description THEN
      RAISE EXCEPTION 'Posted transactions cannot be edited. Void and re-enter.';
    END IF;
    IF OLD.status = 'void' AND NEW.status <> 'void' THEN
      RAISE EXCEPTION 'A voided transaction cannot be restored. Enter a new one.';
    END IF;
    RETURN NEW;
  END IF;
  -- DELETE: only an empty shell (rollback of a failed create) may be removed, and never if the org still exists with a void/entries.
  IF EXISTS (SELECT 1 FROM public.organizations WHERE id = OLD.org_id)
     AND (OLD.status = 'void' OR EXISTS (SELECT 1 FROM public.entries WHERE transaction_id = OLD.id)) THEN
    RAISE EXCEPTION 'Transactions with entries (or voided ones) cannot be deleted; they are part of the audit trail.';
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS transactions_guard_immutable ON public.transactions;
CREATE TRIGGER transactions_guard_immutable BEFORE UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.guard_transaction_immutable();

-- ---------------------------------------------------------------------------
-- 4. Audit log cannot be forged: the actor must be the caller.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Writers add audit log" ON public.audit_log;
CREATE POLICY "Writers add audit log" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (public.can_write_org(auth.uid(), org_id) AND user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5. Reconciliation: reopening is admin-only IN THE DATABASE; completed rows are frozen;
--    at most one in-progress reconciliation per account (closes a check-then-insert race).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_reconciliation_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status = 'completed' THEN
    IF NEW.status = 'in_progress' THEN
      IF NOT public.has_org_role(auth.uid(), OLD.org_id, 'admin') THEN
        RAISE EXCEPTION 'Only admins can reopen a completed reconciliation';
      END IF;
    ELSIF NEW.period_start <> OLD.period_start OR NEW.period_end <> OLD.period_end
       OR NEW.beginning_balance_cents <> OLD.beginning_balance_cents
       OR NEW.ending_balance_cents <> OLD.ending_balance_cents OR NEW.account_id <> OLD.account_id THEN
      RAISE EXCEPTION 'A completed reconciliation cannot be changed; reopen it first';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_reconciliation_update() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS reconciliations_guard_update ON public.reconciliations;
CREATE TRIGGER reconciliations_guard_update BEFORE UPDATE ON public.reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.guard_reconciliation_update();

CREATE UNIQUE INDEX IF NOT EXISTS reconciliations_one_open_per_account
  ON public.reconciliations (account_id) WHERE status = 'in_progress';

-- ---------------------------------------------------------------------------
-- 6. Accounts: type is locked once the account has entries (reports would silently flip sections).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_account_type()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.type <> OLD.type AND EXISTS (SELECT 1 FROM public.entries WHERE account_id = OLD.id) THEN
    RAISE EXCEPTION 'Account type cannot change once the account has transactions';
  END IF;
  IF NEW.org_id <> OLD.org_id THEN RAISE EXCEPTION 'Account cannot move between organizations'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS accounts_guard_type ON public.accounts;
CREATE TRIGGER accounts_guard_type BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.guard_account_type();

-- ---------------------------------------------------------------------------
-- 7. Cross-tenant reference integrity: an entry may only point at its own org's
--    account / category / project / fund. (RLS on entries only checked the transaction's org.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_entry_refs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tx_org uuid;
BEGIN
  SELECT org_id INTO tx_org FROM public.transactions WHERE id = NEW.transaction_id;
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = NEW.account_id AND org_id = tx_org) THEN
    RAISE EXCEPTION 'Account does not belong to this organization';
  END IF;
  IF NEW.category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.categories WHERE id = NEW.category_id AND org_id = tx_org) THEN
    RAISE EXCEPTION 'Category does not belong to this organization';
  END IF;
  IF NEW.project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.projects WHERE id = NEW.project_id AND org_id = tx_org) THEN
    RAISE EXCEPTION 'Project does not belong to this organization';
  END IF;
  IF NEW.fund_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.funds WHERE id = NEW.fund_id AND org_id = tx_org) THEN
    RAISE EXCEPTION 'Fund does not belong to this organization';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_entry_refs() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS entries_guard_refs ON public.entries;
CREATE TRIGGER entries_guard_refs BEFORE INSERT OR UPDATE OF transaction_id, account_id, category_id, project_id, fund_id ON public.entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_entry_refs();

-- Same for bank rows: the account must belong to the row's org.
CREATE OR REPLACE FUNCTION public.guard_bank_refs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = NEW.account_id AND org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'Account does not belong to this organization';
  END IF;
  IF NEW.transaction_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.transactions WHERE id = NEW.transaction_id AND org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'Transaction does not belong to this organization';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_bank_refs() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS bank_transactions_guard_refs ON public.bank_transactions;
CREATE TRIGGER bank_transactions_guard_refs BEFORE INSERT OR UPDATE OF org_id, account_id, transaction_id ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.guard_bank_refs();
