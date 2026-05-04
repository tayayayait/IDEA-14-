# Step5 Strategic Detail Card UI Removal

Date: 2026-04-30

## Change
- Removed the `전략물자 상세` card from the Step5 UI.
- The strategic item summary remains available in the existing `전략물자 검토 상태` panel.
- Runtime scan, stored flags, and SafetyKorea result rendering were not changed.

## Reason
- The removed card repeated low-level HS/HSK metadata already represented in the Step5 summary.
- Hiding it reduces visual density before the KC certification and recall result sections.

## Updated File
- `src/pages/Step5Safety.tsx`
