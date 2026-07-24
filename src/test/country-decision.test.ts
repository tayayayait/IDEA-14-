import { describe, expect, it } from "vitest";
import {
  buildDecisionSummary,
  buildDefaultActionItems,
  parseDecisionFactRows,
  type DecisionFact,
} from "@/lib/country-decision";

function getMockFact(overrides: Partial<DecisionFact> = {}): DecisionFact {
  return {
    id: "fact-1",
    category: "market",
    status: "confirmed",
    severity: "info",
    summary: "목적국 수입시장 근거가 확인됐습니다.",
    value: { importValueUsd: 293_952_776 },
    scope: "hs6",
    sourceName: "UN Comtrade",
    sourceUrl: "https://comtradeplus.un.org/",
    referenceDate: "2025",
    fetchedAt: "2026-07-19T00:00:00.000Z",
    caveat: null,
    nextAction: null,
    isStale: false,
    ...overrides,
  };
}

describe("country decision model", () => {
  it("근거 충족도가 50% 미만이면 기회 점수가 높아도 추가 확인 필요로 표시한다", () => {
    const summary = buildDecisionSummary({ opportunityScore: 96, facts: [getMockFact()] });

    expect(summary.evidenceCompleteness).toBeLessThan(50);
    expect(summary.suitability).toBe("추가 확인 필요");
  });

  it("확인된 차단요소가 있으면 점수와 관계없이 우선 보류한다", () => {
    const categories: DecisionFact["category"][] = [
      "tariff_fta",
      "certification",
      "import_regulation",
      "customs_requirement",
      "payment_risk",
      "market",
      "sanctions",
      "strategic_goods",
    ];
    const facts = categories.map((category, index) => getMockFact({ id: `fact-${index}`, category }));
    facts[2] = getMockFact({
      id: "blocker",
      category: "import_regulation",
      severity: "blocker",
      summary: "현재 수입금지 조치가 확인됐습니다.",
    });

    const summary = buildDecisionSummary({ opportunityScore: 90, facts });

    expect(summary.evidenceCompleteness).toBe(100);
    expect(summary.blockerCount).toBe(1);
    expect(summary.suitability).toBe("우선 보류");
  });

  it("확인과 추정 근거를 분리해 충족도를 계산한다", () => {
    const facts = [
      getMockFact({ category: "tariff_fta", status: "estimated" }),
      getMockFact({ id: "2", category: "certification" }),
      getMockFact({ id: "3", category: "import_regulation", status: "needs_verification" }),
      getMockFact({ id: "4", category: "customs_requirement" }),
    ];

    const summary = buildDecisionSummary({ opportunityScore: 72, facts });

    expect(summary.evidenceCompleteness).toBe(38);
    expect(summary.confirmedCount).toBe(2);
    expect(summary.estimatedCount).toBe(1);
  });

  it("API 근거가 없으면 실행 항목을 생성하지 않는다", () => {
    const actions = buildDefaultActionItems([]);

    expect(actions).toEqual([]);
  });

  it("실제 API 근거가 있는 항목만 다음 행동으로 생성한다", () => {
    const actions = buildDefaultActionItems([
      getMockFact({
        id: "tariff",
        factKey: "tariff_fta:wits_hs6_range",
        category: "tariff_fta",
        status: "estimated",
        sourceName: "World Bank WITS / UNCTAD TRAINS",
      }),
      getMockFact({
        id: "customs-empty",
        factKey: "customs_confirmation:no_direct_match",
        category: "customs_requirement",
        status: "needs_verification",
        value: { resultCount: 0 },
        sourceName: "관세청 세관장확인대상물품",
      }),
      getMockFact({
        id: "strategic-empty",
        factKey: "strategic_goods:kosti_no_direct_match",
        category: "strategic_goods",
        status: "needs_verification",
        value: { resultCount: 0 },
        sourceName: "무역안보관리원 HSK 연계표",
      }),
      getMockFact({
        id: "payment",
        factKey: "payment_risk:ksure",
        category: "payment_risk",
        sourceName: "K-SURE 국가·결제위험",
      }),
    ]);

    expect(actions.map((item) => item.actionKey)).toEqual([
      "confirm_destination_tariff_code",
      "review_payment_and_insurance",
    ]);
  });

  it("외부 응답의 허용되지 않은 상태와 필수값 누락을 제거한다", () => {
    const parsed = parseDecisionFactRows([
      getMockFact(),
      { ...getMockFact({ id: "bad-status" }), status: "safe" },
      { ...getMockFact({ id: "missing-source" }), sourceName: "" },
    ]);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe("fact-1");
  });

  it("PostgREST가 반환하는 UTC offset 타임스탬프를 근거로 파싱한다", () => {
    const parsed = parseDecisionFactRows([{
      id: "postgres-fact",
      category: "cost",
      status: "confirmed",
      severity: "info",
      summary: "환율을 확인했습니다.",
      value_json: { currency: "USD" },
      scope_level: "country",
      source_name: "한국수출입은행",
      source_url: "https://www.koreaexim.go.kr/",
      reference_date: "20260716",
      fetched_at: "2026-07-19T11:28:28.616+00:00",
      caveat: null,
      next_action: null,
      is_stale: false,
    }]);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe("postgres-fact");
  });
});
