# API 7 Connection Note (K-SURE Industry Risk Index)

Date: 2026-04-23

## Source Spec
- Dataset: 한국무역보험공사_국가별 업종별 위험지수
- Version: `1.0.0`
- Function: `riskindex`
- Endpoint: `https://apis.data.go.kr/B552696/ksight/riskindex`

## Request Parameters Used
- `serviceKey` (required)
- `pageNo` (required)
- `numOfRows` (required)
- `_type=json` (runtime JSON response)

## Runtime Verification
Live call check on 2026-04-23:
- HTTP 200
- `response.header.resultCode=0`
- `response.header.resultMsg=NORMAL SERVICE.`
- JSON item fields confirmed:
  - `riskIdx`
  - `ctryCd`
  - `ctryNm`
  - `biztypCd`
  - `biztypNm`

## Response Mapping Used
Input path: `response.body.items.item[]`

Mapped to `project_risks` (category: `k_sure_industry`):
- `level` <- derived from `riskIdx`
  - `>=4` -> `high`
  - `>=3 and <4` -> `caution`
  - `<3` or unknown -> `info`
- `summary` <- country / industry / risk index text
- `raw.country_code` <- `ctryCd`
- `raw.country_name` <- `ctryNm`
- `raw.biz_type_code` <- `biztypCd`
- `raw.biz_type_name` <- `biztypNm`
- `raw.risk_index` <- `riskIdx`

## Code Integration
- `supabase/functions/country-detail/index.ts`
  - Added endpoint constant `KSURE_INDUSTRY_RISK_ENDPOINT`.
  - Added fetch pipeline:
    - `fetchKsureIndustryRisks`
    - `callKsureIndustryRiskPage`
    - `normalizeKsureIndustryRiskItem`
    - `filterKsureIndustryRisksByCountry`
    - `rankKsureIndustryRisks`
  - Added K-SURE industry risk rows to `project_risks` with `category="k_sure_industry"`.
  - Added API call logging with `api_key_name="ksure_industry_risk"`.
  - Included K-SURE industry API source in country rationale sources.
  - Added response field: `ksure_industry_count`.
- `src/lib/api-registry.ts`
  - Updated `ksure_industry_risk` endpoint to the Data.go.kr risk index API path.

## Current Scope
- This change covers API #7 in Step4 detail analysis.
- API #8(수출결제정보) 연동은 별도 연결이 필요함.
