-- Names are unique per organization (ignoring case and extra spaces) for accounts,
-- categories, tags, projects and funds. A trigger, not an index, so installs that
-- already hold a duplicate keep working; only new or renamed rows are checked.
CREATE OR REPLACE FUNCTION public.normalize_name(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT lower(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g')) $$;

CREATE OR REPLACE FUNCTION public.guard_unique_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dup boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND public.normalize_name(NEW.name) = public.normalize_name(OLD.name) THEN
    RETURN NEW;
  END IF;
  EXECUTE format(
    'SELECT EXISTS (SELECT 1 FROM public.%I WHERE org_id = $1 AND id <> $2 AND public.normalize_name(name) = public.normalize_name($3))',
    TG_TABLE_NAME
  ) INTO dup USING NEW.org_id, NEW.id, NEW.name;
  IF dup THEN
    RAISE EXCEPTION '"%" already exists. Choose a different name.', btrim(NEW.name)
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_unique_name ON public.accounts;
CREATE TRIGGER guard_unique_name BEFORE INSERT OR UPDATE OF name ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.guard_unique_name();
DROP TRIGGER IF EXISTS guard_unique_name ON public.categories;
CREATE TRIGGER guard_unique_name BEFORE INSERT OR UPDATE OF name ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.guard_unique_name();
DROP TRIGGER IF EXISTS guard_unique_name ON public.tags;
CREATE TRIGGER guard_unique_name BEFORE INSERT OR UPDATE OF name ON public.tags
  FOR EACH ROW EXECUTE FUNCTION public.guard_unique_name();
DROP TRIGGER IF EXISTS guard_unique_name ON public.projects;
CREATE TRIGGER guard_unique_name BEFORE INSERT OR UPDATE OF name ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.guard_unique_name();
DROP TRIGGER IF EXISTS guard_unique_name ON public.funds;
CREATE TRIGGER guard_unique_name BEFORE INSERT OR UPDATE OF name ON public.funds
  FOR EACH ROW EXECUTE FUNCTION public.guard_unique_name();

-- An account can only be deleted if nothing ever used it. Anything with history is archived.
-- Skipped while the whole organization is being deleted (the org row is already gone).
CREATE OR REPLACE FUNCTION public.guard_account_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = OLD.org_id) THEN
    RETURN OLD;
  END IF;
  IF EXISTS (SELECT 1 FROM public.entries WHERE account_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.bank_transactions WHERE account_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.import_batches WHERE account_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.reconciliations WHERE account_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.budgets WHERE account_id = OLD.id) THEN
    RAISE EXCEPTION 'This account has activity, so it can only be archived.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS guard_account_delete ON public.accounts;
CREATE TRIGGER guard_account_delete BEFORE DELETE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.guard_account_delete();

-- Deleting accounts is an admin action (settings), not something every writer can do.
DROP POLICY IF EXISTS "Writers delete accounts" ON public.accounts;
CREATE POLICY "Admins delete unused accounts" ON public.accounts FOR DELETE TO authenticated
  USING (public.has_org_role(auth.uid(), org_id, 'admin'));
