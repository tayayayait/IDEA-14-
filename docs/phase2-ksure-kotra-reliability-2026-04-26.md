# Phase 2 - K-SURE·KOTRA 근거 신뢰성 보강 (2026-04-26)

## 변경 목적
- Step 4/리포트에서 K-SURE 핵심 3개 결과(국가위험, 업종위험, 수출결제)가 누락되거나 약하게 보이던 문제를 보강.
- K-SURE 출처 링크가 401 가능성이 있는 API 호출 URL로 노출되던 문제를 공개 데이터포털 URL로 교체.
- 추천 국가 점수 계산에서 무관 뉴스가 간접적으로 반영될 수 있던 경로를 차단.
- 제품 직접 근거와 시장 배경 근거를 데이터 단계에서 분리 유지.

## 구현 내용
1. K-SURE 공개 출처 링크 매핑 추가
- `src/lib/source-url.ts`
  - `KSURE_PUBLIC_SOURCE_URLS` 추가:
    - 국별신용등급: `https://www.data.go.kr/data/15140201/openapi.do`
    - 국가별 업종별 위험지수: `https://www.data.go.kr/data/15132755/openapi.do`
    - 수출결제정보: `https://www.data.go.kr/data/15144259/openapi.do`
  - `toPublicSourceUrl`에 K-SURE API URL -> 공개 URL 변환 규칙 추가.

2. API 레지스트리 출처 URL 보강
- `src/lib/api-registry.ts`
  - `ksure_country_risk`, `ksure_industry_risk`, `ksure_export_payment`에 `sourceUrl` 지정.
  - 리포트 출처표에서 K-SURE가 API 엔드포인트 대신 공개 URL을 가리키도록 보정.

3. Step 4 K-SURE 표시 보강
- `src/pages/Step4CountryDetail.tsx`
  - `sanitizeRiskRow`에서도 `toPublicSourceUrl` 적용.
  - K-SURE 3개 카드(국가위험/업종위험/수출결제)에 각각 출처 링크 노출 추가.

4. country-detail Edge Function의 출처/근거 정규화 보강
- `supabase/functions/country-detail/index.ts`
  - K-SURE 리스크 row의 `source_url`을 API URL 대신 공개 데이터포털 URL로 저장.
  - 국가 `rationale.sources`에 K-SURE 3개 근거를 명시적으로 추가:
    - `ksure_country_risk`
    - `ksure_industry_risk`
    - `ksure_export_payment`
  - 기존 K-SURE 근거 중복 항목 제거 로직 추가.
  - `normalizeSourceUrl`에도 K-SURE API URL -> 공개 URL 정규화 추가.

5. 리포트 K-SURE 항목 분리 표시
- `src/pages/Step6Report.tsx`
  - 국가별 주의사항 생성 로직을 단일 `결제·리스크`에서 3개 항목으로 분리:
    - `K-SURE 국가위험`
    - `K-SURE 업종위험`
    - `K-SURE 수출결제`
  - 업종위험은 위험도(high > caution > info > unavailable) 우선으로 대표 항목 선택.

6. KOTRA 뉴스 필터/점수 반영 경로 보강
- `supabase/functions/_shared/recommendation.ts`
  - `isCountryMentionedInText` 유틸 추가(국가 별칭 기반 연관성 판별).
- `supabase/functions/recommend-countries/index.ts`
  - 제품 뉴스 국가 판별 입력을 확대(제목/요약/키워드/본문/국가/권역).
  - 후보국별 `countryNews`는 국가 연관성이 확인된 건만 배경 근거로 유지.
  - 점수용 뉴스(`apiMarketScore`의 `hasNews/newsCount`)는 `productNewsItems`(제품 직접 근거)만 사용.
  - AI 점수 입력(`top_news_titles`)도 `productNewsItems` 기준으로 제한.
  - 결과적으로 배경 뉴스(`country_background`)는 표시 전용이고 점수 경로에서 제외.

## 테스트 보강
- `src/test/source-url.test.ts`
  - K-SURE API URL 3종의 공개 URL 매핑 테스트 추가.
- `src/test/recommendation-news-relevance.test.ts`
  - 국가 연관성 판별(`isCountryMentionedInText`) 테스트 추가.
