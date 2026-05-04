# Supabase invalid refresh token recovery

## Problem
- Browser storage can keep a Supabase refresh token after the Auth server has already removed or rotated it.
- On startup, Supabase tries `auth/v1/token?grant_type=refresh_token` and receives `400`.
- The concrete error is `Invalid Refresh Token: Refresh Token Not Found`.

## Change
- Added `src/lib/supabase-auth-session.ts` for invalid refresh-token detection and project-specific auth storage cleanup.
- Added `src/lib/supabase-auth.ts` for guarded session reads.
- Replaced direct `supabase.auth.getSession()` calls in app entry, auth page, and auth guard.

## Runtime behavior
- If the stored refresh token is invalid, the app removes `sb-<project-ref>-auth-token` from `localStorage`.
- The user is sent to `/auth`.
- A valid session still routes to `/projects`.

## Validation
- `npm test` must pass before this change is considered complete.
