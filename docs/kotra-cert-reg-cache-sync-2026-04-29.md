# KOTRA 인증·수입규제 정합화 작업 기록 (2026-04-29)

## 목적
- Step4 `필요 인증`/`규제·NTM`에서 "API 성공인데 0건"으로 오해되는 상태를 분리한다.
- 수입규제는 실시간 5페이지 조회를 중단하고 캐시 기반 조회로 전환한다.
- 해외인증은 API 명세대로 `search1=품목명`, `search5=HSCD`만 사용한다.

## 구현 변경
- Supabase migration 추가:
  - `kotra_import_regulation_cache`
  - `api_cache_status`
- 신규 Edge Function 추가:
  - `supabase/functions/sync-kotra-import-regulations/index.ts`
  - 실제 API명: `대한무역투자진흥공사_수입규제품목(지역본부별) 정보`
  - 실제 엔드포인트: `https://apis.data.go.kr/B410001/DS00000128/getDS00000128`
  - 요청 파라미터: `serviceKey,pageNo,numOfRows,type=json`
- `country-detail`:
  - 수입규제 조회를 캐시 기반으로 변경
  - 캐시 미동기화/오래됨 시 `detail_state="stale"` 저장
  - `api_call_logs.kotra_import_regulation.status`에 `stale` 기록 가능
- `recommend-countries`:
  - 수입규제 입력 소스를 실시간 API 호출에서 캐시 조회로 변경
- `kotra-detail-tools`:
  - 인증 검색 시도에서 `keyword+country`, `country_only` 제거

## 상태 규칙
- `project_regulations.raw.detail_state`
  - `success`: 캐시 기준 매칭 규제 존재
  - `empty`: 캐시 정상, 필터 매칭 0건
  - `stale`: 캐시 없음 또는 stale 기준 초과
  - `error`: 캐시 조회 오류
- UI 문구 분리
  - `API 오류`
  - `캐시 미동기화/오래됨`
  - `API 성공 (매칭 0건)`

## 테스트 포인트
- 인증 검색 시도에 국가명이 `search1`로 들어가지 않는지 검증
- `base_query` 유지 검증
- 규제 랭킹이 `국가 + (HS 또는 제품토큰)` 조건으로만 통과하는지 검증
- 캐시 정규화/매핑 검증 (`HSCD`, `HSCD_CN`, `REGL_CN`, `ISO_WD2_NAT_CD`, `PROBE_TGT_NAT_NAME`)
