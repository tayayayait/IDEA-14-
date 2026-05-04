# Report draft news impact fix (2026-05-01)

## Problem
- `report-draft.ts` referenced `buildCountryNewsImpact`, but the helper was not defined.
- `npm test` failed in `report-draft.test.ts` before the Step 3 Customs changes could be accepted.

## Fix
- Added `buildCountryNewsImpact`.
- The helper uses only target-country direct evidence references already filtered by `buildCountryEvidenceRefs`.
- When no valid direct evidence exists, it returns the existing no-direct-news fallback text.

## Scope
- No API contract change.
- No database migration.
