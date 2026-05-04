# API 1 Connection Note (KICOX)

Date: 2026-04-24

## Source Spec
- Dataset: 한국산업단지공단_공장등록생산정보조회서비스
- Data portal id: `15087611`
- Base URL: `https://apis.data.go.kr/B550624/fctryRegistInfo`

## Connected Endpoints
- `GET /getFctryListInIrsttService_v2`
  - Used when `complex` is provided.
  - Request params: `serviceKey`, `type=json`, `pageNo`, `numOfRows`, `irsttNm`

- `GET /getFctryPrdctnService_v2`
  - Used when `query`, `product_keyword`, or `region` is provided.
  - Request params: `serviceKey`, `type=json`, `pageNo`, `numOfRows`, `cmpnyNm`, `mainProductCn`, `adres`

- `GET /getFctryByFctryManageNoService_v2`
  - Used when `factory_manage_no` is provided.
  - Request params: `serviceKey`, `type=json`, `pageNo`, `numOfRows`, `fctryManageNo`

## Response Mapping
Input path: `response.body.items.item`

Mapped fields:
- `cmpnyNm` -> `company_name`
- `irsttNm` -> `industrial_complex`
- `rnAdres` -> `address`
- `rprsntvIndutyCode | indutyCodes | indutyNm` -> `industry_code`
- `allEmplyCo` -> `employees`
- `fctryManageNo` -> `factory_manage_no`
- `mainProductCn` -> `main_product`
  - Normalized with `normalizeMainProduct()` to remove empty delimiter tokens such as `", , , ,"`
  - Consecutive separators are collapsed and duplicate tokens are removed.

Not provided by this API:
- Business registration number is not in the response schema.
- Step1 UI does not collect `business_no`.

## Notes
- Data source link in `src/lib/api-registry.ts` updated to `15087611`.
- Previous legacy endpoint (`B552869/companyEntryInfo/getCompanyEntryInfo`) is removed from the runtime path.
- Runtime response content type is currently `application/xml` even when `type=json` is passed.
- `supabase/functions/api-kicox-search/index.ts` therefore parses XML response payloads directly.
- Region filter normalization was added in `supabase/functions/api-kicox-search/region.ts`.
  - UI short labels (e.g. `경북`, `전북`) are converted to official region names for API parameter `adres`.
  - Post-response filtering now treats abbreviations and full names as equivalent (e.g. `경북` = `경상북도`).
- Product text normalization was added in `supabase/functions/api-kicox-search/main-product.ts`.
  - Empty `mainProductCn` entries caused by repeated separators are removed before rendering on Step1.
