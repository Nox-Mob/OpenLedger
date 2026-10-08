ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'change';
UPDATE public.audit_log SET kind = 'ledger' WHERE entity = 'transaction';
UPDATE public.audit_log SET kind = 'system' WHERE action LIKE 'backup.%' OR action LIKE 'import%' OR action LIKE 'invite%' OR action LIKE 'member%' OR entity IN ('import_batch','invite','member');
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_kind_check CHECK (kind IN ('change','ledger','system'));

-- Post a transaction and its history entry in one database transaction.
CREATE OR REPLACE FUNCTION public.post_transaction_atomic(p_tx jsonb, p_entries jsonb, p_tags jsonb, p_audit jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid := (p_tx->>'org_id')::uuid;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.can_write_org(v_uid, v_org) THEN
    RAISE EXCEPTION 'Not allowed to post in this organization' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(p_tags,'[]'::jsonb)) t(id)
             LEFT JOIN public.tags g ON g.id = t.id::uuid AND g.org_id = v_org WHERE g.id IS NULL) THEN
    RAISE EXCEPTION 'Tag does not belong to this organization';
  END IF;
  INSERT INTO public.transactions (id, org_id, transaction_date, posted_date, description, source, created_by, idempotency_key)
  VALUES ((p_tx->>'id')::uuid, v_org, (p_tx->>'transaction_date')::date, (p_tx->>'posted_date')::date,
          p_tx->>'description', (p_tx->>'source')::transaction_source, v_uid, p_tx->>'idempotency_key');
  INSERT INTO public.entries (id, transaction_id, account_id, amount_cents, category_id, project_id, fund_id, memo)
  SELECT (e->>'id')::uuid, (p_tx->>'id')::uuid, (e->>'account_id')::uuid, (e->>'amount_cents')::bigint,
         (e->>'category_id')::uuid, (e->>'project_id')::uuid, (e->>'fund_id')::uuid, e->>'memo'
  FROM jsonb_array_elements(p_entries) e;
  INSERT INTO public.transaction_tags (transaction_id, tag_id)
  SELECT (p_tx->>'id')::uuid, t::uuid FROM jsonb_array_elements_text(coalesce(p_tags,'[]'::jsonb)) t;
  IF p_audit IS NOT NULL THEN
    INSERT INTO public.audit_log (id, org_id, user_id, action, entity, entity_id, before, after, kind)
    VALUES ((p_audit->>'id')::uuid, v_org, v_uid, p_audit->>'action', p_audit->>'entity',
            (p_audit->>'entity_id')::uuid, p_audit->'before', p_audit->'after', 'ledger');
  END IF;
END $$;

-- Flip posted -> void and record history in one database transaction. Returns false if already void.
CREATE OR REPLACE FUNCTION public.void_transaction_atomic(p_org uuid, p_id uuid, p_audit jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.can_write_org(v_uid, p_org) THEN
    RAISE EXCEPTION 'Not allowed to void in this organization' USING ERRCODE = '42501';
  END IF;
  UPDATE public.transactions SET status = 'void' WHERE org_id = p_org AND id = p_id AND status = 'posted';
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_audit IS NOT NULL THEN
    INSERT INTO public.audit_log (id, org_id, user_id, action, entity, entity_id, before, after, kind)
    VALUES ((p_audit->>'id')::uuid, p_org, v_uid, p_audit->>'action', p_audit->>'entity',
            p_id, p_audit->'before', p_audit->'after', 'ledger');
  END IF;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.post_transaction_atomic(jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.void_transaction_atomic(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_transaction_atomic(jsonb, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_transaction_atomic(uuid, uuid, jsonb) TO authenticated;