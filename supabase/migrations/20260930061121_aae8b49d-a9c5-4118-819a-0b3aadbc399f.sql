ALTER TABLE public.organizations ADD COLUMN term_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.profiles ADD COLUMN term_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;