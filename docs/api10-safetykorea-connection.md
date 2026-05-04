# API 10 Connection Note (SafetyKorea KC/Recall)

Date: 2026-04-28

## Source Spec
- Dataset: SafetyKorea_제품 안전인증 및 리콜 정보
- Guide file: `api가이드 파일(공공데이터)/KC인증정보, 국내리콜정보, 국외리콜정보 가이드.hwp`
- Auth method:
  - HTTP Header key: `AuthKey`
  - Value: 발급된 서비스 ID (API key)
- Industry scope note: SafetyKorea is not a general certification/recall API for all industries. See [Step5 Industry Safety API Reference](./step5-industry-safety-api-reference.md) for non-SafetyKorea product groups such as automobiles, medical devices, food, semiconductors, and petroleum.

## Endpoints Applied
- KC 인증 조회
  - `GET http://www.safetykorea.kr/openapi/api/cert/certificationList.json?conditionKey={...}&conditionValue={...}`
- 국내 리콜 조회
  - `GET http://www.safetykorea.kr/openapi/api/recall/recallList.json?conditionKey={...}&conditionValue={...}`
- 국내 리콜 상세
  - `GET http://www.safetykorea.kr/openapi/api/recall/recallDetail.json?recallUid={...}`
- 국외 리콜 조회
  - `GET http://www.safetykorea.kr/openapi/api/recall/fRecallList.json?conditionKey={...}&conditionValue={...}`

## Runtime Integration
- Function: `supabase/functions/safety-scan/index.ts`
- Input query source:
  - Primary: `project_products.components.safetySearch`
    - `productName`
    - `modelName`
    - `brandName`
    - `certNum`
    - `barcodeNum`
  - Fallback:
    - `project_products.name`
    - `components.modelName`
    - `components.tags[]`
- Query strategy:
  - Step5 화면에서 입력값을 먼저 `components.safetySearch`에 저장
  - KC 인증 조회: `certNum` -> `modelName` -> `productName`
  - 국내 리콜 조회: `barcodeNum` -> `certNum` -> `recallModelName` -> `recallBrandName` -> `recallProductName`
  - 국외 리콜 조회: `recallModelName` -> `recallBrandName` -> `recallProductName`
  - 인증번호/리콜 ID 기준 중복 제거
  - KC 인증 상위 결과(최대 5건)는 `certificationDetail`로 보강
  - 국내리콜 상위 결과(최대 5건)는 `recallDetail`로 보강

## DB Mapping
- `project_safety_flags`
  - `flag_type="product_safety"`:
    - `raw.safety_cert_required`
    - `raw.cert_match_count`
    - `raw.domestic_recall_count`
    - `raw.foreign_recall_count`
    - `raw.safety_search`
    - `raw.certifications[]`
    - `raw.domestic_recalls[]`
    - `raw.foreign_recalls[]`
  - `flag_type="recall"`:
    - `raw.notice_date`, `raw.source_record_id`, `raw.source`
    - `raw.defect_summary`, `raw.hazard_summary`, `raw.image_urls`
- `api_call_logs`
  - `api_key_name="safetykorea_recall"`
  - status mapping:
    - key missing -> `idle`
    - api error -> `error`
    - no match -> `empty`
    - matched -> `success`

## Additional Source URL Normalization
- Updated file: `src/lib/source-url.ts`
- Mapping added:
  - `safetykorea.kr/openapi/api/cert/*` -> `https://www.safetykorea.kr/release/openapi`
  - `safetykorea.kr/openapi/api/recall/*` -> `https://www.safetykorea.kr/release/openapi`

## API Registry Update
- Updated file: `src/lib/api-registry.ts`
- `safetykorea_recall.endpoint` changed to real endpoint:
  - `http://www.safetykorea.kr/openapi/api/recall/recallList.json`
- `sourceUrl` set to:
  - `https://www.safetykorea.kr/release/openapi`

## Validation
- Real call verified on 2026-04-28:
  - `recallList` returned `resultCode=2000` with data
  - `certificationList` returned `resultCode=2000` with data
  - `fRecallList` returned `resultCode=2000` with data
  - `recallDetail` returned `resultCode=2000` with data

## 2026-04-29 AuthKey Quote Handling
- `SAFETYKOREA_API_KEY` / `SAFETYKOREA_AUTH_KEY` now trims accidental wrapping quotes before sending the `AuthKey` header.
- Reason: SafetyKorea returns `resultCode=4000` when the header value includes literal `"` or `'` characters around the service ID.

## 2026-04-29 Supabase Edge HTTPS Handshake Handling
- Supabase Edge logs showed SafetyKorea HTTPS calls failing before HTTP response with `received fatal alert: HandshakeFailure`.
- The SafetyKorea interface guide specifies `http://www.safetykorea.kr/openapi/...` API URLs, so runtime API calls now use `http://` for KC/recall endpoints.
- Public source/navigation URLs remain normalized to the SafetyKorea OpenAPI page.

## 2026-04-29 Step5 Product Safety Search Form
- Step5 now exposes a dedicated `제품안전 조회 정보` form.
- Stored JSON path:
  - `project_products.components.safetySearch`
- If a project has no `project_products` row, Step5 can create a minimal product row from `productName` so SafetyKorea can run. HS/HSK-based strategic matching still requires Step2 product classification data.
- Stored shape:
  ```json
  {
    "productName": "제품명",
    "modelName": "모델명",
    "brandName": "브랜드명",
    "certNum": "KC 인증번호",
    "barcodeNum": "바코드",
    "updatedAt": "2026-04-29T00:00:00.000Z"
  }
  ```
- No database migration was added. Existing `components` JSON is preserved and only `safetySearch` is merged.
- 0건 result wording:
  - Do not express as safe.
  - Display as `입력 조건 기준 매칭 없음` / `SafetyKorea 조회 성공 · 입력 조건 기준 매칭 결과 없음`.

## 2026-04-29 Recall Final Match Filter
- `recallBrandName` requests remain as candidate collection only. A brand-only hit is not accepted as a recall match.
- Final domestic/foreign recall storage now requires one of:
  - model match or compatible partial model match
  - product-name/product-family match when no model was provided
  - KC certification number or barcode match when those identifiers are present in the returned record
- Brand match is stored only as supplemental evidence: `브랜드 보조 일치`.
- Brand-only candidates are excluded from `domestic_recalls[]`, `foreign_recalls[]`, and recall counts, with `excludedReason="브랜드만 일치하여 제외됨"`.
- If the final filter leaves zero recall rows, Step5 displays:
  - `입력한 제품명·모델명 기준으로 확인된 리콜 정보 없음`
  - `기관 확인 필요`

## 2026-05-01 Step5 Certification Detail Link Query Preservation
- Cause fixed: Step5 used report-text normalization for clickable SafetyKorea links, which stripped the required `certNum` query string from `https://www.safetykorea.kr/search/searchPop?certNum={...}`.
- Result: the browser opened `/search/searchPop` without `certNum`, so SafetyKorea displayed `인증정보가 존재하지 않습니다.`.
- Step5 now uses clickable-link URL normalization that preserves non-sensitive public query parameters and still removes sensitive key parameters such as `AuthKey`, `serviceKey`, `apiKey`, and `secret`.
- Report/body text normalization remains unchanged and continues to remove query strings from URLs.

## 2026-05-03 Step5 Recall Detail Link Repair
- Cause fixed: domestic recall candidates could point to the generic `https://www.safetykorea.kr/release/recall` or legacy `recallInfo/fRecallInfo` paths, which opened SafetyKorea's `경로를 확인 하시기 바랍니다.` page instead of the recall notice.
- Step5 now rebuilds recall detail links from the stored SafetyKorea `recordId`:
  - Domestic: `https://www.safetykorea.kr/recall/ajax/recallBoard?recallUid={recordId}`
  - Foreign: `https://www.safetykorea.kr/recall/ajax/fRecallBoard?recallUid={recordId}`
- `supabase/functions/safety-scan/index.ts` now stores the same public detail URLs for newly scanned SafetyKorea recall rows.
- Existing stored rows with stale `sourceUrl` values are repaired at render time when `recordId` is present.
