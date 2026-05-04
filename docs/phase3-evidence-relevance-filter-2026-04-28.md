# Phase 3 구현 기록 (2026-04-28)

## 목적
- 근거 데이터 관련성 필터 재설계
- 해결 대상:
  - 뉴스 국가 불일치
  - 인증/규제 HS 불일치
  - K-SURE 업종 위험 불일치

## 적용 스킬
- `systematic-debugging`
- `data-validation`

## 변경 요약

### 1) 뉴스 근거 승격 규칙 강화
- 파일: `supabase/functions/recommend-countries/index.ts`
- 변경:
  - 제품 뉴스(`search2`)의 국가 매핑은 `natn/regn` 메타데이터 기반 국가코드만 사용.
  - 후보국 근거 승격(`product_evidence`)은
    - 선택 후보국 코드와 메타데이터 국가코드가 일치하고
    - 제품 관련성 점수 조건을 통과한 경우에만 허용.
  - 그 외 뉴스는 `country_background`로만 분리.

### 2) 인증/규제 3중 필터 강제
- 파일:
  - `supabase/functions/recommend-countries/index.ts`
  - `supabase/functions/country-detail/index.ts`
- 변경:
  - 기존 OR 기반(`HS 또는 토큰`)을 제거.
  - 점수 반영 조건을 `HS6/HS4 매칭 AND 제품 토큰 매칭 AND 국가코드 매칭`으로 고정.
  - Step4 상세(인증/규제)에서도 동일 기준으로 필터링되도록 통일.
  - 인증 상세 랭킹의 약한 fallback 선택을 제거하여 무관 항목 노출을 차단.

### 3) K-SURE 업종 매핑 명시 + 불일치 점수 제외
- 파일:
  - `supabase/functions/country-detail/index.ts`
  - `src/lib/step4-detail-consistency.ts`
  - `src/lib/step4-risk-presenter.ts`
  - `src/pages/Step4CountryDetail.tsx`
  - `src/pages/Step6Report.tsx`
- 변경:
  - `C29294` 명시 매핑 테이블 추가:
    - `C29294`, `29294`, `C2929`, `2929`, `C292`, `292`, `C29`, `29`
  - 과도한 광역 매칭(`C` 전체 제조업 와일드카드) 제거.
  - 업종 매칭 실패(`industry_match_failed`)는
    - Step4에서 경고 메시지로 표시
    - Step6에서 업종위험 점수/대표값 산정에서 제외
    - 상세완료 판정 시 미완료 사유로 반영.

## 테스트
- 실행: `npm test`
- 결과: 전체 통과
  - `24 passed`, `116 passed`
- 강화/검증 대상 통과:
  - `recommendation-news-relevance`
  - `step4-detail-consistency`
  - `step4-risk-presenter`
