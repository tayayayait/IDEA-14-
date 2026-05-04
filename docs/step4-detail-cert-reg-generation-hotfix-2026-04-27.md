# Step4 상세 인증/규제 생성 누락 핫픽스 (2026-04-27)

## 문제
- 국가 상세(Step4)에서 `필요 인증`, `규제·NTM`이 0건으로 떨어지는 사례가 반복됨.
- 추천 단계(Step3)에서 데이터 신호가 있었는데도 상세 단계에서 결과가 생성되지 않는 불일치가 발생함.

## 원인
1. Step4 제품 연관성 판정이 Step3보다 좁았음.
   - Step4는 제품명(`name`)만 토큰화해 인증/규제 필터를 수행.
   - Step3는 제품명 + 설명(`description`) + 컴포넌트 태그를 함께 사용.
2. Step4 필터가 `제품 신호 필수`로 고정되어 있어, 토큰/HS 매칭이 약한 경우 전체가 0건 처리됨.

## 수정
- 파일: `supabase/functions/country-detail/index.ts`
- 변경 사항:
  - Step4 제품 컨텍스트 조회를 `name, hs_code`에서 `name, hs_code, description, components`로 확장.
  - `parseProductMeta` + 공용 `extractProductTokens`를 사용해 Step3와 동일한 제품 토큰 기준으로 정렬/필터 수행.
  - 인증/규제 strict 매칭 결과가 0건일 때, 국가 매칭 행을 기반으로 제한적 fallback 정렬을 적용해 상세 결과 생성 누락을 방지.
  - 규제 텍스트 매칭 시 `REGL_CN`도 토큰 판정 입력에 포함.

## 기대 효과
- Step3에서 감지된 국가의 인증/규제 신호가 Step4 상세에서도 더 안정적으로 재현됨.
- 완전 무관 데이터 노출을 최소화하면서, `결과 미생성(0건)` 현상을 줄임.
