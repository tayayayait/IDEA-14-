# Phase 1 - KOTRA CSV Cache Load (2026-04-29)

## Scope

- Added CSV cache tables for 4 KOTRA datasets.
- Added shared normalization utility for country/HS/range parsing.
- Added ingest script for CSV load with dedupe and validation metrics.
- Generated dry-run ingest report.

## Migration

- File: `supabase/migrations/20260429113000_add_kotra_csv_cache_tables_phase1.sql`
- Added tables:
  - `kotra_csv_export_region_rank_cache`
  - `kotra_csv_import_regulation_cache`
  - `kotra_csv_trade_office_cache`
  - `kotra_csv_overseas_exhibition_cache`
- Added `api_cache_status` keys:
  - `kotra_csv_export_region_rank`
  - `kotra_csv_import_regulation`
  - `kotra_csv_trade_office`
  - `kotra_csv_overseas_exhibition`

## Validation/Normalization Policy

- Country standardization:
  - alias mapping (`미합중국 -> 미국`, `대한민국 -> 한국`, `아랍에미리트 -> UAE` etc.)
  - ISO2 code fallback (`AE`, `US`, `VN`, `ID`, `CN`, `JP`, `KR`)
- HS normalization:
  - digits only
  - valid range: 6~10 digits
  - below 6: invalid
  - above 10: truncate to first 10
- Null/empty policy:
  - optional numeric/text fields -> `null`
  - required fields -> empty string fallback
- Dedupe:
  - dataset-specific `unique_key` generated from normalized business keys
  - duplicate rows skipped before insert

## Script

- File: `scripts/ingest_kotra_csv_cache.mjs`
- Default mode: dry-run (parse + validate only)
- Write mode: `--write` (requires `SUPABASE_SERVICE_ROLE_KEY`)

### Commands

```bash
node scripts/ingest_kotra_csv_cache.mjs
node scripts/ingest_kotra_csv_cache.mjs --write
node scripts/ingest_kotra_csv_cache.mjs --report=docs/custom-report.json
```

## Latest Load Report

- File: `docs/phase1-kotra-csv-ingest-report-2026-04-29.json`
- Mode: dry-run
- Summary:
  - `kotra_csv_export_region_rank`: source 241 / normalized 238 / duplicate 0 / errors 3
  - `kotra_csv_import_regulation`: source 4,942 / normalized 31,406 / duplicate 739 / errors 297
  - `kotra_csv_trade_office`: source 127 / normalized 127 / duplicate 0 / errors 0
  - `kotra_csv_overseas_exhibition`: source 105 / normalized 104 / duplicate 1 / errors 0

