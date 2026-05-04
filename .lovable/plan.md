

# AI 산단수출 코파일럿 — 구현 계획

상세서.md의 7단계 분석 흐름과 디자인 시스템을 그대로 반영한 B2B 웹 앱을 만듭니다.

## 1. 기술 구조

- **프론트엔드**: React + Vite + TypeScript + Tailwind, 디자인 토큰을 `index.css`에 HSL CSS 변수로 정의(상세서 §5.2 색상, §5.3 폰트, §6 간격)
- **백엔드**: Lovable Cloud (인증 + DB + Edge Functions)
- **AI**: Lovable AI Gateway (Gemini 3 Flash) — 리포트 요약·실행 과제 생성
- **외부 API 어댑터**: 공공데이터 API 10종을 각각 Edge Function 프록시로 래핑. 키 미등록 시 `idle/error` 상태와 "API 인증 정보 미설정" 메시지(상세서 §11.1)를 표시. 키가 등록되면 자동 활성화
- **PDF**: 클라이언트에서 jsPDF + html2canvas로 1페이지 A4 리포트 생성

## 2. 데이터베이스 (RLS 적용, 본인 프로젝트만 접근)

- `profiles` — 사용자 기본 정보
- `projects` — 분석 프로젝트(상태: draft / ready / analyzing / review_required / complete / blocked)
- `project_companies` — 선택된 기업·공장 정보 + `사용자 입력` 배지 플래그
- `project_products` — 제품명, 설명, 부품, HS/HSK 후보 + 확정 코드
- `project_countries` — 후보국 + 종합 점수 + 추천 라벨
- `project_certifications` / `project_regulations` / `project_risks` — 국가별 분석 결과 캐시
- `project_safety_flags` — 전략물자·제품안전 검토 결과
- `api_call_logs` — API별 마지막 성공·실패·조회일 (데이터 출처 화면용)

## 3. 화면 구성 (상세서 §3 그대로)

**공통 앱 셸** — 상단바 64px, 좌측 단계 내비(7단계 진행도), 우측 근거 패널 360px(접기 가능), 하단 고정 액션바 72px, 모바일 단계바 하단 고정

| # | 경로 | 화면 |
|---|---|---|
| 0 | `/auth` | 로그인·회원가입 (이메일+비밀번호) |
| 0 | `/projects` | 프로젝트 목록 + 새 분석 |
| 1 | `/projects/new/company` | 기업·공장 검색 (KICOX) — 검색 폼, 결과 표, 빈 상태 → 수동 입력 |
| 2 | `/projects/{id}/product` | 제품·HS/HSK 입력 (HSK 연계표) — AI 후보 제안, 확정 토글 |
| 3 | `/projects/{id}/countries` | 후보국 Top 3 카드 + 비교 차트 + 비교 표 + 뉴스 근거 |
| 4 | `/projects/{id}/countries/{cc}` | 국가 상세 — 인증/규제/K-SURE 3종 + 다음 실행 과제 체크리스트 |
| 5 | `/projects/{id}/safety` | 전략물자 플래그 + 제품안전·리콜 유사사례 + 조치 체크리스트 |
| 6 | `/projects/{id}/report` | 1페이지 A4 PDF 미리보기 + 다운로드 |
| — | `/data-sources` | API 10종 상태표 + 라이선스 안내 |

## 4. 점수·라벨 규칙 (규칙 기반 우선)

```
종합점수 = 시장성(30) + 인증용이성(20) + 규제위험(20) + 결제안정성(20) + 안전·통제주의(10)
```
점수→라벨 매핑(우선검토/검토가능/주의필요/고위험/확실한 정보 없음)을 단일 유틸로 구현해 카드·표·PDF 어디서든 동일 표시.

## 5. 디자인 시스템

- 팔레트: `--color-primary #0E6B6F` 등 상세서 §5.2 토큰 100% 반영, 위험도 5단계 배지 컴포넌트
- 폰트: SUIT / Noto Sans KR / IBM Plex Sans KR (Google Fonts)
- 카드 radius 8px, 표 헤더 44px / 행 52px, 모바일에서 표→카드 리스트 변환
- 사용 금지 문구(`수출 가능`, `안전함` 등) 린트용 상수로 등록

## 6. 상태·예외 처리

- API 상태 7단계(`idle/loading/success/partial_success/empty/error/stale`) 컴포넌트 단위로 시각화
- `partial_success` 시 종합 점수에 `부분 산출` 배지 + 리포트에 실패 API 명시
- 모든 추천·요약 옆 `출처 보기` 버튼 → 우측 근거 패널 확장
- AI 응답에 근거 없으면 화면 표시 안 함, `기관 확인 필요` 문구로 대체

## 7. 접근성 (§10)

키보드 Tab 순서, 2px focus ring, 44px 터치 영역, 위험도 색상+텍스트 라벨 병기, 아이콘 버튼 `aria-label`, `prefers-reduced-motion` 대응

## 8. 1차 산출물

- 인증 + 프로젝트 CRUD
- 7단계 화면 전체 UI + 단계 내비게이션 + 액션바
- 10개 API 어댑터 Edge Function 골격 (키 미등록 시 명확한 안내, 등록되면 즉시 동작)
- 점수 산정 + 라벨링 유틸
- AI 리포트 요약·실행 과제 생성 (Lovable AI)
- 1페이지 A4 PDF 미리보기·다운로드
- 데이터 출처 화면

구현 후, 사용하실 공공데이터 API 키부터 차례로 등록하시면 해당 단계가 실데이터로 살아납니다.

