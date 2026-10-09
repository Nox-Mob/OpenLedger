-- Only limit app users (the 'authenticated' role); server and maintenance sessions are not app users.
CREATE OR REPLACE FUNCTION public.guard_org_non_admin_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF coalesce(current_setting('role', true), '') <> 'authenticated'
     OR auth.uid() IS NULL
     OR public.has_org_role(auth.uid(), OLD.id, 'admin') THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - 'books_locked_through') IS DISTINCT FROM (to_jsonb(OLD) - 'books_locked_through') THEN
    RAISE EXCEPTION 'Only organization admins can change organization settings';
  END IF;
  RETURN NEW;
END $function$;