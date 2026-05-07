# UI Redesign Batch 1 - 2026-05-06

## Scope

첫 배치는 홈 화면 전용 리디자인이다. 사용자가 범위를 홈으로 축소했으므로 분석 화면과 공통 앱 셸 리팩터링은 진행하지 않는다.

변경 범위:

- Stitch 리디자인 프로젝트 생성
- Public Home Stitch 화면 생성 및 HTML 보관
- Public Home 소개 화면의 시각 구조 정리
- 좌측 상단 브랜드 링크의 홈(`/`) 이동 유지

## Stitch Artifacts

- Project: `projects/3538261065911596639`
- Public Home screen: `projects/3538261065911596639/screens/fa1a080a38324923af3f3f62bc40fb04`
- Downloaded HTML: `docs/stitch/public-home-fa1a080a.html`

참고: `create_design_system`은 동일 입력에서 `invalid argument`를 반환했다. 차단하지 않고 `generate_screen_from_text` 프롬프트에 `DESIGN.md` 기준을 직접 포함했다. 생성 결과에는 Stitch 측 design system asset `assets/d50ea205dcf64d859e000a26d4b823b9`가 포함됐다.

## Code Changes

- `src/components/AppShell.tsx`
  - 좌측 상단 브랜드 링크는 `/` 유지
  - 그 외 공통 셸 로직은 기존 구조 유지

- `src/pages/Index.tsx`
  - H1을 서비스명 `산단수출 코파일럿`으로 정리
  - `서비스 이용하기` CTA는 `/projects` 유지
  - 히어로 우측 분석 미리보기 패널의 빈 공간 제거
  - 진행률, 추천 국가, 다음 확인 항목, 리포트 상태, 근거 출처를 한 패널에 배치
  - 홈 전용 지표 카드와 워크플로우/출처/리포트 섹션 정리
  - `public/hero-scroll/hero-000.webp`부터 `hero-063.webp`까지 64장 WebP 프레임을 스크롤 진행률에 맞춰 전환
  - `public/hero-section-poster.webp`를 reduced-motion 정적 배경으로 사용
  - 원본 영상 우하단 워터마크 영역은 16:9 크롭으로 제외
  - 큰 데스크톱 화면에서 하단 섹션이 끊겨 보이지 않도록 히어로 높이와 섹션 수직 패딩을 압축

## Verification

Baseline before code changes:

- `npm test`: passed, 64 files / 395 tests
- `npm run build`: passed

Batch verification must be run again after this batch before completion.

Post-change verification:

- `npm test`: passed, 64 files / 395 tests
- `npm run build`: passed
- Browser check: `http://127.0.0.1:8090/`
- Desktop viewport: home rendered without visible text overlap
- Mobile viewport: home rendered without visible text overlap
- `서비스 이용하기` click: unauthenticated user redirected to `/auth` as expected
- Desktop screenshot: `docs/screenshots/ui-redesign-batch1-home.png`
- Mobile screenshot: `docs/screenshots/ui-redesign-batch1-home-mobile.png`
- Hero scroll frame check: top frame `/hero-scroll/hero-000.webp`, scrolled frame `/hero-scroll/hero-030.webp`
- Hero desktop screenshot: `docs/screenshots/hero-webp-scroll-desktop.png`
- Hero mobile screenshot: `docs/screenshots/hero-webp-scroll-mobile.png`
- Bottom scroll check: `sources` and `report` sections visible at the bottom scroll position
- Bottom scroll screenshot: `docs/screenshots/home-scroll-bottom-after-layout-compress.png`

Hero motion assets:

- Source video: `히어로섹션 영상.mp4`
- WebP sequence: `public/hero-scroll/hero-000.webp` to `public/hero-scroll/hero-063.webp`
- Static poster: `public/hero-section-poster.webp`
- Sequence size: about 1.49 MB
- Scroll behavior: first hero section scroll range maps to frame index 0-63, with subtle opacity/scale/parallax on the background layer
