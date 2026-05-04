# Step4 regulation/NTM KR-origin HS-first filter (2026-04-30)

## Purpose
- Step4 regulation/NTM results must answer this question:
  - A Korean company exports the selected product to the selected destination country. Which regulations actually apply?
- The feature is not US-specific. The same rule applies to every selected destination country.

## Confirmed regulation criteria
- Importing/regulating country must match the selected country:
  - `ISO_WD2_NAT_CD === selected country code`
- Regulated origin/target country must apply to Korea:
  - Korea terms: `KR`, `KOR`, `Korea`, `South Korea`, `Republic of Korea`, Korean-language Korea names
  - Global terms: all countries, worldwide, global, Korean-language global/all-country names
- HS must match before a row can be confirmed:
  - `HSCD` must match the selected HS 6 digits or the first 6 digits of HSK.
- Product name and keywords are only secondary evidence for ordering. They do not make a row confirmed.

## Review candidate criteria
- If import country and Korea/global origin match, but HS does not match, a product-name match can be shown only as a review candidate.
- Review candidates are not confirmed regulations.
- Review candidate raw fields:
  - `match_confidence: "review_required"`
  - `hs_match: false`
  - `match_strategy: "kr_origin_product_review"`

## Stored raw metadata
- Confirmed regulation rows store:
  - `origin_country_fixed: "KR"`
  - `origin_target_match: true`
  - `import_country_match: true`
  - `hs_match: true`
  - `match_strategy: "kr_origin_country_hs"`
  - `match_confidence: "high"`
- Review candidate rows store the same import/origin metadata, but `hs_match: false`.

## CSV backup
- CSV backup follows the same filtering policy.
- A CSV row must match the selected country and must have `is_korea_target=true` or a Korea-target `korea_target_yn` value.
- HS 6-digit match is required for confirmed rows.
- HS mismatch plus product match can only appear as a review candidate.
