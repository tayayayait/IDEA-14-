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
- KOTRA 해외인증정보는 원본 목록형 DB이므로 API 원본 결과를 사용자 리포트에 그대로 노출하지 않는다.
- 사용자 화면에는 국가·HS/HSK·제품명·산업군 관련성 검증을 통과한 `확정 인증정보`와 `검토 필요 인증정보`만 표시한다.
- 인증 원문 국가 필드(`nat`, `regn`, `ovrofInfo`, `nttSj`)가 선택 국가 alias와 맞지 않으면 점수와 관계없이 제외한다.
- `HS 강매칭`은 HSK 10자리 정확 일치, HS 6자리 정확 일치, item HS 앞 6자리 일치다. 국가, 제품 관련성, 산업군 호환을 모두 통과하고 최종 점수가 90 이상이면 확정 인증정보가 될 수 있다.
- `HS 부분매칭`은 HS 앞 4자리 또는 앞 2자리 일치다. 확정으로 승격하지 않고, 제품 관련성이 강하고 산업군이 호환될 때만 검토 필요 인증정보로 표시한다.
- `HS 없음`은 item `hscd`가 비어 있거나 확인 불가인 경우다. 확정으로 승격하지 않고, 제품명 전체·핵심 복합 키워드·명확한 동의어가 강하게 맞고 산업군이 호환될 때만 검토 필요 인증정보로 표시한다.
- `HS 불일치`는 item HS가 존재하지만 앞 4자리도 불일치하는 경우다. 기본 제외하며, 제품 관련성이 매우 강하고 산업군이 명확히 호환될 때만 예외적으로 검토 필요 인증정보가 될 수 있다.
- 제품명, 영문 키워드, 태그 토큰은 확정 인증의 필수 조건이다. 국가+HS만 일치하고 제품 토큰이 맞지 않는 인증은 표시하지 않는다.
- `인증`, `제품`, `허가`, `등록`, `수입`, `수출`, `제조`, `부품`, `기기`, `장비` 같은 일반어만 일치하면 점수와 관계없이 제외한다.
- 제품군과 인증정보의 산업군이 명확히 다르면 점수와 관계없이 제외한다.
- 확정 인증정보와 검토 필요 인증정보가 모두 없으면 무관한 대체 후보를 표시하지 않고 `확인된 해외인증 정보 없음` 상태로 남긴다.
- 저장되는 인증 row의 `raw.match_basis`에는 `국가=<선택국가> / HS=<확정 HS> / HSK=<확정 HSK> / 제품명=<제품명>` 형식의 노출 기준을 기록한다.
- 저장되는 인증 row의 `raw.input_country_code`, `raw.input_product_name`, `raw.input_hs_code`, `raw.input_hsk_code`는 Step4 화면에서 현재 제품/HS와 다시 대조한다.
- 저장되는 인증 row의 `raw`에는 `match_decision`, `hs_match_level`, `hs_score`, `text_score`, `category_score`, `final_score`, `exclude_reason`을 기록한다.
- 원본 조회 카운트는 사용자 화면이 아니라 개발 로그와 `api_call_logs.detail`에만 기록한다. 예: `API 원본 8건 / 확정 0건 / 검토 0건 / 제외 8건`.

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
