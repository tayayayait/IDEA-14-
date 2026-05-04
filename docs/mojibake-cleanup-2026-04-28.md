# Mojibake cleanup - 2026-04-28

## Scope
- Restored broken Korean UI copy in Step 4 country detail and Step 5 safety review screens.
- Added common `sanitize()` normalization for known Korean mojibake fragments already stored in API/database payloads.
- Expanded the mojibake guard test to block recurrence outside intentional sanitizer fixtures.

## Verification
- `npm test` must pass before this change is treated as complete.
