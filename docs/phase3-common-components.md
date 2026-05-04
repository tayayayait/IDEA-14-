# Phase 3 Common Components (2026-04-22)

## 목적

- 스펙 §7 공통 컴포넌트 레벨 정합성 확보
- 출처/수동입력/체크리스트/토스트 정책을 화면 전반에 일관 적용

## 적용 파일

- `src/components/SourceBadge.tsx` (신규)
- `src/components/ManualBadge.tsx` (신규)
- `src/components/ChecklistPanel.tsx` (신규)
- `src/components/ui/sonner.tsx`
- `src/pages/Step1Company.tsx`
- `src/pages/Step4CountryDetail.tsx`
- `src/pages/Step5Safety.tsx`
- `src/pages/*.tsx` (toast import 경로 통일)

## 변경 내용

1. SourceBadge
- KICOX/KOTRA/K-SURE/SafetyKorea/무역안보관리원/관세청/기타 출처 배지 제공
- 24px 높이 pill 스타일 적용

2. ManualBadge
- "사용자 입력" 전용 배지 컴포넌트 제공

3. ChecklistPanel
- 항목명, 국가, 근거 API, 상태, 원문 링크 렌더링
- 선택적으로 체크 토글(onToggle) 지원

4. 화면 적용
- Step1: 조회 상태 영역에 `ManualBadge`/`SourceBadge` 적용
- Step4: 출처 링크 목록에 `SourceBadge` 적용
- Step5: 기존 체크리스트 UI를 `ChecklistPanel`로 교체

5. Toast 정책 (전역)
- 데스크톱: 우상단, 모바일: 하단 중앙
- 최대 노출: 3개
- duration:
  - success: 3000ms
  - warning: 5000ms
  - error: manual close(`Infinity` + closeButton)
- 페이지 toast import를 `@/components/ui/sonner`로 통일
