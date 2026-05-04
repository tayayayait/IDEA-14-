# PHASE 3 - 완료율 표시 수정 (2026-04-25)

## 변경 목적
- 프로젝트 카드의 완료율이 `current_step` 고정 매핑(`기능 7/10` 등)으로 계산되던 문제를 수정.
- 단계(`n/6`)와 기능 완료율(`x/10`)을 데이터 근거 기반으로 분리.

## 구현 내용

1. 완료율 계산 로직 분리
- 신규 파일: `src/lib/project-progress.ts`
- 10개 요구사항 기준의 완료 증거(boolean)를 받아:
  - 완료 개수(`completed`)
  - 전체 개수(`total=10`)
  - 완료율 퍼센트(`percent`)
  를 계산.

2. 프로젝트 목록 완료율 산정 기준 보강
- 수정 파일: `src/pages/Projects.tsx`
- 아래 데이터를 프로젝트별로 수집해 완료율 산정:
  - `project_companies`
  - `project_products`
  - `project_countries`
  - `project_certifications`
  - `project_regulations`
  - `project_risks` (`k_sure`, `k_sure_industry`, `k_sure_payment`)
  - `project_safety_flags` (`strategic`, `product_safety`, `recall`)
  - `api_call_logs` (요구사항 관련 API key)
- 특히 Step4 영역(요구사항 4~7)은 API 로그 또는 상세 테이블 존재 여부를 함께 반영.

3. UI 표시 변경
- 프로젝트 카드 텍스트를 다음 형식으로 변경:
  - `단계 n/6 · 완료율 xx% (기능 x/10)`
- 완료율 진행 바(progress bar) 추가.

4. 테스트 추가
- 신규 테스트: `src/test/project-progress.test.ts`
  - 0% / 60% / 100% 계산 검증.

## 검증
- `npm test` 실행 통과.
