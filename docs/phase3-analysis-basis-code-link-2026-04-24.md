# Phase 3: 후속 단계/리포트 분석 기준 코드 연동 (2026-04-24)

## 목적
- Step2에서 결정된 HS/HSK와 선택 메타데이터(`auto/manual`, 점수, 상태, 확인 필요)를
  Step3~Step6 및 리포트 생성 문맥까지 일관되게 연결한다.

## 구현 요약

### 1) 공통 파서 추가
- 파일: `src/lib/analysis-code.ts`
- 역할:
  - `project_products`의 `name`, `hs_code`, `hsk_code`, `components`, `confirmed`를 읽어
    분석 기준 코드 객체로 정규화
  - Step2 메타 키 파싱:
    - `hsSelectionSource`
    - `hsSelectionStatus`
    - `hsSelectionScore`
    - `hsReviewRequired`
    - `hsSelectedCandidateKey`
  - 상태 라벨/설명 함수 제공

### 2) Step3/Step4 화면 연결
- 파일:
  - `src/pages/Step3Countries.tsx`
  - `src/pages/Step4CountryDetail.tsx`
- 변경:
  - `project_products` 최신 1건 조회 시 `components`, `confirmed`까지 함께 로드
  - 우측 Evidence 패널에 `분석 기준 코드` 블록 추가
  - 노출 항목:
    - HS / HSK
    - 적용 방식(auto/manual)
    - 후보 점수
    - 상태(신뢰 높음/확인 필요/정보 부족)
    - 확인 필요 경고

### 3) Step5 화면 연결
- 파일: `src/pages/Step5Safety.tsx`
- 변경:
  - 전략물자 검토 상태 카드에 `분석 기준 코드 상태` 항목 추가
  - 전략물자 상세 카드에 아래 항목 추가:
    - 적용 방식
    - 후보 점수
    - 확인 필요 여부

### 4) Step6 리포트 연결
- 파일: `src/pages/Step6Report.tsx`
- 변경:
  - 리포트 번들 `product`에 분석 기준 메타 포함:
    - `hs_selection_source`
    - `hs_selection_status`
    - `hs_selection_score`
    - `hs_review_required`
    - `hs_selected_candidate_key`
  - 리포트 본문에 `분석 기준 코드` 섹션 추가

### 5) AI 요약 문맥 연결
- 파일: `supabase/functions/ai-report-summary/index.ts`
- 변경:
  - 시스템 프롬프트를 정리하고,
  - `hs_review_required=true` 또는 `hs_selection_status!=high_confidence`인 경우
    HS/HSK 검증 필요 문구를 요약에 명시하도록 지시

## 데이터 기준
- 후속 단계의 분석 기준 코드는 모두 `project_products` 최신 행 기준.
- `components` JSON이 없는 구버전 데이터는 기본값(선택 이력 없음/평가 정보 없음)으로 처리.

## 비범위
- HS/HSK 후보 생성 로직 자체(Phase 1) 및 Step2 UX 규칙(Phase 2)은 본 변경에서 재정의하지 않음.
