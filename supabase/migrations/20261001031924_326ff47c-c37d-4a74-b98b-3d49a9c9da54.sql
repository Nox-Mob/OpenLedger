CREATE OR REPLACE FUNCTION public.guard_one_opening_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- The offsetting equity account legitimately appears in every opening balance.
  IF EXISTS (SELECT 1 FROM public.transactions WHERE id = NEW.transaction_id AND source = 'opening_balance')
     AND NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = NEW.account_id AND type = 'equity') THEN
    PERFORM pg_advisory_xact_lock(hashtext('opening:' || NEW.account_id::text));
    IF EXISTS (SELECT 1 FROM public.entries e JOIN public.transactions t ON t.id = e.transaction_id
               WHERE e.account_id = NEW.account_id AND t.source = 'opening_balance'
                 AND t.status = 'posted' AND t.id <> NEW.transaction_id) THEN
      RAISE EXCEPTION 'This account already has an opening balance. Void it first.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_one_opening_balance() FROM PUBLIC, anon, authenticated;