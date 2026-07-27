import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiFinalVerdictCard } from "@/components/AiFinalVerdictCard";
import type { DecisionFact } from "@/lib/country-decision";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null }),
  };

  return {
    supabase: {
      from: vi.fn(() => query),
      functions: { invoke: invokeMock },
    },
  };
});

describe("AI final verdict card", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockReturnValue(new Promise(() => {}));
  });

  it("sends a boolean force_refresh value when the generate button is clicked", () => {
    render(
      <AiFinalVerdictCard
        projectId="project-1"
        facts={[]}
        countryCode="US"
        countryName="미국"
        productName="테스트 제품"
        hs6="123456"
        opportunityScore={80}
        detailExecuted
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "AI 판단 생성" }));

    expect(invokeMock).toHaveBeenCalledOnce();
    expect(invokeMock.mock.calls[0][1].body.force_refresh).toBe(false);
  });

  it("sends complete source evidence instead of summary-only facts", () => {
    const fact: DecisionFact = {
      id: "fact-jp-tariff",
      factKey: "tariff_fta:national_tariff_candidates",
      category: "tariff_fta",
      status: "confirmed",
      severity: "info",
      summary: "일본 공식 관세표에서 세율을 확인했습니다.",
      value: {
        candidates: [{ tariffCode: "848210000", mfnRate: "Free", koreaPreferentialRate: "Free" }],
      },
      scope: "hs6",
      sourceName: "Japan Customs Tariff Schedule",
      sourceUrl: "https://www.customs.go.jp/english/tariff/",
      referenceDate: "2026-04-01",
      fetchedAt: "2026-07-27T00:00:00.000Z",
      caveat: "신고 전 일본어 법령 원문을 확인해야 합니다.",
      nextAction: "일본 9자리 세번을 확정하세요.",
      isStale: false,
    };

    render(
      <AiFinalVerdictCard
        projectId="project-1"
        facts={[fact]}
        countryCode="JP"
        countryName="일본"
        productName="고정밀 볼베어링"
        hs6="848210"
        opportunityScore={80}
        detailExecuted
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "AI 판단 생성" }));

    const sentFact = invokeMock.mock.calls[0][1].body.decision_facts[0];
    expect(sentFact).toMatchObject({
      id: "fact-jp-tariff",
      factKey: "tariff_fta:national_tariff_candidates",
      sourceUrl: "https://www.customs.go.jp/english/tariff/",
      referenceDate: "2026-04-01",
      fetchedAt: "2026-07-27T00:00:00.000Z",
      value: {
        candidates: [{ tariffCode: "848210000", mfnRate: "Free", koreaPreferentialRate: "Free" }],
      },
    });
  });

  it("shows evidence levels, computed confidence, planning estimates, and official source links", async () => {
    invokeMock.mockResolvedValue({
      data: {
        verdict: {
          opinion: "조건부 진출 가능",
          executiveSummary: "공식 근거와 추가 확인 항목을 분리했습니다.",
          opinionDetail: "확인된 관세 근거를 우선 적용합니다.",
          riskScoreboard: {
            tariffRisk: "낮음",
            certificationRisk: "보통",
            paymentRisk: "보통",
            logisticsRisk: "낮음",
            legalRisk: "보통",
          },
          keyBasis: [
            {
              point: "일본 공식 관세표에 세율 후보가 있습니다.",
              source: "Japan Customs",
              sourceUrl: "https://www.customs.go.jp/english/tariff/",
              evidenceIds: ["program:tariff"],
              evidenceLevel: "official_confirmed",
              verificationNote: "공식 원문 근거가 연결되었습니다.",
            },
            {
              point: "정밀도별 전략물자 기준은 추가 확인이 필요합니다.",
              evidenceIds: [],
              evidenceLevel: "needs_verification",
              verificationNote: "직접 연결된 공식 근거가 없습니다.",
            },
          ],
          majorRisks: [],
          recommendedActions: [
            {
              action: "시험기관 견적 확인",
              reason: "실제 사양에 맞는 견적을 받습니다.",
              priority: "medium",
              estimatedCost: "AI 계획용 추정 · 약 200~500만 원",
              estimateType: "ai_planning_estimate",
              evidenceIds: [],
              evidenceLevel: "needs_verification",
            },
          ],
          confidence: "낮음",
          confidenceScore: 58,
          confidenceReason: "핵심 주장 근거 연결 1/2건",
          evidenceSummary: {
            programFactCount: 1,
            officialWebClaimCount: 0,
            rejectedWebClaimCount: 1,
            supportedClaimCount: 1,
            totalClaimCount: 2,
            supportedClaimRatio: 50,
            conflictCount: 0,
            missingCriticalChecks: ["certification", "strategic_goods"],
          },
          officialSources: [
            {
              name: "Japan Customs",
              url: "https://www.customs.go.jp/english/tariff/",
              relevance: "일본 공식 관세표",
              referenceDate: "2026-04-01",
              evidenceIds: ["program:tariff"],
            },
          ],
        },
      },
      error: null,
    });

    render(
      <AiFinalVerdictCard
        projectId="project-1"
        facts={[]}
        countryCode="JP"
        countryName="일본"
        productName="고정밀 볼베어링"
        hs6="848210"
        opportunityScore={80}
        detailExecuted
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "AI 판단 생성" }));

    await waitFor(() => expect(screen.getByText("신뢰도 낮음 · 58점")).toBeInTheDocument());
    expect(screen.getByText("공식 확인")).toBeInTheDocument();
    expect(screen.getAllByText("추가 확인").length).toBeGreaterThan(0);
    expect(screen.getByText(/AI 계획용 추정 · 약 200~500만 원/)).toBeInTheDocument();
    const sourceLinks = screen.getAllByRole("link", { name: /Japan Customs/ });
    expect(sourceLinks[0]).toHaveAttribute("href", "https://www.customs.go.jp/english/tariff/");
    expect(screen.getByText("근거 연결 1/2건 · 50%")).toBeInTheDocument();
  });
});
