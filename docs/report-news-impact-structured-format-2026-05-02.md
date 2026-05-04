# 뉴스·이슈 수출전략 영향 3단 형식 개선

## 목적

Step6 리포트의 `뉴스·이슈 수출전략 영향`이 장문 문단으로만 표시되면 국가별 비교와 실행 항목 확인이 어렵다. 저장 필드인 `newsImpactAnalysis` 문자열은 유지하되, Gemini 생성 결과와 화면 표시를 `핵심 판단 / 영향 근거 / 실행 대응` 3단 구조로 고정한다.

## 변경 내용

- Gemini 프롬프트는 `newsImpactAnalysis`를 `핵심 판단: ... 영향 근거: ... 실행 대응: ...` 순서와 문장부호로 작성하도록 지시한다.
- `핵심 판단`은 2문장으로 진입 강도, 우선 채널, 포지셔닝, 초기 투자 수준, 검증 순서를 작성한다.
- `영향 근거`는 3~5문장으로 뉴스 본문에서 확인 가능한 시장 수요, 소비 변화, 정책·규제, 산업 구조, 공급망·물류, 경기·환율·결제 리스크 신호를 구분한다.
- `실행 대응`은 4~6개 구체 조치로 제품 라인업, 가격대, 채널, 마케팅 메시지, 물류, CS, 바이어 신용, 결제조건 중 필요한 항목을 우선순위로 제시한다.
- 뉴스 제목 나열, `관련 뉴스 N건 확인`, 요약 단순 연결은 계속 금지한다.
- Step6 PDF와 모바일 화면은 `newsImpactAnalysis` 문자열을 파싱한 뒤 국가별 아코디언으로 표시한다. 기본 상태에서는 세부 내용을 접고, 사용자가 `세부 내용 펼치기` 버튼을 눌렀을 때 3개 라벨 블록을 표시한다.
- 기존 저장 리포트가 일반 문장만 가진 경우에는 기존처럼 단일 문장으로 표시한다.
- 직접 뉴스가 없을 때는 기존 문구 `대상국 일치 직접 뉴스 근거 없음 — 관련 뉴스 모니터링 필요`를 유지한다.
- Gemini 미생성 상태는 기존 `Gemini 뉴스 본문 분석 미생성` 문구를 유지해 뉴스 부재와 AI 미실행을 구분한다.

## 검증

- `npm test -- src/test/report-text.test.ts src/test/ai-report-summary-news-body.test.ts src/test/report-draft.test.ts` 통과
- `npm test -- src/test/ai-report-summary-news-body.test.ts src/test/report-news-impact-accordion-ui.test.ts` 통과
- `npm test` 통과: 58 files / 353 tests
- `npm run build`는 Vite가 3340개 모듈 변환 후 Windows `node.exe`가 `-1073740791`로 종료했다. 출력에는 기존 Browserslist stale-data 경고만 표시되었다.
- `npx tsc -p tsconfig.app.json --noEmit`은 기존 테스트 타입 오류에서 실패했다. 확인된 위치는 `src/test/kotra-detail-tools.test.ts`의 `__match_priority`/`__matched_tokens`, `src/test/vite-dev-server-config.test.ts`의 AST 타입 불일치다.
