# Step3 제품 직접뉴스 제품군 판정 개선 (2026-05-03)

## 변경 목적

제품명이 세부 모델명이나 품목명 형태로 들어오는 경우에도, 해당 HS/제품군의 시장, 수요, 수입, 규제, 인증, 판매 뉴스가 `제품 직접뉴스` 후보로 분류되도록 보강했다.

자동차 전용 보정이 아니라 모든 제품에 공통 적용되는 제품 직접성 기준을 추가했다.

## 변경 내용

- AI prompt의 분류 기준을 구조화했다.
  - `direct_product`: `exact_product`, `product_family`, `hs_family`
  - `adjacent_value_chain`: `component`, `material`, `demand_channel`, `distribution_channel`, `regulation_certification`, `logistics_customs`
  - `broad_macro_export_env`: `macro`
  - `unrelated`: `none`
- fallback 분류도 같은 기준을 따른다.
  - 완제품/제품군은 제품군 시장, 수요, 수입, 규제, 인증, 판매 신호가 있으면 `direct_product`로 분류한다.
  - 특정 부품/소재/모듈은 넓은 산업 뉴스만으로 직접뉴스로 승격하지 않고 `adjacent_value_chain`으로 둔다.
  - 타 좁은 산업 뉴스와 순수 거시 뉴스의 기존 분류는 유지한다.
- `rationale.sources` 저장 schema, Supabase 함수명, 프론트 호출 방식은 변경하지 않았다.

## 검증

- `src/test/recommendation-news-relevance.test.ts`
  - 승용자동차, 유모차, 화장품 제품군 뉴스가 `direct_product`로 분류되는지 확인
  - 브레이크 패드, 서보 모터 컨트롤러 같은 특정 부품의 넓은 산업 뉴스가 `adjacent_value_chain`에 남는지 확인
  - 의료기기 등 타 산업 뉴스가 유모차 직접뉴스로 들어가지 않는지 확인
  - 관세, 환율, 물류 뉴스가 `broad_macro_export_env`로 유지되는지 확인
- `src/test/recommend-country-news-edge-bundle.test.ts`
  - AI prompt가 새 basis 체계와 제품군 직접뉴스 기준을 포함하는지 확인

## 배포 메모

변경 대상 Edge Function은 `recommend-country-news`다. 로컬 전체 테스트 통과 후 Supabase에 배포한다.
