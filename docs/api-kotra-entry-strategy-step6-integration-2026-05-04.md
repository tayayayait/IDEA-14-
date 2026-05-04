# KOTRA 진출전략 API Step6 참고 링크 연동

## 목적

`대한무역투자진흥공사_진출전략` API는 후보국 추천, 국가 평가, 시장 기회, 위험요인, 진입전략 생성에 사용하지 않는다. Step6 리포트에서는 사용자가 KOTRA 원문 PDF를 직접 확인할 수 있도록 참고 링크 메타데이터만 제공한다.

## 호출 정보

- Endpoint: `https://apis.data.go.kr/B410001/entryStrategy/entryStrategy`
- Method: `GET`
- 인증키 우선순위: `KOTRA_API_KEY` -> `PUBLIC_DATA_API_KEY` -> `KICOX_API_KEY`
- 요청 변수:
  - `serviceKey`: 공공데이터포털 인증키
  - `type`: `json`
  - `pageNo`: `1`
  - `numOfRows`: `3`
  - `search1`: 국가 검색어
- 국가 검색어 변환:
  - `US` -> `미국`
  - `VN` -> `베트남`
  - `CN` -> `중국`
  - 미등록 국가는 한글 국가명에서 핵심 국가명을 추출한다.

## 사용하는 응답 항목

- `response.header.resultCode`: 정상 여부 확인
- `response.header.resultMsg`: 오류 메시지 확인
- `response.body.totalCnt`: 조회 건수 확인
- `response.body.itemList.item[].newsTitl`: 진출전략 제목
- `response.body.itemList.item[].othbcDt`: 공개일
- `response.body.itemList.item[].ovrofInfo`: 담당 무역관
- `response.body.itemList.item[].kotraNewsUrl`: KOTRA 원문 URL. 저장은 가능하지만 Step6 화면에서는 별도 링크로 표시하지 않는다.
- `response.body.itemList.item[].realAtfileInfoList.realAtfileInfo.realAtfileName`: 첨부 PDF 파일명
- `response.body.itemList.item[].realAtfileInfoList.realAtfileInfo.realAtfileUrl`: 첨부 PDF URL. Step6 화면의 유일한 클릭 링크로 사용한다.

## 호출 검증 결과

2026-05-04 기준 공공데이터포털 API 호출 검증 결과:

- 미국: `resultCode=00`, `totalCnt=11`, 최신 선택 항목 `2026 미국 진출전략`, 게시일자 `2025-12-22`, 무역관 `워싱턴DC무역관`
- 베트남: `resultCode=00`, `totalCnt=13`, 최신 선택 항목 `2026 베트남 진출전략`, 게시일자 `2025-12-22`, 무역관 `하노이무역관`
- 중국: `resultCode=00`, `totalCnt=13`, 최신 선택 항목 `2026 중국 진출전략`, 게시일자 `2025-12-05`

## 리포트 반영 정책

- 최신 항목 선택 기준: `othbcDt` 내림차순, 제목에 `진출전략`이 포함된 항목 우선.
- `newsBdt`는 목차 수준 데이터이므로 리포트 요약 근거, 국가별 유의사항, 시장 기회, 진입전략 생성에 사용하지 않는다.
- 첨부 PDF 본문 파싱은 이번 범위에서 제외한다. 향후 별도 기능으로 구현한다.
- `project_reports.draft.countryStrategies[].kotraEntryStrategy`에는 링크 표시용 메타데이터만 저장한다.
- Step6 화면에서는 제목, 공개일, 담당 무역관을 텍스트로 표시하고, 클릭 가능한 링크는 첨부 PDF 파일명 1개만 표시한다.
- PDF 파일명 링크는 `realAtfileUrl`을 사용하며 새 탭에서 열린다.
- `realAtfileUrl`에 `&amp;` 같은 HTML 엔티티가 포함된 경우 실제 다운로드 파라미터가 깨지지 않도록 링크 생성 전에 디코딩한다.
- `kotraNewsUrl`은 별도 `KOTRA 원문` 링크로 표시하지 않는다.

## 제외 범위

- 후보국 Top 3 추천 점수에 반영하지 않는다.
- AI 리포트 생성 입력에 진출전략 API 결과를 넣지 않는다.
- KOTRA 진출전략 API 결과로 기회요인, 위험요인, 진입전략, 실행 로드맵을 생성하지 않는다.
- DB 마이그레이션이나 별도 테이블은 추가하지 않는다.
