-- Member lifecycle, organization delete and two-step sign-in, each with its failure path.
-- A failed step must leave no change and no history behind. Always rolls back (final RAISE).
DO $$
DECLARE
  r text := '';
  owner uuid := '11111111-1111-1111-1111-111111111111';
  joiner uuid := '33333333-3333-3333-3333-333333333333';
  org uuid := gen_random_uuid();
  org2 uuid := gen_random_uuid();
  inv uuid := gen_random_uuid();
  acct uuid := gen_random_uuid();
  n int;
BEGIN
  INSERT INTO auth.users (id, email, instance_id, aud, role, confirmation_token, recovery_token,
    email_change_token_new, email_change)
  VALUES
    (owner, 'ci-owner@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', '', '', ''),
    (joiner, 'ci-joiner@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', '', '', '')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.organizations (id, name, created_by) VALUES (org, 'CI Members', owner);
  INSERT INTO public.organizations (id, name, created_by) VALUES (org2, 'CI Delete Me', owner);
  INSERT INTO public.accounts (id, org_id, name, type) VALUES (acct, org, 'Cash', 'asset');
  INSERT INTO public.org_invites (id, org_id, token_hash, role, created_by, expires_at)
    VALUES (inv, org, 'ci-hash', 'member', owner, now() + interval '1 day');

  -- Act as the server (service role) for the privileged member paths.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM set_config('role', 'service_role', true);

  -- 1. Invite claim works once; a second claim fails and adds no history.
  PERFORM public.audited_write(org, jsonb_build_array(
      jsonb_build_object('table','org_invites','op','update',
        'values', jsonb_build_object('used_at', now(), 'used_by', joiner),
        'match', jsonb_build_object('id', inv, 'used_at', null, 'revoked_at', null), 'min_rows', 1),
      jsonb_build_object('table','user_roles','op','insert',
        'values', jsonb_build_object('id', gen_random_uuid(), 'user_id', joiner, 'role', 'member'))),
    jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'action','join','entity','user_role')),
    joiner);
  BEGIN
    PERFORM public.audited_write(org, jsonb_build_array(
        jsonb_build_object('table','org_invites','op','update',
          'values', jsonb_build_object('used_at', now(), 'used_by', owner),
          'match', jsonb_build_object('id', inv, 'used_at', null, 'revoked_at', null), 'min_rows', 1),
        jsonb_build_object('table','user_roles','op','insert',
          'values', jsonb_build_object('id', gen_random_uuid(), 'user_id', gen_random_uuid(), 'role', 'admin'))),
      jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'action','join','entity','user_role')),
      owner);
    r := r || 'invite_reuse=FAIL; ';
  EXCEPTION WHEN others THEN
    SELECT count(*) INTO n FROM public.audit_log WHERE org_id = org AND action = 'join';
    r := r || 'invite_reuse=' || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || '; ';
  END;

  -- 2. Removing the last admin is refused and leaves no history.
  BEGIN
    PERFORM public.audited_write(org,
      jsonb_build_array(jsonb_build_object('table','user_roles','op','delete',
        'match', jsonb_build_object('user_id', owner))),
      jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'action','remove','entity','user_role')),
      owner);
    r := r || 'last_admin_remove=FAIL; ';
  EXCEPTION WHEN others THEN
    SELECT count(*) INTO n FROM public.audit_log WHERE org_id = org AND action = 'remove';
    r := r || 'last_admin_remove=' || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || '; ';
  END;

  -- 3. Ownership transfer from someone who isn't the owner changes nothing.
  BEGIN
    PERFORM public.audited_write(org,
      jsonb_build_array(jsonb_build_object('table','organizations','op','update',
        'values', jsonb_build_object('created_by', joiner),
        'match', jsonb_build_object('created_by', joiner), 'min_rows', 1)),
      jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'action','transfer_ownership','entity','organization')),
      joiner);
    r := r || 'transfer_wrong_owner=FAIL; ';
  EXCEPTION WHEN others THEN
    SELECT count(*) INTO n FROM public.organizations WHERE id = org AND created_by = owner;
    SELECT n + count(*) INTO n FROM public.audit_log WHERE org_id = org AND action = 'transfer_ownership';
    r := r || 'transfer_wrong_owner=' || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || '; ';
  END;

  -- 4. A settings change that matches nothing saves no history.
  BEGIN
    PERFORM public.audited_write(org,
      jsonb_build_array(jsonb_build_object('table','organizations','op','update',
        'values', jsonb_build_object('name', 'Renamed'),
        'match', jsonb_build_object('name', 'Not this name'), 'min_rows', 1)),
      jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'action','update_settings','entity','organization')),
      owner);
    r := r || 'settings_no_match=FAIL; ';
  EXCEPTION WHEN others THEN
    SELECT count(*) INTO n FROM public.audit_log WHERE org_id = org AND action = 'update_settings';
    r := r || 'settings_no_match=' || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || '; ';
  END;

  -- 5. Organization delete: wrong name or wrong person changes nothing; right one does both steps.
  BEGIN
    PERFORM public.delete_organization_atomic(org2, owner, 'wrong name');
    r := r || 'org_delete_wrong_name=FAIL; ';
  EXCEPTION WHEN others THEN
    SELECT count(*) INTO n FROM public.deleted_organizations WHERE org_id = org2;
    r := r || 'org_delete_wrong_name=' || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || '; ';
  END;
  BEGIN
    PERFORM public.delete_organization_atomic(org2, joiner, 'CI Delete Me');
    r := r || 'org_delete_not_owner=FAIL; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'org_delete_not_owner=PASS; ';
  END;
  PERFORM public.delete_organization_atomic(org2, owner, 'CI Delete Me');
  SELECT count(*) INTO n FROM public.deleted_organizations WHERE org_id = org2;
  SELECT n + (1 - count(*)) INTO n FROM public.organizations WHERE id = org2;
  r := r || 'org_delete_together=' || CASE WHEN n = 2 THEN 'PASS' ELSE 'FAIL' END || '; ';

  -- 6. Signed-in users can't call the organization delete function at all.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', owner::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    PERFORM public.delete_organization_atomic(org, owner, 'CI Members');
    r := r || 'org_delete_user_blocked=FAIL; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'org_delete_user_blocked=PASS; ';
  END;

  -- 7. A removed member loses access on their very next request.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', joiner::text, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO n FROM public.accounts WHERE org_id = org;
  r := r || 'member_sees_books=' || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || '; ';
  PERFORM set_config('role', 'postgres', true);
  DELETE FROM public.user_roles WHERE org_id = org AND user_id = joiner;
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO n FROM public.accounts WHERE org_id = org;
  SELECT n + count(*) INTO n FROM public.organizations WHERE id = org;
  r := r || 'removed_member_access=' || n || '; ';

  -- 8. Two-step sign-in required: a password-only session sees the org name but no books.
  PERFORM set_config('role', 'postgres', true);
  UPDATE public.organizations SET require_mfa = true WHERE id = org;
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', owner::text, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  SELECT count(*) INTO n FROM public.accounts WHERE org_id = org;
  r := r || 'mfa_aal1_books=' || n || '; ';
  SELECT count(*) INTO n FROM public.organizations WHERE id = org;
  r := r || 'mfa_aal1_sees_org=' || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || '; ';
  BEGIN
    INSERT INTO public.accounts (id, org_id, name, type) VALUES (gen_random_uuid(), org, 'Sneaky', 'asset');
    r := r || 'mfa_aal1_write=FAIL; ';
  EXCEPTION WHEN others THEN r := r || 'mfa_aal1_write=blocked; ';
  END;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', owner::text, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  SELECT count(*) INTO n FROM public.accounts WHERE org_id = org;
  r := r || 'mfa_aal2_books=' || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || '; ';

  RAISE EXCEPTION 'RESULT %', r;
END $$;
