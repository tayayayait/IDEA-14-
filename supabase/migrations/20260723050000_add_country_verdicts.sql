-- AI 최종 판단 캐시 테이블
-- Gemini + Google Search 그라운딩으로 생성된 국가별 AI 판단을 저장합니다.
-- evidence_hash로 DecisionFacts 변동 시 자동 재생성을 트리거합니다.

create table if not exists country_verdicts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  country_code text not null,
  verdict jsonb not null,
  evidence_hash text not null,
  model text not null default 'gemini-3-flash-preview',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint country_verdicts_project_country_unique unique (project_id, country_code)
);

-- RLS 정책
alter table country_verdicts enable row level security;

create policy "Users can read own project verdicts"
  on country_verdicts for select
  using (
    project_id in (select id from projects where user_id = auth.uid())
  );

create policy "Users can insert own project verdicts"
  on country_verdicts for insert
  with check (
    project_id in (select id from projects where user_id = auth.uid())
  );

create policy "Users can update own project verdicts"
  on country_verdicts for update
  using (
    project_id in (select id from projects where user_id = auth.uid())
  );

-- 인덱스
create index if not exists idx_country_verdicts_project_country
  on country_verdicts(project_id, country_code);
