# API 4 Connection Note (KOTRA Overseas Certification Info)

Date: 2026-04-23

## Source Spec
- Dataset: 대한무역투자진흥공사_해외인증정보
- Service: `getOverseasAuthInfo`
- Endpoint: `https://apis.data.go.kr/B410001/overseasAuthInfo/getOverseasAuthInfo`

## Request Parameters Used
- `serviceKey` (required)
- `type=json` (required in spec)
- `numOfRows=20`
- `pageNo=1`
- Conditional filters (spec-compliant only):
  - `search5=<HS code>` (up to 6-digit prefix)
  - `search1=<product name / product keyword>`

Important:
- `search1` is not used for country names.
- Country matching is done only in post-processing from response fields (`nat`, `regn`, `ovrofInfo`, `nttSj`).

## Matching Policy
- 기본 추천 노출은 사용자가 선택한 목표시장 국가, 확정 HS/HSK, 제품명/영문 키워드/태그 토큰을 모두 만족하는 인증만 허용한다.
- 인증 원문 국가 필드(`nat`, `regn`, `ovrofInfo`, `nttSj`)가 선택 국가 alias와 맞지 않으면 추천에서 제외한다.
- HS는 선택 HS 6자리 또는 HSK 10자리와 호환되는 경우만 인정한다. HS 4자리 prefix 유사성만으로는 추천하지 않는다.
- 제품명, 영문 키워드, 태그 토큰은 확정 인증의 필수 조건이다. 국가+HS만 일치하고 제품 토큰이 맞지 않는 인증은 표시하지 않는다.
- `인증`, `제품`, `허가`, `등록`, `수입`, `수출` 같은 일반 인증/무역 단어와 선택 국가 코드/국가 alias는 제품 토큰으로 인정하지 않는다.
- 국가+제품 토큰은 맞지만 HS가 불일치하는 항목은 확정 인증이 아니라 `검토 필요 후보`로만 표시한다.
- 확정 HS/HSK 또는 제품 토큰이 없거나 국가+HS+제품 기준으로 일치하는 인증이 없으면 무관한 인증을 표시하지 않고 `확인 결과 없음` 상태로 남긴다.
- 저장되는 인증 row의 `raw.match_basis`에는 `국가=<선택국가> / HS=<확정 HS> / HSK=<확정 HSK> / 제품명=<제품명>` 형식의 노출 기준을 기록한다.
- 저장되는 인증 row의 `raw.input_country_code`, `raw.input_product_name`, `raw.input_hs_code`, `raw.input_hsk_code`는 Step4 화면에서 현재 제품/HS와 다시 대조한다.

## Runtime Verification
Live call check on 2026-04-23:
- HTTP 200
- `response.header.resultCode=00`
- `response.body.totalCnt=1496` with base query (`type`, `numOfRows`, `pageNo`)
- Item fields confirmed: `systName`, `nat`, `hscd`, `crtfcProsCn`, `needPapersCn`, `crtfcValidPdCn`

## Response Mapping Used
Path: `response.body.itemList.item[]`

Mapped to `project_certifications`:
- `scheme` <- `systName` (fallback `nttSj`)
- `raw.applicable_items` <- `applyTgtCmdltCn` / `expansApplyCmdltCn` / `cmdltDfnCn`
- `raw.required_docs` <- `needPapersCn`
- `raw.procedure` <- `crtfcProsCn`
- `raw.validity_period` <- `crtfcValidPdCn`
- `raw.hs_code` <- `hscd`
- `est_lead_days` <- parsed from `crtfcRqrmnPdCn` or `testRqrmnPdCn`
- `est_cost_krw` <- parsed only when cost text includes KRW/원

## Code Integration
- `supabase/functions/country-detail/index.ts`
  - Added live API4 fetch (`kotra_overseas_certification`) with fallback search sequence.
  - Removed non-spec attempts that mixed country text into `search1`.
  - Added country filtering using `nat/regn/ovrofInfo` and country aliases.
  - Writes certification rows into `project_certifications`.
  - Logs API call status to `api_call_logs` with `api_key_name="kotra_overseas_certification"`.
- `src/lib/api-registry.ts`
  - Updated `kotra_overseas_certification` endpoint to `apis.data.go.kr` path.

## Current Scope
- This change covers API #4 (해외인증정보) in Step4 detail analysis.
- KOTRA 수입규제품목, K-SURE 상세 API는 별도 연결이 필요함.
