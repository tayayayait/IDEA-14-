# Step4 regulation sync internal auth fix (2026-04-30)

## Problem
- `country-detail` can decide that the KOTRA import-regulation cache is missing or stale.
- In that case it must call `sync-kotra-import-regulations`.
- The deployed log only showed `booted` and `shutdown`, so the sync function was not actually processing a sync request.

## Change
- `country-detail` now calls `sync-kotra-import-regulations` with `SUPABASE_SERVICE_ROLE_KEY` when it is available.
- `sync-kotra-import-regulations` accepts this internal service-role call without requiring a user JWT lookup.
- Normal user JWT calls are still accepted and still checked with `auth.getUser()`.
- The sync function now logs:
  - `sync-kotra-import-regulations started`
  - `sync-kotra-import-regulations completed`

## Expected operation
1. `country-detail` checks `api_cache_status`.
2. If the cache is unusable, it calls `sync-kotra-import-regulations` internally.
3. The sync function updates `api_cache_status.active_batch_id` and `last_success_at`.
4. `country-detail` rereads the cache and uses the refreshed rows.

## Deployment
Deploy both functions because `country-detail` and the sync function both changed.

```powershell
npx supabase functions deploy country-detail --project-ref gnwhjqaxndbkqxecxjkn
npx supabase functions deploy sync-kotra-import-regulations --project-ref gnwhjqaxndbkqxecxjkn
```
