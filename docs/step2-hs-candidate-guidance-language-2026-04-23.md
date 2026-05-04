# Step2 HS 후보 선택 기준·언어 출력 정리 (2026-04-23)

## 변경 목적
- 제품명에 복수 품목이 함께 입력될 때 HS·HSK 확정 기준을 화면에서 명확히 안내
- HS 후보 근거/설명이 영어로 노출되는 원인을 제거하고 한국어 출력으로 정렬

## 원인 분석
- `supabase/functions/ai-hs-suggest/index.ts`의 시스템 프롬프트/스키마 문구가 영어 중심으로 작성되어 있었음
- Gemini 응답 언어는 API 기본 고정값이 아니라 프롬프트 지시에 크게 좌우됨
- 따라서 후보 설명(`description`)과 근거(`rationale`)가 영어로 반환될 수 있었음

## 적용 변경
### 1) Step2 화면 가이드 강화
- 파일: `src/pages/Step2Product.tsx`
- 제품명 입력 시 구분자(쉼표, 슬래시, 점 구분자 등) 기반 복수 품목 감지 추가
- 복수 품목 감지 시 “주력 1개 품목 기준으로 확정 코드 선택” 경고 문구 표시
- HS·HSK 후보 카드 상단에 선택 기준 4단계 가이드 추가:
  1. 계약/인보이스 기준 주력 1개 품목 선택
  2. 신뢰도는 보조 지표로 활용
  3. HS 6단위 일치 후 HSK 10단위 구체 일치 확인
  4. 이종 품목은 분리 조회
- 과거에 저장된 영문 후보/근거가 로드되면 Step2 진입 시 자동 재조회해 한국어 결과로 갱신하도록 보강

### 2) AI HS 후보 함수 한국어 출력 고정
- 파일: `supabase/functions/ai-hs-suggest/index.ts`
- 시스템 프롬프트를 한국어 출력 강제 규칙으로 개편
- 복수 품목 입력 시 rationale에 “확정은 주력 1개 품목 기준” 안내를 포함하도록 명시
- 제품명 토큰 분해 정보를 프롬프트에 전달해 혼합 입력 상황을 모델이 인지하도록 보완
- 모델 출력이 영어일 경우를 대비해 **영문 감지 후 한국어 재작성 후처리** 추가
  - 설명/근거 텍스트에서 영문 비중이 높고 한글이 없는 경우 재작성 호출
  - 재작성 시 `hs_code`, `hsk_code`, `confidence`, 후보 순서/개수는 유지
  - 재작성 실패 시 원본 결과로 폴백

## 운영 메모
- 기존 DB에 저장된 과거 영어 `ai_rationale`/후보 설명은 자동 번역되지 않음
- 변경 반영 후 같은 프로젝트에서 `AI에게 HS 후보 받기`를 다시 실행하면 한국어 기준 결과로 갱신됨

## 2026-04-23 추가: HS/HSK 코드 정규화 저장
- 파일: `src/pages/Step2Product.tsx`
- 저장 직전 `hs_code`, `hsk_code`를 `숫자만` 남기도록 정규화(`replace(/\D/g, "")`) 후 검증/저장하도록 변경
- AI 후보에서 `HSK`가 `3920.62.0000`처럼 점(`.`) 포함 형식으로 와도 저장 시 `3920620000`으로 변환됨
- 기존 데이터 로드 시에도 코드 값을 정규화해 입력창/검증 기준을 일치시킴

## 2026-04-24 추가: React duplicate key 경고 수정
- 파일: `src/pages/Step2Product.tsx`
- 원인: 후보 렌더링 key를 `hs_code` 단일 값으로 사용해 동일 HS 코드가 2건 이상일 때 React 경고 발생
- 조치:
  - 후보 리스트를 `hs_code + hsk_code` 조합 기준으로 정규화/중복 제거
  - 중복이 남는 경우 신뢰도(`confidence`)가 더 높은 항목을 유지
  - 모바일 카드/데스크톱 테이블 모두 key를 `hs:hsk` 조합으로 변경
- 효과: `Encountered two children with the same key` 경고 제거 및 리스트 렌더링 안정화

## 2026-04-24 추가: 관세청 공식 코드 기반 후보 생성 전환
- 목적: Step2 HS/HSK 후보에서 AI 임의 코드 생성을 제거하고 공식 코드 기반 후보만 표시

### 1) 공식 카탈로그 생성
- 신규 파일:
  - `scripts/build_hs_catalog.py`
  - `supabase/functions/ai-hs-suggest/hs-catalog.ts` (생성 산출물)
- 입력 데이터:
  - `api가이드 파일(공공데이터)/관세청_HS부호_20260101.xlsx`
  - `api가이드 파일(공공데이터)/관세청_표준품명_20260101.xlsx`
- 생성 결과:
  - 10자리 HSK 코드 기준 카탈로그
  - `hs6`, `ko_name`, `en_name`, `standard_names`, `required_specs`, `detail_notes` 포함

### 2) AI HS 후보 함수 로직 변경
- 파일: `supabase/functions/ai-hs-suggest/index.ts`
- 변경 사항:
  - 1차: 관세청 공식 카탈로그에서 키워드 매칭으로 후보 검색/점수화
  - 2차: AI는 검색된 후보 집합 내부에서만 재정렬/요약 근거 생성
  - AI가 후보 집합 밖 코드를 반환하면 필터링하여 폐기
  - 응답 필드에 `source`, `official_name_ko`, `official_name_en`, `standard_name`, `required_specs`, `match_reason`, `match_score` 추가

### 3) Step2 UI 문구/표현 조정
- 파일: `src/pages/Step2Product.tsx`
- 변경 사항:
  - “AI에게 HS 후보 받기” -> “공식 데이터 기반 후보 검색”
  - `신뢰도` -> `후보 점수`
  - 근거 문구를 “관세청 공식 데이터 + AI 보조 정렬”로 변경
  - 후보 설명이 비어 있으면 공식 품목명 기반 fallback 설명 생성

### 4) 제한 사항
- 본 변경은 “공식 코드 후보 검색”까지 포함
- 법적 확정 코드 결정은 관세평가분류원 사전심사 절차를 대체하지 않음

## 2026-04-24 추가: Phase 1 엔진 정리(범용 매칭 전환)
- 파일:
  - `supabase/functions/ai-hs-suggest/index.ts`
  - `supabase/functions/ai-hs-suggest/token-utils.ts`
  - `src/test/hs-token-utils.test.ts`
- 변경 사항:
  - 특정 품목 하드코딩 토큰 사전(`pkg`, `전기차`, `반도체` 등) 제거
  - 범용 규칙으로 대체:
    - 영문 약어 부분수열 매칭(예: `pkg` -> `package`)  
    - 한글 2-gram 유사도 매칭(예: `전기차`와 `전기자동차`의 공통 문자열 기반)
  - 점수 로직은 여전히 관세청 공식 카탈로그 후보 집합에서만 수행
  - AI는 후보 집합 내부 재정렬/근거 요약만 수행(후보 밖 HSK 폐기)
- 테스트:
  - 토큰 유틸 단위 테스트 추가(한글 유사도/영문 약어 매칭 검증)

## 2026-04-29 추가: 역할 기반 HS 추천 전처리
- 목적: `승용자동차 시트`처럼 사용처와 실제 품목이 함께 입력된 경우 사용처 키워드가 완성차/일반 부품 코드를 과대 추천하는 문제를 줄임
- 파일:
  - `supabase/functions/ai-hs-suggest/candidate-ranking.ts`
  - `supabase/functions/ai-hs-suggest/index.ts`
  - `src/test/hs-role-ranking.test.ts`
- 변경 사항:
  - 입력어를 핵심 품목어, 사용처/산업어, 재질어, 부품 여부로 분리해 점수화
  - 핵심 품목어 매칭을 최우선 점수로 반영하고, 사용처/산업어는 보조 점수로만 반영
  - 핵심 품목어가 있는 입력에서는 핵심 품목이 맞지 않는 후보를 상위 확정 후보로 올리지 않도록 점수 상한 적용
  - 핵심 품목어가 없는 광범위한 사용처+부품 입력은 자동 확정 점수에 도달하지 않도록 확인 필요 범위로 제한
  - 공식 카탈로그 후보 내부 추천과 AI 보조 재정렬 원칙은 유지
- 검증:
  - `승용자동차 시트` 입력에서 `940120` 차량용 의자 계열이 `8703` 완성차/`8708` 일반 자동차 부품 후보보다 우선
  - `반도체 장비 케이스`, `플라스틱 필터 부품`, `자동차 부품` 역할 분리 및 점수 상한 테스트 추가

## 2026-04-24 추가: Phase 2 UX 전환(자동 선택 + 확인 필요)
- 파일:
  - `src/pages/Step2Product.tsx`
- 변경 사항:
  - 후보 검색 완료 시 1순위 후보를 자동 반영
  - 점수 구간 상태 표시:
    - `80~100`: 자동 선택 · 신뢰 높음
    - `60~79`: 자동 선택 · 확인 필요
    - `0~59`: 임시 후보 · 정보 부족
  - 후보를 사용자가 클릭하면 `수동 선택`으로 전환하고 `confirmed=true` 처리
  - HS/HSK 입력창 직접 수정 시 자동 선택 상태를 해제하고 확인 필요 상태로 전환
  - `components` JSON 메타에 선택 상태 저장:
    - `hsSelectionSource`
    - `hsReviewRequired`
    - `hsSelectionScore`
    - `hsSelectionStatus`
    - `hsSelectedCandidateKey`
