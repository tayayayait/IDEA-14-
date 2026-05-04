# API 5 Connection Note (KOTRA Import Regulation Item - Regional HQ)

Date: 2026-04-23

## Source Spec
- Dataset: 대한무역투자진흥공사_수입규제품목(지역본부별) 정보
- API ID: `DS00000128`
- Function: `getDS00000128`
- Endpoint: `https://apis.data.go.kr/B410001/DS00000128/getDS00000128`

## Request Parameters Used
- `serviceKey` (required)
- `pageNo` (required)
- `numOfRows` (required)
- `type=json` (runtime JSON response)

Note:
- In the provided DOCX guide, `search1~searchN` filters are not defined for this API.
- Filtering by country/HS/product is applied in server-side post-processing.
- Step4 상세분석에서는 실시간 API 5페이지 조회를 제거하고, 동기화된 전역 캐시를 사용한다.

## Runtime Verification
Live call check on 2026-04-23:
- HTTP 200
- `resultCode=0`, `resultMsg=정상`
- JSON root includes `records[]`, `pageNo`, `numOfRows`, `totalCount`
- Item fields confirmed:
  - `HQURT_NAME`, `CMDLT_NAME`, `HSCD`, `HSCD_CN`
  - `REGL_CN`, `ISO_WD2_NAT_CD`, `PROBE_TGT_NAT_NAME`
  - `REGL_STR_DE`, `REGL_END_DE`, `REG_DT`

## Response Mapping Used
Input path: `records[]`

Mapped to `project_regulations`:
- `topic` <- `REGL_CN` (fallback `HQURT_NAME`)
- `summary` <- commodity/target-country/HQ/HS combined text
- `effective_date` <- parsed from `REGL_STR_DE` or `REG_DT`
- `raw.hs_code` <- `HSCD`
- `raw.regulation_type` <- `REGL_CN`
- `raw.effective_date` <- parsed effective date
- Additional raw metadata: `HSCD_CN`, `ISO_WD2_NAT_CD`, `PROBE_TGT_NAT_NAME`, `HQURT_NAME`, raw dates

## Code Integration
- `supabase/functions/country-detail/index.ts`
  - Reads only from `kotra_import_regulation_cache` active batch.
  - Marks `detail_state="stale"` when cache is missing or older than stale threshold.
  - Added ranking/filtering by country alias, HS code, product tokens.
  - Writes selected rows to `project_regulations`.
  - Logs API status to `api_call_logs` as `api_key_name="kotra_import_regulation"`.
- `supabase/functions/sync-kotra-import-regulations/index.ts`
  - Calls `https://apis.data.go.kr/B410001/DS00000128/getDS00000128` with `serviceKey,pageNo,numOfRows,type=json`.
  - Iterates full pages using `totalCount`.
  - Switches active cache batch only after full sync success.
- `src/lib/api-registry.ts`
  - Updated `kotra_import_regulation` endpoint to the DS00000128 path.

## Current Scope
- This change covers API #5 in Step4 detail analysis.
- K-SURE 상세 API 연동은 별도 연결이 필요함.
