DO $$ DECLARE c text; BEGIN
FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.organizations'::regclass AND contype='c' AND pg_get_constraintdef(oid) ILIKE '%terminology%' LOOP
EXECUTE format('ALTER TABLE public.organizations DROP CONSTRAINT %I', c); END LOOP;
FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.profiles'::regclass AND contype='c' AND pg_get_constraintdef(oid) ILIKE '%terminology%' LOOP
EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', c); END LOOP;
END $$;
UPDATE public.organizations SET terminology='simplest' WHERE terminology='simplified';
UPDATE public.profiles SET terminology='simplest' WHERE terminology='simplified';
ALTER TABLE public.organizations ALTER COLUMN terminology SET DEFAULT 'simplest';
ALTER TABLE public.profiles ALTER COLUMN terminology SET DEFAULT 'simplest';
ALTER TABLE public.organizations ADD CONSTRAINT organizations_terminology_check CHECK (terminology IN ('simplest','simple','accounting'));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_terminology_check CHECK (terminology IN ('simplest','simple','accounting'));