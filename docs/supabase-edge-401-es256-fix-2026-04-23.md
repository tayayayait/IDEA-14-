# Supabase Edge 401 (`UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM`) Fix

## Date
- 2026-04-23

## Symptom
- Browser invocation to `functions/v1/ai-hs-suggest` returned `401`.
- Invocation metadata showed:
  - `authorization` JWT algorithm: `ES256` (authenticated user token)
  - legacy built-in JWT check failure with `UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM`

## Root Cause
- Supabase Edge Functions legacy gateway JWT verification (`verify_jwt = true`) is not compatible with newer asymmetric JWT signing key flow in this project.
- The request fails at gateway auth check before function code runs.

## Applied Fix
1. Disabled built-in gateway JWT verification in `supabase/config.toml` for authenticated app functions:
   - `ai-hs-suggest`
   - `recommend-countries`
   - `country-detail`
   - `safety-scan`
   - `ai-action-tasks`
   - `ai-report-summary`
   - `ai-product-description`
2. Added explicit in-function auth verification helper:
   - `supabase/functions/_shared/auth.ts`
3. Applied the helper to AI functions that previously had no explicit auth check:
   - `supabase/functions/ai-hs-suggest/index.ts`
   - `supabase/functions/ai-action-tasks/index.ts`
   - `supabase/functions/ai-report-summary/index.ts`

## Verification Checklist
- Deploy updated functions and config.
- Re-login to obtain a fresh access token.
- Re-run product HS suggestion flow.
- Confirm invocation no longer fails with `UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM`.
- Confirm unauthenticated request is rejected with `401 unauthorized`.

## Reference
- Supabase troubleshooting: https://supabase.com/docs/guides/troubleshooting/edge-function-401-error-response
- Supabase auth guidance for Edge Functions: https://supabase.com/docs/guides/functions/auth
