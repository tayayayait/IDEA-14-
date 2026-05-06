# Step3 뉴스 근거 보존 정책 (2026-05-05)

## 문제

상위 3개국 뉴스 근거가 한 번 생성된 뒤에도 다음 경로에서 사라질 수 있었다.

- Step3 재분석(`recommend-countries`)이 `project_countries`를 삭제 후 재삽입하면서 기존 `rationale.sources`의 뉴스 근거를 보존하지 않음.
- Step3 화면 로드 후 관세청 12개월 수출액 갱신이 오래된 `row.rationale`를 기준으로 저장되어, 병행 저장된 뉴스 근거를 덮을 수 있음.
- 뉴스 근거 재생성(`recommend-country-news`)이 신규 결과가 없거나 줄어든 경우 기존 뉴스 근거를 제거함.

## 변경

- `recommend-countries`는 삭제/재삽입 전에 기존 `project_countries.rationale.sources`에서 `product_evidence`, `country_background`, `news` 타입의 실제 뉴스 근거를 국가별로 추출하고, 새 추천 근거에 병합한다.
- `recommend-country-news`는 새 뉴스 근거를 기존 뉴스 근거 앞에 병합하고 중복 제거한다. 신규 결과가 비어 있어도 기존 뉴스 근거는 유지된다.
- Step3 관세청 수출액 저장은 업데이트 직전 DB의 최신 `rationale`와 `updated_at`을 다시 조회한 뒤 `customs_export_12m` 근거만 교체한다.
- 관세청 수출액 저장 중 다른 writer가 `rationale`를 먼저 갱신하면 `updated_at` 조건 불일치로 감지하고 최신 `rationale`를 재조회해 병합을 재시도한다.

## 검증

- `npm test -- src/test/recommend-country-news-edge-bundle.test.ts src/test/recommend-countries-edge-budget.test.ts src/test/step3-news-enrichment-ui.test.ts`
