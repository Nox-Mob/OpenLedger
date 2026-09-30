DO $$
DECLARE
  r record;
  ending bigint;
  final bigint;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('d0e00000-0000-0000-0000-000000000002'::uuid, 'd0e00000-0000-0000-0000-000000000010'::uuid, 'd0e00000-0000-0000-0000-0000000000a1'::uuid, 'd0e00000-0000-0000-0000-0000000000a2'::uuid, DATE '2026-07-01', DATE '2026-08-31', 'simple'::reconcile_mode, 'd0e00000-0000-0000-0000-000000000001'::uuid),
    ('d0e00000-0000-0000-0000-000000000004'::uuid, 'd0e00000-0000-0000-0000-000000000050'::uuid, 'd0e00000-0000-0000-0000-0000000000a3'::uuid, 'd0e00000-0000-0000-0000-0000000000a4'::uuid, DATE '2026-08-01', DATE '2026-08-31', 'full'::reconcile_mode, 'd0e00000-0000-0000-0000-000000000003'::uuid)
  ) AS v(org_id, account_id, done_id, open_id, p_start, p_end, open_mode, user_id)
  LOOP
    IF EXISTS (SELECT 1 FROM public.reconciliations WHERE id = r.done_id) THEN CONTINUE; END IF;
    SELECT COALESCE(SUM(e.amount_cents),0) INTO ending FROM public.entries e JOIN public.transactions t ON t.id = e.transaction_id
      WHERE e.account_id = r.account_id AND t.status='posted' AND t.transaction_date <= r.p_end;
    SELECT COALESCE(SUM(e.amount_cents),0) INTO final FROM public.entries e JOIN public.transactions t ON t.id = e.transaction_id
      WHERE e.account_id = r.account_id AND t.status='posted' AND t.transaction_date <= DATE '2026-09-30';

    INSERT INTO public.reconciliations (id, org_id, account_id, period_start, period_end, beginning_balance_cents, ending_balance_cents, mode, status, created_by)
    VALUES (r.done_id, r.org_id, r.account_id, r.p_start, r.p_end, 0, ending, 'full', 'in_progress', r.user_id);
    UPDATE public.entries e SET reconciliation_id = r.done_id FROM public.transactions t
      WHERE t.id = e.transaction_id AND e.account_id = r.account_id AND t.status='posted' AND t.transaction_date <= r.p_end AND e.reconciliation_id IS NULL;
    UPDATE public.reconciliations SET status='completed', completed_by=r.user_id, completed_at=now() WHERE id = r.done_id;
    INSERT INTO public.audit_log (org_id, user_id, action, entity, entity_id, after)
    VALUES (r.org_id, r.user_id, 'reconcile_complete', 'reconciliation', r.done_id, '{"status":"completed","seed":true}'::jsonb);

    INSERT INTO public.reconciliations (id, org_id, account_id, period_start, period_end, beginning_balance_cents, ending_balance_cents, mode, status, created_by)
    VALUES (r.open_id, r.org_id, r.account_id, r.p_end + 1, DATE '2026-09-30', ending, final, r.open_mode, 'in_progress', r.user_id);
    INSERT INTO public.audit_log (org_id, user_id, action, entity, entity_id, after)
    VALUES (r.org_id, r.user_id, 'reconcile_start', 'reconciliation', r.open_id, '{"seed":true}'::jsonb);
  END LOOP;
END $$;