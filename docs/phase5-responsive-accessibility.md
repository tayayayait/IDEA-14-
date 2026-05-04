# Phase 5 (P1) 반응형·접근성 개선

## 목적
- 모바일/태블릿/데스크톱에서 단계 이동과 표 데이터 확인을 일관되게 제공
- 터치 타깃(최소 높이 44px 수준)과 내비게이션 접근성 보강
- 기존 데스크톱 표 중심 화면을 모바일 카드 뷰와 병행 제공

## 적용 범위
- `src/components/StepNav.tsx`
- `src/components/AppShell.tsx`
- `src/components/MobileCardList.tsx` (신규)
- `src/pages/Step1Company.tsx`
- `src/pages/Step2Product.tsx`
- `src/pages/Step3Countries.tsx`
- `src/pages/DataSources.tsx`

## 핵심 변경
1. 단계 내비게이션 반응형 분리
- 태블릿(`md~lg`)에서는 아이콘 중심 compact `StepNav` 사용
- 데스크톱(`lg+`)에서는 라벨 포함 full `StepNav` 유지
- 모바일(`md-`) 하단 단계바를 링크 기반으로 변경해 단계 직접 이동 지원

2. 모바일 표 대체 카드 UI 도입
- `MobileCardList` 컴포넌트로 모바일 카드 렌더링 공통화
- Step1/Step2/Step3/DataSources에서 모바일 카드 + 데스크톱 테이블 병행
- 데스크톱 테이블은 `md` 이상에서만 노출

3. 접근성/조작성 개선
- 단계 링크에 `aria-label`, 현재 단계에 `aria-current="step"` 적용
- 주요 버튼/링크에 `min-h-11`(44px 근접) 적용
- 모바일 단계바와 하단 액션바가 겹치지 않도록 동적 하단 오프셋 적용

## 검증 기준
- 모바일에서 모든 단계 이동이 가능하고 액션바와 겹치지 않음
- 표 기반 정보가 모바일에서 카드 형태로 동일 의미를 제공
- 클릭/터치 주요 컨트롤이 작은 타깃으로 인한 오동작 없이 동작

## 후속 권장
1. 실제 기기(360px/390px/768px/1024px)에서 단계바 가독성 검증
2. 키보드 탭 순서와 스크린리더 읽기 순서 점검
3. 대규모 번들 경고(`>500kB`)는 Phase 6에서 청크 분리로 최적화
