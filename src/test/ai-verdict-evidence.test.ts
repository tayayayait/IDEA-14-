import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildVerifiedEvidenceCatalog,
  finalizeAiVerdict,
} from "../../supabase/functions/_shared/ai-verdict-evidence";

describe("AI verdict evidence pipeline", () => {
  it("provides a shared evidence verifier for the Step 4 edge function", () => {
    expect(
      existsSync(join(process.cwd(), "supabase/functions/_shared/ai-verdict-evidence.ts")),
    ).toBe(true);
  });

  it("accepts scoped official evidence and rejects unverified web claims", () => {
    const catalog = buildVerifiedEvidenceCatalog({
      countryCode: "JP",
      hs6: "848210",
      retrievedAt: "2026-07-27T00:00:00.000Z",
      decisionFacts: [
        {
          id: "fact-tariff",
          factKey: "tariff_fta:national_tariff_candidates",
          category: "tariff_fta",
          status: "confirmed",
          summary: "일본 공식 관세표에서 세율을 확인했습니다.",
          value: { candidates: [{ tariffCode: "848210000", mfnRate: "Free" }] },
          sourceName: "Japan Customs",
          sourceUrl: "https://www.customs.go.jp/english/tariff/",
          referenceDate: "2026-04-01",
        },
      ],
      groundedSources: [
        { name: "METI export control", url: "https://www.meti.go.jp/policy/anpo/" },
        { name: "Unverified blog", url: "https://trade-example.blog/japan-bearing" },
      ],
      groundedClaims: [
        {
          claimId: "web:jp-export-control",
          claim: "기술사양에 따라 수출통제 판정이 필요합니다.",
          category: "strategic_goods",
          countryCode: "JP",
          hsCode: "848210",
          scopeMatch: true,
          verificationStatus: "confirmed",
          sourceName: "METI",
          sourceUrl: "https://www.meti.go.jp/policy/anpo/",
          effectiveDate: "2026-01-01",
        },
        {
          claimId: "web:blog-cost",
          claim: "시험 비용은 무조건 500만 원입니다.",
          category: "certification",
          countryCode: "JP",
          hsCode: "848210",
          scopeMatch: true,
          verificationStatus: "confirmed",
          sourceName: "Unverified blog",
          sourceUrl: "https://trade-example.blog/japan-bearing",
        },
      ],
    });

    expect(catalog.evidence.map((item: { id: string }) => item.id)).toEqual([
      "program:tariff_fta:national_tariff_candidates",
      "web:jp-export-control",
    ]);
    expect(catalog.rejectedClaims).toContainEqual(
      expect.objectContaining({ claimId: "web:blog-cost", reason: "official_source_required" }),
    );
  });

  it("overrides model confidence and labels unsupported numbers as AI planning estimates", () => {
    const catalog = buildVerifiedEvidenceCatalog({
      countryCode: "JP",
      hs6: "848210",
      retrievedAt: "2026-07-27T00:00:00.000Z",
      decisionFacts: [
        {
          id: "fact-tariff",
          factKey: "tariff_fta:national_tariff_candidates",
          category: "tariff_fta",
          status: "confirmed",
          summary: "일본 공식 관세표에서 세율을 확인했습니다.",
          value: { candidates: [{ tariffCode: "848210000", mfnRate: "Free" }] },
          sourceName: "Japan Customs",
          sourceUrl: "https://www.customs.go.jp/english/tariff/",
          referenceDate: "2026-04-01",
        },
      ],
      groundedSources: [],
      groundedClaims: [],
    });

    const verdict = finalizeAiVerdict({
      rawVerdict: {
        opinion: "조건부 진출 가능",
        executiveSummary: "관세 장벽은 낮지만 추가 검증이 필요합니다.",
        opinionDetail: "공식 근거와 AI 해석을 분리합니다.",
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
            evidenceIds: ["program:tariff_fta:national_tariff_candidates"],
          },
          {
            point: "P5 이상 제품은 모두 전략물자입니다.",
            evidenceIds: ["web:not-found"],
          },
        ],
        majorRisks: [],
        recommendedActions: [
          {
            action: "시험기관 견적 확인",
            reason: "정확한 시험 범위를 확인합니다.",
            priority: "medium",
            estimatedCost: "약 200~500만 원",
            evidenceIds: [],
          },
        ],
        confidence: "높음",
        confidenceReason: "Gemini 판단",
        officialSources: [{ name: "임의 출처", url: "https://example.com" }],
      },
      catalog,
      requiredCategories: ["tariff_fta", "certification", "payment_risk", "strategic_goods"],
      now: "2026-07-27T00:00:00.000Z",
    });

    const keyBasis = verdict.keyBasis as Array<Record<string, unknown>>;
    const recommendedActions = verdict.recommendedActions as Array<Record<string, unknown>>;
    expect(keyBasis[0]).toMatchObject({ evidenceLevel: "official_confirmed" });
    expect(keyBasis[1]).toMatchObject({ evidenceLevel: "needs_verification", evidenceIds: [] });
    expect(recommendedActions[0]).toMatchObject({
      estimateType: "ai_planning_estimate",
      estimatedCost: "AI 계획용 추정 · 약 200~500만 원",
    });
    expect(verdict.confidence).not.toBe("높음");
    expect(verdict.confidenceScore).toBeLessThan(85);
    expect(verdict.officialSources).toEqual([
      expect.objectContaining({ name: "Japan Customs", url: "https://www.customs.go.jp/english/tariff/" }),
    ]);
  });
});
