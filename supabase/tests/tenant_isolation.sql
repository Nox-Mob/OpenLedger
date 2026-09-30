-- Tenant isolation check: acts as a signed-in stranger (member of no org) and tries to
-- read / change / delete every org table. Raises 'RESULT ...'; every count must be 0 and
-- every insert "blocked". The raise rolls everything back.
DO $$
DECLARE r text := ''; n int; t text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  FOREACH t IN ARRAY ARRAY['organizations','accounts','transactions','entries','bank_transactions','reconciliations','audit_log','user_roles','import_batches','import_profiles','categories','tags','projects','funds','transaction_tags'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n; r := r || t || ' read=' || n || '; ';
  END LOOP;
  UPDATE public.transactions SET status='void'; GET DIAGNOSTICS n = ROW_COUNT; r := r || 'void=' || n || '; ';
  DELETE FROM public.entries; GET DIAGNOSTICS n = ROW_COUNT; r := r || 'del_entries=' || n || '; ';
  DELETE FROM public.bank_transactions; GET DIAGNOSTICS n = ROW_COUNT; r := r || 'del_bank=' || n || '; ';
  UPDATE public.reconciliations SET status='in_progress'; GET DIAGNOSTICS n = ROW_COUNT; r := r || 'upd_rec=' || n || '; ';
  UPDATE public.user_roles SET role='admin'; GET DIAGNOSTICS n = ROW_COUNT; r := r || 'upd_roles=' || n || '; ';
  BEGIN INSERT INTO public.user_roles(user_id, org_id, role) SELECT '11111111-1111-1111-1111-111111111111', id, 'admin' FROM public.organizations LIMIT 1; r := r || 'self_join=checked; ';
  EXCEPTION WHEN others THEN r := r || 'self_join=blocked; '; END;
  BEGIN DELETE FROM public.audit_log; r := r || 'audit_delete=no_error; ';
  EXCEPTION WHEN others THEN r := r || 'audit_delete=blocked; '; END;
  RAISE EXCEPTION 'RESULT %', r;
END $$;
