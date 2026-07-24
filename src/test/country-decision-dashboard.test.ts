import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decisionValueLabel, flattenDecisionFactValue } from "@/lib/country-decision-value";
import {
  decisionEvidenceLabel,
  prepareDecisionFactsForDisplay,
  selectKeyDecisionFacts,
  toUserFacingDecisionSummary,
} from "@/lib/country-decision-presentation";
import type { DecisionFact } from "@/lib/country-decision";

const dashboardSource = readFileSync(
  join(process.cwd(), "src/components/CountryDecisionDashboard.tsx"),
  "utf8",
);

describe("CountryDecisionDashboard 운송비 표시", () => {
  it("권역명과 40ft FCL 평균 운송비 금액을 함께 표시한다", () => {
    const entries = Object.fromEntries(flattenDecisionFactValue({
      period: "2026-06",
      routeEstimates: [
        { route: "미국서부", costThousandKrw: 3039 },
        { route: "미국동부", costThousandKrw: 4536 },
      ],
      unit: "천원/2TEU",
      container: "40ft FCL 일반화물(GP)",
    }));

    expect(entries.routeEstimates).toBe("미국서부 3,039천원 / 미국동부 4,536천원");
    expect(entries.unit).toBe("천원/2TEU");
    expect(entries.container).toBe("40ft FCL 일반화물(GP)");
  });
});


describe("CountryDecisionDashboard 사용자용 근거 표시", () => {
  const fact = (overrides: Partial<DecisionFact>): DecisionFact => ({
    id: "fact-1",
    factKey: "certification:kotra",
    category: "certification",
    status: "confirmed",
    severity: "caution",
    summary: "KOTRA 해외인증 후보 1건을 확인했습니다.",
    value: {},
    scope: "hs6",
    sourceName: "KOTRA 해외인증정보",
    sourceUrl: null,
    referenceDate: null,
    fetchedAt: "2026-07-20T01:38:00.000Z",
    caveat: null,
    nextAction: null,
    isStale: false,
    ...overrides,
  });

  it("인증 직접 일치는 필수 인증 확정이 아니라 인증 후보 발견으로 안내한다", () => {
    expect(decisionEvidenceLabel(fact({ category: "certification", status: "confirmed" })))
      .toBe("후보 발견");
  });

  it("KOSTI 연계 후보가 있으면 일반 전략물자 안내를 중복 표시하지 않는다", () => {
    const facts = prepareDecisionFactsForDisplay([
      fact({
        id: "generic",
        factKey: "strategic_goods:classification",
        category: "strategic_goods",
        status: "needs_verification",
        sourceName: "무역안보관리원 전략물자관리시스템",
      }),
      fact({
        id: "candidate",
        factKey: "strategic_goods:kosti_hsk",
        category: "strategic_goods",
        status: "needs_verification",
        sourceName: "무역안보관리원 HSK 연계표",
        value: { candidates: ["5A001.a."] },
      }),
    ]);

    expect(facts.map((item) => item.id)).toEqual(["candidate"]);
  });

  it("핵심 판단은 시장 기회·관세·최우선 확인사항을 중복 없이 보여준다", () => {
    const selected = selectKeyDecisionFacts([
      fact({ id: "cert", category: "certification", status: "confirmed" }),
      fact({ id: "fta", category: "tariff_fta", status: "needs_verification", factKey: "tariff_fta:baseline" }),
      fact({ id: "tariff", category: "tariff_fta", status: "estimated", factKey: "tariff_fta:wits_hs6_range" }),
      fact({ id: "market", category: "market", status: "confirmed", severity: "info" }),
      fact({ id: "strategic", category: "strategic_goods", status: "needs_verification" }),
    ]);

    expect(selected.map((item) => item.id)).toEqual(["market", "tariff", "strategic"]);
  });

  it("K-SURE 영문 요약을 사용자가 이해할 수 있는 한글 문장으로 바꾼다", () => {
    expect(toUserFacingDecisionSummary(
      "Scope: country-specific | Late rate: 18.9% | Avg payment period: 70.4d | Avg late period: 17.2d | Top term: O/A(T/T 포함) (85.7%)",
      "미국",
    )).toBe("미국 거래의 결제 지연율은 18.9%, 평균 결제기간은 70.4일입니다. 평균 지연기간은 17.2일이며, 가장 많이 사용된 결제조건은 O/A(T/T 포함)(85.7%)입니다.");
  });

  it("내부 API 필드명을 사용자용 한글로 표시한다", () => {
    expect(decisionValueLabel("matchStrategy")).toBe("조회 일치 기준");
    expect(decisionValueLabel("countryGrade")).toBe("국가신용등급");
    expect(decisionValueLabel("isReported")).toBe("한국산 실적 신고값");
  });
});

describe("CountryDecisionDashboard 좁은 본문 가독성", () => {
  it("keeps decision cards single-column until a wide desktop and prevents compact values from breaking", () => {
    expect(dashboardSource).toContain('className="grid items-start gap-4 2xl:grid-cols-2"');
    expect(dashboardSource).toContain("isCompactDecisionValue");
    expect(dashboardSource).toContain("whitespace-nowrap");
  });

  it("기본 대시보드에서는 시장 진입 조건을 요약 카드로 표시하고 원문만 상세로 둔다", () => {
    expect(dashboardSource).toContain("const primarySections = sections;");
    expect(dashboardSource).toContain("{primarySections.map((section) => {");
    expect(dashboardSource).toContain("{sections.map((section) => {");
  });
});
