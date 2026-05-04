# Phase 6 (P2) 예외 처리 표준화

## 목표
- API 호출 예외 처리를 화면별 `try/catch` 분산 방식에서 공통 훅 기반으로 통일
- 상태 코드별 사용자 메시지 표준화
- 재시도 정책(429/500)과 timeout 처리 규칙을 일관 적용

## 구현 파일
- `src/hooks/useApiCall.ts` (신규)
- `src/pages/Step1Company.tsx`
- `src/pages/Step2Product.tsx`
- `src/pages/Step3Countries.tsx`
- `src/pages/Step4CountryDetail.tsx`
- `src/pages/Step5Safety.tsx`
- `src/pages/Step6Report.tsx`

## 공통 훅 정책
1. 상태 코드 분기 메시지
- `401/403`: 권한 확인 안내, 자동 재시도 금지
- `429`: 요청 한도 초과 안내
- `500+`: 제공기관/API 불안정 안내
- `timeout`: 시간 초과 안내 + `partial_success` 상태 반환

2. 재시도 정책
- `429`: 60초 카운트다운 후 1회 자동 재시도
- `500+`: 1초 대기 후 1회 자동 재시도

3. 상태 표준화
- 응답에 `state`가 있으면 그대로 사용 (`success`, `partial_success`, `empty`, `error` 등)
- `partial_score` 플래그는 `partial_success`로 승격
- 메시지는 `message` 또는 `error` 필드 우선 추출

## 화면 적용 결과
- Step1/2/3/4/5/6의 Edge Function 호출이 `useApiCall().invoke()`로 통합됨
- 429 자동 재시도 중에는 각 화면에 남은 대기초 표시
- timeout 시 `ApiStateChip`에 부분산출 상태가 반영되도록 연결

## 검증
- 빌드: `pnpm build` 통과
- 테스트: `npm test` 통과
