-- History entries now also store the exact change that audited_write applied,
-- captured by the database itself. The caller-supplied before/after stay as a
-- readable summary, but the recorded change can't be made up by the caller.
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS recorded_change jsonb;
COMMENT ON COLUMN public.audit_log.recorded_change IS 'Exact changes applied by audited_write in the same database transaction, written by the database, not the caller.';

CREATE OR REPLACE FUNCTION public.audit_append_in_write(p_org uuid, p_user uuid, p_audit jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a jsonb;
  v_ops jsonb;
BEGIN
  IF coalesce(current_setting('openledgerapp.audited_write', true), '') <> 'on' THEN
    RAISE EXCEPTION 'History entries can only be written together with a change'
      USING ERRCODE = '42501';
  END IF;
  v_ops := nullif(coalesce(current_setting('openledgerapp.audited_ops', true), ''), '')::jsonb;
  FOR a IN
    SELECT value FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(p_audit) = 'array' THEN p_audit ELSE jsonb_build_array(p_audit) END
    )
  LOOP
    INSERT INTO public.audit_log (id, org_id, user_id, action, entity, entity_id, before, after, kind, recorded_change)
    VALUES (
      (a->>'id')::uuid,
      p_org,
      p_user,
      a->>'action',
      a->>'entity',
      nullif(a->>'entity_id', '')::uuid,
      nullif(a->'before', 'null'::jsonb),
      nullif(a->'after', 'null'::jsonb),
      coalesce(a->>'kind', 'change'),
      v_ops
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.audited_write(
  p_org uuid,
  p_ops jsonb,
  p_audit jsonb,
  p_user uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_service boolean := coalesce(auth.role(), '') = 'service_role';
  v_user uuid;
  o jsonb;
  t text;
  op text;
  vals jsonb;
  m jsonb;
  inl jsonb;
  cols text;
  setl text;
  wherel text;
  n int;
  results jsonb := '[]'::jsonb;
  recorded jsonb := '[]'::jsonb;
  allowed text[] := ARRAY[
    'organizations','accounts','budgets','user_roles','org_invites','reconciliations',
    'entries','bank_transactions','import_batches','import_profiles','pledges','pledge_payments','funds',
    'categories','tags','projects','period_closes'
  ];
BEGIN
  v_user := CASE WHEN v_service THEN p_user ELSE auth.uid() END;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_ops IS NULL OR jsonb_typeof(p_ops) <> 'array' OR jsonb_array_length(p_ops) = 0 THEN
    RAISE EXCEPTION 'audited_write needs at least one change';
  END IF;
  IF p_audit IS NULL OR p_audit = 'null'::jsonb THEN
    RAISE EXCEPTION 'audited_write needs a history entry';
  END IF;

  FOR o IN SELECT value FROM jsonb_array_elements(p_ops) LOOP
    t := o->>'table';
    op := o->>'op';
    IF NOT (t = ANY (allowed)) THEN
      RAISE EXCEPTION 'Table % is not writable here', t;
    END IF;
    IF t = 'entries' AND (op <> 'update' OR (SELECT array_agg(k) FROM jsonb_object_keys(o->'values') k) <> ARRAY['reconciliation_id']) THEN
      RAISE EXCEPTION 'Entries can only change their statement check';
    END IF;
    IF t = 'organizations' AND op = 'delete' THEN
      RAISE EXCEPTION 'Organizations are deleted separately';
    END IF;

    m := coalesce(o->'match', '{}'::jsonb);
    inl := coalesce(o->'in', '{}'::jsonb);
    IF t = 'organizations' THEN
      m := m || jsonb_build_object('id', p_org);
    ELSIF t <> 'entries' THEN
      m := m || jsonb_build_object('org_id', p_org);
    END IF;

    IF op = 'insert' THEN
      vals := o->'values';
      IF jsonb_typeof(vals) = 'object' THEN vals := jsonb_build_array(vals); END IF;
      IF vals IS NULL OR jsonb_array_length(vals) = 0 THEN
        results := results || jsonb_build_array(jsonb_build_object('count', 0));
        CONTINUE;
      END IF;
      SELECT jsonb_agg(e || CASE WHEN t = 'organizations' THEN jsonb_build_object('id', p_org)
                                 ELSE jsonb_build_object('org_id', p_org) END)
        INTO vals FROM jsonb_array_elements(vals) e;
      SELECT string_agg(quote_ident(k), ', ') INTO cols FROM jsonb_object_keys(vals->0) k;
      EXECUTE format(
        'INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_recordset(NULL::public.%I, $1) %s',
        t, cols, cols, t,
        CASE WHEN o->>'conflict' = 'nothing' THEN 'ON CONFLICT DO NOTHING' ELSE '' END
      ) USING vals;
      GET DIAGNOSTICS n = ROW_COUNT;
      recorded := recorded || jsonb_build_array(jsonb_build_object(
        'table', t, 'op', op, 'values', vals, 'rows', n));
    ELSIF op IN ('update', 'delete') THEN
      SELECT string_agg(x, ' AND ') INTO wherel FROM (
        SELECT format('t.%I IS NOT DISTINCT FROM mm.%I', k, k) AS x FROM jsonb_object_keys(m) k
        UNION ALL
        SELECT format('t.%I::text IN (SELECT jsonb_array_elements_text($3->%L))', k, k)
          FROM jsonb_object_keys(inl) k
      ) s;
      IF wherel IS NULL THEN RAISE EXCEPTION 'A change needs a filter'; END IF;
      IF op = 'update' THEN
        vals := o->'values';
        SELECT string_agg(format('%I = r.%I', k, k), ', ') INTO setl FROM jsonb_object_keys(vals) k;
        IF setl IS NULL THEN RAISE EXCEPTION 'An update needs values'; END IF;
        EXECUTE format(
          'UPDATE public.%I t SET %s FROM jsonb_populate_record(NULL::public.%I, $1) r, jsonb_populate_record(NULL::public.%I, $2) mm WHERE %s',
          t, setl, t, t, wherel
        ) USING vals, m, inl;
        GET DIAGNOSTICS n = ROW_COUNT;
      ELSE
        vals := NULL;
        EXECUTE format(
          'DELETE FROM public.%I t USING jsonb_populate_record(NULL::public.%I, $2) mm WHERE %s',
          t, t, wherel
        ) USING NULL::jsonb, m, inl;
        GET DIAGNOSTICS n = ROW_COUNT;
      END IF;
      recorded := recorded || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'table', t, 'op', op, 'values', vals, 'match', m,
        'in', nullif(inl, '{}'::jsonb), 'rows', n)));
    ELSE
      RAISE EXCEPTION 'Unknown change type %', op;
    END IF;

    IF n < coalesce((o->>'min_rows')::int, 0) THEN
      RAISE EXCEPTION '%', coalesce(o->>'min_rows_message', 'The record was not found or was already changed')
        USING ERRCODE = 'P0002';
    END IF;
    results := results || jsonb_build_array(jsonb_build_object('count', n));
  END LOOP;

  IF NOT v_service AND NOT public.is_org_member(v_user, p_org) THEN
    RAISE EXCEPTION 'Not a member of this organization' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('openledgerapp.audited_ops', recorded::text, true);
  PERFORM set_config('openledgerapp.audited_write', 'on', true);
  PERFORM public.audit_append_in_write(p_org, v_user, p_audit);
  PERFORM set_config('openledgerapp.audited_write', 'off', true);
  PERFORM set_config('openledgerapp.audited_ops', '', true);
  RETURN results;
END;
$$;