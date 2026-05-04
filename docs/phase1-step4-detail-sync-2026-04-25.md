# Phase 1 - Step4 Detail Sync Fix (2026-04-25)

## Scope
- Fix the Step4 inconsistency where the detail-run action may return an error while DB rows are already written.
- Ensure Step4 UI reloads latest detail rows even when `invoke` returns `ok: false`.

## Code Change
- File: `src/pages/Step4CountryDetail.tsx`
- Updated `load()` to return row counts for certifications, regulations, and risks.
- Updated `runDetail()` flow:
1. Always call `load()` after invoking `country-detail`.
2. If invoke failed but rows exist after reload, set UI state to `partial_success` instead of `error`.
3. Show warning toast that latest saved data is now reflected on screen.

## Expected Behavior
- Detail-run action no longer leaves Step4 in stale "not executed" view when backend write actually succeeded.
- Step4 body and side panel reflect latest DB data immediately after run.
- Step4 and Step6 consistency is improved for certification/regulation/risk sections.

## Browser Verification
- Project: `52d80b89-be26-45cb-a55e-4cd2fbd8fc32`
- Route: `/projects/52d80b89-be26-45cb-a55e-4cd2fbd8fc32/countries/US`
- Verified:
1. Certification rows render after detail run.
2. Regulation rows render after detail run.
3. K-SURE risk cards render after detail run.
4. AI state shows as success.
