# API 6 Connection Note (K-SURE Country Credit Grade)

Date: 2026-04-23

## Source Spec
- Dataset: 한국무역보험공사_국별신용등급
- Version: `1.0.0`
- Function: `credit-grade`
- Endpoint: `https://apis.data.go.kr/B552696/countrygrade/credit-grade`

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
  - `ctryCd`
  - `ctryNm`
  - `evalGrd`
  - `evalDd`

## Response Mapping Used
Input path: `response.body.items.item[]`

Mapped to `project_risks` (category: `k_sure`):
- `level` <- derived from `evalGrd`
  - grade `6~7` -> `high`
  - grade `4~5` -> `caution`
  - grade `1~3` or unknown -> `info`
- `summary` <- country / grade / evaluation date text
- `raw.country_code` <- `ctryCd`
- `raw.country_name` <- `ctryNm`
- `raw.eval_grade` <- `evalGrd`
- `raw.eval_date` <- parsed `evalDd` (`YYYYMMDD` -> `YYYY-MM-DD`)

## Code Integration
- `supabase/functions/country-detail/index.ts`
  - Added endpoint constant `KSURE_COUNTRY_GRADE_ENDPOINT`.
  - Added fetch pipeline:
    - `fetchKsureCountryGrade`
    - `callKsureCountryGradePage`
    - `normalizeKsureCountryGradeItem`
  - Added K-SURE risk mapping into `project_risks` with `category="k_sure"`.
  - Added API call logging with `api_key_name="ksure_country_risk"`.
  - Included K-SURE source in country rationale sources.
  - Added response fields: `ksure_grade`, `ksure_eval_date`.
- `src/lib/api-registry.ts`
  - Updated `ksure_country_risk` endpoint to the Data.go.kr country grade API path.

## Current Scope
- This change covers API #6 in Step4 detail analysis.
- API #7(국가별 업종별 위험지수) and API #8(수출결제정보) remain to be connected separately.
