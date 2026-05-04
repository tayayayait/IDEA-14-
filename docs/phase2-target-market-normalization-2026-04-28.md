# Phase 2 - Target Market Parsing Normalization (2026-04-28)

## Goal
- Remove `Indonesia(ID)` vs `India(IN)` confusion from target-market parsing.
- Enforce one shared parsing/canonicalization rule between server and client.
- Persist `rationale.target_markets` as canonical `{ code, name }` only.

## Applied Skills
- `systematic-debugging`: reproduced and traced the parsing path (`note -> detect -> normalize -> store -> render`).
- `parse-dont-validate`: parse boundary input into canonical domain values first.
- `data-validation` (`loom-data-validation`): added canonicalization guard before persistence and on client hydration.

## Root Cause
- `detectCountryCodesFromText` allowed substring fallback (`includes`) for non-latin aliases.
- `인도네시아` text also matched `인도`, which inserted `IN` incorrectly.

## Implementation
- Updated shared parser in `supabase/functions/_shared/recommendation.ts`:
  - Added explicit country-code extraction (`[A-Z]{2}`) path.
  - Replaced alias detection with longest-match-first span selection.
  - Added overlap rejection so short aliases cannot re-match inside already matched longer aliases.
  - Added non-latin short-token guard with Korean market suffix allowlist (`시장`, `수출`, `진출`, `대상`, `향`, `내`).
  - Added `canonicalizeTargetMarkets(input)` to coerce mixed payloads to canonical `{ code, name }`.
- Updated `supabase/functions/recommend-countries/index.ts`:
  - Applied `canonicalizeTargetMarkets` in `buildProductContext`.
  - Added pre-persist guard for `rationale.target_markets` before insert.
- Updated `src/pages/Step3Countries.tsx`:
  - Reused shared `canonicalizeTargetMarkets` for `sanitizeMarkets`.
  - Normalized market conversion path used by target-market insight rendering.

## Test Updates
- Extended `src/test/recommendation-target-market.test.ts`:
  - `베트남·인도네시아` does not produce `IN`.
  - explicit `IN` keeps `India`.
  - non-boundary hangul text (`인도네시아시장`) does not infer `IN`.
  - canonical payload coercion guard test for mixed `target_markets` input.

## Validation
- Ran `npm test -- src/test/recommendation-target-market.test.ts` (pass).
- Ran `npm test` (pass, 24 files / 112 tests).
