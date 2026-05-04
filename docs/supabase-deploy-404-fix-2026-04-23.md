# Supabase Upload + 404 (`public.projects`) Fix

Date: 2026-04-23

## Facts

- App runtime is using project `gnwhjqaxndbkqxecxjkn`.
- Local `supabase/config.toml` had a different project id (`vfneymhvlnecjoeuuffd`).
- This mismatch can push migrations to the wrong project.
- `404` with `Could not find the table 'public.projects' in the schema cache` means the target project does not have the `projects` table in PostgREST schema cache.

## Immediate Fix (recommended)

Run in project root:

```bash
supabase login
supabase link --project-ref gnwhjqaxndbkqxecxjkn
supabase db push
supabase functions deploy api-kicox-search
supabase functions deploy ai-hs-suggest
supabase functions deploy recommend-countries
supabase functions deploy country-detail
supabase functions deploy safety-scan
supabase functions deploy ai-action-tasks
supabase functions deploy ai-report-summary
```

Then set function secrets in Supabase:

- `PUBLIC_DATA_API_KEY`
- `KICOX_API_KEY`
- `KOTRA_API_KEY` (if used)
- `GEMINI_API_KEY`
- `GEMINI_MODEL`

CLI alternative:

```bash
supabase secrets set PUBLIC_DATA_API_KEY=... KICOX_API_KEY=... GEMINI_API_KEY=... GEMINI_MODEL=gemini-3-flash-preview
```

## SQL Verification

Run in Supabase SQL Editor:

```sql
select to_regclass('public.projects') as projects_table;
```

Expected:

- `projects_table = public.projects`

Optional row test:

```sql
select count(*) from public.projects;
```

## Emergency Patch (if only `projects` is missing)

If you must unblock quickly before full migration, run:

```sql
create type if not exists public.project_status as enum ('draft','ready','analyzing','review_required','complete','blocked');

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New analysis',
  status public.project_status not null default 'draft',
  current_step smallint not null default 1,
  partial_score boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'projects'
      and policyname = 'own projects all'
  ) then
    create policy "own projects all"
      on public.projects
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_projects_updated on public.projects;
create trigger trg_projects_updated
before update on public.projects
for each row execute function public.update_updated_at_column();
```

Note: this emergency patch only unblocks `projects`. Full flow still needs the full migration in `supabase/migrations/20260422064943_c05bef68-10f7-44ab-be42-26a080c931fd.sql`.

## Edge Function Deploy 400 Fix (Deno import path)

If deploy fails with:

- `Relative import path "@supabase/supabase-js/cors" not prefixed ...`
- `Relative import path "@supabase/supabase-js" not prefixed ...`

apply this rule:

- Replace `@supabase/supabase-js/cors` with `../_shared/cors.ts`
- Replace `@supabase/supabase-js` with `npm:@supabase/supabase-js@2`

Shared file:

- `supabase/functions/_shared/cors.ts`

Redeploy commands:

```bash
pnpm dlx supabase functions deploy api-kicox-search
pnpm dlx supabase functions deploy ai-hs-suggest
pnpm dlx supabase functions deploy recommend-countries
pnpm dlx supabase functions deploy country-detail
pnpm dlx supabase functions deploy safety-scan
pnpm dlx supabase functions deploy ai-action-tasks
pnpm dlx supabase functions deploy ai-report-summary
```
