# Step4 regulation sync policy

## Superseded on 2026-05-05

The 2026-04-30 internal-auth sync policy is no longer active for `country-detail`.

`country-detail` must not call `sync-kotra-import-regulations` during a user detail request because the sync function can page through the full KOTRA DS00000128 dataset and exceed Supabase Edge CPU budget.

## Current operation

1. `country-detail` checks `api_cache_status`.
2. If the cache is ready, it reads only bounded country/product candidates.
3. If the cache is missing, stale, or unreadable, it tries the bounded CSV backup query.
4. If no bounded backup exists, it returns `stale` or `error`.
5. Full KOTRA import-regulation cache sync must run as a separate admin or scheduled operation.

## Deployment

For this policy change, deploy `country-detail`.

```powershell
pnpm dlx supabase functions deploy country-detail --project-ref gnwhjqaxndbkqxecxjkn
```
