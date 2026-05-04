# Step 3 추천 실행 토스트 상태 수정 (2026-05-02)

## 원인

- `recommend-countries`는 국가별 상세 뉴스와 K-SURE 상세 수집을 Step 4로 미루도록 설계되어 있다.
- 이 정상 지연 플래그(`detailEnrichmentDeferred`)가 Step 3 추천 결과의 `apiPartial` 조건에 포함되어 있었다.
- 그 결과 추천 산출이 정상이어도 `partial_success`가 반환되어 우측 상태와 토스트가 "부분 산출"로 표시됐다.

## 수정

- Step 4 상세 수집 지연은 Step 3 추천 실패/부분 산출 조건에서 제외했다.
- 사용자 토스트 메시지에 표시되던 "Country-level news and K-SURE detail..." 문구를 제거했다.

## 검증

- 추천 실행은 KOTRA/AI 등 실제 입력 데이터 오류가 없으면 `success`로 반환된다.
- 상세 뉴스/K-SURE 수집은 기존처럼 Step 4 국가 상세 화면에서 실행한다.
