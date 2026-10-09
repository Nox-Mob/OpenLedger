-- Two-step sign-in: an organization can require it; the database enforces it for org data.
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS require_mfa boolean NOT NULL DEFAULT false;

-- True when the caller meets the organization's sign-in requirement.
CREATE OR REPLACE FUNCTION public.mfa_ok(_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(auth.role(), '') = 'service_role'
      OR NOT coalesce((SELECT require_mfa FROM public.organizations WHERE id = _org_id), false)
      OR coalesce(auth.jwt()->>'aal', '') = 'aal2'
$$;

-- Membership without the sign-in requirement: only used so a member can still see the
-- organization name and their own role (to be told to turn on two-step sign-in).
CREATE OR REPLACE FUNCTION public.is_org_member_any_aal(_user_id uuid, _org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND org_id = _org_id)
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND org_id = _org_id)
     AND public.mfa_ok(_org_id)
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_user_id uuid, _org_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND org_id = _org_id AND role = _role)
     AND public.mfa_ok(_org_id)
$$;

CREATE OR REPLACE FUNCTION public.can_write_org(_user_id uuid, _org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND org_id = _org_id AND role IN ('admin', 'member'))
     AND public.mfa_ok(_org_id)
$$;

DROP POLICY IF EXISTS "Members can view their orgs" ON public.organizations;
CREATE POLICY "Members can view their orgs" ON public.organizations FOR SELECT TO authenticated
  USING (public.is_org_member_any_aal(auth.uid(), id));

DROP POLICY IF EXISTS "Members can view org roles" ON public.user_roles;
CREATE POLICY "Members can view org roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_org_member(auth.uid(), org_id));

-- Delete my account: history, transactions and closes keep the old user id as plain text
-- history ("deleted user"), so these columns no longer point at the sign-in table.
ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_user_id_fkey;
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_created_by_fkey;
ALTER TABLE public.period_closes DROP CONSTRAINT IF EXISTS period_closes_closed_by_fkey;

-- Deleting an organization: the deleted-org record and the delete happen together.
CREATE OR REPLACE FUNCTION public.delete_organization_atomic(p_org uuid, p_user uuid, p_confirm text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only the server can delete organizations' USING ERRCODE = '42501';
  END IF;
  SELECT id, name, created_by INTO o FROM public.organizations WHERE id = p_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Organization not found.' USING ERRCODE = 'P0002'; END IF;
  IF o.created_by IS DISTINCT FROM p_user THEN
    RAISE EXCEPTION 'Only the owner can delete this organization.' USING ERRCODE = '42501';
  END IF;
  IF btrim(p_confirm) <> btrim(o.name) THEN
    RAISE EXCEPTION 'Type the organization name exactly to confirm.';
  END IF;
  INSERT INTO public.deleted_organizations (id, org_id, name, deleted_by)
    VALUES (gen_random_uuid(), o.id, o.name, p_user);
  DELETE FROM public.organizations WHERE id = o.id;
END $$;
REVOKE ALL ON FUNCTION public.delete_organization_atomic(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_organization_atomic(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mfa_ok(uuid) TO authenticated;