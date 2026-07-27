import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildUsitcClassificationGuidance } from "../../supabase/functions/_shared/usitc-classification-guidance";

const providerSource = readFileSync(
  join(process.cwd(), "supabase/functions/_shared/country-decision-providers.ts"),
  "utf8",
);
const edgeSource = readFileSync(
  join(process.cwd(), "supabase/functions/country-detail/index.ts"),
  "utf8",
);
const migrationSource = readFileSync(
  join(process.cwd(), "supabase/migrations/20260719170000_add_country_decision_dashboard.sql"),
  "utf8",
);
const dashboardSource = readFileSync(
  join(process.cwd(), "src/components/CountryDecisionDashboard.tsx"),
  "utf8",
);

describe("USITC classification guidance", () => {
  it("builds semiconductor guidance from the current product and HTS candidate", () => {
    const guidance = buildUsitcClassificationGuidance({
      productName: "반도체장비 부품",
      hs6: "848690",
      candidates: [{
        htsCode: "8486.90.00.00",
        description: "Parts and accessories",
      }],
    });

    expect(guidance.specificationHint).toContain("반도체장비 부품");
    expect(guidance.specificationHint).toContain("용도·적용 대상");
    expect(guidance.specificationHint).not.toMatch(/타이어|림 직경/);
    expect(guidance.nextAction).toContain("8486.90.00.00");
  });

  it("derives tire-specific criteria only when the returned descriptions require them", () => {
    const guidance = buildUsitcClassificationGuidance({
      productName: "승용차용 타이어",
      hs6: "401110",
      candidates: [
        { htsCode: "4011.10.10", description: "Radial" },
        { htsCode: "4011.10.10.10", description: "Having a rim diameter of 33 cm (13 inches) or less" },
      ],
    });

    expect(guidance.specificationHint).toContain("승용차용 타이어");
    expect(guidance.specificationHint).toContain("구조");
    expect(guidance.specificationHint).toContain("규격·치수");
    expect(guidance.specificationHint).not.toContain("반도체");
  });
});

describe("country decision provider contracts", () => {
  it("does not manufacture non-API baseline facts", () => {
    for (const factKey of [
      "tariff_fta:baseline",
      "customs_documents:baseline",
      "sanctions:entity_screening",
      "strategic_goods:classification",
    ]) {
      expect(providerSource).not.toContain(`factKey: "${factKey}"`);
    }
    expect(edgeSource).not.toContain('"verify_fta_origin"');
    expect(edgeSource).not.toContain('"prepare_customs_documents"');
    expect(edgeSource).not.toContain('"calculate_landed_cost"');
    expect(edgeSource).not.toContain('"screen_buyer_sanctions"');
  });

  it("queries every customs head-confirmation row with HSK10 and export type", () => {
    expect(providerSource).toContain(
      "https://apis.data.go.kr/1220000/retrieveCcctLworCd/getRetrieveCcctLworCd",
    );
    expect(providerSource).toContain('url.searchParams.set("hsSgn", context.hsk10)');
    expect(providerSource).toContain('url.searchParams.set("imexTpcd", "1")');
    expect(providerSource).toContain("xml.matchAll(/<item>");
    expect(providerSource).toContain("0건은 수출 관련 법령·인증 요건이 없다는 의미가 아닙니다.");
  });

  it("compares destination imports from world and Korea in Comtrade", () => {
    expect(providerSource).toContain('US: "842"');
    expect(providerSource).toContain('const iso2ToWitsReporter');
    expect(providerSource).toContain('US: "840"');
    expect(providerSource).toContain('partnerCode: "0"');
    expect(providerSource).toContain('partnerCode: "410"');
    expect(providerSource).toContain('url.searchParams.set("cmdCode", params.hs6)');
    expect(providerSource).not.toContain('url.searchParams.set("aggregateBy", "6")');
    expect(providerSource).toContain('await delay(1_100)');
    expect(providerSource).toContain('url.searchParams.set("subscription-key", params.apiKey)');
    expect(providerSource).toContain("comtradeResponseSchema.safeParse");
  });

  it("validates and parses WITS SDMX tariff observations within its provider budget", () => {
    expect(providerSource).toContain("const witsResponseSchema = z.object");
    expect(providerSource).toContain("extractWitsSdmxTariffRows(responseBody.data)");
    expect(providerSource).toContain('attributeValue("MIN_RATE")');
    expect(providerSource).toContain('attributeValue("MAX_RATE")');
    expect(providerSource).toContain("fetchWithRetry(url, {}, 35_000)");
  });

  it("builds USITC confirmation guidance from the current product instead of a fixed tire example", () => {
    expect(providerSource).toContain("buildUsitcClassificationGuidance");
    expect(providerSource).not.toContain("타이어 구조(방사형/기타)와 림 직경");
    expect(providerSource).not.toContain("타이어 구조와 림 직경을 입력한 뒤");
  });

  it("falls back through the latest seven days for EXIM exchange rates", () => {

    expect(providerSource).toContain(
      "https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON",
    );
    expect(providerSource).toContain("for (let daysAgo = 0; daysAgo < 7; daysAgo += 1)");
    expect(providerSource).toContain('url.searchParams.set("data", "AP01")');
    expect(providerSource).toContain('value.replace(/,/g, "")');
    expect(providerSource).toContain("z.array(exchangeRowSchema).safeParse");
  });

  it("loads KOSTI HSK candidates and regional sea-export costs as non-final P1 evidence", () => {
    expect(providerSource).toContain("api.odcloud.kr/api/15034135/v1");
    expect(providerSource).toContain("api.odcloud.kr/api/15116850/v1");
    expect(providerSource).toContain("KOSTI 응답 형식이 올바르지 않습니다.");
    expect(providerSource).toContain("0건은 전략물자가 아니라는 최종판정이 아닙니다.");
    expect(providerSource).toContain('status: "estimated"');
    expect(providerSource).toContain('unit: "천원/2TEU"');
    expect(edgeSource).toContain("syncExternalDatasetVersions");
  });

  it("keeps the shared provider source syntactically valid in truncate", () => {
    const truncateLine = providerSource.split(/\r?\n/).find((line) => line.includes("return value.length <= maxLength"));
    expect(truncateLine).toMatch(/`\s*;$/);
  });

  it("closes normalizeUsitcRow before the next helper", () => {
    expect(providerSource).toMatch(
      /rateInheritedFrom: null,\r?\n  };\r?\n}\r?\n\r?\nfunction findUsitcField/,
    );
  });

  it("retries only one time and preserves partial results", () => {
    expect(providerSource).toContain("for (let attempt = 0; attempt < 2; attempt += 1)");
    expect(providerSource).toContain("response.status === 429 || response.status >= 500");
    expect(edgeSource).toContain("replaceLegacyDetailRows({");
    expect(edgeSource).toContain("failedSourceNames");
    expect(edgeSource).toContain('status: analysisStatus');
    expect(edgeSource).toContain("provider_statuses: providerStatuses");
  });
});

describe("country decision persistence and UI", () => {
  it("creates project-owned RLS tables for facts, actions, runs, and dataset versions", () => {
    for (const table of [
      "country_decision_facts",
      "country_action_items",
      "country_analysis_runs",
      "external_dataset_versions",
    ]) {
      expect(migrationSource).toMatch(new RegExp("CREATE TABLE(?: IF NOT EXISTS)? public\\." + table, "i"));
      expect(migrationSource).toMatch(new RegExp("ALTER TABLE public\\." + table + " ENABLE ROW LEVEL SECURITY", "i"));
    }
    expect(migrationSource).toMatch(/UNIQUE \(project_id, product_id, country_code, fact_key\)/i);
    expect(migrationSource).toMatch(/UNIQUE \(project_id, product_id, country_code, action_key\)/i);
    expect(migrationSource).toMatch(/FOR ALL TO authenticated/i);
    expect(migrationSource).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON public\.country_decision_facts TO authenticated/i);
  });

  it("renders the complete USITC hierarchy and row metadata by default", () => {
    expect(dashboardSource).toContain("useState(true)");
    expect(dashboardSource).toContain("candidate.units");
    expect(dashboardSource).toContain("candidate.footnotes");
    expect(dashboardSource).toContain("candidate.indent");
    expect(dashboardSource).toContain("candidate.rateInheritedFrom");
  });
  it("keeps decisions above the fold and moves long evidence behind disclosure", () => {
    expect(dashboardSource).toContain("수출 적합도");
    expect(dashboardSource).toContain("근거 충족도");
    expect(dashboardSource).toContain("데이터 갱신");
    expect(dashboardSource).toContain("상세 분석");
    expect(dashboardSource).not.toContain("다음 실행 단계");
    expect(dashboardSource).not.toContain("onActionStatusChange");
    expect(edgeSource).toContain("buildDecisionActionRows");
  });

  it("does not render non-API sanctions or generic customs-document sections", () => {
    expect(dashboardSource).not.toContain('{ title: "제재 확인"');
    expect(dashboardSource).not.toContain('{ title: "통관 준비"');
  });
});
