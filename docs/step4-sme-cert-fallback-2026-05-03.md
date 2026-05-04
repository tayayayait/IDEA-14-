# Step4 SME 해외규격인증 fallback 처리

## 문제

Step4 국가 상세의 `필요 인증` 영역은 KOTRA 해외인증 결과와 중소벤처기업부 해외규격인증정보를 함께 사용한다. 그러나 중소벤처기업부 데이터는 Gemini가 제품 적합 인증을 추천한 경우에만 `project_certifications`에 저장되었다.

그 결과 공공데이터 `중소벤처기업부_해외규격인증정보_20250704`에 대상국 인증이 존재해도 다음 경우 화면에는 0건으로 표시될 수 있었다.

- Edge Function secret의 `PUBLIC_DATA_API_KEY` 또는 `GEMINI_API_KEY` 누락
- Gemini API 오류
- Gemini가 빈 배열을 반환

또한 국가 필터가 substring 방식이라 `인도` 조회 시 `인도네시아` 인증까지 후보에 포함될 수 있었다.

## 변경

- SME 국가 필터를 정확 일치 기반으로 변경했다.
  - 예: `IN/인도`는 `인도`만 포함하고 `인도네시아`는 제외한다.
- Gemini 추천 결과가 0건이면 국가별 SME 인증 목록을 `sme_country_fallback`으로 저장한다.
- fallback 행은 확정 인증이 아니라 `raw.match_confidence = "review_required"`인 검토 필요 후보로 표시한다.
- fallback 출처는 `source_org = "중소벤처기업부"`로 저장하고, AI 추천 행은 기존처럼 `중소벤처기업부 (AI 분석)`으로 구분한다.

## 검증

- `src/test/sme-cert.test.ts`
  - 인도/인도네시아 국가 필터 분리
  - 국가별 SME 인증 fallback 후보 생성

## 2026-05-03 Insert Type Fix

- 원격 로그에서 `project_certifications.required` 컬럼에 `"확률 높음"`, `"검토 요망"` 문자열을 삽입해 `22P02 invalid input syntax for type boolean` 오류가 발생하는 것이 확인됐다.
- `required`에는 boolean/null만 저장하도록 수정했다.
- 표시용 문구는 `raw.required_label`로 이동했다.
