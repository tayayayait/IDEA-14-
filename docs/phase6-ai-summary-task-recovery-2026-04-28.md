# Phase 6 - AI 요약/7일 과제 생성 복구 (2026-04-28)

## 목적
- `ai-report-summary`, `ai-action-tasks`, `ai-hs-suggest` 실패 시 빈 화면/장시간 로딩을 방지한다.
- AI 공급자 장애 또는 키 누락 상황에서도 규칙 기반 결과를 즉시 제공한다.

## 원인 점검 결과
- Supabase Function URL: 프론트는 `supabase.functions.invoke(...)` 표준 경로를 사용하며 별도 하드코딩 URL 불일치 코드는 확인되지 않음.
- 인증: 3개 함수 모두 `requireAuthenticatedUser(...)`를 사용해 Bearer 토큰 없으면 `401` 반환.
- CORS: 3개 함수 모두 `OPTIONS` 처리 + 공통 `corsHeaders` 사용.
- Timeout: 기존 AI fetch는 함수 내부 timeout 제어가 없어 외부 네트워크 지연 시 응답이 늦어질 수 있었음.
- Env key: `LOVABLE_API_KEY`/`GEMINI_API_KEY` 모두 없을 때 기존에는 예외(500) 중심 동작.

## 변경 파일
- `supabase/functions/ai-report-summary/index.ts`
- `supabase/functions/ai-action-tasks/index.ts`
- `supabase/functions/ai-hs-suggest/index.ts`
- `src/pages/Step2Product.tsx`
- `src/pages/Step4CountryDetail.tsx`
- `src/pages/Step6Report.tsx`

## 구현 내용
1. AI 함수 fallback/진단 응답 추가
- `ai-report-summary`
  - AI 호출 실패 시 `state: "partial_success"`로 규칙 기반 요약/액션 반환.
  - `diagnostics`에 provider, key 존재 여부, auth/cors, timeout 정보를 포함.
  - AI fetch에 `12000ms` timeout 적용.
- `ai-action-tasks`
  - AI 실패 시 국가/인증/규제/리스크 기반 7일 과제 fallback 생성.
  - `state: "partial_success"` + `diagnostics` 반환.
  - AI fetch에 `12000ms` timeout 적용.
- `ai-hs-suggest`
  - 상위 try/catch에서 예외 발생 시 규칙 기반 후보(`rankCandidates`)를 `partial_success`로 반환.
  - AI fetch에 `12000ms` timeout 적용.

2. 프론트 호출 타임아웃/재시도 UX 조정
- Step2 HS 추천, Step4 과제 생성, Step6 요약 생성 호출에 공통 적용:
  - `timeoutMs: 12000`
  - `retryOn429: false` (60초 자동 대기 제거)
  - `retryOn500: true`, `retry500DelayMs: 800`
- 결과가 `partial_success`이면 warning 토스트로 부분 결과임을 명시.

3. 프론트 로컬 fallback 보강
- Step4: 과제 생성 실패 시 즉시 규칙 기반 과제로 대체해 UI 공백 방지.
- Step6: 요약 생성 실패 시 즉시 규칙 기반 summary/actions로 대체 후 화면 반영.

## 기대 효과
- AI 키 누락/공급자 장애/타임아웃 상황에서도 Step4/Step6 핵심 출력이 유지된다.
- 버튼 로딩이 60초 이상 지속되는 케이스를 제거한다.
- 사용자에게 실패 원인과 대체 경로가 명확하게 전달된다.
