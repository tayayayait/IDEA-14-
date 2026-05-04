# Phase 2 후보 파이프라인 안정화 (2026-04-27)

## 목적
- 후보 정렬, 점수 계산, 자동선택 기준을 단일 정책으로 통일한다.
- 저신뢰(top score < 80) 후보는 자동 반영하지 않고 `확인 필요` 상태를 강제한다.

## 변경 사항
- `src/lib/hs-selection-policy.ts` 신설
  - 공용 규칙:
    - `resolveCandidateScore`
    - `sortCandidatesByScore`
    - `resolveSelectionStatus`
    - `decideAutoSelection`
  - 상수:
    - `HIGH_CONFIDENCE_MIN_SCORE = 80`
    - `REVIEW_REQUIRED_MIN_SCORE = 60`
    - `AUTO_SELECTION_MIN_SCORE = 80`

- `src/pages/Step2Product.tsx`
  - 후보 정렬/자동선택을 공용 정책 모듈로 전환
  - 저신뢰 후보는 자동 선택하지 않고 코드 입력값을 비운 뒤 `review_required` 상태로 전환
  - 후보가 존재하는데 HS/HSK 미선택 상태면 다음 단계 이동 차단
  - 상태 문구 보강:
    - `자동 반영 보류 · 확인 필요`
    - `저신뢰 후보 자동 반영 보류`
  - 중복 후보 병합 시 신뢰도 대신 점수 우선 기준 적용

- `src/lib/analysis-code.ts`
  - 리포트용 상태 판정도 공용 `resolveSelectionStatus` 재사용

## 테스트
- `src/test/hs-selection-policy.test.ts` 신설
  - 정렬 기준 일치 검증
  - 자동선택 임계치(80점) 검증
  - 점수/상태 임계치 결정성 검증

## 기대 효과
- 점수 1순위와 자동선택 정책 불일치 제거
- 저신뢰 자동 반영으로 인한 오분류 확정 위험 감소
- Step2와 Report 해석 기준의 일관성 확보
