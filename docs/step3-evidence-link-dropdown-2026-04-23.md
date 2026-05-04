# Step3 Evidence Link + Dropdown Update

Date: 2026-04-23

## Goal
- Fix unauthorized link issue in `뉴스·시장 근거` by avoiding authenticated API endpoints as user-facing links.
- Restrict evidence browsing to Top 3 ranked countries via dropdown selection.

## What Changed

### 1) User-facing evidence links now resolve to readable pages
- File: `src/pages/Step3Countries.tsx`
  - Added `normalizeEvidenceUrl()`:
    - KOTRA 국가정보 API URL -> KOTRA 공개 국가·지역정보 페이지
    - KOTRA 해외시장뉴스 API URL -> KOTRA 공개 뉴스 페이지
    - Other `apis.data.go.kr` API URL -> `https://www.data.go.kr/`
  - Evidence rows now keep only entries with resolvable public URLs.

### 2) Step3 evidence panel switched to Top3 country dropdown
- File: `src/pages/Step3Countries.tsx`
  - Added Top3-only dropdown (`Select`) in `뉴스·시장 근거` 카드.
  - User can view evidence for rank 1~3 countries only.
  - If selected country has no public link evidence, explicit empty-state message is shown.

### 3) Backend source persistence avoids API endpoint links
- File: `supabase/functions/recommend-countries/index.ts`
  - `rationale.sources` now stores KOTRA 공개 국가·지역정보 페이지 URL (`url`) for market evidence.

- File: `supabase/functions/country-detail/index.ts`
  - News risk rows now store public article URL via `toPublicNewsUrl()` (fallback to KOTRA 뉴스 페이지).
  - `project_countries.rationale.sources` now stores:
    - KOTRA 공개 국가·지역정보 페이지
    - KOTRA 공개 뉴스 페이지
    - 실제 기사 URL(있을 때)
  - Legacy/ingested API endpoint sources are normalized via `normalizeSourceUrl()`:
    - KOTRA 국가정보 API -> 공개 국가정보 페이지
    - KOTRA 뉴스 API -> 공개 뉴스 페이지
    - Other API endpoints -> excluded from rationale link list

## Impact
- Clicking evidence links in Step3 no longer routes users to API Unauthorized pages.
- Evidence inspection UX is narrowed to Top3 candidate countries as requested.
