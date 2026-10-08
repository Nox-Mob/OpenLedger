-- End-to-end checks for the audited_write / audit_append_in_write RPCs.
-- Runs as superuser inside a transaction that always rolls back.
-- Each check records PASS/FAIL; the final RAISE prints the 'RESULT ...' line.
DO $$
DECLARE
  r text := '';
  usr uuid;
  stranger uuid := '22222222-2222-2222-2222-222222222222';
  org uuid := gen_random_uuid();
  fund1 uuid := gen_random_uuid();
  rows jsonb;
  n int;
BEGIN
  -- Reuse an existing auth user when auth.users inserts are blocked locally.
  BEGIN
    usr := '11111111-1111-1111-1111-111111111111';
    INSERT INTO auth.users (id, email, instance_id, aud, role, confirmation_token, recovery_token,
      email_change_token_new, email_change)
    VALUES (usr, 'ci-' || usr || '@example.test', '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', '', '', '', '');
  EXCEPTION WHEN others THEN
    SELECT id INTO usr FROM auth.users LIMIT 1;
  END;
  INSERT INTO public.organizations (id, name, created_by) VALUES (org, 'CI Aud', usr);

  -- Sign the session in as that user.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', usr::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- 1. audit_append_in_write refuses to run on its own.
  BEGIN
    PERFORM public.audit_append_in_write(org, usr,
      jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'action', 'forged',
        'entity', 'organization', 'entity_id', org)));
    r := r || 'direct_history_blocked=FAIL; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'direct_history_blocked=PASS; ';
  END;

  -- 2. A write that isn't on the allowlist is refused.
  BEGIN
    PERFORM public.audited_write(org,
      jsonb_build_array(jsonb_build_object('table','audit_log','op','delete',
        'match', jsonb_build_object('id', org))),
      jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'action','x','entity','x')));
    r := r || 'allowlist=FAIL; ';
  EXCEPTION WHEN others THEN r := r || 'allowlist=PASS; ';
  END;

  -- 3. min_rows raises when nothing matched (no rogue history row left behind).
  BEGIN
    PERFORM public.audited_write(org,
      jsonb_build_array(jsonb_build_object('table','funds','op','delete',
        'match', jsonb_build_object('id', gen_random_uuid()),
        'min_rows', 1)),
      jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'action','x','entity','fund')));
    r := r || 'min_rows=FAIL; ';
  EXCEPTION WHEN no_data_found THEN r := r || 'min_rows=PASS; ';
  END;
  SELECT count(*) INTO n FROM public.audit_log WHERE org_id = org; -- rolled back
  r := r || 'min_rows_rollback_history=' || n || '; ';

  -- 4. Deleting an organization through audited_write is refused.
  BEGIN
    PERFORM public.audited_write(org,
      jsonb_build_array(jsonb_build_object('table','organizations','op','delete',
        'match', jsonb_build_object('id', org))),
      jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'action','x','entity','organization')));
    r := r || 'org_delete=FAIL; ';
  EXCEPTION WHEN others THEN r := r || 'org_delete=PASS; ';
  END;

  -- 5. An update on entries that touches anything other than reconciliation_id is refused.
  BEGIN
    PERFORM public.audited_write(org,
      jsonb_build_array(jsonb_build_object('table','entries','op','update',
        'values', jsonb_build_object('amount_cents', 1),
        'match', jsonb_build_object('id', gen_random_uuid()))),
      jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'action','x','entity','entry')));
    r := r || 'entries_lock=FAIL; ';
  EXCEPTION WHEN others THEN r := r || 'entries_lock=PASS; ';
  END;

  -- 6. Insert on an allowed table saves the change and its history together.
  PERFORM public.audited_write(org,
    jsonb_build_array(jsonb_build_object('table','funds','op','insert',
      'values', jsonb_build_object('id', fund1, 'name', 'Building', 'is_restricted', true))),
    jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'action','create',
      'entity','fund','entity_id', fund1)));
  SELECT count(*) INTO n FROM public.funds WHERE id = fund1;
  r := r || 'fund_insert=' || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL(' || n || ')' END || '; ';
  SELECT count(*) INTO n FROM public.audit_log WHERE org_id = org AND entity = 'fund';
  r := r || 'fund_history=' || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL(' || n || ')' END || '; ';

  -- 7. Someone else can't write to this org even if they know its id.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', stranger::text, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.audited_write(org,
      jsonb_build_array(jsonb_build_object('table','funds','op','insert',
        'values', jsonb_build_object('id', gen_random_uuid(), 'name', 'Stranger'))),
      jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'action','x','entity','fund')));
    r := r || 'non_member=FAIL; ';
  EXCEPTION WHEN others THEN r := r || 'non_member=PASS; ';
  END;

  RAISE EXCEPTION 'RESULT %', r;
END $$;
