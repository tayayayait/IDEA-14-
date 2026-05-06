# Step4 country-detail CPU budget fix (2026-05-05)

## Problem
- Supabase Edge Function `country-detail` hit `CPU Time exceeded` on 2026-05-05.
- The risky path was KOTRA import-regulation detail collection.
- The cache and CSV fallback readers used unbounded `while (true)` pagination.
- The query also matched selected-country aliases against origin/target text fields, which can pull many unrelated rows into one Edge invocation.
- WTO ePing is no longer part of Step4 scope, so `country-detail` must not call WTO ePing or translate WTO notification titles during detail analysis.

## Runtime policy
- `country-detail` must not scan the full KOTRA import-regulation cache.
- Runtime cache reads are bounded:
  - `MAX_IMPORT_REGULATION_CACHE_ROWS = 500`
  - `MAX_CSV_IMPORT_REGULATION_BACKUP_ROWS = 500`
- Primary cache reads must require the selected importing country code:
  - `iso_wd2_nat_cd = selected country code`
- CSV backup reads must require:
  - `regulation_country_code = selected country code`
- Candidate rows are further narrowed by HS/HSK and product text filters before in-memory ranking.
- Origin/target country fields are used only after retrieval to verify Korea/global target applicability, not to broaden the database query.
- WTO ePing notification search is excluded from the runtime path.
- `country-detail` must not invoke `sync-kotra-import-regulations`.
- If the KOTRA import-regulation cache is missing, stale, or unreadable, `country-detail` may use the bounded CSV backup query and otherwise returns `stale`/`error` state. Full cache sync must run as a separate admin or scheduled job, not inside a user detail request.
- KOTRA overseas certification lookup remains enabled, but each search attempt is single-page only:
  - `KOTRA_CERT_SEARCH_ATTEMPT_LIMIT = 8`
  - `KOTRA_CERT_PAGE_LIMIT = 1`
  - `KOTRA_CERT_PAGE_SIZE = 20`
- K-SURE industry risk lookup remains enabled, but it must not scan the 10-page dataset in one user request:
  - `KSURE_INDUSTRY_RISK_PAGE_LIMIT = 3`
  - `KSURE_INDUSTRY_RISK_PAGE_SIZE = 200`

## Verification
- `src/test/country-detail-edge-bundle.test.ts` checks that `country-detail` uses bounded `.limit(...)` reads.
- The test also rejects `while (true)`, `.range(from, to)`, and target-country alias `ilike` filters in these readers.
- The test rejects `../_shared/wto-eping.ts`, `fetchWtoEpingNotifications`, `WTO_API_KEY`, and `wto_eping` in `country-detail`.
- The test rejects `invokeKotraImportRegulationSync`, `sync-kotra-import-regulations`, `KOTRA_IMPORT_REGULATION_SYNC_TIMEOUT_MS`, and `allowApiSync` in `country-detail`.
- The test rejects KOTRA certification `base_query` 8-page/100-row sweeps and requires the single-page certification constants.
- The test rejects K-SURE industry risk 10-page scans and requires the bounded page constants.
