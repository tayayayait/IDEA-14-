# implementation_plan.md

## 1. Scope and Guardrails

목표는 프로젝트 전체의 UI 껍데기를 통일된 B2B SaaS형 수출 의사결정 워크벤치 스타일로 교체하는 것이다. 기존 기능과 비즈니스 로직은 변경하지 않는다.

보존 대상:

- 라우팅 경로와 URL 파라미터
- Supabase 인증, DB 조회, edge function 호출
- 분석 단계 상태값, 진행률, 완료 조건
- 리포트와 PDF 생성 흐름
- 테스트가 검증하는 공개 함수와 데이터 계약
- 기존 문서화된 접근성 및 반응형 요구사항

현재 범위는 홈 화면 전용 리디자인으로 축소됐다. 분석 화면, 인증 화면, 프로젝트 화면, 고위험 단계 화면의 UI 교체와 hook 추출은 진행하지 않는다.

## 2. Required Skill and Tool Status

확인한 필수 스킬:

- `enhance-prompt`
- `design-md`
- `stitch-loop`
- `react:components`

확인한 스킬 경로:

- `C:\Users\dbcdk\.gemini\antigravity\skills`

Stitch MCP 상태:

- `list_projects` 호출 가능
- 프로젝트 조회 계열 도구 사용 가능
- `generate_screen_from_text`, `edit_screens`, `generate_variants`는 `modelId: GEMINI_3_1_PRO`를 지원
- 현재 도구 스키마에서 별도 thinking 파라미터는 확인되지 않음
- 리디자인 프로젝트 생성 완료: `projects/3538261065911596639`
- Public Home 화면 생성 완료: `projects/3538261065911596639/screens/fa1a080a38324923af3f3f62bc40fb04`
- 생성 HTML 보관 위치: `docs/stitch/public-home-fa1a080a.html`

## 3. Existing Route Inventory

| Route | File | Redesign Target | Risk |
| --- | --- | --- | --- |
| `/` | `src/pages/Index.tsx` | Public home intro | Medium |
| `/auth` | `src/pages/Auth.tsx` | Login/signup/auth state screen | Medium |
| `/projects` | `src/pages/Projects.tsx` | Analysis project list | Medium |
| `/projects/:id/company` | `src/pages/Step1Company.tsx` | Company search and selection | High |
| `/projects/:id/product` | `src/pages/Step2Product.tsx` | Product and HS profile | High |
| `/projects/:id/countries` | `src/pages/Step3Countries.tsx` | Country recommendation dashboard | Very high |
| `/projects/:id/countries/:cc` | `src/pages/Step4CountryDetail.tsx` | Country detail, certificates, recalls, regulations | Very high |
| `/projects/:id/safety` | `src/App.tsx` redirect | Redirect compatibility | Low |
| `/projects/:id/report` | `src/pages/Step6Report.tsx` | Final report and PDF workflow | Very high |
| `/data-sources` | `src/pages/DataSources.tsx` | Public data source status and management | Medium |
| `/kc-recall` | `src/pages/KcRecallLookup.tsx` | KC recall lookup tool | Medium |
| `*` | `src/pages/NotFound.tsx` | Not found state | Low |

## 4. Shared UI Inventory

Primary shell and workflow components:

- `src/components/AppShell.tsx`
- `src/components/StepNav.tsx`
- `src/components/NavLink.tsx`
- `src/components/MobileCardList.tsx`
- `src/components/ChecklistPanel.tsx`
- `src/components/WorldMapChart.tsx`
- `src/components/TagInput.tsx`

Status and badge components:

- `src/components/badges/ApiStateChip.tsx`
- `src/components/badges/RiskBadge.tsx`
- `src/components/badges/SourceBadge.tsx`
- `src/components/badges/FeasibilityBadge.tsx`
- `src/components/badges/ManualBadge.tsx`

Design primitives:

- `src/components/ui/*`
- `src/index.css`
- `tailwind.config.ts`

## 5. Redesign Strategy

### Phase A: Baseline Verification

Before code changes after LGTM:

1. Run `npm test`.
2. Run `npm run build`.
3. Capture current critical screens for comparison if the dev server is available.

### Phase B: Logic Shelter With Hooks

Before replacing page shells, move page-specific state, effects, API calls, and derived data into hooks under `src/hooks/`.

Planned hooks:

- `useAuthPage`
- `useProjectsPage`
- `useDataSourcesPage`
- `useKcRecallLookup`
- `useStep1Company`
- `useStep2Product`
- `useStep3Countries`
- `useStep4CountryDetail`
- `useStep6Report`
- `useAppShellProgress`

Rules:

- Keep the same API payloads and Supabase table names.
- Preserve route params and navigation behavior.
- Preserve exported helper functions used by tests through compatibility re-exports when needed.
- Do not move shared business logic into visual components.
- Do not replace real data with Stitch sample data.

### Phase C: Stitch Generation

After LGTM:

1. Create or select a Stitch project for the redesign.
2. Create or update a design system using `DESIGN.md`.
3. Generate screens with `modelId: GEMINI_3_1_PRO`.
4. Use English prompts generated from `enhance-prompt`.
5. Keep all screens on the same token set and layout principles.

Screens to generate:

- Public Home
- Auth
- Project List
- Company Search
- Product and HS Input
- Country Recommendation
- Country Detail
- Final Report
- Data Sources
- KC Recall Lookup
- Not Found

### Phase D: React Assembly

1. Download Stitch HTML/Tailwind output.
2. Convert visual shells into modular React components.
3. Place reusable presentational pieces under `src/components/workbench/`.
4. Keep page files as composition layers that connect hooks to visual components.
5. Keep route preloading intact in `src/lib/route-preload.ts`.
6. Use existing design primitives where they fit; do not introduce a second UI framework.

### Phase E: Verification

Every code-change turn must end with:

1. `npm test`
2. `npm run build`

Additional UI checks after assembly:

- `/` public home to `/projects` service entry
- top-left brand link returns to `/`
- auth guard behavior for unauthenticated users
- full analysis route sequence
- data source screen
- KC recall lookup screen
- report/PDF path
- responsive widths: 390px, 768px, 1280px or wider

## 6. File Ownership Plan

Likely files to edit after LGTM:

- `src/index.css`
- `tailwind.config.ts`
- `src/components/AppShell.tsx`
- `src/components/StepNav.tsx`
- `src/components/NavLink.tsx`
- `src/components/MobileCardList.tsx`
- `src/components/badges/*`
- `src/pages/*.tsx`
- `src/hooks/*.ts`
- `src/components/workbench/*`
- `docs/*`

Files to avoid unless required for compatibility:

- `src/integrations/supabase/types.ts`
- `supabase/functions/*`
- migration files
- API contract utilities

## 7. Main Risks

- `Step3Countries.tsx`, `Step4CountryDetail.tsx`, `Step6Report.tsx` are large and have high behavioral coupling. Hook extraction must be incremental.
- Existing tests may depend on exported helpers from page files. Re-export compatibility is required if helpers move.
- Report and PDF UI can break print layout if decorative styles leak into print media.
- Mobile card equivalents must preserve data density without hiding critical evidence.
- Stitch output is visual reference code, not authoritative business logic.

## 8. English Stitch Prompt Set

### Global Prompt Seed

```text
Design a desktop-first responsive B2B SaaS export decision workbench for Korean manufacturing companies. Preserve the existing workflow semantics and business logic. Use a calm public-data theme: #F7F8FA page background, #FFFFFF surfaces, #0E6B6F primary actions, #2F80ED secondary evidence accent, semantic green/blue/amber/red risk colors, 8px card radius, dense dashboard layout, clear forms, source badges, risk summaries, checklists, and report-style information hierarchy. Avoid decorative gradient blobs, nested cards, marketing-heavy app screens, and color-only status communication. Output a visual shell suitable for React and Tailwind migration.
```

### Per-Screen Prompts

- Public Home: introduce the service, show the export decision workflow, public-data trust signals, and a clear "Use Service" CTA leading into the app.
- Auth: compact trust-first authentication screen with login and signup states, clear errors, and no marketing clutter.
- Project List: show analysis projects, progress, status, last updated time, continue/delete actions, and new analysis CTA.
- Company Search: guide company lookup, selected company evidence, manual fallback, and step progression.
- Product and HS Input: support product details, HS code search/selection, evidence, validation, and save/continue flow.
- Country Recommendation: dense country ranking dashboard with map, filters, risk badges, source evidence, and recommendation reasons.
- Country Detail: detailed country workspace for certificates, recalls, regulations, risks, checklist, and source traceability.
- Final Report: report-style summary with export readiness, country comparisons, risk matrix, source list, and PDF-oriented layout.
- Data Sources: operational data-source catalog with freshness, API state, update status, and source ownership.
- KC Recall Lookup: focused lookup tool with search filters, recall results, severity labels, and evidence details.
- Not Found: restrained error state with route recovery action.

## 9. LGTM Checkpoint

Approval is required before any of the following actions:

- Moving business logic into new hooks
- Generating Stitch screens
- Replacing page shells
- Editing existing React page/component code for the full redesign

On approval, execution starts from Phase A and proceeds in small verifiable batches.

## 10. Execution Log

### 2026-05-06 Batch 1

- Baseline `npm test` 통과: 64 files, 395 tests.
- Baseline `npm run build` 통과.
- Stitch 프로젝트 생성: `projects/3538261065911596639`.
- Stitch Public Home 화면 생성: `fa1a080a38324923af3f3f62bc40fb04`.
- Stitch HTML 다운로드: `docs/stitch/public-home-fa1a080a.html`.
- 범위를 홈 화면 전용으로 축소.
- Public Home hero를 Stitch 기준에 맞춰 브랜드명 중심, 공공데이터 근거, 분석 미리보기 패널 구조로 정리.
- `AppShell`은 좌측 상단 브랜드 링크가 홈(`/`)으로 이동하는 기존 요구만 유지.
