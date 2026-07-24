import { describe, expect, it } from "vitest";
import type { DecisionCategory, DecisionFact } from "@/lib/country-decision";
import {
  buildLogisticsEvidence,
  buildMarketEvidence,
  buildTariffRangeEvidence,
  buildUsitcHtsEvidence,
  groupDecisionFactsForService,
} from "@/lib/country-decision-insights";

const fact = (
  id: string,
  category: DecisionCategory,
  value: unknown,
  factKey = `${category}:${id}`,
): DecisionFact => ({
  id,
  factKey,
  category,
  status: "confirmed",
  severity: "info",
  summary: `${category} evidence`,
  value,
  scope: category === "market" || category === "tariff_fta" ? "hs6" : "country",
  sourceName: "test",
  sourceUrl: null,
  referenceDate: "2025",
  fetchedAt: "2026-07-21T00:00:00.000Z",
  caveat: null,
  nextAction: null,
  isStale: false,
});

describe("country decision service insights", () => {
  it("uses only real UN Comtrade values for the market visual", () => {
    const evidence = buildMarketEvidence([
      fact("market", "market", {
        period: "2025",
        importMarketUsd: 10_512_197_922,
        importsFromKoreaUsd: 585_350_022,
        koreaSharePct: 5.568293389672348,
      }, "market:un_comtrade"),
    ]);

    expect(evidence).toEqual({
      period: "2025",
      importMarketUsd: 10_512_197_922,
      importsFromKoreaUsd: 585_350_022,
      koreaSharePct: 5.57,
      sourceName: "test",
      referenceDate: "2025",
    });
    expect(buildMarketEvidence([fact("empty", "market", { checkedYears: 3 })])).toBeNull();
  });

  it("shows a tariff range only when WITS returned numeric rates", () => {
    const evidence = buildTariffRangeEvidence([
      fact("tariff", "tariff_fta", {
        minRatePct: 0,
        simpleAveragePct: 3.42,
        maxRatePct: 12.5,
      }, "tariff_fta:wits_hs6_range"),
    ]);

    expect(evidence).toMatchObject({ minRatePct: 0, averageRatePct: 3.42, maxRatePct: 12.5 });
    expect(buildTariffRangeEvidence([
      fact("fallback", "tariff_fta", {}, "tariff_fta:baseline"),
    ])).toBeNull();
  });

  it("builds a compact World Bank LPI visual from country-level context", () => {
    const evidence = buildLogisticsEvidence([
      fact("lpi", "cost", {
        overall: 3.8,
        customs: 3.7,
        infrastructure: 3.9,
        internationalShipments: 3.4,
        year: "2022",
      }, "logistics:world_bank_lpi"),
    ]);

    expect(evidence).toMatchObject({
      overall: 3.8,
      customs: 3.7,
      infrastructure: 3.9,
      internationalShipments: 3.4,
      year: "2022",
    });
  });

  it("keeps USITC candidates and additional measures separate", () => {
    const evidence = buildUsitcHtsEvidence([
      fact("usitc", "tariff_fta", {
        candidates: [{
          htsCode: "4011.10.10",
          description: "Radial tires",
          generalRate: "4%",
          specialRate: "Free (KR)",
          otherRate: "10%",
        }],
        additionalMeasures: [{
          htsCode: "9903.40.05",
          description: "Additional duty",
          generalRate: "25%",
          specialRate: "-",
          otherRate: "-",
        }],
        specificationHint: "림 직경 확인",
      }, "tariff_fta:usitc_hts_candidates"),
    ]);

    expect(evidence?.candidates[0].htsCode).toBe("4011.10.10");
    expect(evidence?.additionalMeasures[0].htsCode).toBe("9903.40.05");
  });

  it("prioritizes 10-digit USITC candidates and keeps 8-digit branches in the full list", () => {
    const evidence = buildUsitcHtsEvidence([
      fact("usitc", "tariff_fta", {
        candidates: [
          { htsCode: "4011.10.10", description: "Radial", generalRate: "4%", specialRate: "Free (KR)", otherRate: "10%" },
          { htsCode: "4011.10.10.10", description: "Rim diameter 13 inches or less", generalRate: "4%", specialRate: "Free (KR)", otherRate: "10%" },
          { htsCode: "4011.10.10.50", description: "Rim diameter greater than 16 inches but not more than 17 inches", generalRate: "4%", specialRate: "Free (KR)", otherRate: "10%" },
          { htsCode: "4011.10.50", description: "Other", generalRate: "3.4%", specialRate: "Free (KR)", otherRate: "10%" },
        ],
      }, "tariff_fta:usitc_hts_candidates"),
    ]);

    expect(evidence?.primaryCandidates.map((candidate) => candidate.htsCode)).toEqual([
      "4011.10.10.10",
      "4011.10.10.50",
    ]);
    expect(evidence?.remainingCandidates.map((candidate) => candidate.htsCode)).toEqual([
      "4011.10.10",
      "4011.10.50",
    ]);
    expect(evidence?.primaryCandidates.every((candidate) => candidate.codeLevel === 10)).toBe(true);
    expect(evidence?.remainingCandidates.every((candidate) => candidate.codeLevel === 8)).toBe(true);
  });

  it("falls back to 8-digit USITC branches when no 10-digit candidate is available", () => {
    const evidence = buildUsitcHtsEvidence([
      fact("usitc", "tariff_fta", {
        candidates: [{
          htsCode: "4011.10.10",
          description: "Radial",
          generalRate: "4%",
          specialRate: "Free (KR)",
          otherRate: "10%",
        }],
      }, "tariff_fta:usitc_hts_candidates"),
    ]);

    expect(evidence?.primaryCandidates.map((candidate) => candidate.htsCode)).toEqual(["4011.10.10"]);
    expect(evidence?.primaryCandidates[0]?.isFinalCandidate).toBe(false);
  });
  it("preserves the full HS6 hierarchy and USITC row metadata", () => {
    const evidence = buildUsitcHtsEvidence([
      fact("usitc", "tariff_fta", {
        candidates: [
          { htsCode: "4011.10", description: "Motor car tires", generalRate: "-", specialRate: "-", otherRate: "-", indent: 1, units: [], footnotes: [] },
          { htsCode: "4011.10.10", description: "Radial", generalRate: "4%", specialRate: "Free (KR)", otherRate: "10%", indent: 2, units: [], footnotes: ["See 9903.88.03."] },
          { htsCode: "4011.10.10.10", description: "Rim diameter 13 inches or less", generalRate: "", specialRate: "", otherRate: "", indent: 3, units: ["No."], footnotes: [], rateInheritedFrom: "4011.10.10" },
          { htsCode: "4011.10.10.20", description: "Rim diameter greater than 13 inches but not more than 14 inches", generalRate: "", specialRate: "", otherRate: "", indent: 3, units: ["No."], footnotes: [] },
          { htsCode: "4011.10.50.00", description: "Other", generalRate: "3.4%", specialRate: "Free (KR)", otherRate: "10%", indent: 2, units: ["No."], footnotes: [] },
        ],
      }, "tariff_fta:usitc_hts_candidates"),
    ]);

    expect(evidence?.candidates.map((candidate) => candidate.htsCode)).toEqual([
      "4011.10",
      "4011.10.10",
      "4011.10.10.10",
      "4011.10.10.20",
      "4011.10.50.00",
    ]);
    expect(evidence?.candidates[2]).toMatchObject({
      codeLevel: 10,
      isFinalCandidate: true,
      units: ["No."],
      rateInheritedFrom: "4011.10.10",
    });
    expect(evidence?.candidates[1]?.footnotes).toEqual(["See 9903.88.03."]);
    expect(evidence?.remainingCandidates.map((candidate) => candidate.htsCode)).toEqual([
      "4011.10",
      "4011.10.10",
    ]);
  });
  it("separates destination-market evidence from Korean common export checks", () => {
    const facts = [
      fact("market", "market", {}),
      fact("tariff", "tariff_fta", {}),
      fact("cert", "certification", {}),
      fact("reg", "import_regulation", {}),
      fact("pay", "payment_risk", {}),
      fact("cost", "cost", {}),
      fact("customs", "customs_requirement", {}),
      fact("documents", "customs_documents", {}),
      fact("strategic", "strategic_goods", {}),
      fact("sanctions", "sanctions", {}),
    ];

    const grouped = groupDecisionFactsForService(facts);
    expect(grouped.marketOpportunity.map((item) => item.category)).toEqual(["market"]);
    expect(grouped.marketEntry.map((item) => item.category)).toEqual([
      "tariff_fta",
      "certification",
      "import_regulation",
    ]);
    expect(grouped.transactionRisk.map((item) => item.category)).toEqual(["payment_risk", "cost"]);
    expect(grouped.commonExportChecks.map((item) => item.category)).toEqual([
      "customs_requirement",
      "customs_documents",
      "strategic_goods",
      "sanctions",
    ]);
  });
});
