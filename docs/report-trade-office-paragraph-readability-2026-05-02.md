# Report trade office paragraph readability

Date: 2026-05-02

## Purpose
Step6 리포트의 `실행 연결 경로(무역관)` 섹션에서 무역관 설명이 `...`로 문장 중간에 끊겨 보이는 문제를 정리했다. 리포트 화면과 PDF 캡처 영역 모두 글머리표 목록 대신 국가별 문단형 카드로 표시한다.

## Changes
- `src/lib/report-execution-actions.ts`는 무역관 source의 `office_name`, `office_address`, `airport_route_text`, `summary_source`를 읽어 표시용 문단을 재구성한다.
- 구조화 필드가 없는 legacy summary가 `...`로 끝나면 마지막 완결 문장까지만 표시한다. 완결 문장이 없으면 설명을 숨기고 무역관명과 링크만 남긴다.
- `src/lib/trade-office-summary.ts`와 `supabase/functions/recommend-countries/index.ts`의 무역관 요약은 임의 문자 수 기준 `...` 절단을 쓰지 않는다.
- `src/pages/Step6Report.tsx`의 데스크톱/PDF 및 모바일 무역관 섹션은 무역관명과 설명 문단을 분리해 줄바꿈과 긴 주소를 자연스럽게 처리한다.

## Validation
- `npm test -- src/test/report-execution-actions.test.ts src/test/trade-office-summary.test.ts src/test/recommend-country-news-edge-bundle.test.ts`
- `npm test`

## 2026-05-04 Update
- Step6 리포트의 `실행 연결 경로(무역관)` 섹션을 섹션 단위 Accordion으로 변경했다.
- 최초 리포트 화면에서는 국가별 무역관 상세 카드가 닫힌 상태로 표시된다.
- 사용자가 `상세 보기`를 클릭하면 기존 국가별 무역관 카드와 설명 문단이 펼쳐지고, 열린 상태에서는 `접기`가 표시된다.
- 데스크톱/PDF 캡처 영역과 모바일 영역 모두 `TradeOfficeActionsAccordion`을 사용한다.
- 검증: `npm test -- src/test/report-trade-office-accordion-ui.test.ts`, `npm test`.
