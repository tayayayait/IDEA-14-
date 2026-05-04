# Step3 뉴스 근거 AI 최종 판정 게이트 (2026-05-03)

## 변경 목적

뉴스 후보 수집 범위는 넓게 유지하되, 저장 직전의 제품/수출 관련성 최종 판정을 AI 분류 결과가 결정하도록 변경했다.

## 변경 내용

- `hasDefensibleProductExportFit`에서 deterministic 제품 신호와 타 산업 키워드 veto를 최종 탈락 조건으로 사용하지 않도록 했다.
- 최종 통과 여부는 AI 판정 필드만 기준으로 한다.
  - `direct_product`: AI 제품 관련 점수 기준
  - `adjacent_value_chain`: AI 제품 관련 점수와 구체적 basis 기준
  - `broad_macro_export_env`: AI 수출 영향 점수 기준
  - `unrelated`: 탈락
- 기존 규칙 기반 신호는 후보 생성, 국가 매칭, 카테고리 보조값, 선택 사유 표시에는 계속 사용한다.
- AI 프롬프트에 category와 score가 저장/탈락의 최종 관련성 판단임을 명시했다.

## 유지 범위

- KOTRA 검색 확장 로직은 유지했다.
- `assessNewsRelevance`, `assessCountryNewsMatch`, `classifyNewsCategory` 호출은 유지했다.
- 국가 불일치 후보 제외는 유지했다.
- `rationale.sources` 저장 schema는 변경하지 않았다.

## 검증

- `src/test/recommendation-news-relevance.test.ts`에 AI 최종 판정 회귀 테스트를 추가했다.
  - AI가 `direct_product`로 최종 판정한 후보는 deterministic 산업 veto가 다시 뒤집지 않는다.
  - AI가 `broad_macro_export_env`로 최종 판정한 후보는 recency/rule category가 다시 뒤집지 않는다.
