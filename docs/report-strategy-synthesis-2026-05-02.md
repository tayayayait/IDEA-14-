# AI Export Strategy Report Synthesis

Date: 2026-05-02

## Purpose
최종 리포트는 API 조회 결과 목록이 아니라, 수집된 근거를 AI와 로컬 fallback 로직이 재해석한 수출 전략 리포트로 제공한다. 리포트는 최종 법적·상업적 판정이 아니라 의사결정 참고자료이며, 근거가 부족한 항목은 `확실한 정보 없음` 또는 기관 확인 필요로 표시해야 한다.

## Data Flow Changes
- Step3 후보국의 최근 12개월 HS/HSK 기준 수출액을 `project_countries.rationale.sources[]`에 `type="customs_export_12m"` 근거로 저장한다.
- `ReportEvidenceBundle.topCountries[]`는 `customsExport12mUsd`, `customsExportStatus`를 포함한다.
- `buildReportEvidenceHash`는 리포트 생성 근거를 stable JSON으로 정규화해 저장 리포트 재사용 여부를 판단한다.
- `project_reports`는 프로젝트별 최신 AI 리포트 초안, evidence hash, 생성 상태, 생성 시각을 저장한다.

## Report Composition
Step6 화면과 PDF는 다음 순서를 우선한다.
- 의사결정 요약
- 국가별 수출 가능성 비교
- 국가별 진입 전략
- 인증·규제·제품안전·K-SURE 체크리스트
- 7일/30일/90일 실행 계획
- 근거·출처 부록

## Guardrails
- AI 프롬프트와 fallback은 인증명, 규제명, 국가 리스크를 근거 없이 생성하지 않는다.
- 제품안전·전략물자 조회 불가 또는 후보 부족은 리스크 확정이 아니라 확인 필요 상태로 취급한다.
- 저장된 리포트의 evidence hash가 현재 evidence hash와 다르면 화면에서 재생성 필요 상태로 표시하고, 최신 근거 기반 fallback을 사용한다.

## Validation
- Targeted tests passed:
  - `npm test -- src/test/customs-export-evidence.test.ts src/test/report-draft.test.ts src/test/report-persistence.test.ts`
  - `npm test -- src/test/customs-export-evidence.test.ts src/test/report-draft.test.ts src/test/report-persistence.test.ts src/test/world-map-customs-display.test.ts`
- Full test and build status are recorded in the implementation handoff/final report for this change.
