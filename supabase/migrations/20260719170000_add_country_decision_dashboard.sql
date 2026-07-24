-- Step 4 국가 상세 의사결정 대시보드 정규화 저장소

CREATE TABLE public.country_decision_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.project_products(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL,
  fact_key TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'tariff_fta',
    'certification',
    'import_regulation',
    'customs_requirement',
    'customs_documents',
    'payment_risk',
    'cost',
    'market',
    'sanctions',
    'strategic_goods'
  )),
  status TEXT NOT NULL CHECK (status IN (
    'confirmed',
    'estimated',
    'needs_verification',
    'not_run',
    'unavailable'
  )),
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'caution', 'blocker')),
  summary TEXT NOT NULL,
  value_json JSONB,
  scope_level TEXT NOT NULL CHECK (scope_level IN ('hsk10', 'hs6', 'product_name', 'country')),
  source_name TEXT NOT NULL,
  source_url TEXT,
  reference_date TEXT,
  caveat TEXT,
  next_action TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  is_stale BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, product_id, country_code, fact_key)
);

ALTER TABLE public.country_decision_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own country decision facts" ON public.country_decision_facts
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.country_decision_facts TO authenticated;
CREATE INDEX idx_country_decision_facts_context
  ON public.country_decision_facts(project_id, country_code, product_id, category);
CREATE TRIGGER trg_country_decision_facts_updated
  BEFORE UPDATE ON public.country_decision_facts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.country_action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.project_products(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL,
  action_key TEXT NOT NULL,
  title TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done', 'blocked')),
  priority SMALLINT NOT NULL DEFAULT 50 CHECK (priority BETWEEN 1 AND 99),
  source_url TEXT,
  fact_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, product_id, country_code, action_key)
);

ALTER TABLE public.country_action_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own country action items" ON public.country_action_items
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.country_action_items TO authenticated;
CREATE INDEX idx_country_action_items_context
  ON public.country_action_items(project_id, country_code, product_id, priority);
CREATE TRIGGER trg_country_action_items_updated
  BEFORE UPDATE ON public.country_action_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.country_analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.project_products(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'partial', 'failed')),
  input_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider_statuses JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.country_analysis_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own country analysis runs" ON public.country_analysis_runs
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.country_analysis_runs TO authenticated;
CREATE INDEX idx_country_analysis_runs_context
  ON public.country_analysis_runs(project_id, country_code, product_id, started_at DESC);

CREATE TABLE public.external_dataset_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key TEXT NOT NULL UNIQUE,
  source_name TEXT NOT NULL,
  source_url TEXT,
  reference_date TEXT,
  checksum TEXT,
  row_count BIGINT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'stale', 'failed')),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.external_dataset_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated users read external dataset versions"
  ON public.external_dataset_versions FOR SELECT
  TO authenticated USING (true);
GRANT SELECT ON public.external_dataset_versions TO authenticated;
CREATE TRIGGER trg_external_dataset_versions_updated
  BEFORE UPDATE ON public.external_dataset_versions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
