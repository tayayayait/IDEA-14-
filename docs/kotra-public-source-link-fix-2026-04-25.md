# KOTRA Public Source Link Fix

Date: 2026-04-25

## Problem
- Step4 certification/regulation cards exposed KOTRA `source_url` values that pointed to authenticated public-data API endpoints.
- Clicking the KOTRA link opened `apis.data.go.kr/...` and showed `Unauthorized` when no service key was present.

## Root Cause
- `supabase/functions/country-detail/index.ts` stored API endpoint constants as user-facing `source_url` values for:
  - KOTRA overseas certification
  - KOTRA import regulation items
- Existing saved rows kept those API URLs, and `src/pages/Step4CountryDetail.tsx` rendered them directly.

## Change
- Added `src/lib/source-url.ts` to normalize KOTRA API URLs to public KOTRA pages.
- Step4 now normalizes stored certification/regulation/source-panel URLs on load, so legacy rows no longer open authenticated API endpoints.
- `src/lib/api-registry.ts`, `/data-sources`, and Step6 report source rows now use public KOTRA `sourceUrl` values for user-facing links while keeping API endpoints as call metadata.
- Supabase recommendation/detail functions now persist public KOTRA pages for certification and import-regulation evidence.

## Public KOTRA Pages
- Country information: `https://dream.kotra.or.kr/kotranews/cms/com/index.do?MENU_ID=30`
- Market news: `https://dream.kotra.or.kr/kotranews/index.do`
- Overseas certification information: `https://dream.kotra.or.kr/dream/cms/com/index.do?MENU_ID=4030`
- Import regulation: `https://dream.kotra.or.kr/dream/cms/com/index.do?MENU_ID=3700`

## Verification
- Added `src/test/source-url.test.ts`.
- Targeted test: `npm test -- --run src/test/source-url.test.ts`
