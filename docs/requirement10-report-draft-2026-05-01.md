# 요구사항 10 리포트 고도화

## 변경 목적

리포트 단계를 기존 `AI 요약 + 7일 과제`에서 `공공데이터 기반 수출 실행전략 리포트`로 확장했다.

## 구현 내용

- `ReportEvidenceBundle`로 1~5단계 데이터를 리포트 AI 입력 구조로 정리한다.
- `ReportDraft`로 AI 출력 구조를 고정한다.
- AI 결과에 다음 항목을 포함한다.
  - 종합 결론
  - Top 1 국가 추천 근거
  - Top 3 국가별 진입전략
  - 국가별 필수 확인사항
  - 7일 / 30일 / 90일 실행계획
  - 미확인 항목
  - 최종 주의문구
- `ai-report-summary` Edge Function은 신규 draft 구조와 기존 `summary/actions` 호환 필드를 함께 반환한다.
- AI 호출 실패 시에도 같은 `ReportDraft` 구조의 규칙 기반 fallback을 제공한다.
- 화면/PDF 리포트에 국가별 진입전략과 실행계획을 추가한다.

## 2026-05-01 추가 보완

- `countryStrategies`를 원문 요약 재출력 구조에서 실행전략 구조로 변경했다.
  - `position`: 국가의 추천 순위/점수/검토 포지션
  - `entryMode`: HS/HSK, 인증, 수입규제, 결제위험 확인 후 진입 방식
  - `requiredChecks`: 국가별 필수 확인사항
  - `riskResponse`: 결제·규제 리스크 대응
  - `evidenceLimits`: 근거 한계와 단정 금지 항목
  - `evidenceRefs`: 대상국 일치 직접 근거 제목
- 대상국이 다른 뉴스나 `직접 근거 없음` placeholder는 국가별 진입전략 본문에서 제외한다.
  - 예: 미국 전략에 베네수엘라 뉴스, 폴란드 전략에 덴마크 뉴스를 직접 근거처럼 쓰지 않는다.
- 인증명은 제품 적합성이 확인되기 전까지 최종 요구사항처럼 표시하지 않는다.
  - 예: `FDA Medical Device` 같은 매칭은 `인증 근거 N건 원문 적합성 확인 필요`로 낮춰 표시한다.
- 출처 표의 성공 행은 실제 오류가 없으면 오류 컬럼에 `-`를 표시한다.
- `ai-report-summary`의 리포트 생성 모델 기본값을 `gemini-3.1-pro-preview`로 변경했다.
  - 직접 Gemini 호출은 `GEMINI_REPORT_MODEL` 환경변수로만 덮어쓸 수 있다.
  - Lovable Gateway 경로도 `google/gemini-3.1-pro-preview`를 요청한다.

## 2026-05-02 표시 범위 조정

- Step 6 리포트 화면과 PDF 출력 영역에서 `미확인 항목` 및 `출처 표` 블록을 표시하지 않는다.
- `ReportDraft.unresolvedItems`와 API 로그 데이터는 내부 판단 및 주의문구 생성용으로 유지한다.

## 2026-05-02 국가별 유의사항 분석 카드

- `ReportDraft`에 국가별 유의사항 전용 필드를 추가했다.
  - `countryCautionAnalysisStatus`: `generated` 또는 `not_generated`
  - `countryCautionAnalyses`: 국가별 `coreSummary`와 5개 고정 섹션(`인증`, `규제`, `K-SURE 국가위험`, `K-SURE 업종위험`, `K-SURE 수출결제`)
- Step 6 화면과 PDF의 `국가별 유의사항`은 기존 API summary 문자열 나열을 사용하지 않는다.
- 국가는 하나의 통합 카드로 표시하며, 카드 상단에 `핵심 요약`을 두고 하단에서 `인증·규제 확인`, `K-SURE 위험·결제 조건` 흐름으로 묶어 읽게 한다.
- 5개 고정 섹션 데이터는 내부 구조와 순서를 유지하되, 화면에서는 섹션별 독립 박스로 분리하지 않고 문단형 해석과 간결한 fact 항목으로 표시한다.
- `Grade`, `Risk Index`, `Late rate`, `Avg payment period`, `Avg late period`, `Top term` 등 주요 수치는 카드 내부에서 강조 표시하되 `Country: ... | Grade: ...` 같은 원문 pipe 문자열은 노출하지 않는다.
- Gemini가 유효한 `countryCautionAnalyses`를 생성한 경우에만 분석형 카드를 표시한다.
- Gemini 실패, 미생성, 또는 필수 섹션 누락 시에는 국가명과 `AI 국가별 유의사항 분석 미생성` 상태만 표시한다.
- Gemini가 `countryCautionAnalysisStatus`를 누락하더라도 유효한 5개 섹션 분석이 있으면 `generated`로 정규화한다.
- 섹션 `kind`는 `certification` 등 영문 enum을 우선하되, `인증`, `규제`, `K-SURE 국가위험`, `K-SURE 업종위험`, `K-SURE 수출결제` 제목도 같은 섹션으로 인정한다.
- K-SURE 원천 수치(`Grade`, `Risk Index`, `Late rate`, `Avg payment period`, `Avg late period`, `Top term`)는 `ReportEvidenceBundle.risks.raw`와 `level/sourceOrg`로 AI 입력에 유지한다.
- 데이터가 없는 경우 `위험 없음`으로 해석하지 않고 `확인 가능한 데이터가 부족하므로 추가 검증 필요` 문구를 사용하도록 Gemini 프롬프트와 정규화 정책을 고정했다.

## 제한 사항

- Tavily, Exa, UN Comtrade, World Bank, Trade.gov CSL, OpenSanctions 등 외부 API는 이번 범위에 추가하지 않았다.
- PDF 생성 방식은 기존 `html2canvas + jsPDF`를 유지했다.
- 전략물자·인증·규제는 최종 판정으로 표현하지 않고 기관 원문 확인이 필요한 참고 정보로 표시한다.
- 화면 상세 리포트와 1페이지 PDF 요약의 완전 분리는 후속 작업이다.

## 검증 기준

- `ReportDraft`가 부분 AI 응답과 기존 `summary/actions` 응답을 모두 수용한다.
- 인증/규제/결제위험 등 근거 부족 항목은 `미확인 항목`에 남긴다.
- 실행계획은 7일, 30일, 90일로 분리한다.
- 최종 주의문구에는 최종 판정이 아님을 명시한다.
- 대상국 불일치 뉴스가 국가별 진입전략에 들어가지 않는다.
- 인증 매칭명이 제품 적합성 확인 전 최종 요구사항처럼 노출되지 않는다.
- 국가별 유의사항은 Gemini 생성 분석 카드만 표시하고, 실패 시 원천 API 문자열 목록으로 fallback하지 않는다.

## 검증 결과

- `npm test -- src/test/report-draft.test.ts`: 통과
- `npm test`: 통과, 50개 테스트 파일 / 275개 테스트
- `npm run build`: Vite가 3335개 모듈 변환 후 명시적 오류 메시지 없이 종료 코드 1로 종료. 이전 Windows/Vite 빌드 종료 문제와 동일 양상으로 보이며, 이번 변경에 대한 구체적 타입 오류는 출력되지 않았다.
