ALTER TABLE public.organizations
  ADD COLUMN currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN fiscal_year_start_month smallint NOT NULL DEFAULT 1 CHECK (fiscal_year_start_month BETWEEN 1 AND 12);