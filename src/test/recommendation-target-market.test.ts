import {
  addCountrySignal,
  collectCandidatePool,
  combineMarketScore,
  computeResultState,
  detectCountryCodesFromText,
  extractTargetMarketCodes,
  fallbackScoreParts,
  limitCandidatePool,
  scoreKsurePaymentEvidence,
  scoreSafetyControlEvidence,
  canonicalizeTargetMarkets,
  buildCountryAliases,
  isCountryTextMatched,
  totalScore,
  type CandidateSignal,
} from "../../supabase/functions/_shared/recommendation";
import { describe, expect, it } from "vitest";
import * as recommendation from "../../supabase/functions/_shared/recommendation";

function makeSignalMap(input: Array<[string, CandidateSignal[]]>) {
  const map = new Map<string, Set<CandidateSignal>>();
  for (const [code, signals] of input) {
    for (const signal of signals) addCountrySignal(map, code, signal);
  }
  return map;
}

describe("recommendation candidate logic", () => {
  it("enables the presentation override only for passenger-car tire HS codes", () => {
    const shouldEnable = (recommendation as Record<string, unknown>)
      .shouldEnableTireUsPresentationDemo as ((hsCode: string, hskCode: string) => boolean) | undefined;

    expect(shouldEnable).toBeTypeOf("function");
    expect(shouldEnable?.("401110", "4011101000")).toBe(true);
    expect(shouldEnable?.("850423", "8504230000")).toBe(false);
  });

  it("retains and labels the US presentation candidate in the bounded pool", () => {
    const signals = makeSignalMap([
      ["CN", ["hs6_exact"]],
      ["VN", ["customs_export_data"]],
      ["TH", ["regulation_data"]],
      ["US", ["presentation_demo" as CandidateSignal]],
    ]);
    const pooled = collectCandidatePool({ signalMap: signals, targetMarketCodes: [], minCount: 3 });
    const limited = limitCandidatePool(pooled, ["US"], 3);

    expect(limited.countries.map((row) => row.code)).toContain("US");
    expect(recommendation.signalLabel("presentation_demo" as CandidateSignal)).toBe("발표용 우선 후보");
  });

  it("places the presentation country in Top 3 without changing its score", () => {
    const ensureTopN = (recommendation as Record<string, unknown>).ensureCountryInTopN as
      | (<T extends { country_code: string; rank: number; total_score: number }>(rows: T[], countryCode: string, topN: number) => T[])
      | undefined;
    const rows = [
      { country_code: "CN", rank: 1, total_score: 84 },
      { country_code: "VN", rank: 2, total_score: 80 },
      { country_code: "TH", rank: 3, total_score: 77 },
      { country_code: "US", rank: 4, total_score: 68 },
    ];

    expect(ensureTopN).toBeTypeOf("function");
    const result = ensureTopN?.(rows, "US", 3) ?? [];
    expect(result.slice(0, 3).map((row) => row.country_code)).toEqual(["CN", "VN", "US"]);
    expect(result.find((row) => row.country_code === "US")?.total_score).toBe(68);
    expect(result.map((row) => row.rank)).toEqual([1, 2, 3, 4]);
  });

  it("parses target-market memo and extracts countries", () => {
    const note = "\uC911\uAD6D \uC2DC\uC7A5 \uC9C4\uCD9C \uAC80\uD1A0, \uC778\uB3C4\uB124\uC2DC\uC544\uB3C4 \uBE44\uAD50";
    const codes = extractTargetMarketCodes(note);

    expect(codes).toContain("CN");
    expect(codes).toContain("ID");
  });

  it("expands regional memo keywords for southeast asia and north america", () => {
    const note = "\uBAA9\uD45C\uC2DC\uC7A5: \uB3D9\uB0A8\uC544 \uBC0F \uBD81\uBBF8 \uC9C4\uCD9C \uC6B0\uC120";
    const codes = extractTargetMarketCodes(note);

    expect(codes).toEqual(expect.arrayContaining(["VN", "TH", "MY", "ID", "US", "MX"]));
  });

  it("prefers indonesia over india when note contains 인도네시아", () => {
    const note = "목표시장: 베트남·인도네시아";
    const codes = extractTargetMarketCodes(note);

    expect(codes).toContain("VN");
    expect(codes).toContain("ID");
    expect(codes).not.toContain("IN");
  });

  it("keeps India when explicitly provided as ISO code", () => {
    const note = "Target market: IN, 베트남, 인도네시아";
    const codes = extractTargetMarketCodes(note);

    expect(codes).toEqual(expect.arrayContaining(["IN", "VN", "ID"]));
  });

  it("does not detect India from non-boundary hangul words", () => {
    const codes = detectCountryCodesFromText("인도네시아시장 중심 전략");

    expect(codes).toContain("ID");
    expect(codes).not.toContain("IN");
  });

  it("normalizes official country display names to API country aliases", () => {
    expect(isCountryTextMatched("US", "미합중국(The United States of America)", "nat=미국 regn=북미")).toBe(true);
    expect(isCountryTextMatched("JP", "일본(Japan)", "nat=일본")).toBe(true);
    expect(isCountryTextMatched("CN", "중화인민공화국(The People's Republic of China)", "nat=중국")).toBe(true);
    expect(isCountryTextMatched("GB", "영국(United Kingdom)", "nat=UK regn=Europe")).toBe(true);
  });

  it("builds shared country aliases without matching India inside Indonesia", () => {
    const usAliases = buildCountryAliases("US", "미합중국(The United States of America)");

    expect(usAliases).toEqual(expect.arrayContaining(["미국", "미합중국", "united states of america"]));
    expect(isCountryTextMatched("IN", "인도(India)", "인도네시아시장 중심 전략")).toBe(false);
    expect(isCountryTextMatched("ID", "인도네시아(Indonesia)", "인도네시아시장 중심 전략")).toBe(true);
  });

  it("canonicalizes target_markets payload to code/name pairs before persistence", () => {
    const canonical = canonicalizeTargetMarkets([
      { code: "vn", name: "Viet Nam (legacy)" },
      { name: "인도네시아" },
      { country_code: "in" },
      { code: "XX", name: "Unknown" },
      "미국, 독일",
      null,
    ]);

    expect(canonical).toEqual([
      { code: "VN", name: "Vietnam" },
      { code: "ID", name: "Indonesia" },
      { code: "IN", name: "India" },
      { code: "US", name: "United States" },
      { code: "DE", name: "Germany" },
    ]);
  });

  it("keeps only signal-based countries and adds fallback only when <3", () => {
    const signals = makeSignalMap([
      ["CN", ["hs6_exact", "cert_data"]],
      ["JP", ["product_keyword"]],
    ]);
    const pooled = collectCandidatePool({
      signalMap: signals,
      targetMarketCodes: [],
      minCount: 3,
    });

    const codes = pooled.countries.map((row) => row.code);
    expect(codes).toContain("CN");
    expect(codes).toContain("JP");
    expect(codes.length).toBe(3);
    expect(pooled.fallbackCodes.length).toBe(1);
  });

  it("limits recommendation candidates while retaining target markets first", () => {
    const signals = makeSignalMap([
      ["US", ["hs6_exact", "cert_data"]],
      ["DE", ["hs4_prefix", "regulation_data"]],
      ["JP", ["product_keyword"]],
      ["CN", ["target_market_note"]],
      ["VN", ["news_match"]],
    ]);
    const pooled = collectCandidatePool({
      signalMap: signals,
      targetMarketCodes: ["CN"],
      minCount: 3,
    });

    const limited = limitCandidatePool(pooled, ["CN"], 3);

    expect(limited.countries.map((row) => row.code)).toEqual(["CN", "US", "DE"]);
    expect([...limited.signalByCountry.keys()].sort()).toEqual(["CN", "DE", "US"]);
    expect(limited.fallbackCodes).toEqual([]);
  });

  it("does not force ranking from memo and reflects score changes", () => {
    const scenarioA = [
      {
        code: "JP",
        total: totalScore({
          market: combineMarketScore(20, 29),
          cert: 17,
          regulation: 16,
          payment: 16,
          safety: 8,
        }),
      },
      {
        code: "CN",
        total: totalScore({
          market: combineMarketScore(20, 13),
          cert: 10,
          regulation: 9,
          payment: 9,
          safety: 6,
        }),
      },
    ].sort((a, b) => b.total - a.total);

    const scenarioB = [
      {
        code: "JP",
        total: totalScore({
          market: combineMarketScore(20, 9),
          cert: 10,
          regulation: 9,
          payment: 9,
          safety: 6,
        }),
      },
      {
        code: "CN",
        total: totalScore({
          market: combineMarketScore(20, 26),
          cert: 15,
          regulation: 14,
          payment: 13,
          safety: 7,
        }),
      },
    ].sort((a, b) => b.total - a.total);

    expect(scenarioA[0].code).toBe("JP");
    expect(scenarioB[0].code).toBe("CN");
  });

  it("marks partial_success when fallback scoring is used", () => {
    const state = computeResultState({
      apiPartial: false,
      fallbackUsed: true,
    });
    expect(state).toBe("partial_success");
  });

  it("generates bounded API-only fallback scores", () => {
    const score = fallbackScoreParts({
      apiMarketScore: 17,
      hasCountryInfo: true,
      hasCountryNews: false,
      certSignalCount: 2,
      regulationSignalCount: 1,
      hasHs6: true,
      hasHs4: false,
      targetMatched: true,
    });

    expect(score.market).toBeGreaterThanOrEqual(0);
    expect(score.market).toBeLessThanOrEqual(30);
    expect(score.cert).toBeLessThanOrEqual(20);
    expect(score.regulation).toBeLessThanOrEqual(20);
    expect(score.payment).toBeLessThanOrEqual(20);
    expect(score.safety).toBeLessThanOrEqual(10);
  });

  it("keeps payment and safety conservative when cert/reg signals are zero", () => {
    const lowCompliance = fallbackScoreParts({
      apiMarketScore: 20,
      hasCountryInfo: true,
      hasCountryNews: true,
      certSignalCount: 0,
      regulationSignalCount: 0,
      hasHs6: true,
      hasHs4: false,
      targetMatched: true,
    });
    const highCompliance = fallbackScoreParts({
      apiMarketScore: 20,
      hasCountryInfo: true,
      hasCountryNews: true,
      certSignalCount: 3,
      regulationSignalCount: 2,
      hasHs6: true,
      hasHs4: false,
      targetMatched: true,
    });

    expect(lowCompliance.payment).toBeLessThan(highCompliance.payment);
    expect(lowCompliance.safety).toBeLessThan(highCompliance.safety);
  });

  it("uses direct K-SURE evidence score before heuristic payment scoring", () => {
    const highRiskPayment = scoreKsurePaymentEvidence({
      countryGradeLevel: "high",
      industryRiskLevel: "caution",
      paymentRiskLevel: "high",
      paymentScope: "country",
    });

    const score = fallbackScoreParts({
      apiMarketScore: 24,
      hasCountryInfo: true,
      hasCountryNews: true,
      certSignalCount: 2,
      regulationSignalCount: 2,
      hasHs6: true,
      hasHs4: false,
      targetMatched: true,
      paymentEvidenceScore: highRiskPayment,
    });

    expect(highRiskPayment).toBeLessThan(10);
    expect(score.payment).toBe(highRiskPayment);
  });

  it("uses direct SafetyKorea and strategic-item evidence score before heuristic safety scoring", () => {
    const safetyScore = scoreSafetyControlEvidence({
      strategicMatchType: "exact_hsk",
      recallCount: 2,
      certCount: 1,
      safetyStatus: "success",
    });

    const score = fallbackScoreParts({
      apiMarketScore: 24,
      hasCountryInfo: true,
      hasCountryNews: true,
      certSignalCount: 2,
      regulationSignalCount: 2,
      hasHs6: true,
      hasHs4: false,
      targetMatched: true,
      safetyEvidenceScore: safetyScore,
    });

    expect(safetyScore).toBeLessThan(5);
    expect(score.safety).toBe(safetyScore);
  });
});
