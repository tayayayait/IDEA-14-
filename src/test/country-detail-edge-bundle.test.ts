import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("country-detail edge bundle", () => {
  it("imports every shared recommendation helper used by country-detail news selection", () => {
    const source = readFileSync(
      join(process.cwd(), "supabase/functions/country-detail/index.ts"),
      "utf8",
    );

    expect(source).toContain("detectCountryCodesFromText(");
    expect(source).toMatch(
      /import\s*{[\s\S]*detectCountryCodesFromText[\s\S]*}\s*from\s*["']\.\.\/_shared\/recommendation\.ts["']/,
    );
  });

  it("uses shared country normalization for KOTRA certification country matching", () => {
    const detailSource = readFileSync(
      join(process.cwd(), "supabase/functions/country-detail/index.ts"),
      "utf8",
    );
    const sharedSource = readFileSync(
      join(process.cwd(), "supabase/functions/_shared/recommendation.ts"),
      "utf8",
    );

    expect(detailSource).toMatch(
      /import\s*{[\s\S]*buildCountryAliases[\s\S]*isCountryTextMatched[\s\S]*}\s*from\s*["']\.\.\/_shared\/recommendation\.ts["']/,
    );
    expect(detailSource).not.toContain("const COUNTRY_ALIASES");
    expect(sharedSource).toContain('US: ["United States", "United States of America"');
    expect(sharedSource).toContain("\\uBBF8\\uAD6D");
    expect(sharedSource).toContain("\\uBBF8\\uD569\\uC911\\uAD6D");
  });

  it("keeps country-detail responsible for enriching project country rationale sources", () => {
    const source = readFileSync(
      join(process.cwd(), "supabase/functions/country-detail/index.ts"),
      "utf8",
    );

    expect(source).toContain("fetchKotraMarketNews({ countryCode, countryName }, kotraKey)");
    expect(source).toContain("fetchKsureExportPayment({ countryCode }, ksureKey)");
    expect(source).toContain("replaceDetailMatchedSources(");
    expect(source).toMatch(
      /\.from\(["']project_countries["']\)\s*\n\s*\.update\(\{\s*\n\s*rationale:\s*\{/,
    );
    expect(source).toContain("sources: dedupeSources(sourcePairs)");
  });

  it("does not use SME overseas certification data in country-detail", () => {
    const source = readFileSync(
      join(process.cwd(), "supabase/functions/country-detail/index.ts"),
      "utf8",
    );

    expect(source).not.toContain("../_shared/sme-cert.ts");
    expect(source).not.toContain("fetchSmeCertifications(");
    expect(source).not.toContain("evaluateSmeCertificationsWithAI(");
    expect(source).not.toContain("sme_overseas_cert");
    expect(source).not.toContain("중소벤처기업부");
  });

  it("does not use WTO ePing data in country-detail", () => {
    const source = readFileSync(
      join(process.cwd(), "supabase/functions/country-detail/index.ts"),
      "utf8",
    );

    expect(source).not.toContain("../_shared/wto-eping.ts");
    expect(source).not.toContain("fetchWtoEpingNotifications(");
    expect(source).not.toContain("WTO_API_KEY");
    expect(source).not.toContain("wto_eping");
  });

  it("stores source_type markers for the Step4 source cards", () => {
    const source = readFileSync(
      join(process.cwd(), "supabase/functions/country-detail/index.ts"),
      "utf8",
    );

    expect(source).toContain('source_type: "kotra_overseas_cert"');
    expect(source).toContain('source_type: sourceType');
  });

  it("uses CSV backup when KOTRA import-regulation cache has no filtered match", () => {
    const source = readFileSync(
      join(process.cwd(), "supabase/functions/country-detail/index.ts"),
      "utf8",
    );

    expect(source).toContain("const backupResult = await fetchCsvImportRegulationBackup(params, supa, relevanceContext);");
    expect(source).toContain("cache_filter_match_0_csv_backup_used");
    expect(source).toContain("cache_filter_match_0_csv_backup_no_match");
  });

  it("keeps KOTRA import-regulation fallback reads bounded in country-detail", () => {
    const source = readFileSync(
      join(process.cwd(), "supabase/functions/country-detail/index.ts"),
      "utf8",
    );
    const cacheBlock = source.match(
      /async function fetchKotraImportRegulations[\s\S]*?async function fetchCsvImportRegulationBackup/,
    )?.[0] ?? "";
    const csvBlock = source.match(
      /async function fetchCsvImportRegulationBackup[\s\S]*?function formatImportRegulationCacheStaleMessage/,
    )?.[0] ?? "";

    expect(source).toContain("const MAX_IMPORT_REGULATION_CACHE_ROWS = 500;");
    expect(source).toContain("const MAX_CSV_IMPORT_REGULATION_BACKUP_ROWS = 500;");
    expect(cacheBlock).toContain(".eq(\"iso_wd2_nat_cd\", params.countryCode)");
    expect(cacheBlock).toContain(".or(cacheCandidateFilter)");
    expect(cacheBlock).toContain(".limit(MAX_IMPORT_REGULATION_CACHE_ROWS)");
    expect(cacheBlock).not.toContain("while (true)");
    expect(cacheBlock).not.toContain(".range(from, to)");
    expect(cacheBlock).not.toContain("probe_tgt_nat_name.ilike.%");
    expect(csvBlock).toContain(".eq(\"regulation_country_code\", params.countryCode)");
    expect(csvBlock).toContain(".or(csvCandidateFilter)");
    expect(csvBlock).toContain(".limit(MAX_CSV_IMPORT_REGULATION_BACKUP_ROWS)");
    expect(csvBlock).not.toContain("while (true)");
    expect(csvBlock).not.toContain(".range(from, to)");
    expect(csvBlock).not.toContain("target_country_text.ilike.%");
  });

  it("does not run the KOTRA import-regulation sync job inside country-detail", () => {
    const source = readFileSync(
      join(process.cwd(), "supabase/functions/country-detail/index.ts"),
      "utf8",
    );

    expect(source).not.toContain("invokeKotraImportRegulationSync");
    expect(source).not.toContain("sync-kotra-import-regulations");
    expect(source).not.toContain("KOTRA_IMPORT_REGULATION_SYNC_TIMEOUT_MS");
    expect(source).not.toContain("allowApiSync");
    expect(source).toContain("sync_attempted: false");
  });

  it("keeps KOTRA overseas certification lookups single-page in country-detail", () => {
    const source = readFileSync(
      join(process.cwd(), "supabase/functions/country-detail/index.ts"),
      "utf8",
    );
    const certBlock = source.match(
      /async function fetchKotraOverseasCertInfo[\s\S]*?async function callKotraOverseasAuthEndpoint/,
    )?.[0] ?? "";

    expect(source).toContain("const KOTRA_CERT_SEARCH_ATTEMPT_LIMIT = 8;");
    expect(source).toContain("const KOTRA_CERT_PAGE_LIMIT = 1;");
    expect(source).toContain("const KOTRA_CERT_PAGE_SIZE = 20;");
    expect(certBlock).toContain("maxAttempts: KOTRA_CERT_SEARCH_ATTEMPT_LIMIT");
    expect(certBlock).toContain("const maxPages = KOTRA_CERT_PAGE_LIMIT;");
    expect(certBlock).toContain("const numOfRows = KOTRA_CERT_PAGE_SIZE;");
    expect(certBlock).not.toContain("const maxPages = isBaseQuery ? 8 : 1;");
    expect(certBlock).not.toContain("const numOfRows = isBaseQuery ? 100 : 20;");
  });

  it("keeps K-SURE industry risk lookups within the country-detail CPU budget", () => {
    const source = readFileSync(
      join(process.cwd(), "supabase/functions/country-detail/index.ts"),
      "utf8",
    );
    const industryRiskBlock = source.match(
      /async function fetchKsureIndustryRisks[\s\S]*?async function callKsureIndustryRiskPage/,
    )?.[0] ?? "";

    expect(source).toContain("const KSURE_INDUSTRY_RISK_PAGE_LIMIT = 3;");
    expect(source).toContain("const KSURE_INDUSTRY_RISK_PAGE_SIZE = 200;");
    expect(industryRiskBlock).toContain("const maxPages = KSURE_INDUSTRY_RISK_PAGE_LIMIT;");
    expect(industryRiskBlock).toContain("const pageSize = KSURE_INDUSTRY_RISK_PAGE_SIZE;");
    expect(industryRiskBlock).not.toContain("const maxPages = 10;");
  });

});
