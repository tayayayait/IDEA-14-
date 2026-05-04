# Step3 AI Recommendation Gate

## Problem

Step 3 recommendation cards could show API-only fallback copy such as candidate signal lists or generic low-score reasons when AI scoring returned incomplete results.

## Change

- Step 2 now invokes `recommend-countries` with `require_ai: true` after saving the product/HS data.
- Step 2 opens `/projects/{id}/countries` only after AI scoring and Korean rationale are returned for every candidate country.
- Step 3 manual recommendation reruns also pass `require_ai: true`.
- `recommend-countries` rejects incomplete AI scoring before deleting or replacing existing `project_countries` rows, so API-only fallback rationale is not persisted for the AI-required path.
- AI result parsing now requires `recommendation_reason`; incomplete AI rows are treated as missing.

## Verification

- Added `src/test/step3-ai-recommendation-gate.test.ts`.
- The test checks Step 2 gating, Step 3 rerun gating, and the Edge function persistence guard.
