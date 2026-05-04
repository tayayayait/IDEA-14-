# Phase 3 - HS/HSK 후보 추천 품질 수정 (2026-04-26)

## 변경 목적
- 차량 부품 검색 시 무관 후보(예: 식품류)가 상위에 섞이는 문제를 점수 로직에서 차단.
- 후보 점수와 자동 선택 기준을 동일한 규칙(점수 우선)으로 통일.
- 복수 품목 입력 시 `품목 분리 필요` 상태를 강하게 노출.
- 확정 체크 없이 진행 가능한 정책에서는 문구를 `확인 필요 상태로 진행`으로 명확화.
- 확정 체크 필수 정책으로 전환할 경우 Step 3 차단 동작을 동일 기준으로 적용할 수 있도록 공통 정책값 추가.

## 구현 내용
1. HS 후보 점수 로직 정제 (`supabase/functions/ai-hs-suggest/index.ts`)
- 불용어 토큰 제거:
  - 영어 불용어/한국어 불용어 필터 추가.
- 유효 신호 게이트 추가:
  - 의미 있는 매칭 신호가 없는 row는 점수를 0으로 처리해 후보에서 제외.
  - 행별 기본 가산점(세부 row, 표준품명, 요구 스펙)만으로는 후보에 포함되지 않도록 변경.
- 결과 정렬 통일:
  - 최종 후보를 `match_score` 내림차순으로 정렬 후 반환.

2. 후보 점수와 자동 선택 기준 일치화 (`src/pages/Step2Product.tsx`)
- 자동 선택 시 `배열 1번`이 아니라 `후보 점수 최상위`를 선택.
- 후보 리스트도 점수 기준 정렬(내림차순)로 렌더링.
- 후보 안내 문구를 `후보 점수 1순위 자동 반영`으로 변경.

3. 복수 품목 경고 강화 (`src/pages/Step2Product.tsx`)
- 제품명에서 복수 품목 감지 시 경고를 강조 박스로 변경.
- 상태 라벨을 `품목 분리 필요`로 우선 표기.
- 복수 품목 감지 시 `hsReviewRequired`를 강제 true로 저장.

4. Step 3 진입 정책 통일 기반 추가
- 공통 정책 파일 추가: `src/lib/step3-entry-policy.ts`
  - `REQUIRE_PRODUCT_CONFIRMATION_FOR_STEP3` (기본값 `false`)
  - `PROCEED_REVIEW_REQUIRED_LABEL` (`확인 필요 상태로 진행`)
- Step2 동작:
  - 정책이 `false`면 미확정 상태에서도 진행 가능하며 버튼/경고 문구를 `확인 필요 상태로 진행`으로 표시.
  - 정책이 `true`면 미확정 시 Step 3 이동 차단(버튼 비활성/저장 차단).
- Step3 동작:
  - 정책이 `true`이고 제품 확정이 없으면 Step2로 리다이렉트하고 안내 토스트 표시.

5. 공통 상태 문구 업데이트
- `src/lib/analysis-code.ts`
  - `review_required` 상세 문구를 `확인 필요 상태로 진행 중입니다...` 형태로 변경.

## 영향 파일
- `supabase/functions/ai-hs-suggest/index.ts`
- `src/pages/Step2Product.tsx`
- `src/pages/Step3Countries.tsx`
- `src/lib/analysis-code.ts`
- `src/lib/step3-entry-policy.ts` (new)
