ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'treasurer' AFTER 'admin';

CREATE OR REPLACE FUNCTION public.can_write_org(_user_id uuid, _org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND org_id = _org_id
                 AND role::text IN ('admin', 'treasurer', 'member'))
     AND public.mfa_ok(_org_id)
$$;

-- Admins and treasurers: year close, book lock, reopening finished statement checks.
CREATE OR REPLACE FUNCTION public.can_close_books(_user_id uuid, _org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND org_id = _org_id
                 AND role::text IN ('admin', 'treasurer'))
     AND public.mfa_ok(_org_id)
$$;
REVOKE EXECUTE ON FUNCTION public.can_close_books(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_close_books(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_reconciliation_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF OLD.status = 'completed' THEN
    IF NEW.status = 'in_progress' THEN
      IF NOT public.can_close_books(auth.uid(), OLD.org_id) THEN
        RAISE EXCEPTION 'Only admins and treasurers can reopen a completed reconciliation';
      END IF;
    ELSIF NEW.period_start <> OLD.period_start OR NEW.period_end <> OLD.period_end
       OR NEW.beginning_balance_cents <> OLD.beginning_balance_cents
       OR NEW.ending_balance_cents <> OLD.ending_balance_cents OR NEW.account_id <> OLD.account_id THEN
      RAISE EXCEPTION 'A completed reconciliation cannot be changed; reopen it first';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

DROP POLICY IF EXISTS "Admins can record closes" ON public.period_closes;
CREATE POLICY "Admins and treasurers can record closes" ON public.period_closes FOR INSERT TO authenticated
  WITH CHECK (public.can_close_books(auth.uid(), org_id));

CREATE POLICY "Treasurers can lock books" ON public.organizations FOR UPDATE TO authenticated
  USING (public.can_close_books(auth.uid(), id)) WITH CHECK (public.can_close_books(auth.uid(), id));

-- A treasurer may only move the book lock date; every other org setting stays admin-only.
CREATE OR REPLACE FUNCTION public.guard_org_non_admin_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.has_org_role(auth.uid(), OLD.id, 'admin') THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - 'books_locked_through') IS DISTINCT FROM (to_jsonb(OLD) - 'books_locked_through') THEN
    RAISE EXCEPTION 'Only organization admins can change organization settings';
  END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS guard_org_non_admin_update ON public.organizations;
CREATE TRIGGER guard_org_non_admin_update BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.guard_org_non_admin_update();