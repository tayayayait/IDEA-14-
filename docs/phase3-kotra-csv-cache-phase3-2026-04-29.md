# Phase 3 - KOTRA CSV 연동 테스트/문서/릴리즈 (2026-04-29)

## 1) 신규 데이터 4종

1. `kotra_csv_export_region_rank` (수출 지역 순위)  
   출처: [공공데이터포털 검색](https://www.data.go.kr/tcs/dss/selectDataSetList.do?keyword=%EC%88%98%EC%B6%9C%20%EC%A7%80%EC%97%AD%20%EC%88%9C%EC%9C%84)
2. `kotra_csv_import_regulation` (국별 대세계 수입규제 현황)  
   출처: [공공데이터포털 검색](https://www.data.go.kr/tcs/dss/selectDataSetList.do?keyword=%EA%B5%AD%EB%B3%84%20%EB%8C%80%EC%84%B8%EA%B3%84%20%EC%88%98%EC%9E%85%EA%B7%9C%EC%A0%9C%20%ED%98%84%ED%99%A9)
3. `kotra_csv_trade_office` (무역관 정보)  
   출처: [공공데이터포털 검색](https://www.data.go.kr/tcs/dss/selectDataSetList.do?keyword=%EB%8C%80%ED%95%9C%EB%AC%B4%EC%97%AD%ED%88%AC%EC%9E%90%EC%A7%84%ED%9D%A5%EA%B3%B5%EC%82%AC_%EB%AC%B4%EC%97%AD%EA%B4%80%20%EC%A0%95%EB%B3%B4)
4. `kotra_csv_overseas_exhibition` (해외전시회 정보)  
   출처: [공공데이터포털 검색](https://www.data.go.kr/tcs/dss/selectDataSetList.do?keyword=%EB%8C%80%ED%95%9C%EB%AC%B4%EC%97%AD%ED%88%AC%EC%9E%90%EC%A7%84%ED%9D%A5%EA%B3%B5%EC%82%AC%20%ED%95%B4%EC%99%B8%EC%A0%84%EC%8B%9C%ED%9A%8C%20%EC%A0%95%EB%B3%B4)

## 2) 점수 반영 규칙 (Step3)

`deriveExportRegionRankMarketBoost` 규칙:

- `rank` 구간 보정: `<=3:+8`, `<=10:+6`, `<=20:+4`, `<=50:+2`, 그 외 `+1`
- `export_share` 보정: `>=10:+3`, `>=5:+2`, `>=1:+1`
- `hsMatched=true`일 때 `+1`
- 최대 상한: `12점` (clamp)

적용 방식:

- API 기반 시장점수(`apiMarketScore`)에 CSV 정량 보정치를 추가
- Step3 후보국 점수의 정량 근거를 `rationale.sources`에 함께 저장

## 3) 인코딩 규칙

- 기본: UTF-8
- 예외: `해외전시회 정보` CSV는 CP949 우선 디코딩 (`TextDecoder("euc-kr")`)
- CP949 디코딩 실패 시 UTF-8 fallback

## 4) 실패 시 폴백 정책

- Step4 수입규제 API 결과가 `error/stale/미매칭`이면:
  - `kotra_csv_import_regulation_cache` 조회로 백업 상세 생성
  - `raw.source_type="csv_backup"` 표기
  - 상세 화면에서 백업 근거/링크를 명시
- Step6은 `rationale.sources`의 `trade_office_action`, `exhibition_action`를 파싱해서 실행 블록 출력
- `/data-sources`는 `api_cache_status` 기준으로 4종 CSV 캐시 상태를 독립 표기

## 5) Phase 3 테스트 범위

- 파서/정규화: `src/test/kotra-csv-cache-normalizer.test.ts`
- 스코어링: `src/test/export-region-rank-score.test.ts`
- 상태 매핑: `src/test/csv-cache-status.test.ts`
- 리포트 실행 액션 매핑: `src/test/report-execution-actions.test.ts`

## 6) 실사용 시나리오 검증 경로

- Step2 입력
- Step3 추천/점수 확인
- Step4 상세(규제 백업 근거 포함) 확인
- Step6 리포트(무역관/전시회 실행 액션) 확인

## 7) 검증 결과

- `npm test` 통과: **35 files / 168 tests**
- `/data-sources` 반영 확인:
  - API 10종 상태 카드 + CSV 캐시 4종 상태 카드 동시 노출
  - `api_cache_status` 기반 상태(`idle/running/success/partial_success/error/stale`) 매핑 확인
- Step6 실행 액션 출력 경로 확인:
  - `src/lib/report-execution-actions.ts`로 파싱/중복제거/URL 정규화 분리
  - `src/test/report-execution-actions.test.ts`에서 무역관/전시회 액션 렌더용 데이터 추출 검증 완료
- 실사용 페이지 플로우 확인:
  - `Step2(/product) -> Step3(/countries) -> Step4(/countries/DE) -> Step6(/report)` 이동 정상
  - 검증 시점 프로젝트(`ef5799ef-5187-4086-a0da-5e33879d1a81`)는 CSV 캐시가 `미동기화`여서 Step6에 무역관/전시회 액션이 노출되지 않음
  - 데이터 적재 후 Step3 재실행 시 Step6 액션 블록이 노출되도록 코드 경로는 연결됨
