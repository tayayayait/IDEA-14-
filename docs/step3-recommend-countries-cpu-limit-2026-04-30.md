# Step 3 recommend-countries CPU limit fix (2026-04-30)

## Problem
- Supabase Edge Function `recommend-countries` returned HTTP 546.
- Edge logs showed `CPU Time exceeded`, followed by shutdown/boot cycles.
- The frontend retried the 546 response as a generic 5xx error, causing an immediate second invocation.
- A later split added `api-customs-trade`, but that function only runs after Step 3 rows are loaded. If `recommend-countries` fails first, the split function is not reached.

## Root cause
- `recommend-countries` queried Customs Nitemtrade for every supported country before the candidate pool was finalized.
- KOTRA query variants, K-SURE dataset pages, Customs requests, and candidate analysis were highly parallelized in one Edge Function execution.
- This reduced wall-clock wait time but increased CPU bursts and response parsing work inside the hosted Edge runtime.
- After the split, `recommend-countries` still kept stale Customs references and still fanned out country-level KOTRA news queries across too many candidates.

## Fix
- Stop client retry for Supabase Edge Function HTTP 546.
- Limit KOTRA query variant and K-SURE dataset page concurrency to 2.
- Remove Customs work and stale Customs log/source references from `recommend-countries`; Customs enrichment now belongs to `api-customs-trade`.
- Cap recommendation candidates at 4, process candidate analysis serially, cap product-news query variants at 5, and cap country-news query variants at 4.

## Follow-up: Step 3 detail deferral
- The latest fix does not reduce product-news query count. Step 3 still keeps the product-news query cap at 5.
- The latest fix does not reduce country-news query count. Country-level KOTRA news collection is moved out of `recommend-countries` and remains in `country-detail`.
- `recommend-countries` now performs only lightweight recommendation work: product news, candidate pool creation, cached KOTRA certification/import-regulation signals, export-region rank signals, trade-office actions, SafetyKorea product signals, and AI/fallback scoring.
- Candidate-country KOTRA market news, K-SURE country grade, K-SURE industry risk, K-SURE export-payment detail, and detailed evidence source generation are deferred to `country-detail`.
- `project_countries.rationale.sources` starts with minimal Step 3 sources and a detail-deferred marker. `country-detail` enriches the same field when the user runs detail analysis from the country detail screen.
- No Supabase migration was added.

## Follow-up: import-regulation cache budget
- Version 50 still exceeded CPU because `recommend-countries` loaded every active `kotra_import_regulation_cache` row into the Edge Function and filtered 17,895 rows in JavaScript.
- The cache-based signal is kept, but filtering now happens in the database by HS6/HS4 prefix before rows enter the function.
- Step 3 reads at most 500 import-regulation cache rows per invocation and does not select the `raw` JSONB payload.
- This is not a query-count reduction for product news or country news. It removes an unnecessary full-cache transfer and CPU-heavy local filtering step.

## Follow-up: separate Step 3 news evidence function
- Step 3 ranking remains in `recommend-countries`.
- News evidence for Top 3 countries now runs through a separate Edge Function: `recommend-country-news`.
- The new function accepts `{ project_id, country_code }`, fetches product-news queries capped at 5 and country-news queries capped at 8, then updates only news-related `project_countries.rationale.sources`.
- Existing non-news sources such as market profile, certification, regulation, trade-office, SafetyKorea, and detail-deferred markers are preserved.
- The Step 3 UI action now invokes `recommend-country-news` sequentially for ranks 1-3 in one click, so news source generation no longer competes with recommendation ranking inside one CPU budget.
- News evidence country matching now separates `direct_country`, `background_country`, and `mismatch`. Only `direct_country` can become product-direct evidence; other-country articles can only appear as background evidence when the selected country is clearly mentioned.
- Step 3 displays up to 4 selected-country direct news items and up to 4 combined industry/export-environment background items per selected country.
- No Supabase migration was added.

## Verification
- Added tests for 546 no-retry handling and Customs request concurrency.
- `npm test` passed: 42 test files, 227 tests.
- `npm run build` did not complete in this local Windows environment: `node.exe` exited with `-1073740791` after Vite transformed 3333 modules, with no TypeScript or Vite error line emitted.
- Follow-up tests added for candidate limiting and the `recommend-countries` edge budget guard.
- Deno static check was not run locally because `deno` is not installed in this Windows environment.
