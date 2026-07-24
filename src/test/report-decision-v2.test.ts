import { describe, expect, it } from "vitest";
import {
  buildReportDraftFallback,
  normalizeReportDraft,
  type ReportEvidenceBundle,
} from "@/lib/report-draft";

const evidence: ReportEvidenceBundle = {
  company: { companyName: "테스트 제조사", industrialComplex: "산업단지", address: "대한민국" },
  product: { name: "산업용 타이어", hsCode: "401110", hskCode: "4011100000", hsReviewRequired: false },
  topCountries: [{
    countryCode: "US",
    countryName: "미국",
    totalScore: 82,
    label: "검토권장",
    summary: "최근 12개월 수출 흐름이 확인됨",
    customsExport12mUsd: 12_000_000,
    customsExportStatus: "available",
  }],
  certs: [{ countryCode: "US", category: "certification", summary: "인증 요구사항 확인 필요", sourceOrg: "KOTRA" }],
  regs: [{ countryCode: "US", category: "regulation", summary: "수입규제 적용 범위 확인 필요", sourceOrg: "KOTRA" }],
  risks: [{ countryCode: "US", category: "k_sure_payment", summary: "결제 지연 위험 확인", sourceOrg: "K-SURE" }],
  decisionFacts: [],
  decisionActions: [],
  safetyFlags: [],
  apiLogs: [],
  missingEvidence: [],
};

describe("decision-first report draft v2", () => {
  it("builds a selected-country v2 fallback without legacy or news fields", () => {
    const draft = buildReportDraftFallback(evidence);

    expect(draft.schemaVersion).toBe(2);
    expect(draft.decision.verdict).toBe("conditional");
    expect(draft.entryStrategy.countryCode).toBe("US");
    expect(draft.actionPlan.map((item) => item.horizon)).toEqual(expect.arrayContaining(["D+7", "D+30", "D+90"]));
    expect(draft.decisionGates.map((gate) => gate.topic)).toEqual(expect.arrayContaining([
      "certification",
      "regulation",
      "tariff",
      "profitability",
      "payment",
      "safety",
    ]));
    expect(draft).not.toHaveProperty("newsImpactAnalysis");
    expect(draft).not.toHaveProperty("executiveSummary");
    expect(draft).not.toHaveProperty("exportFeasibility");
    expect(draft).not.toHaveProperty("topCountryReason");
  });

  it("forces hold when any decision gate is blocked", () => {
    const draft = normalizeReportDraft({
      schemaVersion: 2,
      decision: {
        verdict: "proceed",
        confidence: "high",
        headline: "즉시 진입",
        reason: "시장성이 충분함",
        immediateActions: [{ action: "견적 발송", owner: "영업", evidenceRefs: ["P-COUNTRY-001"] }],
        evidenceRefs: ["P-COUNTRY-001"],
      },
      decisionGates: [{
        topic: "regulation",
        status: "blocked",
        decision: "수입 금지 가능성이 있어 중단",
        requiredAction: "관할 기관 확인",
        owner: "규제 담당",
        due: "D+7",
        stopCondition: "허용 근거를 확보하지 못함",
        evidenceRefs: ["P-REG-001"],
      }],
    }, evidence);

    expect(draft.decision.verdict).toBe("hold");
  });

  it("caps proceed at conditional for a critical check and lowers confidence for weak evidence", () => {
    const draft = normalizeReportDraft({
      schemaVersion: 2,
      decision: {
        verdict: "proceed",
        confidence: "high",
        headline: "진입 가능",
        reason: "추가 확인이 필요함",
        immediateActions: [{ action: "인증 확인", owner: "인증 담당", evidenceRefs: [] }],
        evidenceRefs: [],
      },
      decisionGates: [{
        topic: "certification",
        status: "check_required",
        decision: "적용 인증 미확정",
        requiredAction: "공식 인증기관에 적용 여부 확인",
        owner: "인증 담당",
        due: "D+7",
        stopCondition: "필수 인증 비용이 목표 원가를 초과함",
        evidenceRefs: [],
      }],
      officialResearch: { summary: "", keyFindings: [], queries: [], sources: [], conflicts: ["관세율 불일치"] },
    }, evidence);

    expect(draft.decision.verdict).toBe("conditional");
    expect(draft.decision.confidence).toBe("low");
  });

  it("converts a legacy stored report to the v2 decision structure", () => {
    const draft = normalizeReportDraft({
      executiveSummary: "기존 AI 요약",
      aiDecision: {
        verdict: "conditional",
        confidence: "medium",
        rationale: "인증과 결제조건 확인이 필요함",
        recommendedDirection: "샘플 견적부터 검증",
        opportunities: ["수출 흐름 확인"],
        blockers: ["인증 미확정"],
        stopConditions: ["인증 불가 시 중단"],
      },
      actionPlan7Days: ["인증기관 문의"],
      actionPlan30Days: ["바이어 견적 협의"],
      actionPlan90Days: ["파일럿 성과 재평가"],
    }, evidence);

    expect(draft.schemaVersion).toBe(2);
    expect(draft.decision.headline).toBe("기존 AI 요약");
    expect(draft.decision.reason).toContain("인증과 결제조건");
    expect(draft.entryStrategy.primaryChannel).toContain("샘플");
    expect(draft.actionPlan).toHaveLength(3);
  });
});
