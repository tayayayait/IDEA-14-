import {
  buildTargetMarketInsights,
  collectTargetMarkets,
  extractEvidence,
  applyEvidenceDisplayPolicy,
  type CountryRow,
} from "@/pages/Step3Countries";
import { describe, expect, it } from "vitest";

function makeRow(partial: Partial<CountryRow>): CountryRow {
  return {
    country_code: "ID",
    country_name: "Indonesia",
    market_score: 20,
    cert_score: 12,
    regulation_score: 11,
    payment_score: 10,
    safety_score: 6,
    total_score: 59,
    label: "caution",
    rank: 2,
    rationale: null,
    ...partial,
  };
}

describe("Step3 target-market insight helpers", () => {
  it("collects unique target markets from rationale", () => {
    const rows: CountryRow[] = [
      makeRow({
        rationale: {
          target_markets: [
            { code: "CN", name: "China" },
            { code: "ID", name: "Indonesia" },
          ],
        },
      }),
      makeRow({
        country_code: "CN",
        country_name: "China",
        rationale: {
          target_markets: [{ code: "CN", name: "China" }],
        },
      }),
    ];

    const markets = collectTargetMarkets(rows);
    expect(markets).toEqual([
      { code: "CN", name: "China" },
      { code: "ID", name: "Indonesia" },
    ]);
  });

  it("builds insight with ranking, reasons, and alternatives", () => {
    const rows: CountryRow[] = [
      makeRow({
        country_code: "CN",
        country_name: "China",
        total_score: 48,
        rank: 5,
        rationale: {
          target_markets: [{ code: "CN", name: "China" }],
          inclusion_reason: "Included by target market memo",
          recommendation_reason: "Strong demand but higher compliance burden",
          low_recommendation_reason: "Regulatory cost is high",
          alternative_markets: [
            { code: "ID", name: "Indonesia" },
            { code: "IN", name: "India" },
          ],
        },
      }),
      makeRow({
        country_code: "ID",
        country_name: "Indonesia",
        total_score: 74,
        rank: 1,
        rationale: {
          target_markets: [{ code: "CN", name: "China" }],
        },
      }),
    ];

    const insights = buildTargetMarketInsights(rows);
    expect(insights).toHaveLength(1);
    expect(insights[0].target.code).toBe("CN");
    expect(insights[0].country?.rank).toBe(5);
    expect(insights[0].lowRecommendationReason).toContain("Regulatory");
    expect(insights[0].alternatives.length).toBeGreaterThan(0);
  });

  it("extracts product evidence and country background rows together", () => {
    const row = makeRow({
      country_code: "JP",
      country_name: "Japan",
      rationale: {
        sources: [
          {
            type: "country_background",
            title: "Japan EV policy update",
            country: "Japan",
            published_at: "2026-04-01",
            summary: "Subsidy policy update for imported components",
            keywords: ["EV", "policy"],
            score_relevant: false,
            news_category: "geopolitical_risk",
            recency_tier: "recent",
            selection_reason: "recent<=1y | category:geopolitical_risk",
            impact_summary: "[Export impact] policy change can affect compliance",
          },
          {
            type: "product_evidence",
            title: "Automotive brake demand in Japan",
            country: "Japan",
            published_at: "2026-04-15",
            summary: "HS 870830 demand expansion",
            keywords: "brake,870830",
            score_relevant: true,
            news_category: "product_direct",
            recency_tier: "recent",
            selection_reason: "recent<=1y | hs6 | category:product_direct",
          },
          {
            type: "country_background",
            title: "Japan automotive component investment rises",
            country: "Japan",
            published_at: "2026-03-20",
            summary: "Local suppliers expand capacity for vehicle components",
            keywords: ["automotive", "component", "investment"],
            score_relevant: false,
            news_category: "industry_trend",
            recency_tier: "recent",
            selection_reason: "recent<=1y | category:industry_trend",
          },
        ],
      },
    });

    const evidence = extractEvidence(row);
    expect(evidence).toHaveLength(3);
    expect(evidence.some((item) => item.scoreRelevant)).toBe(true);
    const riskRow = evidence.find((item) => item.title.includes("policy"));
    expect(riskRow?.newsCategory).toBe("geopolitical_risk");
    expect(riskRow?.recencyTier).toBe("recent");
    expect(riskRow?.impactSummary).toContain("수출 영향");
    expect(evidence.some((item) => item.newsCategory === "industry_trend")).toBe(true);
  });

  it("omits empty direct-evidence placeholders from selected-country news", () => {
    const row = makeRow({
      country_code: "US",
      country_name: "United States",
      rationale: {
        sources: [
          {
            type: "product_evidence",
            title: "Direct evidence none",
            country: "United States",
            url: "",
            summary: "",
            keywords: [],
            score_relevant: false,
            news_category: "product_direct",
            recency_tier: "supplementary",
            selection_reason: "No direct news evidence",
          },
          {
            type: "country_background",
            title: "US import demand outlook",
            country: "United States",
            published_at: "2026-04-01",
            summary: "Import demand and logistics conditions changed.",
            keywords: ["import demand", "logistics"],
            score_relevant: false,
            news_category: "geopolitical_risk",
            recency_tier: "recent",
          },
        ],
      },
    });

    const evidence = extractEvidence(row);
    expect(evidence).toHaveLength(1);
    expect(evidence[0].title).toBe("US import demand outlook");
    expect(evidence.some((item) => item.newsCategory === "product_direct")).toBe(false);
  });

  it("decodes html ellipsis entities in evidence text", () => {
    const row = makeRow({
      rationale: {
        sources: [
          {
            type: "product_evidence",
            title: "Memory market outlook &hellip;",
            country: "United States",
            published_at: "2026-04-30",
            summary: "AI server demand expands &hellip; supply remains tight",
            keywords: "DRAM&hellip;,NAND",
            score_relevant: true,
            news_category: "product_direct",
            recency_tier: "recent",
            selection_reason: "recent<=1y | category:product_direct",
          },
        ],
      },
    });

    const evidence = extractEvidence(row);
    expect(evidence[0].title).toBe("Memory market outlook ...");
    expect(evidence[0].summary).toBe("AI server demand expands ... supply remains tight");
    expect(evidence[0].keywords).toContain("DRAM...");
  });

  it("localizes export impact summaries with export-environment keywords", () => {
    const row = makeRow({
      rationale: {
        sources: [
          {
            type: "country_background",
            title: "Macro pressure reshapes memory chip terms",
            country: "United States",
            published_at: "2026-04-30",
            summary: "Consumer spending and dollar pressure affect import terms",
            keywords: ["경기", "달러", "금리"],
            score_relevant: false,
            news_category: "geopolitical_risk",
            recency_tier: "recent",
            selection_reason: "recent<=1y | export_env:경기,달러,금리 | category:geopolitical_risk",
            impact_summary:
              "[Export impact] 경기, 달러, 금리 can affect DRAM, NAND Flash in cost, lead-time, or payment conditions.",
          },
        ],
      },
    });

    const evidence = extractEvidence(row);
    expect(evidence[0].impactSummary).toBe(
      "[수출 영향] 경기, 달러, 금리 변동은 DRAM·NAND Flash의 원가, 납기, 결제 조건에 영향을 줄 수 있습니다.",
    );
  });

  it("does not drop non-brake news titles from evidence list", () => {
    const row = makeRow({
      country_code: "US",
      country_name: "United States",
      rationale: {
        sources: [
          {
            type: "news",
            title: "US semiconductor equipment import trend",
            country: "United States",
            published_at: "2026-03-10",
            summary: "Large fab investment and component sourcing demand",
            score_relevant: false,
          },
        ],
      },
    });

    const evidence = extractEvidence(row);
    expect(evidence).toHaveLength(1);
    expect(evidence[0].title).toContain("semiconductor");
  });

  it("separates other-country supply-chain references from selected-country background news", () => {
    const row = makeRow({
      country_code: "US",
      country_name: "United States",
      rationale: {
        sources: [
          {
            type: "country_background",
            title: "Vietnam semiconductor strategy may affect US supply chains",
            country: "United States",
            published_at: "2026-04-29",
            summary: "Vietnam cluster investment is a supply-chain reference for US buyers.",
            keywords: ["semiconductor", "supply chain"],
            score_relevant: false,
            news_category: "industry_trend",
            recency_tier: "recent",
            country_match_type: "background_country",
            selection_reason: "recent<=1y | category:industry_trend | country:background_mention",
          },
          {
            type: "country_background",
            title: "US tariff outlook changes import terms",
            country: "United States",
            published_at: "2026-04-28",
            summary: "Tariff and logistics changes affect import conditions.",
            keywords: ["tariff", "logistics"],
            score_relevant: false,
            news_category: "geopolitical_risk",
            recency_tier: "recent",
            country_match_type: "direct_country",
            selection_reason: "recent<=1y | export_env:tariff,logistics | category:geopolitical_risk",
          },
        ],
      },
    });

    const evidence = extractEvidence(row);
    expect(evidence.map((item) => item.newsScope)).toEqual([
      "selected_country_export_env",
      "supply_chain_reference",
    ]);
    expect(evidence.find((item) => item.title.includes("Vietnam"))?.label).toBe("공급망/경쟁국 참고뉴스");
  });

  it("shows up to four export-environment and four industry background rows separately", () => {
    const sources = [
      ...Array.from({ length: 5 }, (_, index) => ({
        type: "country_background",
        title: `US macro export condition ${index + 1}`,
        country: "United States",
        published_at: `2026-04-${20 + index}`,
        summary: "Tariff and logistics pressure affect import terms.",
        keywords: ["tariff", "logistics"],
        score_relevant: false,
        news_category: "geopolitical_risk",
        recency_tier: "recent",
      })),
      ...Array.from({ length: 5 }, (_, index) => ({
        type: "country_background",
        title: `US industry background ${index + 1}`,
        country: "United States",
        published_at: `2026-03-${20 + index}`,
        summary: "Distribution channel and product demand background.",
        keywords: ["distribution", "demand"],
        score_relevant: false,
        news_category: "industry_trend",
        recency_tier: "recent",
      })),
    ];
    const row = makeRow({
      country_code: "US",
      country_name: "United States",
      rationale: { sources },
    });

    const groups = applyEvidenceDisplayPolicy(extractEvidence(row));

    expect(groups.geopoliticalRisk).toHaveLength(4);
    expect(groups.industryTrend).toHaveLength(4);
  });
});
