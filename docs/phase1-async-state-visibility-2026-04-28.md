# Phase 1 - 비동기 실행/상태 가시성 안정화 (2026-04-28)

## 목표
- 추천/상세분석/안전검토의 상태 모델을 `idle | running | partial_success | success | error | stale`로 통일.
- 장시간 실행 시 사용자에게 진행상태/지연 상태를 명시.
- 사이드바 단계 완료 표시와 프로젝트 완료율 계산의 근거 규칙을 동일화.

## 적용 내용
- 공통 상태 유틸 추가:
  - `src/lib/execution-state.ts`
  - `loading -> running`, `empty -> partial_success` 정규화 규칙 추가.
- 장시간 실행 경과 타이머 훅 추가:
  - `src/hooks/useRunningProgress.ts`
  - 실행 중 경과초와 지연(45초+) 메시지 표시에 사용.
- 상태 칩 확장:
  - `src/components/ApiStateChip.tsx`에 `running` 상태 추가.
- API 호출 상태 정규화 강화:
  - `src/hooks/useApiCall.ts`
  - timeout 응답을 `stale`로 반환하도록 조정.
- 소스 상태 해석 통일:
  - `src/lib/source-status.ts`
  - `empty` 로그를 `partial_success`로 해석하고, `running`/`stale` 표시 보강.
- Step3/Step4/Step5 실행 UX 개선:
  - `src/pages/Step3Countries.tsx`
  - `src/pages/Step4CountryDetail.tsx`
  - `src/pages/Step5Safety.tsx`
  - 실행 중 단계형 메시지, 지연 경고, 상태칩 일관화.
- 단계 완료 규칙 공유:
  - `src/lib/project-progress.ts`에 `resolveProjectStepCompletion` 추가.
  - `PROJECT_PROGRESS_API_KEYS` 상수 공통화.
- StepNav 완료 표시를 실제 완료 근거로 연결:
  - `src/components/AppShell.tsx`에서 프로젝트 단건 근거 데이터를 조회해 단계 완료 계산.
  - `src/components/StepNav.tsx`에서 `stepCompletion` 기반 체크 아이콘 표시.
- 추천 함수 응답/로그 상태 정규화:
  - `supabase/functions/recommend-countries/index.ts`
  - `empty` 로그를 `partial_success`로 통일하고 응답 메시지에 소요시간/부분산출 안내 추가.

## 테스트 보강
- `src/test/source-status.test.ts`
  - `empty -> partial_success` 매핑 검증.
  - `running` 상태 라벨/칩 상태 검증.
- `src/test/project-progress.test.ts`
  - 단계 완료 매핑(`resolveProjectStepCompletion`) 검증.
- `src/test/step3-ui-state.test.ts` 신규
  - Step3 실행 중 경과 메시지 단계 검증.
  - legacy 상태 정규화(`loading/empty`) 검증.

