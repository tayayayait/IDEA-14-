# Phase 5 - K-SURE 데이터 해석 로직 보정 (2026-04-28)

## 목적
- K-SURE 링크 자체가 아니라, 데이터 해석/표시 로직의 오해를 줄여 공모전 평가 기준에 맞는 근거 표시를 보장한다.

## 변경 파일
- `supabase/functions/country-detail/index.ts`
- `src/pages/Step4CountryDetail.tsx`
- `src/pages/Step6Report.tsx`
- `src/lib/step4-risk-presenter.ts`
- `src/test/step4-risk-presenter.test.ts`

## 핵심 변경
1. K-SURE 업종위험: 국가 전체 상위 업종 노출 제거
- `project_companies.industry_code`를 `country-detail`에서 함께 조회.
- K-SURE 업종위험 데이터는 국가 필터 후, 입력 업종 코드(예: `C281`)와 계층 매핑 코드(`C281`, `C28`, `C2`, `C`)로 2차 필터 적용.
- 업종 매칭 실패 시 임의 상위 업종을 노출하지 않고, 빈 결과 + 실패 사유를 기록.

2. 업종 매핑 실패 명시
- 업종 매칭 실패 시 `project_risks.raw`에 아래 메타를 저장:
  - `industry_match_failed`, `input_industry_code`, `mapped_industry_codes`, `country_item_count`
- Step 4 업종 카드에서 성공 행이 없고 매핑 실패 플래그가 있으면:
  - `입력 업종 매칭 실패 (입력: ..., 매핑: ...)` 문구를 표시.

3. K-SURE 수출결제 global fallback 신뢰도 하향
- 수출결제 scope가 `global`이면 위험 레벨을 보수적으로 `info`로 처리.
- Step 4에서 `전세계 참고자료 (낮은 신뢰도)` 문구를 명시.
- Step 6 리포트 주의사항에서 수출결제 문구를 scope 기준으로 분기:
  - `K-SURE 수출결제(국가별): ...`
  - `K-SURE 수출결제(전세계 참고자료·낮은 신뢰도): ...`

4. 링크 정책 유지
- K-SURE 출처 링크(`data.go.kr` 공개 OpenAPI 상세 페이지)는 변경하지 않음.

## 테스트
- `src/test/step4-risk-presenter.test.ts`
  - country/global 결제 행이 함께 있을 때 country scope를 우선 선택하는지 검증 추가.
