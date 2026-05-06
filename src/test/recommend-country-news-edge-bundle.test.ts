import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("recommend-country-news edge bundle", () => {
  it("is registered as a separate Supabase Edge Function", () => {
    const config = read("supabase/config.toml");

    expect(config).toContain("[functions.recommend-country-news]");
    expect(config).toMatch(/\[functions\.recommend-country-news\]\s*\nverify_jwt = false/);
  });

  it("keeps Step 3 news evidence enrichment outside recommend-countries", () => {
    const recommendSource = read("supabase/functions/recommend-countries/index.ts");
    const newsSource = read("supabase/functions/recommend-country-news/index.ts");

    expect(recommendSource).not.toContain("sources: buildEvidenceSources(analysis, product)");
    expect(newsSource).toContain("fetchCountryMarketNews(country, kotraKey, product, expandedQueries.country)");
    expect(newsSource).toContain("return out.slice(0, PRODUCT_BASE_QUERY_LIMIT);");
    expect(newsSource).toContain("return out.slice(0, COUNTRY_BASE_QUERY_LIMIT);");
  });

  it("uses balanced expanded collection budgets for Step 3 news evidence", () => {
    const source = read("supabase/functions/recommend-country-news/index.ts");

    expect(source).toContain("const PRODUCT_NEWS_QUERY_LIMIT = 16;");
    expect(source).toContain("const PRODUCT_NEWS_ROWS_PER_QUERY = 30;");
    expect(source).toContain("const COUNTRY_NEWS_QUERY_LIMIT = 20;");
    expect(source).toContain("const COUNTRY_NEWS_ROWS_PER_QUERY = 20;");
    expect(source).toContain("const AI_NEWS_REVIEW_CANDIDATE_LIMIT = 60;");
    expect(source).toContain("const NEWS_EVIDENCE_PER_CATEGORY_LIMIT = 6;");
    expect(source).toContain("const COUNTRY_BACKGROUND_FALLBACK_LIMIT = 5;");
  });

  it("applies expanded query and candidate limits without changing KOTRA search fields", () => {
    const source = read("supabase/functions/recommend-country-news/index.ts");

    expect(source).toContain("]).slice(0, PRODUCT_NEWS_QUERY_LIMIT)");
    expect(source).toContain("fetchKotraNewsByQuery(query, key, PRODUCT_NEWS_ROWS_PER_QUERY, marketNewsSearchParam(\"product\"))");
    expect(source).toContain("]).slice(0, COUNTRY_NEWS_QUERY_LIMIT)");
    expect(source).toContain("fetchKotraNewsByQuery(query, key, COUNTRY_NEWS_ROWS_PER_QUERY, marketNewsSearchParam(\"country\"))");
    expect(source).toContain("dedupeNewsItems(items).slice(0, AI_NEWS_REVIEW_CANDIDATE_LIMIT)");
    expect(source).toContain("selectNewsEvidence({ items: candidates, perCategoryLimit: NEWS_EVIDENCE_PER_CATEGORY_LIMIT })");
    expect(source).toContain("selectNewsEvidence({ items: candidates, perCategoryLimit: COUNTRY_BACKGROUND_FALLBACK_LIMIT })");
  });

  it("uses official KOTRA market-news search fields for product and country lookups", () => {
    const source = read("supabase/functions/recommend-country-news/index.ts");

    expect(source).toContain('url.searchParams.set("type", "json");');
    expect(source).not.toContain('url.searchParams.set("_type", "json");');
    expect(source).toContain("buildRepresentativeProductSearchTerms({");
    expect(source).toContain("shouldUseRawProductNameQuery(product.name)");
    expect(source).toContain("Infer the searchable product family before writing product_queries.");
    expect(source).toContain("mixed model names, SKUs, options, components, or variants in any format");
    expect(source).toContain("for (const token of directTerms.slice(0, PRODUCT_DIRECT_TOKEN_QUERY_LIMIT))");
    expect(source).toContain("for (const token of descTokens.slice(0, PRODUCT_HS_DESCRIPTION_QUERY_LIMIT))");
    expect(source).toContain("pushHsProductCombinationQueries(product, directTerms, pushQuery)");
    expect(source).toContain("const countrySearchAliases = selectCountrySearchAliases(countryAliases, compactName);");
    expect(source).toContain("for (const alias of countrySearchAliases) pushQuery(alias);");
    expect(source).not.toContain("for (const keyword of productKeywords.slice(0, COUNTRY_PRODUCT_KEYWORD_QUERY_LIMIT)) pushQuery(`${alias} ${keyword}`);");
    expect(source).not.toContain("pushQuery(`${alias} ${product.hsCode.slice(0, 6)}`);");
    expect(source).not.toContain("if (product.name && product.name !== \"N/A\") pushQuery(product.name);");
    expect(source).toContain("assessNewsRelevance({");
    expect(source).toContain("assessCountryNewsMatch({");
    expect(source).toContain("hasDefensibleProductExportFit({");
  });

  it("logs expanded search coverage for observability", () => {
    const source = read("supabase/functions/recommend-country-news/index.ts");

    expect(source).toContain("product_query_count: productNewsResult.queryCount");
    expect(source).toContain("country_query_count: countryNewsResult.queryCount");
    expect(source).toContain("product_candidate_count: productNewsResult.items.length");
    expect(source).toContain("country_candidate_count: countryNewsResult.items.length");
    expect(source).toContain("ai_review_candidate_limit: AI_NEWS_REVIEW_CANDIDATE_LIMIT");
  });

  it("uses strict direct-country matching before promoting product news", () => {
    const source = read("supabase/functions/recommend-country-news/index.ts");

    expect(source).toContain("assessCountryNewsMatch(");
    expect(source).toContain('countryMatch.type === "direct_country" && relevance.isDirectEvidence');
    expect(source).toContain('country_match_type: evidence.countryMatchType');
  });

  it("updates only news evidence sources on project_countries rationale", () => {
    const source = read("supabase/functions/recommend-country-news/index.ts");

    expect(source).toContain("replaceNewsEvidenceSources(");
    expect(source).toMatch(
      /\.from\(["']project_countries["']\)\s*\n\s*\.update\(\{\s*\n\s*rationale:\s*nextRationale,/,
    );
    expect(source).toContain('source.type === "product_evidence"');
    expect(source).toContain('source.type === "country_background"');
    expect(source).toContain('source.type === "news"');
  });

  it("keeps existing generated news when a later generation has fewer or empty sources", () => {
    const source = read("supabase/functions/recommend-country-news/index.ts");

    expect(source).toContain("const retainedNews = existingSources.filter(isNewsEvidenceSource);");
    expect(source).toContain("return [...retained, ...newsSources, ...retainedNews];");
  });

  it("adds AI review with fallback and persists AI metadata on news sources", () => {
    const source = read("supabase/functions/recommend-country-news/index.ts");

    expect(source).toContain("reviewNewsCandidatesWithAi(");
    expect(source).toContain("callAiJson(");
    expect(source).toContain("LOVABLE_API_KEY");
    expect(source).toContain("GEMINI_API_KEY");
    expect(source).toContain("fallbackAiNewsAssessment");
    expect(source).toContain("ai_category: evidence.ai.category");
    expect(source).toContain("ai_product_relevance_score: evidence.ai.productRelevanceScore");
    expect(source).toContain("ai_country_relevance_score: evidence.ai.countryRelevanceScore");
    expect(source).toContain("ai_export_impact_score: evidence.ai.exportImpactScore");
    expect(source).toContain("ai_reason: evidence.ai.reason");
  });

  it("instructs AI to separate direct product-family evidence from adjacent value-chain evidence", () => {
    const source = read("supabase/functions/recommend-country-news/index.ts");

    expect(source).toContain("direct_product includes exact_product, product_family, or hs_family evidence");
    expect(source).toContain("product market, demand, imports, regulation, certification, sales, or product-use evidence");
    expect(source).toContain("adjacent_value_chain basis must be component, material, demand_channel, distribution_channel, regulation_certification, or logistics_customs");
    expect(source).toContain("basis\\\":\\\"exact_product|product_family|hs_family|component|material|demand_channel|distribution_channel|regulation_certification|logistics_customs|macro|none");
  });

  it("falls back to country background news when stricter product evidence filters select nothing", () => {
    const source = read("supabase/functions/recommend-country-news/index.ts");

    expect(source).toContain("buildCountryBackgroundFallbackSources(params)");
    expect(source).toContain("fallback:country_background");
    expect(source).toContain('type: "country_background"');
    expect(source).toContain("isProductDirect: false");
    expect(source).not.toContain("직접 근거 없음 (확실한 정보 없음)");
  });

  it("persists sanitized article bodies for Step 6 Gemini report analysis", () => {
    const source = read("supabase/functions/recommend-country-news/index.ts");

    expect(source).toContain("const ARTICLE_BODY_MAX_LENGTH = 12000;");
    expect(source).toContain("article_body?: string;");
    expect(source).toContain("buildNewsArticleBody(evidence.item, articleBodyByKey.get(newsKey(evidence.item)))");
    expect(source).toContain("article_body: articleBody.body");
    expect(source).toContain("article_body_truncated: articleBody.truncated");
    expect(source).toContain("article_body_original_length: articleBody.originalLength");
    expect(source).toContain("stripHtml(item.newsBdt)");
  });

  it("hydrates article bodies from the public KOTRA article page when API body is missing", () => {
    const source = read("supabase/functions/recommend-country-news/index.ts");

    expect(source).toContain("const ARTICLE_BODY_FETCH_CONCURRENCY = 2;");
    expect(source).toContain("const ARTICLE_BODY_MIN_USEFUL_LENGTH = 300;");
    expect(source).toContain("const newsSources = await buildNewsEvidenceSources({");
    expect(source).toContain("async function buildNewsEvidenceSources(");
    expect(source).toContain("fetchArticleBodiesForSelectedEvidence(selectedEvidence)");
    expect(source).toContain("async function fetchArticleBodyForNewsItem(item: KotraNewsItem): Promise<string>");
    expect(source).toContain("extractKotraArticleBody(result.text, item.newsTitl)");
    expect(source).toContain("function extractKotraArticleBody(html: string, title: string): string");
  });

  it("persists structured AI-backed trade office summaries from recommend-countries", () => {
    const source = read("supabase/functions/recommend-countries/index.ts");

    expect(source).toContain("summarizeTradeOfficeActionsWithAi(");
    expect(source).toContain("office_name: office.officeName");
    expect(source).toContain("office_address: office.officeAddress");
    expect(source).toContain("airport_route_text: office.airportRouteText");
    expect(source).toContain("raw: entry.office.raw");
    expect(source).toContain("summary_source: office.summarySource");
    expect(source).toContain("summarySource: \"ai\"");
    expect(source).toContain("summarySource: \"rule\"");
    expect(source).toContain("kotra_csv_trade_office_summary_cache");
    expect(source).toContain("source_hash");
    expect(source).toContain("source CSV fields exactly as supplied");
    expect(source).toContain("produce three to five Korean sentences under 800 Korean characters total");
    expect(source).toContain("airport names, access routes, travel times, fees, transfer/drop-off points, and visit scheduling notes when present");
    expect(source).toContain("Keep every displayed summary sentence complete");
    expect(source).toContain("limitTradeOfficeTextBySentence");
    expect(source).toContain("Do not include phone numbers, fax numbers, homepage URLs, or email addresses");
    expect(source).not.toContain("return `공항 이동 안내: ${truncate(text, 320)}.`;");
    expect(source).not.toContain("address: address ? truncate(stripTradeOfficeTrailingPunctuation(address), 150) : \"\"");
    expect(source).not.toContain("위치 정보 없음");
  });

  it("declares a cache table for reusable trade office AI summaries", () => {
    const migration = read("supabase/migrations/20260501072000_add_kotra_trade_office_summary_cache.sql");

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.kotra_csv_trade_office_summary_cache");
    expect(migration).toContain("source_hash TEXT NOT NULL DEFAULT ''");
    expect(migration).toContain("summary_ko TEXT NOT NULL DEFAULT ''");
    expect(migration).toContain("UNIQUE (country_name_normalized, office_name, source_hash)");
    expect(migration).toContain("auth read kotra csv trade office summary cache");
    expect(migration).toContain("service write kotra csv trade office summary cache");
  });
});
