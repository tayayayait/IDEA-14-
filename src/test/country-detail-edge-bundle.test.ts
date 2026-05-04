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

  it("stores source_type markers for the Step4 source cards", () => {
    const source = readFileSync(
      join(process.cwd(), "supabase/functions/country-detail/index.ts"),
      "utf8",
    );

    expect(source).toContain('source_type: "kotra_overseas_cert"');
    expect(source).toContain('source_type: sourceType');
    expect(source).toContain('source_type: "wto_eping"');
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

  it("persists a WTO ePing placeholder row for key-missing, failure, or zero-result states", () => {
    const source = readFileSync(
      join(process.cwd(), "supabase/functions/country-detail/index.ts"),
      "utf8",
    );

    expect(source).toContain("buildWtoEpingPlaceholderRegulationRow");
    expect(source).toContain("WTO_API_KEY 미설정");
    expect(source).toContain("wto_api_key_missing");
  });

  it("queries and records WTO ePing direct, broad, and excluded classifications", () => {
    const source = readFileSync(
      join(process.cwd(), "supabase/functions/country-detail/index.ts"),
      "utf8",
    );

    expect(source).toContain("wto_eping_hs6_country");
    expect(source).toContain("wto_eping_hs4_country");
    expect(source).toContain("wto_eping_exact_product_country");
    expect(source).toContain("wto_eping_product_family_country");
    expect(source).toContain("wto_raw_count");
    expect(source).toContain("direct_count");
    expect(source).toContain("broad_count");
    expect(source).toContain("excluded_count");
    expect(source).toContain("broad_references");
  });
});
