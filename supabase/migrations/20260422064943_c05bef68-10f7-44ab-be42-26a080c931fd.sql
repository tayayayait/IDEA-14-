
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.project_status AS ENUM ('draft','ready','analyzing','review_required','complete','blocked');
CREATE TYPE public.risk_label AS ENUM ('priority','reviewable','caution','high_risk','unknown');
CREATE TYPE public.api_status AS ENUM ('idle','loading','success','partial_success','empty','error','stale');

-- ============ TIMESTAMP TRIGGER ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  organization TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
CREATE POLICY "own roles read" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

-- ============ AUTO PROFILE + ROLE ON SIGNUP ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, organization)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'organization');
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ PROJECTS ============
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '새 분석',
  status project_status NOT NULL DEFAULT 'draft',
  current_step SMALLINT NOT NULL DEFAULT 1,
  partial_score BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own projects all" ON public.projects FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_projects_user ON public.projects(user_id, updated_at DESC);

-- ============ COMPANIES ============
CREATE TABLE public.project_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'manual', -- 'kicox' | 'manual'
  business_no TEXT,
  company_name TEXT NOT NULL,
  industrial_complex TEXT,
  address TEXT,
  industry_code TEXT,
  employees INT,
  user_overridden BOOLEAN NOT NULL DEFAULT false,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.project_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own companies" ON public.project_companies FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON public.project_companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ PRODUCTS ============
CREATE TABLE public.project_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  components TEXT,
  hs_code TEXT,
  hsk_code TEXT,
  hs_candidates JSONB,
  confirmed BOOLEAN NOT NULL DEFAULT false,
  ai_rationale TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.project_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own products" ON public.project_products FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.project_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ COUNTRIES ============
CREATE TABLE public.project_countries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL,
  country_name TEXT NOT NULL,
  market_score NUMERIC,         -- /30
  cert_score NUMERIC,           -- /20
  regulation_score NUMERIC,     -- /20
  payment_score NUMERIC,        -- /20
  safety_score NUMERIC,         -- /10
  total_score NUMERIC,          -- /100
  label risk_label NOT NULL DEFAULT 'unknown',
  rank SMALLINT,
  rationale JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, country_code)
);
ALTER TABLE public.project_countries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own countries" ON public.project_countries FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_countries_updated BEFORE UPDATE ON public.project_countries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ CERTIFICATIONS / REGULATIONS / RISKS ============
CREATE TABLE public.project_certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL,
  scheme TEXT,
  required BOOLEAN,
  est_cost_krw NUMERIC,
  est_lead_days INT,
  source_url TEXT,
  source_org TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.project_certifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own certs" ON public.project_certifications FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.project_regulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL,
  topic TEXT,
  summary TEXT,
  effective_date DATE,
  source_url TEXT,
  source_org TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.project_regulations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own regs" ON public.project_regulations FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.project_risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL,
  category TEXT,        -- 'k_sure' | 'sanction' | 'fx' | 'news'
  level TEXT,
  summary TEXT,
  source_url TEXT,
  source_org TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.project_risks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own risks" ON public.project_risks FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ SAFETY FLAGS ============
CREATE TABLE public.project_safety_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  flag_type TEXT NOT NULL,    -- 'strategic' | 'recall' | 'product_safety'
  severity TEXT,              -- 'info' | 'warn' | 'block'
  summary TEXT,
  recommended_action TEXT,
  source_url TEXT,
  source_org TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.project_safety_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own safety" ON public.project_safety_flags FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ API CALL LOGS ============
CREATE TABLE public.api_call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  api_key_name TEXT NOT NULL,    -- 'kicox','kotra','customs',...
  status api_status NOT NULL,
  http_status INT,
  message TEXT,
  called_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.api_call_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own logs read" ON public.api_call_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own logs insert" ON public.api_call_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_logs_api ON public.api_call_logs(api_key_name, called_at DESC);
