CREATE TABLE IF NOT EXISTS public.project_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  draft JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_hash TEXT NOT NULL,
  ai_state TEXT NOT NULL DEFAULT 'success',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT project_reports_project_id_key UNIQUE (project_id)
);

ALTER TABLE public.project_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own project reports all" ON public.project_reports;
CREATE POLICY "own project reports all" ON public.project_reports FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_project_reports_updated ON public.project_reports;
CREATE TRIGGER trg_project_reports_updated BEFORE UPDATE ON public.project_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_project_reports_user_generated
  ON public.project_reports(user_id, generated_at DESC);
