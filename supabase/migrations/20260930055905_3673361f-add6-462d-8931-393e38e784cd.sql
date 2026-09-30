CREATE OR REPLACE FUNCTION public.validate_transaction_balanced()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  tx_id UUID;
  total BIGINT;
  entry_count INT;
  pos_count INT;
  neg_count INT;
  tx_status public.transaction_status;
BEGIN
  tx_id := COALESCE(NEW.transaction_id, OLD.transaction_id);
  SELECT status INTO tx_status FROM public.transactions WHERE id = tx_id;
  IF tx_status = 'void' THEN RETURN NULL; END IF;

  SELECT COUNT(*),
         COALESCE(SUM(amount_cents), 0),
         COUNT(*) FILTER (WHERE amount_cents > 0),
         COUNT(*) FILTER (WHERE amount_cents < 0)
    INTO entry_count, total, pos_count, neg_count
    FROM public.entries
   WHERE transaction_id = tx_id;

  IF entry_count < 2 THEN
    RAISE EXCEPTION 'Transaction % must have at least 2 entries (has %)', tx_id, entry_count;
  END IF;
  IF total <> 0 THEN
    RAISE EXCEPTION 'Transaction % is not balanced: entries sum to % cents', tx_id, total;
  END IF;
  IF pos_count = 0 OR neg_count = 0 THEN
    RAISE EXCEPTION 'Transaction % must have at least one positive and one negative entry', tx_id;
  END IF;
  RETURN NULL;
END;
$function$;