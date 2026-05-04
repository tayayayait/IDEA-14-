# Recommendation Direct Risk Linkage (2026-04-28)

## 목적
- 후보국 추천 TOP3의 `payment_score`와 `safety_score`가 추정치에만 의존하지 않도록 K-SURE, SafetyKorea, 전략물자 HSK 근거를 직접 반영한다.

## 연결 API
- K-SURE 국별신용등급: `https://apis.data.go.kr/B552696/countrygrade/credit-grade`
- K-SURE 국가별 업종별 위험지수: `https://apis.data.go.kr/B552696/ksight/riskindex`
- K-SURE 수출결제정보: `https://apis.data.go.kr/B552696/exportPayment/getPaymentInfo`
- SafetyKorea KC 인증: `http://www.safetykorea.kr/openapi/api/cert/certificationList.json`
- SafetyKorea 국내/국외 리콜:
  - `http://www.safetykorea.kr/openapi/api/recall/recallList.json`
  - `http://www.safetykorea.kr/openapi/api/recall/fRecallList.json`
- 전략물자 HSK 연계표: `api가이드 파일(공공데이터)/전략물자관리원_HSK 연계표 정보_20181126.csv`에서 생성된 `supabase/functions/safety-scan/strategic-hsk-map.ts`

## 점수 반영
- `payment_score`는 K-SURE 직접 근거가 있으면 휴리스틱 결제 점수보다 우선한다.
  - 국별신용등급, 업종별 위험지수, 수출결제 지연율/지연기간을 `info/caution/high`로 정규화한다.
  - 국가별 수출결제정보가 없으면 전역 집계를 선택 국가 결제 근거로 사용하지 않는다.
- `safety_score`는 SafetyKorea 및 전략물자 근거가 있으면 휴리스틱 안전 점수보다 우선한다.
  - HSK 정확 매칭은 안전 점수를 더 강하게 차감한다.
  - HS6 prefix 후보 매칭은 후보 리스크로 낮은 강도의 차감을 적용한다.
  - 리콜 건수는 인증 건수보다 강한 차감 요인으로 본다.

## 코드 변경
- `supabase/functions/recommend-countries/index.ts`
  - 추천 후보국 루프에서 K-SURE 3종 API를 국가별로 호출한다.
  - 제품명, 모델명, 태그 기준으로 SafetyKorea KC/리콜 정보를 조회한다.
  - HS/HSK 코드 기준으로 전략물자 HSK 연계표를 조회한다.
  - 산출 근거를 `rationale.sources`와 `api_call_logs`에 기록한다.
- `supabase/functions/_shared/recommendation.ts`
  - `scoreKsurePaymentEvidence`
  - `scoreSafetyControlEvidence`
  - 직접 근거 점수 우선 적용 옵션을 `fallbackScoreParts`에 추가했다.
- `src/test/recommendation-target-market.test.ts`
  - K-SURE 직접 점수가 결제 휴리스틱보다 우선되는지 검증한다.
  - SafetyKorea/전략물자 직접 점수가 안전 휴리스틱보다 우선되는지 검증한다.

## 환경 변수
- K-SURE: `KSURE_API_KEY` 또는 `DATA_GO_KR_API_KEY` 또는 `PUBLIC_DATA_API_KEY`
- SafetyKorea: `SAFETYKOREA_API_KEY` 또는 `SAFETYKOREA_AUTH_KEY`

## 검증
- 대상 테스트: `npm test -- src/test/recommendation-target-market.test.ts`
- 전체 테스트: `npm test`
- 결과: 24개 테스트 파일, 121개 테스트 통과
