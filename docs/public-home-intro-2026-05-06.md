# Public Home Intro Routing

## 변경 목적

- 최초 진입 경로 `/`에서 곧바로 분석 프로젝트 목록으로 이동하지 않고, 공개 서비스 소개 화면을 먼저 보여준다.
- 기존 분석 기능과 인증 흐름은 유지한다.

## 적용 내용

- `src/pages/Index.tsx`를 공개 소개 화면으로 변경했다.
- `서비스 이용하기` CTA는 기존 보호 라우트 `/projects`로 연결한다.
- 인증되지 않은 사용자는 기존 `useAuthGuard`에 의해 `/auth`로 이동한다.
- 인증된 사용자는 기존 분석 프로젝트 목록 화면을 그대로 사용한다.
- 히어로 배경은 `public/hero-section-video-clean.mp4`의 16초 루프 MP4를 사용한다.
- `prefers-reduced-motion` 환경에서는 기존 `public/hero-section-poster.webp` 정적 포스터를 표시한다.
- 히어로의 분석 프로젝트 미리보기 카드는 제거했다.
- 히어로 영상은 빈 공간 없이 화면을 채우도록 `object-cover`로 표시하고, 흰 오버레이와 그리드 농도를 낮춰 영상 선명도를 유지한다.
- 공개 홈의 주요 콘텐츠 쉘은 `max-w-[1720px]` 기준으로 넓혀 데스크톱 좌우 여백을 줄였다.

## 유지한 기능

- `/projects` 이하 분석 프로젝트, 단계별 분석, 데이터 출처, KC 리콜 조회 라우팅은 변경하지 않았다.
- Supabase 세션 확인과 로그인 강제 로직은 기존 보호 화면의 `useAuthGuard`에 남겼다.
