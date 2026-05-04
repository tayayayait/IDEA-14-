# KC·리콜 조회 배치 변경

## 변경 요약

- 프로젝트 워크플로우의 기존 Step5 `KC인증·리콜정보` 단계를 제거했다.
- 프로젝트 목록 카드에서 `SafetyKorea` 대기/상태 칩을 제거했다.
- 상단 메뉴에 전역 `KC·리콜 조회` 진입점을 추가했다.
- 프로젝트 진행률은 5단계, 8개 기능 요구사항 기준으로 계산한다.

## 라우트

- 새 라우트: `/kc-recall`
- 기존 프로젝트 내부 라우트 `/projects/:id/safety`는 제거 대상 경로이므로 `/projects/:id/countries`로 우회한다.

## 동작 기준

- `KC·리콜 조회`는 프로젝트 저장 데이터와 분리된 참고 조회 기능이다.
- 조회 조건은 제품명, 모델명, 브랜드명, KC 인증번호, 바코드를 받는다.
- 모델명, KC 인증번호, 바코드 없이 제품명만 입력한 결과는 후보로 표시한다.
- 조회 결과는 KC 인증정보, 국내 리콜정보, 국외 리콜정보 탭으로만 제공하며 프로젝트 완료율에 반영하지 않는다.

## 기존 데이터

- 과거 프로젝트에 저장된 `project_safety_flags` 데이터가 있어도 리포트 화면에는 `KC인증 / 리콜정보` 블록을 표시하지 않는다.
- 신규 워크플로우에서는 SafetyKorea 조회가 필수 단계, 완료 조건, 리포트 근거로 쓰이지 않는다.

## Consumer24 리콜 링크

- 국내 리콜 상세 링크는 현행 Consumer24 경로 `https://www.consumer.go.kr/user/ftc/consumer/recallInfo/629/selectRecallInfoInternalDetail.do?recallSn=...`를 사용한다.
- OpenAPI 응답의 출처 필드에 과거 경로 `/consumer/safe/recall/selectRecallDetail.do` 또는 `/consumer/safe/recall/selectRecallList.do`가 들어오면 현행 상세/목록 경로로 보정한다.
