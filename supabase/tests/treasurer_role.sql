-- Treasurer role: may keep the books, close the year, lock the books and reopen finished
-- statement checks, but never change settings or people. Members may do none of the closing
-- steps. Always rolls back (final RAISE).
DO $$
DECLARE
  r text := '';
  owner uuid := '11111111-1111-1111-1111-111111111111';
  treas uuid := '44444444-4444-4444-4444-444444444444';
  mem uuid := '55555555-5555-5555-5555-555555555555';
  org uuid := gen_random_uuid();
  acct uuid := gen_random_uuid();
  rec uuid := gen_random_uuid();
  rec2 uuid := gen_random_uuid();
  n int;
BEGIN
  INSERT INTO auth.users (id, email, instance_id, aud, role, confirmation_token, recovery_token,
    email_change_token_new, email_change)
  VALUES
    (owner, 'ci-owner@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', '', '', ''),
    (treas, 'ci-treasurer@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', '', '', ''),
    (mem, 'ci-member@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', '', '', '')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.organizations (id, name, created_by) VALUES (org, 'CI Treasurer', owner);
  INSERT INTO public.user_roles (user_id, org_id, role) VALUES (treas, org, 'treasurer'), (mem, org, 'member');
  INSERT INTO public.accounts (id, org_id, name, type) VALUES (acct, org, 'Cash', 'asset');
  INSERT INTO public.reconciliations (id, org_id, account_id, period_start, period_end,
      beginning_balance_cents, ending_balance_cents, mode, status)
    VALUES (rec, org, acct, '2026-01-01', '2026-01-31', 0, 0, 'simple', 'completed'),
           (rec2, org, acct, '2026-02-01', '2026-02-28', 0, 0, 'simple', 'completed');

  -- Act as the treasurer.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', treas, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  r := r || 'treasurer_can_write=' || CASE WHEN public.can_write_org(treas, org) THEN 'PASS' ELSE 'FAIL' END || '; ';

  UPDATE public.organizations SET books_locked_through = '2026-03-31' WHERE id = org;
  GET DIAGNOSTICS n = ROW_COUNT;
  r := r || 'treasurer_lock_books=' || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || '; ';

  BEGIN
    UPDATE public.organizations SET name = 'Renamed by treasurer' WHERE id = org;
    GET DIAGNOSTICS n = ROW_COUNT;
    r := r || 'treasurer_change_settings=' || n || '; ';
  EXCEPTION WHEN others THEN r := r || 'treasurer_change_settings=blocked; ';
  END;

  BEGIN
    INSERT INTO public.period_closes (org_id, fiscal_year_end, net_income_cents, closed_by)
      VALUES (org, '2025-12-31', 0, treas);
    r := r || 'treasurer_year_close=PASS; ';
  EXCEPTION WHEN others THEN r := r || 'treasurer_year_close=FAIL; ';
  END;

  BEGIN
    UPDATE public.reconciliations SET status = 'in_progress' WHERE id = rec;
    GET DIAGNOSTICS n = ROW_COUNT;
    r := r || 'treasurer_reopen=' || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || '; ';
  EXCEPTION WHEN others THEN r := r || 'treasurer_reopen=FAIL; ';
  END;

  BEGIN
    UPDATE public.user_roles SET role = 'admin' WHERE org_id = org AND user_id = treas;
    GET DIAGNOSTICS n = ROW_COUNT;
    r := r || 'treasurer_change_roles=' || n || '; ';
  EXCEPTION WHEN others THEN r := r || 'treasurer_change_roles=blocked; ';
  END;

  BEGIN
    INSERT INTO public.org_invites (org_id, token_hash, role, created_by, expires_at)
      VALUES (org, 'ci-treas-hash', 'admin', treas, now() + interval '1 day');
    r := r || 'treasurer_invite=FAIL; ';
  EXCEPTION WHEN others THEN r := r || 'treasurer_invite=blocked; ';
  END;

  -- Act as a plain member.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', mem, 'role', 'authenticated')::text, true);

  UPDATE public.organizations SET books_locked_through = '2026-06-30' WHERE id = org;
  GET DIAGNOSTICS n = ROW_COUNT;
  r := r || 'member_lock_books=' || n || '; ';

  BEGIN
    INSERT INTO public.period_closes (org_id, fiscal_year_end, net_income_cents, closed_by)
      VALUES (org, '2024-12-31', 0, mem);
    r := r || 'member_year_close=FAIL; ';
  EXCEPTION WHEN others THEN r := r || 'member_year_close=blocked; ';
  END;

  BEGIN
    UPDATE public.reconciliations SET status = 'in_progress' WHERE id = rec2;
    GET DIAGNOSTICS n = ROW_COUNT;
    r := r || 'member_reopen=' || n || '; ';
  EXCEPTION WHEN others THEN r := r || 'member_reopen=blocked; ';
  END;

  RAISE EXCEPTION 'RESULT %', r;
END $$;
