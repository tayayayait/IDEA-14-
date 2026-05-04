# 산단수출 코파일럿 결함 개선 반영 상태

작성일: 2026-04-24  
최종 갱신: 2026-04-25

## 기준 결정

- UI 라우팅은 6단계 구조를 유지한다.
- 기획서의 10개 기능 흐름은 각 단계 화면 안에서 요구사항 번호로 매핑한다.
- 기존 DB 원천 `raw` 데이터는 보존한다.
- 깨진 fallback/summary 문구와 화면 표시 문구만 보수적으로 정리한다.
- SafetyKorea는 실제 조회 MVP 범위에서 리콜·제품안전 유사사례 상태를 분리한다.
- E2E 의존성은 추가하지 않는다. 자동 검증은 Vitest, 브라우저 검증은 수동/도구 기반 체크리스트로 수행한다.

## Supabase 반영 상태

대상 프로젝트: `gnwhjqaxndbkqxecxjkn`

- `npx supabase db push --linked` 실행 완료.
- `npx supabase functions deploy --project-ref gnwhjqaxndbkqxecxjkn` 실행 완료.
- 적용 확인된 migration:
  - `20260422064943`
  - `20260424110000`
  - `20260424113000`
- 배포 확인된 Edge Function:
  - `api-kicox-search`
  - `recommend-countries`
  - `ai-action-tasks`
  - `ai-report-summary`
  - `ai-hs-suggest`
  - `country-detail`
  - `safety-scan`
  - `ai-product-description`

## Phase별 반영 상태

### Phase 1. 문자열/인코딩 정상화

- `country-detail`, `safety-scan`의 깨진 fallback 문구를 정상 한국어로 교체.
- 공통 상태 문구를 `확실한 정보 없음`, `기관 확인 필요`, `조회 결과 없음`, `API 오류` 기준으로 정리.
- Step 3 화면의 기존 영문 UI 및 저장 데이터 표시를 한국어로 정규화.
- `src/App.tsx` Suspense 로딩 문구를 `화면을 불러오는 중...`으로 복구.
- `src/test/mojibake-guard.test.ts`로 주요 깨진 문자열 패턴 잔존 여부를 검증.

### Phase 2. DB 정리 마이그레이션

- `20260424110000_fix_mojibake_fallbacks.sql` 추가.
- `project_certifications`, `project_regulations`, `project_safety_flags`, `project_countries.rationale.summary`의 깨진 fallback 문구만 제한 치환.
- `raw` 원천 응답은 삭제하지 않음.

### Phase 3. 6단계 UI와 10개 요구사항 매핑

- `StepNav`는 6단계를 유지.
- 화면별 요구사항 매핑:
  - Step 1: 요구사항 1
  - Step 2: 요구사항 2
  - Step 3: 요구사항 3
  - Step 4: 요구사항 4~7
  - Step 5: 요구사항 8~9
  - Step 6: 요구사항 10
- 프로젝트 카드에 `단계 n/6`과 `기능 x/10`을 분리 표시.
- Step 4 링크는 최근 선택 국가가 있으면 해당 국가 상세로 이동하고, 없으면 국가 선택 필요 상태를 표시.

### Phase 4. API 상태 표시 정확화

- `api_call_logs`에 `response_count`, `error_code`, `detail` 컬럼 추가.
- API 10종별 고유 key 기준으로 최근 상태, HTTP 상태, 응답 건수, 오류 코드, 실패 횟수를 분리 표시.
- `/data-sources`에서 KOTRA 공통 로그 하나가 4개 API 전체 정상처럼 보이는 alias 문제를 제거.
- 프로젝트 목록과 리포트 상단에 KICOX/SafetyKorea 핵심 상태 칩을 표시.

### Phase 5. 후보국 추천 근거 품질 개선

- 제품 직접 근거와 국가 일반 배경 근거를 분리.
- HS 6자리, HS 4자리, 제품명 토큰, 영문 동의어 토큰 기반 relevance score 추가.
- 자동차 제동장치 기본 토큰: `brake`, `braking system`, `automotive parts`, `vehicle parts`.
- 의료기기, 두피, 코스메슈티컬, AR 안경, 열펌프 등 무관 뉴스는 추천 점수 근거에서 제외.
- 무관 뉴스가 저장 데이터에 남아 있어도 Step 3/Step 4/Step 6 표시 단계에서 필터링.

### Phase 6. 국가 상세 데이터 일관성 수정

- 추천 단계의 인증·규제 감지 수와 상세 본문 상태를 같은 기준으로 표시.
- `데이터 없음`과 `상세 분석 미실행`을 분리.
- 상세 테이블이 비어 있지만 추천 단계에서 match count가 있는 경우 `추천 단계 감지 N건, 상세 분석 미실행`으로 표시.

### Phase 7. 전략물자/SafetyKorea 실제 조회 MVP

- 전략물자 화면에 HS, HSK, 매칭 방식, 기준일, 출처, 적용 방식, 후보 점수를 표시.
- SafetyKorea는 API 키 없음, 조회 실패, 결과 없음 상태를 분리 저장·표시.
- 유사명칭 결과는 법적 확정 판정이 아니라 `유사 사례`로 취급한다.
- 자동 판정 금지 및 기관 확인 필요 문구를 유지한다.

### Phase 8. 리포트/PDF 및 품질 보강

- `React.lazy`와 `Suspense`로 라우트 단위 lazy loading 적용.
- `vite.config.ts`의 `manualChunks`로 React, Router, Supabase, UI, Form, Chart 번들을 분리.
- `jspdf`, `html2canvas`는 PDF 다운로드 시 dynamic import로 로드.
- 모바일 리포트는 A4 고정폭 대신 카드형 열람 레이아웃을 표시.
- PDF 생성 대상 A4 레이아웃은 화면 밖에 유지해 모바일에서도 PDF 생성 대상 구조를 보존.
- AI 요약 미생성 상태에서도 기본 실행 과제 fallback을 표시.

## 브라우저 재검증 결과

검증일: 2026-04-25  
검증 URL: `http://127.0.0.1:8080/`

- 프로젝트 목록:
  - `단계 n/6`, `기능 x/10` 분리 표시 확인.
  - KICOX/SafetyKorea 상태 칩 표시 확인.
- Step 3:
  - 기존 영문 UI 문구 미노출 확인.
  - 기존 저장 데이터의 영문 신호가 한국어로 표시되는 것 확인.
  - 무관 뉴스 미노출 확인.
- Step 4:
  - 인증 2건, 규제 15건 감지 수와 상세 미실행 상태가 분리 표시되는 것 확인.
  - 출처 패널의 영문 match 문구가 한국어로 표시되는 것 확인.
- Step 5:
  - 전략물자 HSK 상세와 기관 확인 필요 문구 표시 확인.
- Step 6:
  - 무관 뉴스 요약 제거 확인.
  - 인증·규제 주의사항이 `추천 단계 감지 N건, 상세 분석 미실행`으로 표시되는 것 확인.
  - AI 요약 미생성 fallback 실행 과제 표시 확인.
  - 모바일 카드형 리포트에서 수평 오버플로우 없음 확인.
- `/data-sources`:
  - API 10종이 독립 행으로 표시되는 것 확인.
  - KICOX는 `대기`, SafetyKorea는 `오류` 상태로 노출 확인.
  - 최근 조회, HTTP, 응답 건수, 오류 코드, 실패 횟수 컬럼 표시 확인.

## 자동 검증

- `npm test`: 11개 파일, 33개 테스트 통과.
- `pnpm build`: 통과.
- 빌드 결과에서 500KB 초과 chunk 경고 없음.

## 남은 작업

1. SafetyKorea 실제 운영 응답 샘플을 확보해 필드 매핑 정확도를 보강한다.
2. 상세 분석 실행 후 인증·규제·K-SURE 행 수와 출처 패널 count가 일치하는 컴포넌트/단위 테스트를 추가한다.
3. PDF 다운로드 실제 파일의 한글 폰트·캔버스 렌더링을 별도 수동 체크한다.
4. `/data-sources`의 API 설명 텍스트는 현재 일부 영어가 남아 있으므로 출시 전 한국어화가 필요하다.
