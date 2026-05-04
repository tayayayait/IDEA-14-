# Step4 K-SURE 수출결제 국가 기준 보정 (2026-04-29)

## 문제
- Step4 국가 상세의 `수출결제 현황`에 선택 국가 기준 자료가 없을 때 전세계 수출결제 자료가 fallback으로 표시됐다.
- 화면에는 `전세계 참고자료 (국가 단위 아님)`이라고 표기됐지만, 선택 국가 상세 화면의 결제 현황으로 보이기 때문에 오해 소지가 있었다.

## 수정
- `supabase/functions/_shared/ksure-payment.ts`를 추가했다.
- `country-detail`과 `recommend-countries`의 K-SURE 수출결제 조회는 `ctryCd=<선택 국가>` 결과만 사용한다.
- 선택 국가 결과가 없거나 오류가 발생하면 전세계 조회를 추가 호출하지 않는다.
- `src/lib/step4-risk-presenter.ts`에서 기존 DB에 남아 있는 `scope=global` 결제 row도 선택 국가 결제 근거로 선택하지 않도록 했다.
- 선택 국가 결과가 0건이면 `country-detail`은 `k_sure_payment` empty row를 저장하고, 화면은 `정확한 정보 없음` 대신 “국가 단위 수출결제 데이터 없음” 사유를 표시한다.
- `k_sure_payment` empty row에도 `source_url`이 있으므로, 화면은 데이터 없음 사유 아래에 `K-SURE 출처` 링크를 함께 표시한다.
- 2026-04-29 실측 기준 `ctryCd=JP`, `ctryCd=VN`은 `resultCode=3`이며, 무필터 응답은 국가 식별 필드가 없는 전세계 집계로 확인했다.
- 추가 확인 결과 K-Sight 수출결제 UI는 ISO2가 아닌 숫자 국가코드를 사용한다. 예: `MY`는 `151`, `JP`는 `140`.
- `supabase/functions/_shared/ksure-payment.ts`에 K-Sight 수출결제 국가코드 매핑을 추가해 `country-detail`과 `recommend-countries`가 동일하게 사용한다.

## 표시 정책
- 국가별 수출결제 데이터가 있으면 `수출결제 현황`에 표시한다.
- 국가별 수출결제 데이터가 없으면 `정확한 정보 없음` 또는 미조회/0건 상태로 표시한다.
- 전세계 수출결제 자료는 선택 국가의 결제 조건으로 단정하지 않는다.

## 테스트
- `src/test/ksure-payment-scope.test.ts`
  - 선택 국가 결과가 있으면 `scope=country`로 반환.
  - 선택 국가 결과가 없으면 전세계 fallback을 호출하지 않음.
  - 선택 국가 조회 오류 시 전세계 fallback을 호출하지 않음.
- `src/test/step4-risk-presenter.test.ts`
  - `scope=global` 결제 row만 있을 때 선택 국가 결제 근거로 사용하지 않음.
