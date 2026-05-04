# Step 3 customs export visibility fix (2026-05-01)

## Problem
- Customs Nitemtrade data was fetched in Step 3 and used for score boosting, but the export amount was only available in a map hover tooltip.
- Users could not verify from the normal Step 3 screen whether the Customs export amount had been applied.

## Fix
- Show Customs export lookup state directly on each Top 3 country card.
- Show Customs export lookup state directly below the Step 3 world map summary for all Top 3 countries.
- Use the guide-defined `hsSgn` item-code behavior more strictly: 10-digit HSK first, then 6-digit and 4-digit fallbacks only when the more specific query returns no trade amount.
- Keep the existing hover tooltip display.

## Scope
- No API contract change.
- No Supabase migration.
- No change to Customs score boost thresholds.

## Guide check
- `strtYymm` and `endYymm`: sent as `YYYYMM`; the code keeps the range within 12 months.
- `cntyCd`: sent as ISO alpha-2 country code, matching the guide sample `US`.
- `hsSgn`: now prefers the 10-digit HSK item code when available.
- `expDlr`: displayed as the recent 12-month HS/HSK export amount in USD.
