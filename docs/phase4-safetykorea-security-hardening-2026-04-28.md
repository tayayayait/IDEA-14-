# Phase 4: SafetyKorea 복구 + 보안 하드닝 (2026-04-28)

## 목적
- SafetyKorea TLS/네트워크 실패 시 원문 예외를 그대로 노출하지 않고 표준 에러코드로 일원화한다.
- 화면/리포트/로그에 `serviceKey`, `AuthKey`, `apiKey` 등 민감정보가 노출되지 않도록 차단한다.
- Step4 상세 분석 상태와 Step6 리포트의 미완료/부분완료 판정 규칙을 동일하게 맞춘다.

## 적용 변경

### 1) `supabase/functions/safety-scan/index.ts`
- `SafetyFetchResult`, `SafetyApiResult`에 `errorCode` 필드 추가.
- 실패 코드를 표준화:
  - `safetykorea_timeout`
  - `safetykorea_tls_handshake_failed`
  - `safetykorea_network_error`
  - `safetykorea_invalid_auth_key`
  - `safetykorea_invalid_ip`
  - `safetykorea_invalid_parameter`
  - `safetykorea_provider_internal_error`
  - `safetykorea_request_failed`
- `sanitizeSensitiveText`로 메시지 내 비밀키/쿼리스트링 마스킹.
- URL 정규화(`normalizeHttpUrl`) 시 query/hash 제거.
- `api_call_logs`에는 표준 `error_code`와 마스킹된 `message`만 저장.

### 2) `src/lib/report-text.ts`
- 리포트 공통 정규화 함수에 민감정보 마스킹 적용.
- URL이 포함된 문자열에서도 query/hash 제거.
- `toSafePublicUrl` 유틸 추가.

### 3) `src/pages/Step5Safety.tsx`
- `project_safety_flags` 로드 시 `summary`, `recommended_action`에 `normalizeReportText` 강제 적용.
- UI 렌더 시에도 `normalizeReportText`를 재적용해 레거시 데이터(과거 저장된 원문) 노출 방지.
- `source_url`은 `toSafePublicUrl`로 정규화.

### 4) `src/pages/Step6Report.tsx`
- 출처 URL 생성 시 `toSafePublicUrl` 적용.
- Step4와 동일한 상세 판정 함수(`resolveSectionState`, `pickPlaceholderState`, `getSuccessfulDetailRows`, `isKsureCategory`)를 사용해 리포트 완료 기준 통일.

### 5) `src/lib/step5-feedback.ts`
- API 로그 상세 문구 생성 시 `normalizeReportText` 적용(2차 마스킹).

## 검증
- 단위 테스트: `npm test` 통과 (24 files, 118 tests).
- 타입 검사: `npx tsc --noEmit` 통과.
- UI E2E 확인:
  - Step5에서 `serviceKey=`, `AuthKey=`, `.../search?...` 원문 미노출 확인.
  - Step5/Step6에서 SafetyKorea 오류 문구가 마스킹된 형태(`https://.../search` + `[REDACTED]`)로 표시됨 확인.
  - Step6 출처 링크가 쿼리스트링 없는 URL로 표시됨 확인.

## 운영 조치
- 과거 노출 가능성이 있는 SafetyKorea 키는 폐기 후 재발급/교체 권장.
- 신규 키 반영 위치:
  - Supabase Edge Function Secret (`SAFETYKOREA_API_KEY` 또는 `SAFETYKOREA_AUTH_KEY`)
  - CI/CD 배포 환경 변수
- 배포 후 캐시된 리포트/로그의 과거 노출 문자열 재점검 필요.
