# Step4 analysis basis product name - 2026-04-30

## Change

- Shows the latest `project_products.name` value in the Step4 country detail evidence card.
- The evidence card now displays the Korean product-name label above HS/HSK codes.
- Missing product names render with the app's existing unknown-information fallback copy.
- Long product names wrap inside the sidebar card.

## Files

- `src/pages/Step4CountryDetail.tsx`

## Verification

- `npm test` passed: 37 files, 214 tests.
- `tsc --noEmit` passed via `node ./node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit`.
