# Phase 4 Design System (2026-04-22)

## 목적

- 디자인 토큰을 스펙 기준값으로 정렬
- 입력/카드 기본 치수의 일관성 확보

## 적용 파일

- `src/index.css`
- `tailwind.config.ts`
- `src/components/ui/input.tsx`
- `src/components/ui/card.tsx`

## 변경 내용

1. 색상 토큰 정합화
- `--background`: `#F7F8FA` 기준으로 조정
- `--accent`: `#2F80ED` 기준으로 조정
- `--ring`(focus): `#1D4ED8` 기준으로 조정

2. 폰트 우선순위 조정
- SUIT 웹폰트를 import하고 기본 본문 폰트 1순위로 설정
- Tailwind `fontFamily.sans`도 SUIT 우선으로 변경

3. 입력/카드 규격 정렬
- Tailwind 토큰에 `h-input/min-h-input = 44px` 추가
- Input 컴포넌트 기본 높이를 `44px`로 적용
- Card 반경을 `8px`로 고정 (`rounded-card`)

4. 리스크 토큰 매핑 보강
- `risk.critical`, `risk.critical-soft` 토큰 추가

5. Tailwind 플러그인 import 정리
- `require` 대신 ESM import로 변경
