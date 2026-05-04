CREATE TABLE IF NOT EXISTS public.kotra_csv_trade_office_summary_cache (
  id BIGSERIAL PRIMARY KEY,
  country_name_normalized TEXT NOT NULL DEFAULT '',
  office_name TEXT NOT NULL DEFAULT '',
  source_hash TEXT NOT NULL DEFAULT '',
  summary_ko TEXT NOT NULL DEFAULT '',
  summary_source TEXT NOT NULL DEFAULT 'ai' CHECK (summary_source IN ('ai', 'rule')),
  model TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (country_name_normalized, office_name, source_hash)
);

CREATE INDEX IF NOT EXISTS idx_kotra_csv_trade_office_summary_country
  ON public.kotra_csv_trade_office_summary_cache (country_name_normalized);

CREATE INDEX IF NOT EXISTS idx_kotra_csv_trade_office_summary_hash
  ON public.kotra_csv_trade_office_summary_cache (source_hash);

ALTER TABLE public.kotra_csv_trade_office_summary_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read kotra csv trade office summary cache"
  ON public.kotra_csv_trade_office_summary_cache;
CREATE POLICY "auth read kotra csv trade office summary cache"
  ON public.kotra_csv_trade_office_summary_cache
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "service write kotra csv trade office summary cache"
  ON public.kotra_csv_trade_office_summary_cache;
CREATE POLICY "service write kotra csv trade office summary cache"
  ON public.kotra_csv_trade_office_summary_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
