# Phase 5: Step4 상세 데이터 일관성 보강 (2026-04-25)

## 적용 범위
- Step4 상세 화면의 인증/규제/리스크 상태 분기 정확화
- `country-detail` Edge Function 저장 데이터와 출처 카운트 동기화

## 반영 내용
1. `src/lib/step4-detail-consistency.ts`
   - `isKsureCategory` 유틸 추가
   - `detail_state` 기반 섹션 상태 판단 유틸 유지

2. `src/pages/Step4CountryDetail.tsx`
   - `isKsureCategory`를 공통 유틸에서 사용하도록 정리
   - K-SURE 3개 카테고리(`k_sure`, `k_sure_industry`, `k_sure_payment`)만 리스크 본문 행 집계에 반영

3. `supabase/functions/country-detail/index.ts`
   - 인증/규제/리스크 저장 row의 `raw.detail_state`를 명시적으로 저장
     - 성공: `success`
     - 조회 결과 없음: `empty`
     - API 오류: `error`
   - `project_countries.rationale.sources`의 `cert_data`, `regulation_data`를 상세 실행 결과 기준으로 재작성
     - 기존 legacy title(`certification matched`, `import regulation matched`)은 교체
     - 새 title 포맷:
       - `인증 매칭 N건`
       - `인증 매칭 0건 (조회 결과 없음)`
       - `인증 매칭 0건 (API 오류)`
       - `수입규제 매칭 ...` 동일 규칙

## 기대 효과
- Step4 본문과 출처 패널의 인증/규제 건수 불일치 제거
- `데이터 없음`과 `API 오류` 상태를 화면에서 명확히 구분
- K-SURE 리스크 표시 범위를 요구사항 기준으로 고정

## 검증
- 자동 테스트:
  - `npm test`
- 빌드 검증:
  - `pnpm build`
- 수동 확인:
  1. Step4에서 `상세 분석 실행` 전후 인증/규제 CardDescription 카운트 확인
  2. 인증/규제 API 실패 시 본문에 `API 오류` 문구 노출 확인
  3. 결과 없음 시 `조회 결과 없음` 노출 확인
