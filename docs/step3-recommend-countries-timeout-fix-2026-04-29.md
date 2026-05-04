# Step 3 recommend-countries timeout fix (2026-04-29)

## Problem
- Step 3 stayed in `running` and did not create Top 3 country rows when the `recommend-countries` Edge Function exceeded the client invocation window.
- Root cause was not ranking logic. The function performed several slow external calls in a mostly sequential path.

## Root cause
- KOTRA certification, country profile, and market news requests used raw `fetch()` without a local timeout.
- Product news and country news query variants were called sequentially.
- K-SURE country grade and industry risk datasets were fetched repeatedly for each candidate country even though the source datasets are shared.
- Candidate country analysis was processed one country at a time.

## Fix
- Added bounded fetch helpers for KOTRA text responses and AI scoring calls.
- Ran independent initial data sources in parallel.
- Ran KOTRA certification/news query variants in parallel with per-request timeout.
- Loaded K-SURE country grade and industry risk datasets once per recommendation, then resolved each candidate from the shared dataset.
- Processed candidate country analyses with limited concurrency.

## Verification
- `npm test` passed: 36 test files, 203 tests.
- TypeScript syntax parse check for `supabase/functions/recommend-countries/index.ts` passed.
