# Phase 0 Baseline (2026-04-22)

## 목적

- 개발 환경을 재현 가능한 상태로 고정
- 비밀키 노출 위험 제거
- 다음 Phase 작업 전에 실행/검증 루프 확보

## 적용 내용

1. 패키지 매니저 정책 고정
- `package.json`에 `packageManager: pnpm@10.33.0` 추가

2. 의존성 설치
- `pnpm install` 실행 완료

3. 비밀키 파일 보호
- `.gitignore`에 `.env`, `.env.*`, `!.env.example` 추가

4. 환경변수 템플릿 추가
- `.env.example` 신설
- 프론트(`VITE_*`) + 서버(`KICOX_API_KEY`, `GEMINI_API_KEY` 등) 키를 명시

5. 기본 문서 갱신
- `README.md`를 실행 가능한 개발 안내 문서로 교체

6. AI 키 연결 경로 보강
- `supabase/functions/ai-*` 3개 함수에
  - `LOVABLE_API_KEY` 우선 사용
  - 미설정 시 `GEMINI_API_KEY` + `GEMINI_MODEL` 폴백 사용

## 확인 필요 항목

- `pnpm` 설치 이후 빌드 스크립트 승인 경고가 발생함
  - 필요 시 `pnpm approve-builds` 실행
- 기능 구현 Phase 시작 전 `pnpm test`, `pnpm build` 통과 여부를 다시 확인
