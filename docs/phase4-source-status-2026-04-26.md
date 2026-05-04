# Phase 4 - 출처/조회일/API 상태판 정리 (2026-04-26)

## 목적
- `/data-sources`가 정적 표기가 아니라 실제 `api_call_logs` 최신 호출 이력을 기준으로 상태를 보여주도록 정합성 강화.
- 리포트 출처 표의 상태를 `조회 성공 / 조회 결과 없음 / 미실행 / 오류` 4분류로 통일.
- SafetyKorea는 API 키 미등록(승인 대기) 상태를 오류 결함으로 취급하지 않고, `API 승인 대기`로만 노출.
- 전략물자관리원 404 링크(`https://yestrade.go.kr/openapi`)를 접근 가능한 공개 URL로 교체.

## 구현 내용
1. 공통 상태 해석 유틸 추가
- 파일: `src/lib/source-status.ts` (신규)
- 기능:
  - `resolveSourceStatusView(log, apiKey)`:
    - 상태 칩(`ApiState`) + 4분류 상태 라벨 + 보조 노트(`API 승인 대기`) 반환
  - `isSafetyKoreaApprovalPending(log, apiKey)`:
    - `safetykorea_api_key_missing`를 승인 대기 상태로 판별

2. `/data-sources` 실제 로그 동기화 강화
- 파일: `src/pages/DataSources.tsx`
- 변경:
  - `api_call_logs` 조회 시 `API_REGISTRY` 키로 필터링하고 limit 확장(`2000`)
  - 실패 건수 집계에서 SafetyKorea 승인 대기(`key_missing`)는 제외
  - 상태 표시를 공통 유틸 기반으로 변경:
    - 최근 상태
    - SafetyKorea 승인 대기 노트 표시
    - 오류 코드 칸에서 승인 대기 시 `API 승인 대기` 표시

3. 리포트 출처 표 상태 표준화
- 파일: `src/pages/Step6Report.tsx`
- 변경:
  - 출처 표 렌더링을 `statusLabel/statusNote` 기반으로 변경
  - 상태 4분류:
    - 조회 성공
    - 조회 결과 없음
    - 미실행
    - 오류
  - SafetyKorea `key_missing`는 `미실행 (API 승인 대기)`로 표시
  - 리포트 상단 API 칩 상태도 공통 유틸로 계산하여 승인 대기를 오류로 표시하지 않음

4. 전략물자관리원 링크 404 교체
- 파일: `src/lib/source-url.ts`, `src/lib/api-registry.ts`
- 변경:
  - 공개 URL 상수 추가: `TRADE_SECURITY_PUBLIC_SOURCE_URL = "https://www.yestrade.go.kr/"`
  - API 레지스트리 전략물자관리원 링크를 공개 URL로 변경
  - `toPublicSourceUrl()`에서 기존 `yestrade.../openapi`를 공개 URL로 정규화

5. SafetyKorea 승인 대기 비결함 처리
- 파일: `src/lib/step5-feedback.ts`
  - `deriveStep5State()`에서 SafetyKorea key missing은 실패 상태로 간주하지 않음
  - `describeStep5Run()`에서 승인 대기 칩 상태를 `idle`로 변경
- 파일: `supabase/functions/safety-scan/index.ts`
  - key missing 시:
    - 플래그 심각도 `info`
    - 요약 `SafetyKorea API 승인 대기`
    - 전체 실행 상태는 `partial_success`가 아닌 `success/empty` 경로로 처리
    - API 로그 상태를 `idle`로 기록

6. 프로젝트 목록 칩 정합성
- 파일: `src/pages/Projects.tsx`
- 변경:
  - `api_call_logs` 조회에 `error_code` 포함
  - SafetyKorea key missing을 공통 유틸로 해석해 오류 칩으로 보이지 않게 수정

## 테스트
- `src/test/source-status.test.ts` 신규 추가
- `src/test/source-url.test.ts`에 yestrade URL 정규화 케이스 추가
- `src/test/step5-feedback.test.ts` 승인 대기 비결함 동작으로 기대값 수정
