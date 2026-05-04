CREATE TABLE IF NOT EXISTS public.kotra_import_regulation_cache (
  id BIGSERIAL PRIMARY KEY,
  batch_id UUID NOT NULL,
  source_page_no INT NOT NULL,
  source_row_no INT NOT NULL,
  hqurt_name TEXT NOT NULL DEFAULT '',
  cmdlt_name TEXT NOT NULL DEFAULT '',
  hscd TEXT NOT NULL DEFAULT '',
  hscd_cn TEXT NOT NULL DEFAULT '',
  reg_dt TEXT NOT NULL DEFAULT '',
  regl_cn TEXT NOT NULL DEFAULT '',
  iso_wd2_nat_cd TEXT NOT NULL DEFAULT '',
  regl_str_de TEXT NOT NULL DEFAULT '',
  regl_end_de TEXT NOT NULL DEFAULT '',
  probe_tgt_nat_name TEXT NOT NULL DEFAULT '',
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (batch_id, source_page_no, source_row_no)
);

CREATE INDEX IF NOT EXISTS idx_kotra_import_reg_cache_batch
  ON public.kotra_import_regulation_cache (batch_id, is_active);

CREATE INDEX IF NOT EXISTS idx_kotra_import_reg_cache_country_hs
  ON public.kotra_import_regulation_cache (iso_wd2_nat_cd, hscd);

ALTER TABLE public.kotra_import_regulation_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read kotra import regulation cache" ON public.kotra_import_regulation_cache;
CREATE POLICY "auth read kotra import regulation cache"
  ON public.kotra_import_regulation_cache
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "service write kotra import regulation cache" ON public.kotra_import_regulation_cache;
CREATE POLICY "service write kotra import regulation cache"
  ON public.kotra_import_regulation_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.api_cache_status (
  cache_key TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'idle',
  active_batch_id UUID,
  total_count INT NOT NULL DEFAULT 0,
  fetched_count INT NOT NULL DEFAULT 0,
  upserted_count INT NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error TEXT,
  stale_after_days INT NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_cache_status_success_at
  ON public.api_cache_status (last_success_at DESC);

ALTER TABLE public.api_cache_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read api cache status" ON public.api_cache_status;
CREATE POLICY "auth read api cache status"
  ON public.api_cache_status
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "service write api cache status" ON public.api_cache_status;
CREATE POLICY "service write api cache status"
  ON public.api_cache_status
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_api_cache_status_updated ON public.api_cache_status;
CREATE TRIGGER trg_api_cache_status_updated
  BEFORE UPDATE ON public.api_cache_status
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.api_cache_status (cache_key, status, stale_after_days)
VALUES ('kotra_import_regulation_ds00000128', 'idle', 30)
ON CONFLICT (cache_key) DO NOTHING;
