# Step4 certification/regulation current-context filter (2026-05-02)

## Purpose
- Step4 country detail must show certification and regulation data for the current selected product context only.
- The display context is the latest `project_products` row: selected country, product name, HS code, and HSK code.

## Certification policy
- Confirmed certification rows require all of:
  - selected country match
  - selected HS 6-digit or HSK 10-digit match
  - selected product-name, English keyword, or tag-token match
- Country+HS-only certification rows are excluded from confirmed results.
- Country+product rows with HS mismatch can appear only as review candidates.
- Generic certification/trade terms and the selected country code/aliases are ignored as product-match tokens.
- Review candidates are counted separately from confirmed required certifications.

## Regulation/NTM policy
- Existing confirmed regulation criteria remain unchanged:
  - selected import country
  - Korea/global origin target
  - selected HS 6-digit or HSK-compatible match
- Product token match can only support review candidates when HS does not match.
- Rows saved for a different product/HS input context are not shown as current confirmed regulations.

## Stored metadata
- `country-detail` stores the analysis input on certification and regulation rows:
  - `raw.input_country_code`
  - `raw.input_country_name`
  - `raw.input_product_name`
  - `raw.input_hs_code`
  - `raw.input_hsk_code`
- Step4 rechecks these fields before rendering rows.
- Legacy rows without `raw.input_*` are treated conservatively:
  - certifications need both HS evidence and product text evidence
  - regulations need HS evidence
  - insufficient evidence is excluded from current confirmed display

## User-facing empty state
- If only stale/different-context rows exist, Step4 shows:
  - `현재 제품/HS 기준 상세 분석 결과 없음. 대상국 분석을 다시 실행하세요.`
- If the current context was checked and returned no rows, Step4 shows the normal no-result notice.
