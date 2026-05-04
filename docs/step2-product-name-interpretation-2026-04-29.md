# Step2 product-name interpretation update (2026-04-29)

## Change
- Moved Step2 product-description fallback rules into `supabase/functions/_shared/product-description-rules.ts`.
- Added deterministic interpretation for passenger automobile seats. `승용자동차 시트` and `승용차 시트` are normalized as passenger automobile seat parts instead of unknown generic products.
- Added deterministic fallback interpretation for `전자자료`, treating it as likely `전자재료` in this export-product context instead of returning the generic unknown-product sentence.
- Updated the AI prompt to infer product category from the product name and start with a direct definition, not a question template.
- Added a prompt hint field so the model receives the product-name interpretation before writing the draft.
- Added a sanitizer that removes question-style openings such as "`...란 무엇인가요?`" when a provider still returns that template.

## Expected result
- Product description drafts for passenger automobile seats should describe an in-vehicle seat component, seating support, possible frame/cushion/cover/headrest/rail/recliner structure, shock absorption, seating stability, entry/exit convenience, and optional heating/ventilation/electric adjustment review points.
- Product description drafts for `전자자료` should describe electronic materials used in electronic component manufacturing and explicitly defer exact HS/HSK classification to composition and process checks.
- The fallback path should no longer output generic wording such as "product-name-based purpose/function only" or "no certain information" for recognized vehicle seats.

## Verification
- Covered by `src/test/ai-product-description-rules.test.ts`.
