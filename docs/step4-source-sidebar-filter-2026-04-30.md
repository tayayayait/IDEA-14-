# Step 4 source sidebar filter - 2026-04-30

## Change

- Hidden `trade_office_action` rows from the Step 4 evidence sidebar because the same local-support content is already surfaced in the Step 6 report action section.
- Removed supplemental K-SURE, Strategic item, and SafetyKorea entries from the Step 4 evidence sidebar source list.
- The detailed Step 4 cards and downstream safety/risk pages still keep their data paths; this only hides the duplicated sidebar source rows shown under the evidence list.
- Previously, `trade_office_action` raw sidebar title/link rows were replaced with interpreted summaries based on the KOTRA trade office CSV fields; Step 4 now suppresses those rows entirely.
- Trade office summaries now prefer AI-generated Korean summaries based on the original KOTRA CSV fields for each selected country office.
- Rule-based trade office fallback is intentionally conservative: it cleans contact labels and URLs, keeps the address when available, and summarizes long airport-route text without inventing missing location details.
- Legacy route-only trade office summaries no longer render `위치 정보 없음`; when no address is available, Step 4 keeps the office name and available airport-route guidance only.
- Trade office summaries and links are no longer rendered in the Step 4 sidebar; other visible source rows keep their existing source rendering.
- New recommendation runs store interpreted trade office summaries instead of truncating raw CSV text to a short raw-label snippet.
- Hidden generic KOTRA country profile rows from the Step 4 evidence sidebar when the source contains `country and market profile` or `Export region rank`.
- Step 4 trade office rows render stored AI summaries directly when `summary_source` is `ai`; the display layer only removes raw labels, URLs, and contact fields.
- New `recommend-countries` runs persist structured trade office source fields: `office_name`, `office_address`, `airport_route_text`, and `summary_source`.
- Trade office summaries use AI when `LOVABLE_API_KEY` or `GEMINI_API_KEY` is available; otherwise they persist the same rule-based fallback with `summary_source: "rule"`. The AI prompt now asks for three to five Korean sentences up to 800 characters so address, airport access, transfer, fee, and visit-scheduling details can be retained.
- New recommendation runs can reuse `kotra_csv_trade_office_summary_cache` rows keyed by country, office name, and source hash to avoid repeated AI calls for unchanged CSV rows.

## Files

- `src/pages/Step4CountryDetail.tsx`
- `src/lib/trade-office-summary.ts`
- `src/test/trade-office-summary.test.ts`
- `src/test/step4-source-sidebar-filter.test.ts`
- `src/test/recommend-country-news-edge-bundle.test.ts`
- `supabase/functions/recommend-countries/index.ts`

## Verification

- `npm test -- src/test/trade-office-summary.test.ts src/test/recommend-country-news-edge-bundle.test.ts` passed after the trade office summary change.
- `node .\node_modules\typescript\bin\tsc -p .\tsconfig.app.json --noEmit` passed.
- `npm run build` still exits after Vite module transformation (`3017 modules transformed`) with the same native failure pattern already present in existing build logs; no new TypeScript error was emitted.
