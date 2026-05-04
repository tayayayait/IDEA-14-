# Step4 인증·규제 생성 및 K-SURE 링크 수정 (2026-04-28)

## 문제
- Step4 국가 상세에서 `상세 분석 실행` 후 KOTRA 인증/규제 상세 항목이 0건 placeholder로 남는 사례가 있었다.
- K-SURE 카드의 `K-SURE 출처` 링크가 실제 조회 화면이 아니라 공공데이터포털 OpenAPI 안내 페이지로 이동했다.

## 원인
- KOTRA 해외인증 검색 시 상세 검색 시도가 최대치에 도달하면 `base_query`가 잘려, 필터 검색이 모두 0건일 때 전체 원문 후보를 확인하지 못했다.
- KOTRA 인증/규제 랭킹이 `HS 신호 + 제품 토큰` 동시 매칭만 성공으로 인정해, HS 또는 국가+HS 근거가 있는 원문도 0건으로 버렸다.
- K-SURE 공개 URL 상수가 `data.go.kr` OpenAPI 안내 페이지를 가리켰다.

## 수정
- `supabase/functions/_shared/kotra-detail-tools.ts`를 추가해 KOTRA 인증 검색 시도 생성과 인증/규제 랭킹을 테스트 가능한 공용 로직으로 분리했다.
- 인증 검색 시 `base_query`를 항상 마지막 시도로 유지하고, base query는 복수 페이지를 조회하도록 조정했다.
- 인증은 국가 필터 후 HS 또는 제품 토큰 신호가 있으면 상세 항목으로 유지한다.
- 규제는 국가 신호와 함께 HS 또는 제품 토큰 신호가 있으면 상세 항목으로 유지한다.
- K-SURE 링크를 K-Sight 상세 화면으로 변경했다.
  - 국가위험: `https://ksight.ksure.or.kr/rsrch/nation/nationView`
  - 업종위험: `https://ksight.ksure.or.kr/risk-index`
  - 수출결제: `https://ksight.ksure.or.kr/analysis/risk-advisor/payment`
- 기존 DB에 저장된 `data.go.kr` OpenAPI 안내 URL도 클라이언트 정규화 단계에서 K-Sight URL로 대체한다.

## 테스트
- `src/test/kotra-detail-tools.test.ts`
  - 인증 검색 시도에서 `base_query` 보존 검증
  - 인증 HS-only 근거 보존 검증
  - 규제 국가+HS 근거 보존 검증
  - 규제 국가-only 오탐 제외 검증
- `src/test/source-url.test.ts`
  - K-SURE API URL 및 기존 OpenAPI 안내 URL의 K-Sight 정규화 검증
