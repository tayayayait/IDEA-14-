# DESIGN.md

## 1. Design System Source of Truth

이 문서는 산단수출 코파일럿 전체 UI/UX 리디자인의 단일 기준이다. 실제 기능, 라우팅, API 호출, Supabase 연동, 분석 상태값, 리포트 생성 로직은 변경하지 않는다. Stitch 생성물과 React 마이그레이션은 이 문서의 토큰과 컴포넌트 원칙을 따라야 한다.

- Product: 산단수출 코파일럿
- Device: Desktop-first responsive web
- Primary workflow: 기업 정보 입력, 제품 및 HS 정보 입력, 추천 국가 분석, 국가별 상세 리스크 확인, 보고서 생성
- Stitch project: `projects/3538261065911596639`
- First generated screen: `projects/3538261065911596639/screens/fa1a080a38324923af3f3f62bc40fb04`
- Stitch model: `GEMINI_3_1_PRO` 사용. 현재 노출된 Stitch MCP 스키마에는 별도 thinking 파라미터가 없다.

## 2. Visual Direction

신뢰도 높은 B2B SaaS형 수출 의사결정 워크벤치로 설계한다. 화면은 공공데이터 근거, 리스크, 체크리스트, 진행 상태, 보고서를 빠르게 스캔할 수 있어야 한다.

- 분위기: 차분함, 정밀함, 공공데이터 기반의 신뢰감
- 정보 구조: 대시보드형 밀도, 명확한 상태 표시, 근거 중심 레이아웃
- 금지 패턴: 장식용 그라디언트 오브, 과도한 마케팅 히어로, 중첩 카드, 모호한 일러스트, 색상만으로 의미 전달
- 참고 패턴: Stripe Dashboard의 명확한 폼과 상태 표시, Linear의 업무형 밀도, GOV.UK Design System의 공공 서비스 가독성, Financial Times식 리포트 구조

## 3. Color Tokens

기본 테마는 밝은 공공/무역 데이터 테마다. 색상은 의미 기반으로만 확장한다.

| Role | Token | Value | Usage |
| --- | --- | --- | --- |
| Page background | `background` | `#F7F8FA` | 전체 앱 배경 |
| Surface | `surface` | `#FFFFFF` | 카드, 폼, 리포트 블록 |
| Primary | `brand` | `#0E6B6F` | 핵심 CTA, 브랜드, 현재 단계 |
| Primary hover | `brand-hover` | `#0A585C` | CTA hover |
| Secondary accent | `accent` | `#2F80ED` | 링크, 근거, 보조 강조 |
| Focus | `focus` | `#1D4ED8` | 키보드 포커스 링 |
| Text primary | `foreground` | `#161A22` | 본문 핵심 텍스트 |
| Text muted | `muted-foreground` | `#5F6670` | 보조 설명, 메타 정보 |
| Border | `border` | `#D8DEE6` | 카드, 입력, 구분선 |
| Soft surface | `surface-soft` | `#EEF3F6` | 약한 구획, 비활성 배경 |

### Risk and Status Colors

리스크 색상은 항상 텍스트 라벨, 아이콘, 보조 설명과 함께 사용한다.

| Meaning | Color | Usage |
| --- | --- | --- |
| Positive / ready | `#16A34A` | 정상, 완료, 낮은 리스크 |
| Informational | `#2F80ED` | 참고, 데이터 근거, 검토 가능 |
| Caution | `#F59E0B` | 주의, 보완 필요 |
| High risk | `#DC2626` | 리콜, 중대 리스크, 차단 요인 |
| Unknown | `#6B7280` | 정보 없음, 미확인 |

## 4. Typography

- Primary font: `SUIT`, `Noto Sans KR`, system sans-serif
- Heading font: `IBM Plex Sans KR`, `SUIT`, system sans-serif
- Numeric data: tabular numbers where possible
- Letter spacing: `0`
- Font sizes must not scale with viewport width.
- Compact panels and tables must use restrained heading scale. Hero-scale typography is allowed only on the public home intro screen.

## 5. Layout Principles

### Public Home

첫 화면은 소개형 웹서비스 홈이다. 사용자는 `서비스 이용하기`를 눌러 업무 화면으로 이동한다. 홈은 제품명, 대상 사용자, 핵심 가치, 데이터 근거, 서비스 진입 CTA를 첫 viewport 안에서 명확히 보여준다.

### Authenticated Workspace

업무 화면은 앱 셸 기반이다.

- 상단 앱바: 브랜드, 프로젝트, 데이터 출처, KC 리콜 조회, 로그아웃
- 좌측 상단 브랜드 클릭: 홈(`/`)으로 이동
- 본문: 최대 폭을 제한하되 데이터 표와 리포트 화면은 충분한 가로 폭을 확보
- 단계 화면: 진행 상태, 현재 단계, 다음 행동을 항상 같은 위치에서 확인 가능
- 모바일: 하단 또는 상단 압축 내비게이션과 카드형 리스트 제공

## 6. Component Rules

### App Shell

- 브랜드 영역은 항상 클릭 가능해야 한다.
- 현재 경로 상태가 시각적으로 명확해야 한다.
- 네비게이션 아이콘은 `lucide-react`를 우선 사용한다.
- 텍스트 버튼보다 익숙한 아이콘 버튼을 우선하되, 낯선 아이콘에는 접근 가능한 이름을 제공한다.

### Buttons and Controls

- 최소 터치 타깃: 44px
- Primary CTA: 딥 틸 배경, 흰색 텍스트
- Secondary: 흰색 표면, 명확한 경계선
- Destructive: 빨강은 삭제, 차단, 중대 위험에만 사용
- Toggle, segmented control, stepper, slider 등은 기능에 맞는 표준 컨트롤로 표현한다.

### Cards and Panels

- 카드 radius는 8px 이하
- 카드 안에 또 다른 카드 구조를 만들지 않는다.
- 반복 항목, 모달, 명확한 도구 패널에만 카드 스타일을 적용한다.
- 페이지 섹션 자체는 floating card가 아니라 full-width band 또는 unframed layout이어야 한다.

### Forms

- 입력 필드는 44px 이상 높이를 유지한다.
- 라벨, 보조 설명, 오류 메시지를 분리한다.
- 기업명, 제품명, HS 코드, 국가 검색 등 핵심 입력은 사용자가 반복 작업하기 쉬워야 한다.
- 긴 한국어 텍스트와 영문/숫자 혼합값이 부모 영역을 넘치지 않아야 한다.

### Tables, Lists, and Evidence

- 데스크톱은 표와 밀도 높은 리스트를 우선한다.
- 모바일은 `MobileCardList` 패턴을 유지한다.
- 출처, 업데이트 시각, API 상태, 수동 입력 여부는 보조 배지로 일관되게 표시한다.
- 데이터 없음, 로딩, 실패 상태는 각각 명확한 문구와 재시도 행동을 제공한다.

### Report

- 보고서 화면은 출력과 PDF 저장을 고려한 흰색 리포트 표면을 유지한다.
- 리스크 요약, 국가별 상세, 근거 출처, 체크리스트를 구획화한다.
- 인쇄 스타일에서 배경 장식과 불필요한 내비게이션은 제거한다.

## 7. Accessibility and QA

- 모든 인터랙션 요소는 키보드로 접근 가능해야 한다.
- 포커스 링은 명확히 보이고 브랜드 색상과 혼동되지 않아야 한다.
- 의미 전달은 색상 단독에 의존하지 않는다.
- 모바일 390px, 태블릿 768px, 데스크톱 1280px 이상에서 텍스트 겹침이 없어야 한다.
- 화면 전환, 분석 진행, 오류, 완료 상태는 스크린리더가 이해할 수 있는 구조를 유지한다.

## 8. Stitch Prompt Contract

Stitch 화면 생성 프롬프트는 다음 공통 지시를 포함해야 한다.

```text
Design a desktop-first responsive B2B SaaS export decision workbench for Korean manufacturing companies. Preserve the existing workflow semantics and business logic. Use a calm public-data theme: #F7F8FA page background, #FFFFFF surfaces, #0E6B6F primary actions, #2F80ED secondary evidence accent, semantic green/blue/amber/red risk colors, 8px card radius, dense dashboard layout, clear forms, source badges, risk summaries, checklists, and report-style information hierarchy. Avoid decorative gradient blobs, nested cards, marketing-heavy app screens, and color-only status communication. Output a visual shell suitable for React and Tailwind migration.
```
