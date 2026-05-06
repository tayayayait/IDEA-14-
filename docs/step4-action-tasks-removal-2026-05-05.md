# Step4 7일 실행 과제 제거 (2026-05-05)

## 변경 배경
- 국가 상세 화면에서 `7일 실행 과제` 카드와 `과제 생성` 버튼을 제거한다.
- 해당 버튼이 호출하던 Supabase Edge Function `ai-action-tasks`는 화면에서 더 이상 실행하지 않는다.

## 변경 내용
- `src/pages/Step4CountryDetail.tsx`
  - `tasks`, `taskGenerating` 상태 제거.
  - `generateTasks` 함수 제거.
  - `7일 실행 과제` 카드 렌더링 제거.
  - `상세 분석 실행` 버튼의 비활성화 조건에서 `taskGenerating` 제거.

## 검증
- `npm test`: 63개 테스트 파일, 393개 테스트 통과.
