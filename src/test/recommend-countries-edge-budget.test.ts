import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const edgeSource = () =>
  readFileSync(join(process.cwd(), "supabase/functions/recommend-countries/index.ts"), "utf8");

describe("recommend-countries edge budget", () => {
  it("preserves generated news evidence across recommendation reruns", () => {
    const source = edgeSource();

    expect(source).toContain('select("country_code,rationale")');
    expect(source).toContain("const persistentNewsEvidenceByCountry =");
    expect(source).toContain("extractPersistentNewsEvidenceSources(");
    expect(source).toContain("mergePersistentNewsEvidenceSources(");
  });

  it("keeps customs trade work out of the recommendation function", () => {
    const source = edgeSource();

    expect(source).not.toContain("customsTradeMap");
    expect(source).not.toContain("customsTradeResult");
    expect(source).not.toContain("resolveCustomsApiKey");
    expect(source).not.toContain("customs_nitemtrade");
    expect(source).not.toContain("../_shared/customs-trade.ts");
  });

  it("caps high-fanout recommendation work inside one edge invocation", () => {
    const source = edgeSource();

    expect(source).toContain("const CANDIDATE_ANALYSIS_CONCURRENCY = 1;");
    expect(source).toContain("const MAX_RECOMMENDATION_CANDIDATES = 4;");
    expect(source).toContain("return out.slice(0, 5);");
  });

  it("defers country-level detail collection out of the Step 3 recommendation function", () => {
    const source = edgeSource();

    expect(source).not.toContain("fetchCountryMarketNews(country, kotraKey, product)");
    expect(source).not.toContain("fetchKsureExportPayment({ countryCode: country.code }, ksureKey)");
    expect(source).not.toContain("fetchKsureCountryGradeDataset(ksureKey)");
    expect(source).not.toContain("fetchKsureIndustryRiskDataset(ksureKey)");
    expect(source).not.toContain("sources: buildEvidenceSources(analysis, product)");
  });

  it("does not treat deferred Step 4 detail collection as a partial Step 3 result", () => {
    const source = edgeSource();

    expect(source).toContain("const detailEnrichmentDeferred = true;");
    expect(source).not.toContain("detailEnrichmentDeferred ||");
    expect(source).not.toContain("Country-level news and K-SURE detail are deferred to Step 4 country-detail.");
  });

  it("does not load the full KOTRA import-regulation cache into one edge invocation", () => {
    const source = edgeSource();
    const importCacheFunction = source.match(
      /async function fetchImportRegulationDatasetFromCache[\s\S]*?function formatImportRegulationCacheStaleMessage/,
    )?.[0] ?? "";

    expect(source).toContain("fetchImportRegulationDatasetFromCache(supa, product)");
    expect(importCacheFunction).toContain("buildImportRegulationCacheFilters(product)");
    expect(importCacheFunction).toContain(".or(importRegulationOrFilter)");
    expect(importCacheFunction).toContain(".limit(MAX_IMPORT_REGULATION_CACHE_ROWS)");
    expect(importCacheFunction).not.toContain("while (true)");
    expect(importCacheFunction).not.toContain(".range(from, to)");
    expect(importCacheFunction).not.toContain("raw");
  });

  it("does not persist empty direct-news placeholders", () => {
    const source = edgeSource();

    expect(source).not.toContain("직접 근거 없음 (확실한 정보 없음)");
    expect(source).not.toContain("해당 제품·국가 기준 직접 뉴스 근거 없음");
  });
});
