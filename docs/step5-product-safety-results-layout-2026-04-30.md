# Step5 Product Safety Results Layout

Date: 2026-04-30

## Change
- Reworked the Step5 SafetyKorea result area from a long stacked list into:
  - summary metric cards
  - tabs for summary, KC certification, domestic recall, and foreign recall
  - compact KC certification table
  - collapsible recall detail cards
- Renamed the result title to `KC 인증·리콜 참고 조회 결과`.
- Clarified that SafetyKorea results are candidate records, not final product-safety determinations.

## Behavior
- Product-name-only searches are displayed as low-confidence product candidates.
- Model name, KC certification number, and barcode searches are displayed as higher-confidence lookup bases.
- Each result section shows visible count against the total count, for example `상위 10건 표시 / 전체 2,335건`.
- Recall cards show only the key risk and action summary by default; full details, images, and links are hidden behind a disclosure control.

## Scope
- UI-only change in Step5 result rendering.
- No SafetyKorea API, Supabase Edge Function, database, or stored raw payload changes.
