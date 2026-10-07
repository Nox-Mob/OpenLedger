-- Deleting an organization cascades through many tables in an arbitrary order. Checking
-- these "no action" references at commit (instead of per row) lets the whole cascade
-- finish; any reference still broken at commit still fails, so nothing else changes.
ALTER TABLE public.entries ALTER CONSTRAINT entries_account_id_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.entries ALTER CONSTRAINT entries_category_id_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.entries ALTER CONSTRAINT entries_project_id_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.entries ALTER CONSTRAINT entries_fund_id_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.bank_transactions ALTER CONSTRAINT bank_transactions_account_id_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.import_batches ALTER CONSTRAINT import_batches_account_id_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.reconciliations ALTER CONSTRAINT reconciliations_account_id_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.period_closes ALTER CONSTRAINT period_closes_transaction_id_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.pledges ALTER CONSTRAINT pledges_transaction_id_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.pledges ALTER CONSTRAINT pledges_fund_id_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.pledge_payments ALTER CONSTRAINT pledge_payments_transaction_id_fkey DEFERRABLE INITIALLY DEFERRED;