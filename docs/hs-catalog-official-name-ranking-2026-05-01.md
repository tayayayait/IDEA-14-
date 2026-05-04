# HS Catalog Official Name Ranking

Date: 2026-05-01

## Facts

- Source file: `api가이드 파일(공공데이터)/관세청_HS부호_20260101.xlsx`.
- Generated runtime file: `supabase/functions/ai-hs-suggest/hs-catalog.ts`.
- The generated catalog contains 11,327 valid 10-digit HSK rows.
- Before this change, the runtime catalog preserved core name fields but did not preserve official source metadata such as effective dates, unit codes, and nature classification fields.

## Cause

- Product descriptions can contain part words such as seat, frame, and wheel.
- The previous ranker allowed those part words to dominate over a direct official product-name match.
- For the stroller case, the official HSK row was capped because it did not match the detected seat core concept, so it was excluded from the top candidates.

## Fix

- `scripts/build_hs_catalog.py` now preserves official source metadata needed for HS confirmation UI:
  - effective start and end dates
  - weight unit code
  - integrated nature classification name
- `candidate-ranking.ts` now treats direct official product-name or standard-name matches as a strong signal.
- Direct product-name matches bypass role caps so secondary description terms cannot suppress the official product row.
- Regression coverage keeps lavatory-seat searches ranked to `392220` while stroller searches rank to `8715000000`.

## Verification

- Added ranking regression tests in `src/test/hs-role-ranking.test.ts`.
- Added catalog metadata coverage in `src/test/hs-catalog-mapping.test.ts`.
- Targeted test command passed:
  `npm test -- src/test/hs-role-ranking.test.ts src/test/hs-catalog-mapping.test.ts`
