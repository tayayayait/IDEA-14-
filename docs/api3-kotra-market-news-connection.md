# API 3 Connection Note (KOTRA Overseas Market News)

Date: 2026-04-23
Updated: 2026-05-05

## Source Spec
- Dataset: 대한무역투자진흥공사_해외시장뉴스
- Service ID (guide): `IF_API_1001`
- Service name (eng): `ovseaMrktNews`
- Endpoint: `https://apis.data.go.kr/B410001/kotra_overseasMarketNews/ovseaMrktNews/ovseaMrktNews`

## Request Parameters Used
- `serviceKey` (required)
- `type=json` (runtime JSON response)
- `numOfRows=8~30` (by use-case)
- `pageNo=1`
- `search1=<country name/alias>` (country background news lookup; country-only)
- `search2=<product name/token>` (product/title news lookup)
- `search8=Y` (summary/keyword/body fields included for evidence enrichment)

## Search Field Alignment (2026-05-05)
- The public guide defines `search1` as country name and `search2` as news title.
- Runtime calls now keep those meanings separate:
  - country background news: `search1` receives only country aliases such as Korean name, English name, and compact country name.
  - product news: `search2` receives product/title terms such as product name, HS/HSK-derived product words, selected official-description tokens, and AI-expanded product terms.
- When the product name contains multiple model names, SKUs, options, components, or variants in any format, the raw composite name is not used as a primary `search2` query. The runtime first asks AI query expansion to infer representative product/title keywords from product name, HS/HSK, HS description, and product description. Deterministic fallback also removes obvious model/SKU-list noise and builds product-family terms such as `승용자동차`, `하이브리드 승용자동차`, `전기승용자동차`, `hybrid vehicle`, or `electric vehicle` when supported by HS/HSK and HS description context.
- Removed country compound searches from `search1`, including `country + product`, `country + HS`, and `country + export-environment term`.
- HS/HSK values are not sent through a dedicated HS parameter because the published API parameter list does not expose one for this endpoint. HS/HSK-derived words are used only as `search2` title/product terms.
- `search4`/`search7` date range, `search5` industry category, and `search6` hot clip are not applied in v1 because the recommendation flow has no stable user-selected date/industry/hot-clip policy yet.
- `search8=Y` is retained as an enrichment flag because it returns summary/keyword/body fields used in the evidence panel; it is not used as a search condition.

## Country Source Guard (2026-05-06)
- Product/title lookups through `search2` are not country-limited by the KOTRA API. They can return third-country articles when the title matches the product token.
- Saved evidence now treats the KOTRA response `natn` field as the source-country guard:
  - if `natn` matches the selected country, the article can become `selected_country_direct` when product/HS relevance also passes;
  - if `natn` is present and does not match the selected country, selected-country mentions in title, summary, keywords, or body are background only (`country:source_metadata_mismatch`);
  - if `natn` is blank, the existing title/summary/keyword/body country matching rules are used.
- This prevents third-country product news, such as a Russia gasoline article that only mentions the United States in the body, from being shown as selected-country direct news for the United States.

## Runtime Verification
Live call check on 2026-04-23:
- HTTP 200
- `response.header.resultCode=00`
- `response.body.itemList.item[]` returned (example country: 베트남)

## Response Mapping Used
Path: `response.body.itemList.item[]`

Mapped fields:
- `newsTitl` -> headline
- `kotraNewsUrl` -> source URL
- `cntntSumar` / `kwrd` / `newsBdt` -> evidence text + UI summary/keywords
- `othbcDt` -> publish date
- `natn` -> country name
- `newsWrterNm`, `infoCl`, `regn`, `bbstxSn` -> metadata in `raw`

## Text Normalization
- KOTRA news fields can include HTML entities such as `&#39;`, `&rsquo;`, `&middot;`, `&amp;`, and `&hellip;`.
- Edge Functions normalize newly saved `rationale.sources[]` news titles, summaries, countries, and keyword text through entity decoding before persistence.
- Step4 also decodes existing stored sidebar sources at display time so older rows do not expose raw entities in the evidence panel.

## Evidence Display Policy
- Step3 separates news evidence into:
  - `제품 직접 뉴스`: product, HS code, or strong product-keyword evidence
  - `산업 동향 뉴스`: product/industry-adjacent demand, supply, or technology trend evidence
  - `거시경제/수출환경 뉴스`: country-level exchange rate, economy, interest rate, inflation, trade policy, supply-chain, logistics, tariff, or import-demand evidence
- Step4 keeps the same `rationale.sources[]` source records and treats non-direct news as background evidence.
- Source type meaning:
  - `product_evidence` = direct product evidence
  - `news` / `country_background` = industry trend or macro export-environment background
- `project_countries.rationale.sources[]` for news rows now includes:
  - `summary`: brief normalized summary (`cntntSumar` fallback `newsBdt`)
  - `keywords`: normalized keyword array from `kwrd`
  - `score_relevant`: whether the row is score-relevant evidence

## Generic News Classification Rules (2026-04-26)
- Product-specific hardcoding has been removed. No item-specific synonym patch (e.g., textile/filter/HVAC only rules) is applied.
- News classification is now generic and uses product context from:
  - product name
  - product description
  - extracted tags
  - HS code (HS6/HS4)

### Categories
- `product_evidence`:
  - only direct product evidence
  - `score_relevant: true` when direct evidence conditions are satisfied
- `country_background` (and legacy `news`):
  - industry trend, country policy, tariff, fraud, payment, regulation, or macro export-environment background
  - `score_relevant: false`

### Direct Evidence Conditions
- One of the following must be true:
  - HS6 exact mention (or HS4 with product keyword support), or
  - multiple strong product-keyword matches with at least one product anchor token match, or
  - clear product name/use-case match in title/summary text.

### Product Anchor Token Rule (2026-04-27 update)
- Product anchor tokens are built from product name first (generic/weak terms excluded).
- If product-name anchors are unavailable, fallback anchors are built from the strongest relevance tokens.
- `product_evidence` promotion now requires anchor support for keyword-based direct evidence.
- `country_background` inclusion now requires both:
  - country match, and
  - minimum product anchor or HS signal.

### Exclusion Conditions (No Score Reflection)
- Broad generic-word-only matches are excluded from direct evidence. Examples:
  - `직물`, `소재`, `부품`, `기계`, `산업`, `제품`, `시장`
  - standalone generic English equivalents (`material`, `component`, `industry`, `product`, `market`, etc.)
- Culture/lifestyle news that only matches broad trends (e.g., food/drama/tourism) without product anchors is excluded.
- Country-level policy/tariff/compliance/fraud/payment trend news stays in `country_background`.
- Country-level macro export-environment news also stays in `country_background`.
- Non-direct news does not participate in candidate-country score boosting or `점수 반영` labeling.

### UI Label Rule
- `product_evidence` only -> `점수 반영`
- `country_background` / `news` -> `시장 배경`
- If no direct evidence exists, UI must show:
  - `제품 직접 근거 없음(확실한 정보 없음)`

## Recency and Selection Policy (2026-04-29)
- News freshness tiers:
  - `recent`: within last 1 year
  - `supplementary`: 1~5 years
  - `archive`: older than 5 years
- Selection policy is fixed and shared by Step3 recommendation and Step4 detail:
  - Per section/category, show up to 3 recent rows first.
  - Use supplementary rows only when recent rows are insufficient.
  - Archive rows are excluded from default sections and shown only as `archive_reference` (`과거 참고자료`).
- Product relevance guard:
  - Direct score evidence requires HS / product-name / anchor-keyword signals.
  - Country-only or generic industry rows without product signal are excluded from default evidence unless they are recent macro export-environment news.
  - Recent macro export-environment rows are included only as background evidence and never raise recommendation scores.

## Macro Export-Environment Policy (2026-05-05)
- Country news queries use country aliases only through `search1`.
- Macro/export-environment relevance is determined after API results are returned, not by placing export-environment terms into `search1`.
- A country news row can be included without product anchors only when:
  - the selected country is matched,
  - the row is `recent`, and
  - the text contains macro/export-environment signals.
- Macro/export-environment signal examples:
  - 경기 흐름, GDP, 경기 둔화/침체, PMI
  - 환율, 외환, 달러/유로, 통화 변동
  - 금리, 기준금리, 통화정책
  - 물가, 인플레이션, 소비자물가/생산자물가
  - 수입 수요, 내수, 구매력
  - 산업생산, 설비투자, 산업 투자
  - 공급망, 물류비, 해상운임, 항만, 통관
  - 관세, 수입규제, 수출규제, 무역정책, 반덤핑
- UI compatibility:
  - `news_category="geopolitical_risk"` is retained for existing records.
  - The Step3 UI renders this category as `거시경제/수출환경 뉴스`.
  - `selection_reason` may include `export_env:<keywords>` so the UI can show why the row was selected.

## AI News Relevance Review (2026-05-01)
- Scope:
  - KOTRA overseas market news remains the only news source in v1.
  - AI does not create sources and does not perform external web search.
  - AI only expands KOTRA API search terms and reclassifies API-returned candidate articles.
- Query expansion input:
  - product name
  - HS/HSK code
  - HS official name and product description/components/tags when available
  - selected country name/code
- Query field policy:
  - AI-expanded product queries are used only with `search2`.
  - AI-expanded country queries are filtered to country aliases only before `search1`.
- Product-context cleanup:
  - Search and judgement anchors are built from product name, HS/HSK code, HS official name, product description, and extracted component/tag tokens.
  - Sentence-fragment tokens such as `유통`, `구조`, `주요`, `특징`, `위해`, `등의`, `배경을`, `background`, and `structure` are excluded from product anchors.
- Candidate review output:
  - `direct_product`: article directly discusses the product, HS item, product use case, or direct supply/demand condition.
  - `adjacent_value_chain`: article is connected through concrete value-chain basis: `material`, `component`, `demand_channel`, `distribution_channel`, `regulation_certification`, or `logistics_customs`.
  - `broad_macro_export_env`: article affects national export conditions through GDP, demand, exchange rate, tariffs, interest rates, logistics cost, customs, consumer sentiment, purchasing power, or import demand.
  - `unrelated`: article has no defensible product, value-chain, or broad macro export-environment link.
- AI response fields:
  - `category`
  - `product_link_score`
  - `country_link_score`
  - `export_impact_score`
  - `basis`
  - `reject_reason`
- Product-family examples:
  - Stroller/baby goods: baby-products, child-safety, online baby retail, consumer spending, GDP, instant retail, tariffs, and import demand can pass; data centers, automotive events, biopharma, and generic plastics/chemical industry are blocked without product anchors.
  - Semiconductor: semiconductor strategy, memory, chip, server/data-center demand, wafer/foundry, and electronics supply-chain news can pass; food, textile, tourism, and unrelated consumer news are blocked.
  - Cosmetics: cosmetics, beauty, skin-care, labeling, ingredient, certification, and cosmetics regulation news can pass; biopharmaceutical drug deals, automotive, and data-center news are blocked.
  - Machinery/parts: article text must contain concrete machinery, equipment, component, automation, controller, motor, factory, or facility-investment linkage; generic immigration, residency, country-event, or broad investment articles are blocked.
- Fallback:
  - If `LOVABLE_API_KEY` and `GEMINI_API_KEY` are missing, or AI parsing/call fails, the existing deterministic rule classifier is used.
  - Rule evidence such as HS match, explicit product anchors, country match, and recency still constrains final exposure even when AI review succeeds.
- Final exposure policy:
  - `unrelated` is never shown in Step3/Step4 news evidence.
  - `direct_product` maps to `news_category="product_direct"`.
  - `adjacent_value_chain` maps to `news_category="industry_trend"`.
  - `broad_macro_export_env` maps to `news_category="geopolitical_risk"` and never becomes direct product evidence.
  - Legacy `adjacent_industry` and `macro_export_env` values are normalized to the new category names when old rows are read.

## Defensible Export-Fit Gate (2026-05-01)
- Step3 `recommend-country-news` and Step4 `country-detail` now share a final exposure gate before saving or rendering KOTRA market-news evidence.
- Allowed without product anchors:
  - broad country macro signals such as GDP, economic growth, exchange rate, inflation, interest rate, consumer demand, purchasing power, and import demand;
  - broad consumer/retail-channel shifts such as instant retail, retail-market digital transformation, e-commerce demand, and logistics changes.
- Allowed with concrete product value-chain basis:
  - `소재`, `부품`, `수요처`, `유통채널`, `규제/인증`, or `물류/통관` only when the article text names a product-family or use-case connection.
- Blocked without product anchors:
  - narrow unrelated industries such as data centers, satellites, semiconductors, automotive technology, biopharmaceuticals, drugs, cosmetics, tourism, culture, food, apparel, and textile;
  - generic export-hub or bonded-zone articles such as port/bonded-zone/cross-border e-commerce hub promotion unless the article itself includes product, HS, or concrete use-case anchors;
  - generic manufacturing/material/logistics claims such as “manufactured goods use plastic” or “there is a supply chain” without a product-family connection.
- Examples for stroller/HS 871500:
  - Keep: U.S. consumer spending pressure, China GDP/economic outlook, China instant-retail market growth, baby-products tariff/supply-chain news.
  - Drop: space data-center supply chain, Detroit automotive technology event, China biopharmaceutical license-out deals, generic Tianjin port/bonded-zone K-consumer-goods hub news.

## `rationale.sources[]` News Metadata
- News rows can carry the following optional fields:
  - `news_category`: `product_direct` | `geopolitical_risk` | `industry_trend` | `archive_reference`
  - `recency_tier`: `recent` | `supplementary` | `archive`
  - `selection_reason`: normalized reason string for why the row was selected
  - `impact_summary`: product-export impact summary (used primarily for `geopolitical_risk`)
  - `ai_category`: `direct_product` | `adjacent_value_chain` | `broad_macro_export_env` | `unrelated`
  - `ai_product_relevance_score`: 0~100 AI product relevance score
  - `ai_country_relevance_score`: 0~100 AI country relevance score
  - `ai_export_impact_score`: 0~100 AI export impact score
  - `ai_reason`: normalized short Korean reason shown in Step3/Step4 when present

## Code Integration
- `supabase/functions/country-detail/index.ts`
  - Added live KOTRA market news fetch by country.
  - Key resolution order: `KOTRA_API_KEY` -> `PUBLIC_DATA_API_KEY` -> `KICOX_API_KEY`.
  - Writes market-news rows into `project_risks` with `category="news"`.
  - Updates `project_countries.rationale.sources` with KOTRA news source links.
  - Logs API status into `api_call_logs` with `api_key_name="kotra_market_news"`.

## Current Scope
- This change only covers API #3 (해외시장뉴스).
- Certification/regulation/K-SURE detail APIs remain fallback unless their keys and mappings are connected.
