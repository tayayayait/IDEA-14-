# Phase 1 API 로그/완료율 정합성 수정 (2026-04-27)

## 목표

- 실제 미실행 API가 완료로 보이지 않도록 정합성 수정
- KICOX, KOTRA 국가정보 로그 누락 보완
- `/projects`, `/report`, `/data-sources` 상태 판정 기준 통일

## 적용 내용

1. KICOX 호출 로그 기록
- 파일: `supabase/functions/api-kicox-search/index.ts`
- 변경:
  - `project_id` 입력 수용
  - 검색 실행 결과를 `api_call_logs`에 `api_key_name = "kicox_factory_production"`으로 저장
  - `status`, `http_status`, `response_count`, `error_code`, `message`, 요청 조건 detail 기록

2. KOTRA 국가정보 로그 기록
- 파일: `supabase/functions/recommend-countries/index.ts`
- 변경:
  - 후보국별 KOTRA 국가정보 호출 결과를 집계해 `api_call_logs`에 `api_key_name = "kotra_country_info"`로 저장
  - 성공/부분성공/오류/빈결과 상태를 `response_count`와 함께 기록

3. 완료율 계산 보정
- 파일: `src/lib/source-status.ts`, `src/pages/Projects.tsx`
- 변경:
  - 공통 판정 함수 `isSourceReadyForCompletion` 추가
  - 핵심 API(`KICOX`, `KOTRA`, `K-SURE`)는 `response_count > 0`일 때만 완료 처리
  - `idle/loading/stale/error/미실행/오류`는 완료 처리 제외
  - 프로젝트 완료율 계산에서 단순 “로그 키 존재” 기준 제거, 최신 로그 상태 기반으로 변경

4. 리포트 상세완료 판정 보정
- 파일: `src/pages/Step6Report.tsx`
- 변경:
  - 상세 분석 완료 판정을 공통 함수(`isSourceReadyForCompletion`) 기준으로 통일
  - 인증/규제/결제 API가 미실행 또는 0건이면 `상세 분석 미완료` 유지

5. Step1 요청 파라미터 보강
- 파일: `src/pages/Step1Company.tsx`
- 변경:
  - `api-kicox-search` 호출 시 `project_id` 전달

## 테스트

- `npm test`: 통과 (23 files, 100 tests)
- `npm run build`: 프로세스 비정상 종료 코드(`-1073740791`)로 원인 로그 미확정

## 비고

- 이번 Phase 1은 “표시/완료율 정합성” 중심 수정이며, 인증/규제 데이터 매핑 자체 개선(0건 원인 제거)은 다음 Phase에서 별도 진행 필요.
