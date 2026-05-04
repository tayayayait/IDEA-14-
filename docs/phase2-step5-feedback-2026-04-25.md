# PHASE 2 - Step5 실행 피드백 보강 (2026-04-25)

## 변경 목적
- Step5(전략물자·제품안전)에서 실행 결과를 `성공/실패` 1개 상태로만 보이던 문제를 보강.
- API 호출 실패 시에도 실제 DB 반영 결과가 있으면 화면에 최신 상태를 반영하도록 수정.
- `SafetyKorea API 승인 대기`, `조회 실패`, `조회 결과 없음`, `유사 사례 n건`을 명확히 분리.

## 구현 내용
1. `src/pages/Step5Safety.tsx`
- `api_call_logs` 최신 로그(`trade_security_hsk_strategic`, `safetykorea_recall`)를 함께 조회.
- 최근 실행 시각(`called_at`)과 API별 실행 피드백 카드 추가.
- 상태 분류 표시 추가:
  - 미실행
  - API 승인 대기
  - 조회 실패
  - 조회 결과 없음
  - 실행 완료 / 유사 사례 n건 확인
- `invoke("safety-scan")` 실패 시에도 `load()`를 재실행하고, 최근 로그가 갱신되었으면 `partial_success`로 처리.

2. `src/lib/step5-feedback.ts` (신규)
- Step5 상태 파생 로직 분리:
  - `deriveStep5State`
  - `describeStep5Run`
  - `hasRecentRunEvidence`
- UI 로직과 상태 규칙을 분리해 테스트 가능하게 구조화.

3. `supabase/functions/safety-scan/index.ts`
- 응답 payload 확장:
  - `state`
  - `strategic_status`
  - `safety_status`
  - `scanned_at`
  - `recall_count`
  - `message`
- Step5가 즉시 실행 결과를 해석할 수 있도록 상태 메타데이터 제공.

4. 테스트 추가
- `src/test/step5-feedback.test.ts` 신규:
  - Step5 상태 파생 규칙 검증
  - 승인 대기/조회 결과 없음/유사 사례 n건 라벨 검증
  - 최근 실행 타임스탬프 판별 검증

## 검증 방법
1. Step5에서 `검토 실행` 클릭
2. 우측 근거 패널에서 최근 실행 시각/각 API 상태 문구 확인
3. 본문 실행 피드백 카드 2개 확인:
   - 전략물자 API
   - SafetyKorea API
4. SafetyKorea API 키 미등록 환경에서 `API 승인 대기` 상태 표출 확인

## 영향 범위
- Step5 화면 상태 표시/피드백 UX
- `safety-scan` 응답 포맷(하위 호환 유지: 기존 `state`는 그대로 포함)
