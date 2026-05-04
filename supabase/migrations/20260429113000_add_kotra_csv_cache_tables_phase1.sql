CREATE TABLE IF NOT EXISTS public.kotra_csv_export_region_rank_cache (
  id BIGSERIAL PRIMARY KEY,
  batch_id UUID NOT NULL,
  source_row_no INT NOT NULL,
  source_rank INT,
  country_name TEXT NOT NULL DEFAULT '',
  country_name_normalized TEXT NOT NULL DEFAULT '',
  reference_year INT,
  export_amount_usd NUMERIC(20, 2),
  import_amount_usd NUMERIC(20, 2),
  export_share NUMERIC(12, 8),
  import_share NUMERIC(12, 8),
  hs_code_raw TEXT NOT NULL DEFAULT '',
  hs_code_normalized TEXT NOT NULL DEFAULT '',
  unique_key TEXT NOT NULL DEFAULT '',
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (batch_id, source_row_no)
);

CREATE INDEX IF NOT EXISTS idx_kotra_csv_export_region_rank_batch
  ON public.kotra_csv_export_region_rank_cache (batch_id, is_active);

CREATE INDEX IF NOT EXISTS idx_kotra_csv_export_region_rank_country_hs
  ON public.kotra_csv_export_region_rank_cache (country_name_normalized, hs_code_normalized);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kotra_csv_export_region_rank_dedupe
  ON public.kotra_csv_export_region_rank_cache (batch_id, unique_key)
  WHERE unique_key <> '';

ALTER TABLE public.kotra_csv_export_region_rank_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read kotra csv export region rank cache" ON public.kotra_csv_export_region_rank_cache;
CREATE POLICY "auth read kotra csv export region rank cache"
  ON public.kotra_csv_export_region_rank_cache
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "service write kotra csv export region rank cache" ON public.kotra_csv_export_region_rank_cache;
CREATE POLICY "service write kotra csv export region rank cache"
  ON public.kotra_csv_export_region_rank_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.kotra_csv_import_regulation_cache (
  id BIGSERIAL PRIMARY KEY,
  batch_id UUID NOT NULL,
  source_row_no INT NOT NULL,
  source_seq INT,
  regulation_country_code TEXT NOT NULL DEFAULT '',
  regulation_country_name TEXT NOT NULL DEFAULT '',
  regulation_country_normalized TEXT NOT NULL DEFAULT '',
  source_hs_column_no SMALLINT NOT NULL DEFAULT 0,
  hs_code_raw TEXT NOT NULL DEFAULT '',
  hs_code_normalized TEXT NOT NULL DEFAULT '',
  item_name TEXT NOT NULL DEFAULT '',
  regulation_type TEXT NOT NULL DEFAULT '',
  target_country_text TEXT NOT NULL DEFAULT '',
  decision_period TEXT NOT NULL DEFAULT '',
  decision_tariff TEXT NOT NULL DEFAULT '',
  korea_target_yn TEXT NOT NULL DEFAULT '',
  is_korea_target BOOLEAN NOT NULL DEFAULT false,
  unique_key TEXT NOT NULL DEFAULT '',
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (batch_id, source_row_no, source_hs_column_no)
);

CREATE INDEX IF NOT EXISTS idx_kotra_csv_import_regulation_batch
  ON public.kotra_csv_import_regulation_cache (batch_id, is_active);

CREATE INDEX IF NOT EXISTS idx_kotra_csv_import_regulation_country_hs
  ON public.kotra_csv_import_regulation_cache (regulation_country_normalized, hs_code_normalized);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kotra_csv_import_regulation_dedupe
  ON public.kotra_csv_import_regulation_cache (batch_id, unique_key)
  WHERE unique_key <> '';

ALTER TABLE public.kotra_csv_import_regulation_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read kotra csv import regulation cache" ON public.kotra_csv_import_regulation_cache;
CREATE POLICY "auth read kotra csv import regulation cache"
  ON public.kotra_csv_import_regulation_cache
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "service write kotra csv import regulation cache" ON public.kotra_csv_import_regulation_cache;
CREATE POLICY "service write kotra csv import regulation cache"
  ON public.kotra_csv_import_regulation_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.kotra_csv_trade_office_cache (
  id BIGSERIAL PRIMARY KEY,
  batch_id UUID NOT NULL,
  source_row_no INT NOT NULL,
  source_seq INT,
  country_name TEXT NOT NULL DEFAULT '',
  country_name_normalized TEXT NOT NULL DEFAULT '',
  office_name TEXT NOT NULL DEFAULT '',
  office_address TEXT NOT NULL DEFAULT '',
  airport_route_text TEXT NOT NULL DEFAULT '',
  unique_key TEXT NOT NULL DEFAULT '',
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (batch_id, source_row_no)
);

CREATE INDEX IF NOT EXISTS idx_kotra_csv_trade_office_batch
  ON public.kotra_csv_trade_office_cache (batch_id, is_active);

CREATE INDEX IF NOT EXISTS idx_kotra_csv_trade_office_country
  ON public.kotra_csv_trade_office_cache (country_name_normalized);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kotra_csv_trade_office_dedupe
  ON public.kotra_csv_trade_office_cache (batch_id, unique_key)
  WHERE unique_key <> '';

ALTER TABLE public.kotra_csv_trade_office_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read kotra csv trade office cache" ON public.kotra_csv_trade_office_cache;
CREATE POLICY "auth read kotra csv trade office cache"
  ON public.kotra_csv_trade_office_cache
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "service write kotra csv trade office cache" ON public.kotra_csv_trade_office_cache;
CREATE POLICY "service write kotra csv trade office cache"
  ON public.kotra_csv_trade_office_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.kotra_csv_overseas_exhibition_cache (
  id BIGSERIAL PRIMARY KEY,
  batch_id UUID NOT NULL,
  source_row_no INT NOT NULL,
  exhibition_name TEXT NOT NULL DEFAULT '',
  exhibition_name_en TEXT NOT NULL DEFAULT '',
  event_period_raw TEXT NOT NULL DEFAULT '',
  event_start_month SMALLINT,
  event_start_day SMALLINT,
  event_end_month SMALLINT,
  event_end_day SMALLINT,
  product_category TEXT NOT NULL DEFAULT '',
  country_name TEXT NOT NULL DEFAULT '',
  country_name_normalized TEXT NOT NULL DEFAULT '',
  city_name TEXT NOT NULL DEFAULT '',
  partner_org TEXT NOT NULL DEFAULT '',
  unique_key TEXT NOT NULL DEFAULT '',
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (batch_id, source_row_no)
);

CREATE INDEX IF NOT EXISTS idx_kotra_csv_overseas_exhibition_batch
  ON public.kotra_csv_overseas_exhibition_cache (batch_id, is_active);

CREATE INDEX IF NOT EXISTS idx_kotra_csv_overseas_exhibition_country
  ON public.kotra_csv_overseas_exhibition_cache (country_name_normalized);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kotra_csv_overseas_exhibition_dedupe
  ON public.kotra_csv_overseas_exhibition_cache (batch_id, unique_key)
  WHERE unique_key <> '';

ALTER TABLE public.kotra_csv_overseas_exhibition_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read kotra csv overseas exhibition cache" ON public.kotra_csv_overseas_exhibition_cache;
CREATE POLICY "auth read kotra csv overseas exhibition cache"
  ON public.kotra_csv_overseas_exhibition_cache
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "service write kotra csv overseas exhibition cache" ON public.kotra_csv_overseas_exhibition_cache;
CREATE POLICY "service write kotra csv overseas exhibition cache"
  ON public.kotra_csv_overseas_exhibition_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

INSERT INTO public.api_cache_status (cache_key, status, stale_after_days)
VALUES
  ('kotra_csv_export_region_rank', 'idle', 30),
  ('kotra_csv_import_regulation', 'idle', 30),
  ('kotra_csv_trade_office', 'idle', 180),
  ('kotra_csv_overseas_exhibition', 'idle', 60)
ON CONFLICT (cache_key) DO UPDATE
SET stale_after_days = EXCLUDED.stale_after_days;
