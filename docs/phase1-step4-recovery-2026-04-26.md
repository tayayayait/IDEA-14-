# Phase 1 - Step4 Recovery Fix (2026-04-26)

## Scope
- Recover Step4 detailed analysis flow when `country-detail` Edge Function is slow or has partial upstream failures.
- Replace transport-level raw errors with user-facing messages.
- Keep Step5/Report progression unchanged even when Step4 is incomplete.
- Mark report output with explicit `상세 분석 미완료` state when Step4 data is not fully refreshed.

## Code Changes
- `supabase/functions/country-detail/index.ts`
1. Added external API fetch guard (`fetchExternal`) with timeout (`8000ms`) and normalized error message.
2. Applied guarded fetch to KOTRA/K-SURE/news external calls to prevent unhandled network exceptions.
3. Parallelized Step4 upstream calls (cert/reg/K-SURE/news) to reduce end-to-end latency.
4. Limited KOTRA news query variants to `MAX_NEWS_QUERY_COUNT=4`.
5. Replaced technical partial-failure message with user-facing summary:
   - Incomplete: `상세 분석 일부 항목(...)이 미완료입니다...`
   - Empty: `상세 분석은 완료되었지만 일부 항목(...)은 조회 결과가 없습니다.`
6. Added response fields: `detail_incomplete`, `detail_incomplete_items`, `detail_empty_items`.

- `src/pages/Step4CountryDetail.tsx`
1. Extended `country-detail` invoke timeout to `45000ms` for long-running detail analysis.

- `src/hooks/useApiCall.ts`
1. Added transport-error detection and message mapping for Edge request failures.
2. User now sees a stable message instead of raw error text (e.g. `Failed to send a request...`).

- `src/pages/Step6Report.tsx`
1. Added Step4 completion assessment from API logs and detail row states.
2. Added report-level banner (`상세 분석 미완료`) on desktop/mobile when detail data is missing/error.
3. Banner explicitly states that Step5/Report can continue but Step4 rerun is required before submission.

## Expected Result
- Step4 execution no longer collapses into top-level 500 on transient external fetch failures.
- Failure message is actionable for users, not raw transport text.
- Even when Step4 is partially incomplete, Step5 and Report remain accessible.
- Final report clearly surfaces incomplete Step4 analysis status.
