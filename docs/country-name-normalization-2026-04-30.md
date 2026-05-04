# 국가명 정규화 기준

## 배경

상세 분석 단계에서 저장 국가명과 외부 API 국가명이 서로 다르게 표현될 수 있다.

- 화면/DB 저장 예: `미합중국(The United States of America)`, `일본(Japan)`
- KOTRA 인증 API 예: `미국`, `일본`
- K-SURE API 예: 한글 국가명 또는 ISO 코드

이 차이 때문에 같은 국가인데도 인증·위험 데이터가 0건으로 판정될 수 있다.

## 변경 기준

- 국가명 별칭은 `supabase/functions/_shared/recommendation.ts`의 `COUNTRY_ALIAS_MAP`과 공유 helper로 통합한다.
- `country-detail` 내부에 별도 `COUNTRY_ALIASES` 상수를 두지 않는다.
- `buildCountryAliases(countryCode, countryName)`은 선택 국가 코드, 저장 국가명, 주요 한글/영문 별칭을 정규화해서 반환한다.
- `isCountryTextMatched(countryCode, countryName, text)`는 API 응답 텍스트가 선택 국가와 같은지 판정한다.
- `country-detail`과 `recommend-countries`는 KOTRA/K-SURE 국가명 매칭 시 같은 helper를 사용한다.

## 오탐 방지

- 한글 짧은 국가명은 단순 부분 문자열로 판정하지 않는다.
- `인도`는 `인도네시아`에 매칭되면 안 된다.
- 긴 별칭을 우선하고, 라틴 alias는 단어 경계가 맞을 때만 통과시킨다.

## 현재 검증 케이스

- `US` + `미합중국(The United States of America)`는 `미국` API row와 매칭된다.
- `JP` + `일본(Japan)`는 `일본` API row와 매칭된다.
- `CN` + `중화인민공화국(The People's Republic of China)`는 `중국` API row와 매칭된다.
- `IN`은 `인도네시아` 텍스트에 매칭되지 않는다.
- `ID`는 `인도네시아` 텍스트에 매칭된다.

## 배포 영향

- Supabase Edge Function `country-detail` 재배포가 필요하다.
- 국가 추천 실행 경로까지 최신화하려면 `recommend-countries`도 재배포한다.
