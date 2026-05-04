import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  assessCountryNewsMatch,
  assessNewsRelevance,
  buildExportImpactSummary,
  buildNewsRelevanceText,
  buildNewsSelectionReason,
  buildProductRelevanceTokens,
  classifyNewsForProductContext,
  classifyNewsCategory,
  classifyNewsRecency,
  COUNTRY_ALIAS_MAP,
  COUNTRY_NAME_BY_CODE,
  EXPORT_ENVIRONMENT_QUERY_TERMS,
  extractProductTokens,
  hasDefensibleProductExportFit,
  isWeakProductRelevanceToken,
  marketNewsSearchParam,
  newsCategoryFromAiAssessment,
  normalizeHsCode,
  parseProductMeta,
  selectNewsEvidence,
  type AiNewsCategory,
  type AiNewsRelevanceAssessment,
  type CountryNewsMatchType,
  type NewsCategory,
  type NewsRecencyTier,
  type SeedCountry,
} from "../_shared/recommendation.ts";

const KOTRA_MARKET_NEWS_ENDPOINT =
  "https://apis.data.go.kr/B410001/kotra_overseasMarketNews/ovseaMrktNews/ovseaMrktNews";
const KOTRA_NEWS_ARTICLE_PATH = "https://dream.kotra.or.kr/user/extra/kotranews/bbs/linkView/jsp/Page.do";
const GATEWAY_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";
const KOTRA_FETCH_TIMEOUT_MS = 6000;
const AI_FETCH_TIMEOUT_MS = 15000;
const KOTRA_QUERY_CONCURRENCY = 1;
const PRODUCT_NEWS_QUERY_LIMIT = 16;
const PRODUCT_NEWS_ROWS_PER_QUERY = 30;
const PRODUCT_BASE_QUERY_LIMIT = 14;
const PRODUCT_DIRECT_TOKEN_QUERY_LIMIT = 7;
const PRODUCT_HS_DESCRIPTION_QUERY_LIMIT = 6;
const PRODUCT_QUERY_HINT_LIMIT = 7;
const PRODUCT_HS_COMBINATION_TOKEN_LIMIT = 3;
const PRODUCT_AI_EXPANDED_QUERY_LIMIT = 12;
const COUNTRY_NEWS_QUERY_LIMIT = 20;
const COUNTRY_NEWS_ROWS_PER_QUERY = 20;
const COUNTRY_BASE_QUERY_LIMIT = 18;
const COUNTRY_SEARCH_ALIAS_LIMIT = 3;
const COUNTRY_PRODUCT_KEYWORD_QUERY_LIMIT = 3;
const COUNTRY_STRONG_TOKEN_QUERY_LIMIT = 4;
const COUNTRY_HS_DESCRIPTION_QUERY_LIMIT = 3;
const COUNTRY_EXPORT_ENV_QUERY_LIMIT = 8;
const COUNTRY_AI_EXPANDED_QUERY_LIMIT = 14;
const AI_NEWS_REVIEW_CANDIDATE_LIMIT = 60;
const NEWS_EVIDENCE_PER_CATEGORY_LIMIT = 6;
const COUNTRY_BACKGROUND_FALLBACK_LIMIT = 5;
const ARTICLE_BODY_MAX_LENGTH = 12000;
const ARTICLE_BODY_FETCH_CONCURRENCY = 2;
const ARTICLE_BODY_MIN_USEFUL_LENGTH = 300;
const COUNTRY_EXPORT_NEWS_TERMS = [
  "소비",
  "소매",
  "수입 수요",
  "물류",
  "관세",
  "통관",
  "retail",
  "consumer demand",
  "import demand",
  "logistics",
  "customs",
  "tariff",
] as const;

const COUNTRY_NEWS_QUERY: Record<string, string[]> = {
  AE: ["United Arab Emirates", "UAE", "아랍에미리트"],
  BR: ["Brazil", "브라질"],
  CN: ["China", "중국"],
  DE: ["Germany", "Deutschland", "독일"],
  ID: ["Indonesia", "인도네시아"],
  IN: ["India", "인도"],
  JP: ["Japan", "일본"],
  MX: ["Mexico", "멕시코"],
  MY: ["Malaysia", "말레이시아"],
  PL: ["Poland", "폴란드"],
  TH: ["Thailand", "태국"],
  TR: ["Turkey", "Turkiye", "튀르키예", "터키"],
  US: ["United States", "USA", "미국"],
  VN: ["Vietnam", "베트남"],
};

type ProductContext = {
  name: string;
  description: string;
  hsCode: string;
  hskCode: string;
  hsDescription: string;
  tokens: string[];
  relevanceTokens: string[];
  tags: string[];
};

type KotraNewsItem = {
  newsTitl: string;
  kotraNewsUrl: string;
  cntntSumar: string;
  kwrd: string;
  newsBdt: string;
  othbcDt: string;
  natn: string;
  regn: string;
  bbstxSn: string;
};

type KotraNewsResult = {
  ok: boolean;
  status: number | null;
  message: string;
  query: string;
  queryCount: number;
  items: KotraNewsItem[];
};

type RationaleSource = {
  type?: string;
  title: string;
  url: string;
  country?: string;
  published_at?: string | null;
  summary?: string;
  article_body?: string;
  article_body_truncated?: boolean;
  article_body_original_length?: number;
  keywords?: string[];
  score_relevant?: boolean;
  news_category?: NewsCategory;
  recency_tier?: NewsRecencyTier;
  selection_reason?: string;
  impact_summary?: string;
  country_match_type?: CountryNewsMatchType;
  news_scope?: NewsScope;
  ai_category?: AiNewsCategory;
  ai_product_relevance_score?: number;
  ai_country_relevance_score?: number;
  ai_export_impact_score?: number;
  ai_reason?: string;
};

type NewsScope =
  | "selected_country_direct"
  | "selected_country_export_env"
  | "selected_country_industry"
  | "supply_chain_reference"
  | "archive_reference";

type NewsEvidenceCandidate = {
  type: "product_evidence" | "country_background";
  item: KotraNewsItem;
  publishedAt: string | null;
  recencyTier: NewsRecencyTier;
  newsCategory: NewsCategory;
  newsScope: NewsScope;
  selectionReason: string;
  impactSummary: string;
  scoreRelevant: boolean;
  countryMatchType: CountryNewsMatchType;
  ai: AiNewsRelevanceAssessment;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = asRecord(await req.json().catch(() => ({})));
    const projectId = asText(body.project_id);
    const countryCode = asText(body.country_code).toUpperCase();
    if (!projectId) return json({ state: "error", error: "project_id required" }, 400);
    if (!countryCode) return json({ state: "error", error: "country_code required" }, 400);

    const auth = req.headers.get("Authorization") ?? "";
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });

    const { data: userData } = await supa.auth.getUser();
    if (!userData.user) return json({ state: "error", error: "unauthorized" }, 401);

    const [{ data: productRow, error: productError }, { data: countryRow, error: countryError }] = await Promise.all([
      supa
        .from("project_products")
        .select("name,description,hs_code,hsk_code,hs_candidates,components")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supa
        .from("project_countries")
        .select("country_code,country_name,rationale")
        .eq("project_id", projectId)
        .eq("country_code", countryCode)
        .maybeSingle(),
    ]);

    if (productError) return json({ state: "error", error: productError.message }, 500);
    if (countryError) return json({ state: "error", error: countryError.message }, 500);
    if (!countryRow) return json({ state: "error", error: "country row not found" }, 404);

    const product = buildProductContext(productRow as Record<string, unknown> | null);
    const countryName = asText((countryRow as Record<string, unknown>).country_name) ||
      COUNTRY_NAME_BY_CODE[countryCode] ||
      countryCode;
    const country = { code: countryCode, name: countryName } satisfies SeedCountry;
    const kotraKey = resolveKotraKey();
    if (!kotraKey) return json({ state: "error", error: "KOTRA API key is missing" }, 500);

    const expandedQueries = await expandNewsQueriesWithAi(product, country);
    const [productNewsResult, countryNewsResult] = await Promise.all([
      fetchProductNewsDataset(product, kotraKey, expandedQueries.product),
      fetchCountryMarketNews(country, kotraKey, product, expandedQueries.country),
    ]);

    const productNewsItems = filterProductNewsForCountry(productNewsResult.items, country, product);
    const aiReviews = await reviewNewsCandidatesWithAi(product, country, [
      ...productNewsItems,
      ...countryNewsResult.items,
    ]);
    const newsSources = await buildNewsEvidenceSources({
      product,
      country,
      productNewsItems,
      countryNewsItems: countryNewsResult.items,
      aiReviews,
    });

    const existingRationale = asRecord((countryRow as Record<string, unknown>).rationale);
    const existingSources = normalizeRationaleSources(existingRationale.sources);
    const nextSources = replaceNewsEvidenceSources(existingSources, newsSources);
    const nextRationale = {
      ...existingRationale,
      sources: dedupeSources(nextSources),
    };

    const { error: updateError } = await supa
      .from("project_countries")
      .update({
        rationale: nextRationale,
      })
      .eq("project_id", projectId)
      .eq("country_code", countryCode);

    if (updateError) return json({ state: "error", error: updateError.message }, 500);

    const status = newsSources.some((source) => source.url) ? "success" : "empty";
    await supa.from("api_call_logs").insert({
      user_id: userData.user.id,
      project_id: projectId,
      api_key_name: "recommend_country_news",
      status,
      http_status: productNewsResult.status ?? countryNewsResult.status ?? null,
      response_count: newsSources.length,
      error_code: status === "empty" ? "news_evidence_empty" : null,
      detail: {
        country_code: countryCode,
        product_query: productNewsResult.query,
        country_query: countryNewsResult.query,
        product_query_count: productNewsResult.queryCount,
        country_query_count: countryNewsResult.queryCount,
        ai_expanded_product_query: expandedQueries.product.join(", "),
        ai_expanded_country_query: expandedQueries.country.join(", "),
        ai_review_candidate_limit: AI_NEWS_REVIEW_CANDIDATE_LIMIT,
        news_evidence_per_category_limit: NEWS_EVIDENCE_PER_CATEGORY_LIMIT,
        country_background_fallback_limit: COUNTRY_BACKGROUND_FALLBACK_LIMIT,
        product_candidate_count: productNewsResult.items.length,
        country_candidate_count: countryNewsResult.items.length,
        product_filtered_candidate_count: productNewsItems.length,
        product_item_count: productNewsResult.items.length,
        country_item_count: countryNewsResult.items.length,
      },
      message: `news_sources=${newsSources.length}, product_ok=${productNewsResult.ok}, country_ok=${countryNewsResult.ok}`,
    });

    return json({
      state: status,
      message: status === "success"
        ? `${countryName} news evidence generated.`
        : `${countryName} news evidence generated with no direct matched article.`,
      country_code: countryCode,
      source_count: newsSources.length,
    });
  } catch (error) {
    return json({ state: "error", error: error instanceof Error ? error.message : "unknown" }, 500);
  }
});

async function fetchProductNewsDataset(
  product: ProductContext,
  key: string,
  expandedQueries: string[] = [],
): Promise<KotraNewsResult> {
  const queries = dedupeQueryTerms([...buildProductNewsQueries(product), ...expandedQueries]).slice(0, PRODUCT_NEWS_QUERY_LIMIT);
  if (queries.length === 0) return { ok: true, status: 200, message: "No query terms", query: "", queryCount: 0, items: [] };

  const results = await mapWithConcurrency(
    queries,
    KOTRA_QUERY_CONCURRENCY,
    (query) => fetchKotraNewsByQuery(query, key, PRODUCT_NEWS_ROWS_PER_QUERY, marketNewsSearchParam("product")),
  );
  return mergeNewsResults(results, queries);
}

function buildProductNewsQueries(product: ProductContext): string[] {
  const out: string[] = [];
  const pushQuery = (value: string) => {
    const cleaned = value.replace(/\s+/g, " ").trim();
    if (!cleaned || cleaned.length < 2 || out.includes(cleaned)) return;
    out.push(cleaned);
  };

  const isKorean = (token: string) => /[\uAC00-\uD7AF]/.test(token);
  const directTerms = product.relevanceTokens
    .filter((token) => !isWeakProductRelevanceToken(token))
    .filter((token) => !/^\d{4,}$/.test(token))
    .filter((token) => token.length >= 3 || token.includes(" ") || (token.length === 2 && isKorean(token)));
  const queryHints = buildProductQueryHints(product);

  if (product.name && product.name !== "N/A") pushQuery(product.name);
  for (const token of directTerms.slice(0, PRODUCT_DIRECT_TOKEN_QUERY_LIMIT)) pushQuery(token);
  if (product.hsCode.length >= 6) pushQuery(product.hsCode.slice(0, 6));
  pushHsProductCombinationQueries(product, directTerms, pushQuery);
  if (product.hsDescription) {
    const descTokens = product.hsDescription
      .split(/[\s/·,()]+/g)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2 && !isWeakProductRelevanceToken(token) && !/^\d{4,}$/.test(token));
    for (const token of descTokens.slice(0, PRODUCT_HS_DESCRIPTION_QUERY_LIMIT)) pushQuery(token);
  }
  for (const hint of queryHints.slice(0, PRODUCT_QUERY_HINT_LIMIT)) pushQuery(hint);
  return out.slice(0, PRODUCT_BASE_QUERY_LIMIT);
}

function pushHsProductCombinationQueries(
  product: ProductContext,
  directTerms: string[],
  pushQuery: (value: string) => void,
): void {
  const hs4 = product.hsCode.slice(0, 4);
  if (hs4.length !== 4) return;
  for (const token of directTerms.slice(0, PRODUCT_HS_COMBINATION_TOKEN_LIMIT)) {
    pushQuery(`${hs4} ${token}`);
  }
}

function buildProductQueryHints(product: ProductContext): string[] {
  const context = [
    product.name,
    product.description,
    product.hsDescription,
    product.hsCode,
    ...product.relevanceTokens,
    ...product.tags,
  ].join(" ").toLowerCase();
  const hints: string[] = [];
  const add = (...values: string[]) => hints.push(...values);
  if (/8541|8542|semiconductor|memory|dram|nand|chip|반도체|메모리/.test(context)) {
    add("semiconductor", "chip", "memory", "data center");
  }
  if (/330|cosmetic|beauty|skin care|skincare|화장품|뷰티|스킨케어/.test(context)) {
    add("cosmetics", "beauty", "skin care", "cosmetics regulation");
  }
  if (/8715|stroller|baby|infant|childcare|유모차|유아|영유아/.test(context)) {
    add("stroller", "baby products", "유아용품", "online baby");
  }
  if (/84|automation|servo|motor|controller|machine|machinery|기계|자동화|모터/.test(context)) {
    add("automation", "industrial equipment", "servo motor", "controller");
  }
  if (/870[1-8]|automotive|vehicle|brake|electric vehicle|자동차|차량|전기차/.test(context) && !/8715/.test(context)) {
    add("automotive", "vehicle parts", "mobility");
  }
  return dedupeQueryTerms(hints);
}

async function fetchCountryMarketNews(
  country: SeedCountry,
  key: string,
  product: ProductContext,
  expandedQueries: string[] = [],
): Promise<KotraNewsResult> {
  const queries = dedupeQueryTerms([...buildCountryNewsQueries(country, product), ...expandedQueries]).slice(0, COUNTRY_NEWS_QUERY_LIMIT);
  if (queries.length === 0) return { ok: true, status: 200, message: "No query terms", query: "", queryCount: 0, items: [] };

  const results = await mapWithConcurrency(
    queries,
    KOTRA_QUERY_CONCURRENCY,
    (query) => fetchKotraNewsByQuery(query, key, COUNTRY_NEWS_ROWS_PER_QUERY, marketNewsSearchParam("country")),
  );
  return mergeNewsResults(results, queries);
}

function buildCountryNewsQueries(country: SeedCountry, product: ProductContext): string[] {
  const countryAliases: string[] = [];
  for (const alias of COUNTRY_ALIAS_MAP[country.code] ?? []) {
    const cleaned = alias.trim();
    if (cleaned) countryAliases.push(cleaned);
  }
  for (const query of COUNTRY_NEWS_QUERY[country.code] ?? []) {
    const cleaned = query.trim();
    if (cleaned && !countryAliases.includes(cleaned)) countryAliases.push(cleaned);
  }
  const compactName = country.name.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  if (compactName && !countryAliases.includes(compactName)) countryAliases.push(compactName);
  const countrySearchAliases = selectCountrySearchAliases(countryAliases, compactName);
  const primaryAlias = countrySearchAliases[0] ?? compactName;

  const productKeywords: string[] = [];
  if (product.name && product.name !== "N/A") productKeywords.push(product.name);
  const strongTokens = product.relevanceTokens
    .filter((token) => !isWeakProductRelevanceToken(token) && !/^\d{4,}$/.test(token) && token.length >= 2)
    .slice(0, COUNTRY_STRONG_TOKEN_QUERY_LIMIT);
  for (const token of strongTokens) {
    if (!productKeywords.includes(token)) productKeywords.push(token);
  }
  if (product.hsDescription) {
    const descParts = product.hsDescription
      .split(/[\s/·,()]+/g)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2 && !isWeakProductRelevanceToken(token) && !/^\d{4,}$/.test(token));
    productKeywords.push(...descParts.slice(0, COUNTRY_HS_DESCRIPTION_QUERY_LIMIT));
  }

  const out: string[] = [];
  const pushQuery = (value: string) => {
    const cleaned = value.replace(/\s+/g, " ").trim();
    if (!cleaned || cleaned.length < 2 || out.includes(cleaned)) return;
    out.push(cleaned);
  };

  for (const alias of countrySearchAliases) {
    for (const keyword of productKeywords.slice(0, COUNTRY_PRODUCT_KEYWORD_QUERY_LIMIT)) pushQuery(`${alias} ${keyword}`);
    if (product.hsCode.length >= 6) pushQuery(`${alias} ${product.hsCode.slice(0, 6)}`);
  }
  for (const alias of countrySearchAliases) pushQuery(alias);
  for (const alias of countrySearchAliases) {
    for (const term of EXPORT_ENVIRONMENT_QUERY_TERMS.slice(0, COUNTRY_EXPORT_ENV_QUERY_LIMIT)) pushQuery(`${alias} ${term}`);
  }
  for (const term of COUNTRY_EXPORT_NEWS_TERMS) pushQuery(`${primaryAlias} ${term}`);
  return out.slice(0, COUNTRY_BASE_QUERY_LIMIT);
}

function selectCountrySearchAliases(countryAliases: string[], compactName: string): string[] {
  const koreanAlias = countryAliases.find((alias) => /[\uAC00-\uD7AF]/.test(alias));
  const englishAlias = countryAliases.find((alias) => /[A-Za-z]/.test(alias));
  return dedupeQueryTerms([
    koreanAlias ?? "",
    englishAlias ?? "",
    compactName,
    ...countryAliases,
  ]).slice(0, COUNTRY_SEARCH_ALIAS_LIMIT);
}

async function expandNewsQueriesWithAi(
  product: ProductContext,
  country: SeedCountry,
): Promise<{ product: string[]; country: string[] }> {
  const fallback = buildFallbackExpandedNewsQueries(product, country);
  if (!hasAiKey()) return fallback;

  const systemPrompt = [
    "You expand KOTRA market-news search queries for export evidence.",
    "Return strict JSON only.",
    "Use KOTRA API as the only news source; do not invent articles.",
    "Keep queries short and searchable.",
    "Include direct product terms, HS names, product-family terms, and country export-environment terms.",
    "Do not add unrelated narrow industries unless they are part of the product context.",
    "Schema: {\"product_queries\":[\"...\"],\"country_queries\":[\"...\"]}",
  ].join(" ");
  const userPrompt = [
    `Product: ${product.name}`,
    `Description: ${product.description}`,
    `HS: ${product.hsCode || "N/A"}`,
    `HSK: ${product.hskCode || "N/A"}`,
    `HS description: ${product.hsDescription || "N/A"}`,
    `Tags: ${product.tags.join(", ") || "N/A"}`,
    `Country: ${country.name}(${country.code})`,
    "Return product queries for direct/adjacent product evidence and country queries for macro export-environment evidence.",
  ].join("\n");

  try {
    const aiText = await callAiJson(systemPrompt, userPrompt);
    const parsed = asRecord(JSON.parse(aiText));
    return {
      product: dedupeQueryTerms([
        ...fallback.product,
        ...asArray(parsed.product_queries).map(asText),
      ]).slice(0, PRODUCT_AI_EXPANDED_QUERY_LIMIT),
      country: dedupeQueryTerms([
        ...fallback.country,
        ...asArray(parsed.country_queries).map(asText),
      ]).slice(0, COUNTRY_AI_EXPANDED_QUERY_LIMIT),
    };
  } catch {
    return fallback;
  }
}

function buildFallbackExpandedNewsQueries(
  product: ProductContext,
  country: SeedCountry,
): { product: string[]; country: string[] } {
  const terms = product.relevanceTokens
    .filter((token) => !isWeakProductRelevanceToken(token))
    .filter((token) => !/^\d{4,}$/.test(token))
    .slice(0, PRODUCT_DIRECT_TOKEN_QUERY_LIMIT);
  const countryName = country.name.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const hints = buildProductQueryHints(product);
  return {
    product: dedupeQueryTerms([
      product.name,
      product.hsDescription,
      ...terms,
      ...hints,
    ]).slice(0, PRODUCT_AI_EXPANDED_QUERY_LIMIT),
    country: dedupeQueryTerms([
      ...terms.slice(0, COUNTRY_PRODUCT_KEYWORD_QUERY_LIMIT).map((term) => `${countryName} ${term}`),
      ...hints.slice(0, 3).map((term) => `${countryName} ${term}`),
      ...COUNTRY_EXPORT_NEWS_TERMS.map((term) => `${countryName} ${term}`),
    ]).slice(0, COUNTRY_AI_EXPANDED_QUERY_LIMIT),
  };
}

async function reviewNewsCandidatesWithAi(
  product: ProductContext,
  country: SeedCountry,
  items: KotraNewsItem[],
): Promise<Map<string, AiNewsRelevanceAssessment>> {
  const uniqueItems = dedupeNewsItems(items).slice(0, AI_NEWS_REVIEW_CANDIDATE_LIMIT);
  const fallback = new Map<string, AiNewsRelevanceAssessment>();
  for (const item of uniqueItems) {
    fallback.set(newsKey(item), fallbackAiNewsAssessment(product, item));
  }
  if (!hasAiKey() || uniqueItems.length === 0) return fallback;

  const systemPrompt = [
    "You classify KOTRA market-news candidates for product export analysis.",
    "Return strict JSON only.",
    "Do not create or cite articles not provided in candidates.",
    "Classify each candidate as direct_product, adjacent_value_chain, broad_macro_export_env, or unrelated.",
    "Your category and scores are the final product/export relevance decision for saving or rejecting each candidate.",
    "direct_product includes exact_product, product_family, or hs_family evidence.",
    "Use direct_product when the article covers product market, demand, imports, regulation, certification, sales, or product-use evidence for the product name, HS/HSK family, or inferred product family.",
    "adjacent_value_chain basis must be component, material, demand_channel, distribution_channel, regulation_certification, or logistics_customs.",
    "Generic manufacturing, generic plastics, generic logistics, or a different narrow industry is unrelated unless tied to the product context.",
    "broad_macro_export_env is allowed for national export conditions such as GDP, demand, exchange rates, tariffs, customs, logistics cost, consumer sentiment, purchasing power, or import demand.",
    "Schema: {\"articles\":[{\"id\":\"...\",\"category\":\"direct_product\",\"product_link_score\":0,\"country_link_score\":0,\"export_impact_score\":0,\"basis\":\"exact_product|product_family|hs_family|component|material|demand_channel|distribution_channel|regulation_certification|logistics_customs|macro|none\",\"reject_reason\":\"...\"}]}",
  ].join(" ");
  const payload = uniqueItems.map((item, index) => ({
    id: String(index),
    title: item.newsTitl,
    summary: item.cntntSumar,
    keywords: item.kwrd,
    body_excerpt: stripHtml(item.newsBdt).slice(0, 900),
    country_metadata: [item.natn, item.regn].filter(Boolean).join(" / "),
    published_at: item.othbcDt,
  }));
  const userPrompt = [
    `Product: ${product.name}`,
    `Description: ${product.description}`,
    `HS: ${product.hsCode || "N/A"}`,
    `HSK: ${product.hskCode || "N/A"}`,
    `HS description: ${product.hsDescription || "N/A"}`,
    `Selected country: ${country.name}(${country.code})`,
    `Candidates: ${JSON.stringify(payload)}`,
  ].join("\n");

  try {
    const aiText = await callAiJson(systemPrompt, userPrompt);
    const parsed = asRecord(JSON.parse(aiText));
    const articles = asArray(parsed.articles);
    for (const row of articles) {
      const record = asRecord(row);
      const index = Number(asText(record.id));
      const item = Number.isInteger(index) ? uniqueItems[index] : null;
      if (!item) continue;
      fallback.set(newsKey(item), normalizeAiAssessment(record, fallback.get(newsKey(item))));
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function fallbackAiNewsAssessment(product: ProductContext, item: KotraNewsItem): AiNewsRelevanceAssessment {
  return classifyNewsForProductContext({
    productName: product.name,
    hsCode: product.hsCode,
    title: item.newsTitl,
    summary: item.cntntSumar,
    keywords: item.kwrd,
    body: item.newsBdt,
    tokens: product.relevanceTokens,
  });
}

async function callAiJson(systemPrompt: string, userPrompt: string): Promise<string> {
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  if (lovableApiKey) {
    const response = await fetchWithTimeout(GATEWAY_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    }, AI_FETCH_TIMEOUT_MS);

    if (!response.ok) throw new Error(`AI ${response.status}`);
    const data = await response.json();
    return asText(data.choices?.[0]?.message?.content) || "{}";
  }

  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiApiKey) throw new Error("LOVABLE_API_KEY or GEMINI_API_KEY missing");

  const geminiModel = Deno.env.get("GEMINI_MODEL") ?? "gemini-3-flash-preview";
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${geminiApiKey}`;
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  }, AI_FETCH_TIMEOUT_MS);

  if (!response.ok) throw new Error(`Gemini ${response.status}`);
  const data = await response.json();
  return asText(data.candidates?.[0]?.content?.parts?.[0]?.text) || "{}";
}

async function fetchKotraNewsByQuery(
  query: string,
  key: string,
  numOfRows: number,
  searchParam: "search1" | "search2",
): Promise<KotraNewsResult> {
  const url = new URL(KOTRA_MARKET_NEWS_ENDPOINT);
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("_type", "json");
  url.searchParams.set("numOfRows", String(numOfRows));
  url.searchParams.set("pageNo", "1");
  url.searchParams.set(searchParam, query);
  url.searchParams.set("search8", "Y");

  const result = await fetchTextWithTimeout(url.toString(), KOTRA_FETCH_TIMEOUT_MS);
  if (!result.ok) return { ok: false, status: result.status, message: result.message, query, queryCount: 1, items: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.text);
  } catch {
    return { ok: false, status: result.status, message: "Invalid JSON response", query, queryCount: 1, items: [] };
  }

  const responseRoot = asRecord(asRecord(parsed).response);
  const header = asRecord(responseRoot.header);
  const resultCode = asText(header.resultCode);
  const resultMsg = asText(header.resultMsg);
  if (resultCode && resultCode !== "00") {
    return { ok: false, status: result.status, message: `${resultCode}${resultMsg ? ` ${resultMsg}` : ""}`, query, queryCount: 1, items: [] };
  }

  const items = asArray(asRecord(asRecord(responseRoot.body).itemList).item)
    .map(normalizeNewsItem)
    .filter((item) => item.newsTitl || item.bbstxSn);
  return { ok: true, status: result.status, message: resultMsg || "NO ERROR", query, queryCount: 1, items };
}

function mergeNewsResults(results: KotraNewsResult[], queries: string[]): KotraNewsResult {
  const allItems: KotraNewsItem[] = [];
  let firstError: KotraNewsResult | null = null;
  let lastOkStatus: number | null = null;
  for (const result of results) {
    if (!result.ok) {
      if (!firstError) firstError = result;
      continue;
    }
    lastOkStatus = result.status;
    allItems.push(...result.items);
  }
  if (allItems.length === 0 && firstError) {
    return { ...firstError, query: queries.join(", "), queryCount: queries.length };
  }
  return {
    ok: true,
    status: lastOkStatus ?? 200,
    message: "NO ERROR",
    query: queries.join(", "),
    queryCount: queries.length,
    items: dedupeNewsItems(allItems),
  };
}

function filterProductNewsForCountry(items: KotraNewsItem[], country: SeedCountry, product: ProductContext): KotraNewsItem[] {
  const out: KotraNewsItem[] = [];
  for (const item of items) {
    const relevanceText = buildNewsRelevanceText({
      title: item.newsTitl,
      summary: item.cntntSumar,
      keywords: item.kwrd,
      body: item.newsBdt,
    });
    const relevance = assessNewsRelevance({
      text: relevanceText,
      tokens: product.relevanceTokens,
      hsCode: product.hsCode,
      productName: product.name,
    });
    if (!relevance.isDirectEvidence) continue;
    const countryMatch = assessCountryNewsMatch({
      countryCode: country.code,
      title: item.newsTitl,
      summary: item.cntntSumar,
      keywords: item.kwrd,
      body: item.newsBdt,
      natn: item.natn,
      regn: item.regn,
    });
    if (countryMatch.type !== "mismatch") out.push(item);
  }
  return dedupeNewsItems(out);
}

async function buildNewsEvidenceSources(params: {
  product: ProductContext;
  country: SeedCountry;
  productNewsItems: KotraNewsItem[];
  countryNewsItems: KotraNewsItem[];
  aiReviews: Map<string, AiNewsRelevanceAssessment>;
}): Promise<RationaleSource[]> {
  const candidates: NewsEvidenceCandidate[] = [];
  const addCandidate = (item: KotraNewsItem) => {
    const relevanceText = buildNewsRelevanceText({
      title: item.newsTitl,
      summary: item.cntntSumar,
      keywords: item.kwrd,
      body: item.newsBdt,
    });
    const relevance = assessNewsRelevance({
      text: relevanceText,
      tokens: params.product.relevanceTokens,
      hsCode: params.product.hsCode,
      productName: params.product.name,
    });
    const countryMatch = assessCountryNewsMatch({
      countryCode: params.country.code,
      title: item.newsTitl,
      summary: item.cntntSumar,
      keywords: item.kwrd,
      body: item.newsBdt,
      natn: item.natn,
      regn: item.regn,
    });
    if (countryMatch.type === "mismatch") return;
    const recencyTier = classifyNewsRecency(item.othbcDt);
    const ruleCategory = classifyNewsCategory({
      title: item.newsTitl,
      summary: item.cntntSumar,
      keywords: item.kwrd,
      recencyTier,
      isProductDirect: countryMatch.type === "direct_country" && relevance.isDirectEvidence,
      relevance,
    });
    const ai = params.aiReviews.get(newsKey(item)) ?? fallbackAiNewsAssessment(params.product, item);
    const isProductDirect = countryMatch.type === "direct_country" &&
      (ai.category === "direct_product" || relevance.isDirectEvidence);
    const aiNewsCategory = newsCategoryFromAiAssessment(ai, ruleCategory);
    if (!aiNewsCategory) return;
    const newsCategory = aiNewsCategory === "product_direct" && !isProductDirect
      ? "industry_trend"
      : aiNewsCategory;
    if (!hasDefensibleProductExportFit({
      productName: params.product.name,
      hsCode: params.product.hsCode,
      text: relevanceText,
      relevance,
      aiAssessment: ai,
      recencyTier,
      newsCategory,
    })) return;

    const type: "product_evidence" | "country_background" = newsCategory === "product_direct"
      ? "product_evidence"
      : "country_background";
    candidates.push({
      type,
      item,
      publishedAt: normalizePublishedDate(item.othbcDt),
      recencyTier,
      newsCategory,
      newsScope: resolveNewsScope(newsCategory, type, countryMatch.type),
      selectionReason: `${buildNewsSelectionReason(recencyTier, newsCategory, relevance, relevanceText)}|${countryMatch.reason}`,
      impactSummary: buildExportImpactSummary({
        title: item.newsTitl,
        summary: item.cntntSumar,
        productName: params.product.name,
        category: newsCategory,
      }),
      scoreRelevant: type === "product_evidence" && countryMatch.type === "direct_country" && recencyTier !== "archive",
      countryMatchType: countryMatch.type,
      ai,
    });
  };

  for (const item of dedupeNewsItems(params.productNewsItems)) addCandidate(item);
  for (const item of dedupeNewsItems(params.countryNewsItems)) addCandidate(item);

  const selectedNews = selectNewsEvidence({ items: candidates, perCategoryLimit: NEWS_EVIDENCE_PER_CATEGORY_LIMIT });
  const selectedEvidence = [
    ...selectedNews.productDirect,
    ...selectedNews.geopoliticalRisk,
    ...selectedNews.industryTrend,
    ...selectedNews.archiveReference,
  ];

  const articleBodyByKey = await fetchArticleBodiesForSelectedEvidence(selectedEvidence);
  const sources = selectedEvidence.map((evidence): RationaleSource => {
    const articleBody = buildNewsArticleBody(evidence.item, articleBodyByKey.get(newsKey(evidence.item)));
    return {
      type: evidence.type,
      title: cleanText(evidence.item.newsTitl || "KOTRA Overseas Market News"),
      url: toPublicNewsUrl(evidence.item.kotraNewsUrl, evidence.item.bbstxSn),
      country: params.country.name,
      published_at: evidence.publishedAt,
      summary: buildNewsSourceSummary(evidence.item),
      article_body: articleBody.body,
      article_body_truncated: articleBody.truncated,
      article_body_original_length: articleBody.originalLength,
      keywords: parseKeywordList(evidence.item.kwrd),
      score_relevant: evidence.scoreRelevant,
      news_category: evidence.newsCategory,
      news_scope: evidence.newsScope,
      recency_tier: evidence.recencyTier,
      selection_reason: evidence.selectionReason,
      impact_summary: evidence.impactSummary || undefined,
      country_match_type: evidence.countryMatchType,
      ai_category: evidence.ai.category,
      ai_product_relevance_score: evidence.ai.productRelevanceScore,
      ai_country_relevance_score: evidence.ai.countryRelevanceScore,
      ai_export_impact_score: evidence.ai.exportImpactScore,
      ai_reason: evidence.ai.reason,
    };
  });

  if (sources.length > 0) return dedupeSources(sources);
  return dedupeSources(await buildCountryBackgroundFallbackSources(params));
}

async function buildCountryBackgroundFallbackSources(params: {
  product: ProductContext;
  country: SeedCountry;
  countryNewsItems: KotraNewsItem[];
  aiReviews: Map<string, AiNewsRelevanceAssessment>;
}): Promise<RationaleSource[]> {
  const candidates: NewsEvidenceCandidate[] = [];

  for (const item of dedupeNewsItems(params.countryNewsItems)) {
    const relevanceText = buildNewsRelevanceText({
      title: item.newsTitl,
      summary: item.cntntSumar,
      keywords: item.kwrd,
      body: item.newsBdt,
    });
    const relevance = assessNewsRelevance({
      text: relevanceText,
      tokens: params.product.relevanceTokens,
      hsCode: params.product.hsCode,
      productName: params.product.name,
    });
    const countryMatch = assessCountryNewsMatch({
      countryCode: params.country.code,
      title: item.newsTitl,
      summary: item.cntntSumar,
      keywords: item.kwrd,
      body: item.newsBdt,
      natn: item.natn,
      regn: item.regn,
    });
    if (countryMatch.type === "mismatch") continue;

    const recencyTier = classifyNewsRecency(item.othbcDt);
    const newsCategory = classifyNewsCategory({
      title: item.newsTitl,
      summary: item.cntntSumar,
      keywords: item.kwrd,
      recencyTier,
      isProductDirect: false,
      relevance,
    });
    const ai = params.aiReviews.get(newsKey(item)) ?? fallbackAiNewsAssessment(params.product, item);
    if (!hasDefensibleProductExportFit({
      productName: params.product.name,
      hsCode: params.product.hsCode,
      text: relevanceText,
      relevance,
      aiAssessment: ai,
      recencyTier,
      newsCategory,
    })) continue;

    candidates.push({
      type: "country_background",
      item,
      publishedAt: normalizePublishedDate(item.othbcDt),
      relevance,
      recencyTier,
      newsCategory,
      newsScope: resolveNewsScope(newsCategory, "country_background", countryMatch.type),
      selectionReason: `${buildNewsSelectionReason(recencyTier, newsCategory, relevance, relevanceText)}|${countryMatch.reason}|fallback:country_background`,
      impactSummary: buildExportImpactSummary({
        title: item.newsTitl,
        summary: item.cntntSumar,
        productName: params.product.name,
        category: newsCategory,
      }),
      scoreRelevant: false,
      countryMatchType: countryMatch.type,
      ai,
    });
  }

  const selectedNews = selectNewsEvidence({ items: candidates, perCategoryLimit: COUNTRY_BACKGROUND_FALLBACK_LIMIT });
  const selectedEvidence = [
    ...selectedNews.geopoliticalRisk,
    ...selectedNews.industryTrend,
    ...selectedNews.archiveReference,
  ];

  const articleBodyByKey = await fetchArticleBodiesForSelectedEvidence(selectedEvidence);
  return selectedEvidence.map((evidence): RationaleSource => {
    const articleBody = buildNewsArticleBody(evidence.item, articleBodyByKey.get(newsKey(evidence.item)));
    return {
      type: "country_background",
      title: cleanText(evidence.item.newsTitl || "KOTRA Overseas Market News"),
      url: toPublicNewsUrl(evidence.item.kotraNewsUrl, evidence.item.bbstxSn),
      country: params.country.name,
      published_at: evidence.publishedAt,
      summary: buildNewsSourceSummary(evidence.item),
      article_body: articleBody.body,
      article_body_truncated: articleBody.truncated,
      article_body_original_length: articleBody.originalLength,
      keywords: parseKeywordList(evidence.item.kwrd),
      score_relevant: false,
      news_category: evidence.newsCategory,
      news_scope: evidence.newsScope,
      recency_tier: evidence.recencyTier,
      selection_reason: evidence.selectionReason,
      impact_summary: evidence.impactSummary || undefined,
      country_match_type: evidence.countryMatchType,
      ai_category: evidence.ai.category,
      ai_product_relevance_score: evidence.ai.productRelevanceScore,
      ai_country_relevance_score: evidence.ai.countryRelevanceScore,
      ai_export_impact_score: evidence.ai.exportImpactScore,
      ai_reason: evidence.ai.reason,
    };
  });
}

function resolveNewsScope(
  newsCategory: NewsCategory,
  type: "product_evidence" | "country_background",
  countryMatchType: CountryNewsMatchType,
): NewsScope {
  if (newsCategory === "archive_reference") return "archive_reference";
  if (type === "product_evidence" && newsCategory === "product_direct") return "selected_country_direct";
  if (countryMatchType === "background_country") return "supply_chain_reference";
  if (newsCategory === "geopolitical_risk") return "selected_country_export_env";
  return "selected_country_industry";
}

function replaceNewsEvidenceSources(existingSources: RationaleSource[], newsSources: RationaleSource[]): RationaleSource[] {
  const retained = existingSources.filter((source) =>
    source.type === "product_evidence" ||
      source.type === "country_background" ||
      source.type === "news"
      ? false
      : true
  );
  return [...retained, ...newsSources];
}

function buildProductContext(raw: Record<string, unknown> | null): ProductContext {
  const productName = asText(raw?.name);
  const productDescription = asText(raw?.description);
  const hsCode = normalizeHsCode(asText(raw?.hs_code));
  const hskCode = normalizeHsCode(asText(raw?.hsk_code));
  const hsDescription = extractHsDescriptionFromCandidates(raw?.hs_candidates, hsCode, hskCode);
  const meta = parseProductMeta(asText(raw?.components));
  const baseTokens = extractProductTokens(productName, productDescription, meta.tags);
  const hsDescriptionTokens = hsDescription
    ? extractProductTokens(hsDescription).filter((token) => !isWeakProductRelevanceToken(token))
    : [];
  return {
    name: productName || "N/A",
    description: productDescription || "N/A",
    hsCode,
    hskCode,
    hsDescription,
    tokens: baseTokens,
    relevanceTokens: buildProductRelevanceTokens(productName, hsCode, [...baseTokens, ...hsDescriptionTokens]),
    tags: meta.tags,
  };
}

function extractHsDescriptionFromCandidates(candidates: unknown, hsCode: string, hskCode: string): string {
  const items = Array.isArray(candidates) ? candidates : [];
  for (const item of items) {
    const row = asRecord(item);
    const candidateHs = normalizeHsCode(asText(row.hs_code));
    const candidateHsk = normalizeHsCode(asText(row.hsk_code));
    if ((hskCode && candidateHsk === hskCode) || (hsCode && candidateHs === hsCode)) {
      return cleanText([
        asText(row.description),
        asText(row.official_name_ko),
        asText(row.official_name_en),
      ].filter(Boolean).join(" "));
    }
  }
  return "";
}

function resolveKotraKey(): string {
  return normalizeAuthKeyValue(
    Deno.env.get("KOTRA_API_KEY") ||
    Deno.env.get("PUBLIC_DATA_API_KEY") ||
    Deno.env.get("KICOX_API_KEY") ||
    "",
  );
}

function normalizeAuthKeyValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;

  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if ((first === "\"" && last === "\"") || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

type FetchTextResult =
  | { ok: true; status: number; text: string }
  | { ok: false; status: number | null; message: string };

function hasAiKey(): boolean {
  return Boolean(Deno.env.get("LOVABLE_API_KEY") || Deno.env.get("GEMINI_API_KEY"));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchTextWithTimeout(url: string, timeoutMs: number): Promise<FetchTextResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return { ok: false, status: response.status, message: `HTTP ${response.status}` };
    return { ok: true, status: response.status, text: await response.text() };
  } catch (error) {
    return { ok: false, status: null, message: toFetchErrorMessage(error, timeoutMs) };
  } finally {
    clearTimeout(timeoutId);
  }
}

function toFetchErrorMessage(error: unknown, timeoutMs: number): string {
  const message = asText((error as { message?: unknown } | null | undefined)?.message);
  const lower = message.toLowerCase();
  if (lower.includes("abort") || lower.includes("timeout") || lower.includes("timed out")) {
    return `External API timeout after ${timeoutMs}ms`;
  }
  return message || "External API request failed";
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  const limit = Math.max(1, Math.min(concurrency, items.length || 1));
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(items[index]);
      }
    }),
  );
  return results;
}

function normalizeRationaleSources(input: unknown): RationaleSource[] {
  return asArray(input).map((value) => {
    const row = asRecord(value);
    return {
      type: asText(row.type) || undefined,
      title: cleanText(asText(row.title) || asText(row.api) || "Source"),
      url: normalizeSourceUrl(asText(row.url) || asText(row.endpoint)),
      country: cleanText(asText(row.country)) || undefined,
      published_at: normalizePublishedDate(asText(row.published_at) || asText(row.publishedAt)) || undefined,
      summary: cleanText(asText(row.summary)) || undefined,
      article_body: cleanText(asText(row.article_body)) || undefined,
      article_body_truncated: typeof row.article_body_truncated === "boolean" ? row.article_body_truncated : undefined,
      article_body_original_length: toOptionalLength(row.article_body_original_length),
      keywords: normalizeKeywordList(row.keywords),
      score_relevant: typeof row.score_relevant === "boolean" ? row.score_relevant : undefined,
      news_category: toNewsCategory(asText(row.news_category)),
      recency_tier: toNewsRecencyTier(asText(row.recency_tier)),
      selection_reason: cleanText(asText(row.selection_reason)) || undefined,
      impact_summary: cleanText(asText(row.impact_summary)) || undefined,
      country_match_type: toCountryNewsMatchType(asText(row.country_match_type)),
      news_scope: toNewsScope(asText(row.news_scope)),
      ai_category: normalizeAiCategory(asText(row.ai_category)) ?? undefined,
      ai_product_relevance_score: toOptionalScore(row.ai_product_relevance_score),
      ai_country_relevance_score: toOptionalScore(row.ai_country_relevance_score),
      ai_export_impact_score: toOptionalScore(row.ai_export_impact_score),
      ai_reason: cleanText(asText(row.ai_reason)) || undefined,
    };
  }).filter((source) => source.title || source.url);
}

function normalizeSourceUrl(url: string): string {
  const value = asText(url);
  if (!/^https?:\/\//i.test(value)) return "";
  if (value.toLowerCase().includes("apis.data.go.kr/")) return "";
  return value;
}

function toNewsCategory(value: string): NewsCategory | undefined {
  if (value === "product_direct" || value === "geopolitical_risk" || value === "industry_trend" || value === "archive_reference") {
    return value;
  }
  return undefined;
}

function toNewsRecencyTier(value: string): NewsRecencyTier | undefined {
  if (value === "recent" || value === "supplementary" || value === "archive") return value;
  return undefined;
}

function toCountryNewsMatchType(value: string): CountryNewsMatchType | undefined {
  if (value === "direct_country" || value === "background_country" || value === "mismatch") return value;
  return undefined;
}

function toNewsScope(value: string): NewsScope | undefined {
  if (
    value === "selected_country_direct" ||
    value === "selected_country_export_env" ||
    value === "selected_country_industry" ||
    value === "supply_chain_reference" ||
    value === "archive_reference"
  ) return value;
  return undefined;
}

function normalizeNewsItem(value: unknown): KotraNewsItem {
  const row = asRecord(value);
  return {
    newsTitl: cleanText(asText(row.newsTitl)),
    kotraNewsUrl: asText(row.kotraNewsUrl),
    cntntSumar: cleanText(asText(row.cntntSumar)),
    kwrd: cleanText(asText(row.kwrd)),
    newsBdt: asText(row.newsBdt),
    othbcDt: asText(row.othbcDt),
    natn: cleanText(asText(row.natn)),
    regn: cleanText(asText(row.regn)),
    bbstxSn: asText(row.bbstxSn),
  };
}

function toPublicNewsUrl(rawUrl: string, articleId: string): string {
  const direct = normalizeSourceUrl(rawUrl);
  if (direct) return direct;
  const id = asText(articleId);
  if (!id) return "";
  const page = new URL(KOTRA_NEWS_ARTICLE_PATH);
  page.searchParams.set("dataIdx", id);
  return page.toString();
}

function normalizePublishedDate(value: string): string | null {
  const text = asText(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{8}$/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  return null;
}

function buildNewsSourceSummary(item: KotraNewsItem): string {
  const summary = cleanText(item.cntntSumar || stripHtml(item.newsBdt));
  return summary ? truncate(summary, 240) : "";
}

async function fetchArticleBodiesForSelectedEvidence(
  selectedEvidence: NewsEvidenceCandidate[],
): Promise<Map<string, string>> {
  const items = dedupeNewsItems(selectedEvidence.map((evidence) => evidence.item));
  const entries = await mapWithConcurrency(items, ARTICLE_BODY_FETCH_CONCURRENCY, async (item) => {
    const body = await fetchArticleBodyForNewsItem(item);
    return [newsKey(item), body] as const;
  });
  return new Map(entries.filter(([, body]) => Boolean(body)));
}

async function fetchArticleBodyForNewsItem(item: KotraNewsItem): Promise<string> {
  const apiBody = cleanText(stripHtml(item.newsBdt));
  if (apiBody.length >= ARTICLE_BODY_MIN_USEFUL_LENGTH) return apiBody;

  const url = toPublicNewsUrl(item.kotraNewsUrl, item.bbstxSn);
  if (!url) return apiBody;

  const result = await fetchTextWithTimeout(url, KOTRA_FETCH_TIMEOUT_MS);
  if (!result.ok) return apiBody;

  const extracted = extractKotraArticleBody(result.text, item.newsTitl);
  if (extracted.length >= ARTICLE_BODY_MIN_USEFUL_LENGTH || extracted.length > apiBody.length) return extracted;
  return apiBody;
}

function extractKotraArticleBody(html: string, title: string): string {
  const stripped = cleanText(stripHtml(removeNonContentHtml(html)));
  const normalizedTitle = cleanText(title);
  const titleIndex = normalizedTitle ? stripped.indexOf(normalizedTitle) : -1;
  let body = titleIndex >= 0 ? stripped.slice(titleIndex + normalizedTitle.length) : stripped;

  const startMarkers = ["Keyword", "시장동향", "현장·인터뷰", "트렌드", "상품 DB", "□", "ㅇ"];
  for (const marker of startMarkers) {
    const index = body.indexOf(marker);
    if (index >= 0 && index < 1800) {
      body = body.slice(index);
      break;
    }
  }

  const endMarkers = [
    "<저작권자",
    "저작권자",
    "KOTRA의 저작물",
    "대한무역투자진흥공사",
    "이 뉴스를 본",
    "로그인 후",
    "목록",
  ];
  let endIndex = body.length;
  for (const marker of endMarkers) {
    const index = body.indexOf(marker);
    if (index > ARTICLE_BODY_MIN_USEFUL_LENGTH && index < endIndex) endIndex = index;
  }

  return cleanText(body.slice(0, endIndex));
}

function removeNonContentHtml(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ");
}

function buildNewsArticleBody(
  item: KotraNewsItem,
  hydratedBody = "",
): { body: string; truncated: boolean; originalLength: number } {
  const body = cleanText(hydratedBody || stripHtml(item.newsBdt));
  const originalLength = body.length;
  const truncated = originalLength > ARTICLE_BODY_MAX_LENGTH;
  return {
    body: truncated ? body.slice(0, ARTICLE_BODY_MAX_LENGTH) : body,
    truncated,
    originalLength,
  };
}

function dedupeNewsItems(items: KotraNewsItem[]): KotraNewsItem[] {
  return dedupeByKey(items, newsKey);
}

function newsKey(item: KotraNewsItem): string {
  return [item.bbstxSn, item.newsTitl, item.othbcDt].join("|");
}

function dedupeSources(sources: RationaleSource[]): RationaleSource[] {
  return dedupeByKey(sources, (source) =>
    [source.type || "", source.title, source.country || "", source.published_at || "", source.url].join("|"));
}

function dedupeByKey<T>(items: T[], keyFn: (item: T) => string): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.toUpperCase().trim()).filter(Boolean))];
}

function dedupeQueryTerms(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const cleaned = cleanText(value).replace(/\s+/g, " ").trim();
    const key = cleaned.toLowerCase();
    if (!cleaned || cleaned.length < 2 || seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

function normalizeAiAssessment(
  record: Record<string, unknown>,
  fallback?: AiNewsRelevanceAssessment,
): AiNewsRelevanceAssessment {
  const category = normalizeAiCategory(asText(record.category)) ?? fallback?.category ?? "unrelated";
  const productRelevanceScore = clampScore(
    record.product_link_score ?? record.product_relevance_score,
    fallback?.productRelevanceScore ?? 0,
  );
  const countryRelevanceScore = clampScore(
    record.country_link_score ?? record.country_relevance_score,
    fallback?.countryRelevanceScore ?? 0,
  );
  const exportImpactScore = clampScore(record.export_impact_score, fallback?.exportImpactScore ?? 0);
  const basis = normalizeAiBasis(asText(record.basis)) || fallback?.basis || defaultAiBasis(category);
  const rejectReason = cleanText(asText(record.reject_reason)) || fallback?.rejectReason || "";
  return {
    category,
    productRelevanceScore,
    countryRelevanceScore,
    exportImpactScore,
    basis,
    rejectReason,
    reason: normalizeAiReason(category, basis, rejectReason, cleanText(asText(record.reason)) || fallback?.reason || ""),
  };
}

function normalizeAiCategory(value: string): AiNewsCategory | null {
  if (value === "direct_product") return "direct_product";
  if (value === "adjacent_value_chain" || value === "adjacent_industry") return "adjacent_value_chain";
  if (value === "broad_macro_export_env" || value === "macro_export_env") return "broad_macro_export_env";
  if (value === "unrelated") return "unrelated";
  return null;
}

const AI_BASIS_ALIASES: Record<string, string> = {
  product_anchor: "exact_product",
  product_name: "exact_product",
  exact_product_name: "exact_product",
  exact_product: "exact_product",
  product_family: "product_family",
  product_group: "product_family",
  hs_family: "hs_family",
  hs_code: "hs_family",
  hsk_code: "hs_family",
  material: "material",
  component: "component",
  parts: "component",
  part: "component",
  demand_channel: "demand_channel",
  demand: "demand_channel",
  distribution_channel: "distribution_channel",
  retail_channel: "distribution_channel",
  regulation_certification: "regulation_certification",
  certification: "regulation_certification",
  regulation: "regulation_certification",
  logistics_customs: "logistics_customs",
  logistics: "logistics_customs",
  customs: "logistics_customs",
  macro: "macro",
  macro_export_env: "macro",
  value_chain: "demand_channel",
  none: "none",
};

const AI_BASIS_VALUES = new Set(Object.values(AI_BASIS_ALIASES));

function normalizeAiBasis(value: string): string {
  const raw = cleanText(value);
  if (!raw) return "";
  const normalized = raw
    .split(/[,|/]+/g)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .map((part) => part.replace(/\s+/g, "_"))
    .map((part) => AI_BASIS_ALIASES[part] ?? part)
    .filter((part) => AI_BASIS_VALUES.has(part));
  return Array.from(new Set(normalized)).slice(0, 4).join(",");
}

function defaultAiBasis(category: AiNewsCategory): string {
  if (category === "direct_product") return "exact_product";
  if (category === "adjacent_value_chain") return "demand_channel";
  if (category === "broad_macro_export_env") return "macro";
  return "none";
}

function normalizeAiReason(
  category: AiNewsCategory,
  basis: string,
  rejectReason: string,
  fallbackReason: string,
): string {
  if (category === "direct_product") return "제품/HS 직접 신호";
  if (category === "adjacent_value_chain") return `제품 가치사슬 신호: ${formatAiBasisLabel(basis)}`;
  if (category === "broad_macro_export_env") return "거시/수출환경 신호";
  const reject = cleanText(rejectReason || fallbackReason);
  return reject ? `무관 뉴스: ${reject}` : "무관 뉴스";
}

function formatAiBasisLabel(value: string): string {
  const labels: Record<string, string> = {
    product_anchor: "제품 앵커",
    exact_product: "제품명 직접",
    product_family: "제품군",
    hs_family: "HS 품목군",
    material: "소재",
    component: "부품",
    demand_channel: "수요처",
    distribution_channel: "유통채널",
    regulation_certification: "규제/인증",
    logistics_customs: "물류/통관",
    value_chain: "가치사슬",
    macro: "거시환경",
  };
  const parts = value.split(",").map((part) => labels[part.trim()] ?? part.trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "가치사슬";
}

function clampScore(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(asText(value));
  if (!Number.isFinite(n)) return Math.max(0, Math.min(100, Math.round(fallback)));
  return Math.max(0, Math.min(100, Math.round(n)));
}

function toOptionalScore(value: unknown): number | undefined {
  if (value == null) return undefined;
  const n = typeof value === "number" ? value : Number(asText(value));
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function toOptionalLength(value: unknown): number | undefined {
  if (value == null) return undefined;
  const n = typeof value === "number" ? value : Number(asText(value));
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.round(n));
}

function parseKeywordList(value: string): string[] {
  return normalizeKeywordList(value);
}

function normalizeKeywordList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.map((entry) => cleanText(asText(entry))).filter(Boolean))].slice(0, 12);
  }
  const text = cleanText(asText(value));
  if (!text) return [];
  return [...new Set(text.split(/[,\n/|]+/g).map((entry) => cleanText(entry)).filter(Boolean))].slice(0, 12);
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, " "));
}

function cleanText(value: string): string {
  return decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
}

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: "\"",
  apos: "'",
  nbsp: " ",
  middot: "·",
  rsquo: "'",
  lsquo: "'",
  rdquo: "\"",
  ldquo: "\"",
  hellip: "...",
};

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entityRaw: string) => {
    const entity = entityRaw.toLowerCase();
    if (entity.startsWith("#x")) {
      const codePoint = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (entity.startsWith("#")) {
      const codePoint = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return HTML_ENTITY_MAP[entity] ?? match;
  });
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
}

function asText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
