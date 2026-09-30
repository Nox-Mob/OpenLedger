CREATE TYPE public.app_role AS ENUM ('admin', 'member', 'viewer');
CREATE TYPE public.org_type AS ENUM ('nonprofit', 'business');
CREATE TYPE public.account_type AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');
CREATE TYPE public.transaction_source AS ENUM ('manual', 'import', 'opening_balance', 'adjustment', 'transfer');
CREATE TYPE public.transaction_status AS ENUM ('posted', 'void');

CREATE TABLE public.organizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  org_type public.org_type NOT NULL DEFAULT 'business',
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  terminology TEXT NOT NULL DEFAULT 'simplified' CHECK (terminology IN ('simplified', 'accounting')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, org_id)
);

CREATE TABLE public.accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type public.account_type NOT NULL,
  subtype TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type public.account_type NOT NULL DEFAULT 'expense' CHECK (type IN ('revenue', 'expense')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE TABLE public.tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  budget_cents BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE TABLE public.funds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_restricted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE TABLE public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  transaction_date DATE NOT NULL,
  posted_date DATE,
  description TEXT NOT NULL,
  source public.transaction_source NOT NULL DEFAULT 'manual',
  status public.transaction_status NOT NULL DEFAULT 'posted',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id),
  amount_cents BIGINT NOT NULL CHECK (amount_cents <> 0),
  category_id UUID REFERENCES public.categories(id),
  project_id UUID REFERENCES public.projects(id),
  fund_id UUID REFERENCES public.funds(id),
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_entries_transaction ON public.entries(transaction_id);
CREATE INDEX idx_entries_account ON public.entries(account_id);

CREATE TABLE public.transaction_tags (
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, tag_id)
);

CREATE TABLE public.bank_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id),
  bank_date DATE NOT NULL,
  description TEXT NOT NULL,
  amount_cents BIGINT NOT NULL,
  external_id TEXT,
  fingerprint TEXT NOT NULL,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, account_id, fingerprint)
);

CREATE TABLE public.audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id UUID,
  before JSONB,
  after JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.funds TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transaction_tags TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_transactions TO authenticated;
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.organizations TO service_role;
GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.user_roles TO service_role;
GRANT ALL ON public.accounts TO service_role;
GRANT ALL ON public.categories TO service_role;
GRANT ALL ON public.tags TO service_role;
GRANT ALL ON public.projects TO service_role;
GRANT ALL ON public.funds TO service_role;
GRANT ALL ON public.transactions TO service_role;
GRANT ALL ON public.entries TO service_role;
GRANT ALL ON public.transaction_tags TO service_role;
GRANT ALL ON public.bank_transactions TO service_role;
GRANT ALL ON public.audit_log TO service_role;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_org_member(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND org_id = _org_id)
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_user_id UUID, _org_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND org_id = _org_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.can_write_org(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND org_id = _org_id AND role IN ('admin', 'member'))
$$;

CREATE POLICY "Members can view their orgs" ON public.organizations FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), id));
CREATE POLICY "Signed-in users can create orgs" ON public.organizations FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Admins can update orgs" ON public.organizations FOR UPDATE TO authenticated USING (public.has_org_role(auth.uid(), id, 'admin'));

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE POLICY "Members can view org roles" ON public.user_roles FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Admins manage org roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_org_role(auth.uid(), org_id, 'admin') OR (auth.uid() = user_id AND role = 'admin'));
CREATE POLICY "Admins update org roles" ON public.user_roles FOR UPDATE TO authenticated USING (public.has_org_role(auth.uid(), org_id, 'admin'));
CREATE POLICY "Admins delete org roles" ON public.user_roles FOR DELETE TO authenticated USING (public.has_org_role(auth.uid(), org_id, 'admin'));

CREATE POLICY "Members view accounts" ON public.accounts FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Writers insert accounts" ON public.accounts FOR INSERT TO authenticated WITH CHECK (public.can_write_org(auth.uid(), org_id));
CREATE POLICY "Writers update accounts" ON public.accounts FOR UPDATE TO authenticated USING (public.can_write_org(auth.uid(), org_id));
CREATE POLICY "Writers delete accounts" ON public.accounts FOR DELETE TO authenticated USING (public.can_write_org(auth.uid(), org_id));

CREATE POLICY "Members view categories" ON public.categories FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Writers insert categories" ON public.categories FOR INSERT TO authenticated WITH CHECK (public.can_write_org(auth.uid(), org_id));
CREATE POLICY "Writers update categories" ON public.categories FOR UPDATE TO authenticated USING (public.can_write_org(auth.uid(), org_id));
CREATE POLICY "Writers delete categories" ON public.categories FOR DELETE TO authenticated USING (public.can_write_org(auth.uid(), org_id));

CREATE POLICY "Members view tags" ON public.tags FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Writers insert tags" ON public.tags FOR INSERT TO authenticated WITH CHECK (public.can_write_org(auth.uid(), org_id));
CREATE POLICY "Writers update tags" ON public.tags FOR UPDATE TO authenticated USING (public.can_write_org(auth.uid(), org_id));
CREATE POLICY "Writers delete tags" ON public.tags FOR DELETE TO authenticated USING (public.can_write_org(auth.uid(), org_id));

CREATE POLICY "Members view projects" ON public.projects FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Writers insert projects" ON public.projects FOR INSERT TO authenticated WITH CHECK (public.can_write_org(auth.uid(), org_id));
CREATE POLICY "Writers update projects" ON public.projects FOR UPDATE TO authenticated USING (public.can_write_org(auth.uid(), org_id));
CREATE POLICY "Writers delete projects" ON public.projects FOR DELETE TO authenticated USING (public.can_write_org(auth.uid(), org_id));

CREATE POLICY "Members view funds" ON public.funds FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Writers insert funds" ON public.funds FOR INSERT TO authenticated WITH CHECK (public.can_write_org(auth.uid(), org_id));
CREATE POLICY "Writers update funds" ON public.funds FOR UPDATE TO authenticated USING (public.can_write_org(auth.uid(), org_id));
CREATE POLICY "Writers delete funds" ON public.funds FOR DELETE TO authenticated USING (public.can_write_org(auth.uid(), org_id));

CREATE POLICY "Members view transactions" ON public.transactions FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Writers insert transactions" ON public.transactions FOR INSERT TO authenticated WITH CHECK (public.can_write_org(auth.uid(), org_id));
CREATE POLICY "Writers update transactions" ON public.transactions FOR UPDATE TO authenticated USING (public.can_write_org(auth.uid(), org_id));
CREATE POLICY "Writers delete transactions" ON public.transactions FOR DELETE TO authenticated USING (public.can_write_org(auth.uid(), org_id));

CREATE POLICY "Members view entries" ON public.entries FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_id AND public.is_org_member(auth.uid(), t.org_id)));
CREATE POLICY "Writers insert entries" ON public.entries FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_id AND public.can_write_org(auth.uid(), t.org_id)));
CREATE POLICY "Writers update entries" ON public.entries FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_id AND public.can_write_org(auth.uid(), t.org_id)));
CREATE POLICY "Writers delete entries" ON public.entries FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_id AND public.can_write_org(auth.uid(), t.org_id)));

CREATE POLICY "Members view transaction tags" ON public.transaction_tags FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_id AND public.is_org_member(auth.uid(), t.org_id)));
CREATE POLICY "Writers manage transaction tags" ON public.transaction_tags FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_id AND public.can_write_org(auth.uid(), t.org_id)));

CREATE POLICY "Members view bank transactions" ON public.bank_transactions FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Writers insert bank transactions" ON public.bank_transactions FOR INSERT TO authenticated WITH CHECK (public.can_write_org(auth.uid(), org_id));
CREATE POLICY "Writers update bank transactions" ON public.bank_transactions FOR UPDATE TO authenticated USING (public.can_write_org(auth.uid(), org_id));
CREATE POLICY "Writers delete bank transactions" ON public.bank_transactions FOR DELETE TO authenticated USING (public.can_write_org(auth.uid(), org_id));

CREATE POLICY "Members view audit log" ON public.audit_log FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Writers add audit log" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (public.can_write_org(auth.uid(), org_id));

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.validate_transaction_balanced() RETURNS TRIGGER AS $$
DECLARE tx_id UUID; total BIGINT; tx_status public.transaction_status;
BEGIN
  tx_id := COALESCE(NEW.transaction_id, OLD.transaction_id);
  SELECT status INTO tx_status FROM public.transactions WHERE id = tx_id;
  IF tx_status = 'void' THEN RETURN NULL; END IF;
  SELECT COALESCE(SUM(amount_cents), 0) INTO total FROM public.entries WHERE transaction_id = tx_id;
  IF total <> 0 THEN RAISE EXCEPTION 'Transaction % is not balanced: entries sum to % cents', tx_id, total; END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE CONSTRAINT TRIGGER entries_balanced_after_write
AFTER INSERT OR UPDATE OR DELETE ON public.entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.validate_transaction_balanced();