# API 9 Connection Note (Trade Security Institute HSK Linkage)

Date: 2026-04-23

## Source Spec
- Dataset: 무역안보관리원_HSK 연계표 정보
- Source file used: `api가이드 파일(공공데이터)/전략물자관리원_HSK 연계표 정보_20181126.csv`
- Record count in source file: 9,907 rows
- Core fields:
  - `HSKCD` (HSK code)
  - `HSKNM` (Korean item name)
  - `HSENM` (English item name)
  - `CNTRLNO` (Control number)

## Runtime Integration Policy
- This dataset is consumed as a static linkage map (CSV -> TypeScript map) instead of live HTTP API calls.
- Matching order:
  1. Exact 10-digit HSK code match (`hsk_code`)
  2. Fallback candidate match by 6-digit prefix (`hsk_code` or `hs_code`)

## Response Mapping Used
Mapped to `project_safety_flags` with `flag_type="strategic"`:
- Exact match:
  - `severity=warn`
  - summary includes exact HSK match and control number(s)
  - `raw.control_no`, `raw.control_no_list`, `raw.item_name_ko`, `raw.item_name_en`
- Prefix candidate match:
  - `severity=warn`
  - summary includes candidate count by 6-digit prefix
  - `raw.candidate_hsk_list`, `raw.control_no_list`, `raw.prefix6`
- No match:
  - `severity=info`
  - summary indicates no linkage match found

## Code Integration
- Added generated static map:
  - `supabase/functions/safety-scan/strategic-hsk-map.ts`
- Updated safety scan logic:
  - `supabase/functions/safety-scan/index.ts`
  - Removed fixed HS heuristic array and replaced with CSV-derived HSK linkage matching
  - Added API call logs:
    - `api_key_name="trade_security_hsk_strategic"`
    - `api_key_name="safetykorea_recall"`

## Current Scope
- This change covers API #9 strategic-item flag generation using the provided HSK linkage table.
- SafetyKorea recall details remain in the existing separate flow.
