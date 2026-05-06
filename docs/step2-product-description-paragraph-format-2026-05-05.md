# Step2 AI 제품 설명 문단 정리 (2026-05-05)

## 변경
- `제품·HS 코드` 단계에서 `AI 설명 초안 작성`으로 생성된 제품 설명을 즉시 문단 정리된 형태로 표시한다.
- 동일하게 정리된 설명을 `project_products.description` 저장 payload에 사용한다.
- 별도 `문단 정리` 버튼은 제공하지 않는다.
- HS/HSK 후보 검색 및 확정 코드 로직은 변경하지 않았다.

## 검증
- `npm test -- src/test/step2-product-description-draft-persistence.test.tsx`
- 최종 검증은 전체 `npm test`로 확인한다.
