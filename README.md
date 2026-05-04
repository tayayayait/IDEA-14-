# AI 산단수출 코파일럿

공공데이터 기반으로 수출 후보국 추천, 인증/규제/안전 검토, 1페이지 리포트를 생성하는 React + Supabase 프로젝트입니다.

## 1. 개발 환경

- Node.js 20+
- pnpm 10+

## 2. 설치

```bash
pnpm install
```

## 3. 환경 변수

`.env.example`를 참고해 `.env`를 구성합니다.

프론트엔드:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

서버/엣지 함수:
- `KICOX_API_KEY`
- `PUBLIC_DATA_API_KEY`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `LOVABLE_API_KEY` (기존 Lovable gateway 경로 사용 시)

AI 함수는 `LOVABLE_API_KEY`를 우선 사용하고, 미설정 시 `GEMINI_API_KEY`로 자동 폴백됩니다.

## 4. 실행 및 검증

```bash
pnpm dev
pnpm test
pnpm build
```
