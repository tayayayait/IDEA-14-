-- PHASE 4: API 상태 상세 컬럼 확장

ALTER TABLE public.api_call_logs
  ADD COLUMN IF NOT EXISTS response_count INT,
  ADD COLUMN IF NOT EXISTS error_code TEXT,
  ADD COLUMN IF NOT EXISTS detail JSONB;
