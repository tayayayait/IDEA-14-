import { describe, expect, test } from "vitest";
import {
  buildReportDraftFallback,
  normalizeReportDraft,
  type ReportEvidenceBundle,
} from "../lib/report-draft";

const mockEvidenceBundle: ReportEvidenceBundle = {
  company: { companyName: "(주)테스트타이어", industrialComplex: "창원 국가산업단지", address: "경남 창원시" },
  product: { name: "승용차용 타이어", hsCode: "401110", hskCode: "4011100000", hsReviewRequired: false },
  topCountries: [{ countryCode: "US", countryName: "미국", totalScore: 88, label: "최우선 추천", summary: "시장규모 우수" }],
  certs: [{ countryCode: "US", category: "certification", level: "high", summary: "DOT 인증 필수", sourceOrg: "KOTRA" }],
  regs: [{ countryCode: "US", category: "regulation", level: "medium", summary: "FMVSS 139 반덤핑 조사", sourceOrg: "USITC" }],
  risks: [{ countryCode: "US", category: "payment_risk", level: "low", summary: "미국 국가신용등급 A1", sourceOrg: "K-SURE" }],
  safetyFlags: [],
  apiLogs: [],
  missingEvidence: [],
};

describe("ReportDraft v3 확장 및 riskScoreboard 검증", () => {
  test("buildReportDraftFallback이 schemaVersion 3 및 기본 riskScoreboard를 생성해야 함", () => {
    const fallback = buildReportDraftFallback(mockEvidenceBundle);
    expect(fallback.schemaVersion).toBe(3);
    expect(fallback.riskScoreboard).toBeDefined();
    expect(fallback.riskScoreboard?.tariffRisk).toBe("보통");
    expect(fallback.riskScoreboard?.certificationRisk).toBe("보통");
    expect(fallback.riskScoreboard?.paymentRisk).toBe("보통");
    expect(fallback.decisionLogicSummary).toContain("프로그램 자동 수집 데이터");
  });

  test("normalizeReportDraft가 v3 입력 데이터의 riskScoreboard 및 risk deep-dive 필드를 정상 파싱해야 함", () => {
    const rawV3Input = {
      schemaVersion: 3,
      decision: {
        verdict: "conditional",
        confidence: "high",
        confidenceReason: "공식 웹 근거 2건 및 KOTRA 자료 검증 완료",
        headline: "미국 시장은 DOT 인증 확인 후 제한적 진행 권장",
        reason: "시장 규모는 유망하나 FMVSS 인증 준수가 필수적임",
        immediateActions: [
          {
            action: "DOT 시험기관 신청 및 샘플 테스트 진행",
            owner: "인증 담당",
            priority: "high",
            timeline: "D+7",
            difficulty: "보통",
            estimatedCost: "약 500만원",
            govSupport: "KOTRA 해외인증 지원사업 70% 보조",
            subSteps: ["공인 시험소 선정", "샘플 3세트 발송", "성적서 발급"],
            evidenceRefs: ["P-CERT-001"],
          },
        ],
        evidenceRefs: ["P-COUNTRY-001"],
      },
      decisionLogicSummary: "UN Comtrade 수입규모 1위 국가이나 DOT 규제 미충족 시 반송 리스크가 큼",
      riskScoreboard: {
        tariffRisk: "낮음",
        certificationRisk: "높음",
        paymentRisk: "낮음",
        logisticsRisk: "보통",
        legalRisk: "보통",
      },
      decisionReasons: [
        {
          type: "risk",
          title: "DOT/FMVSS No. 139 안전규격 미취득 위험",
          interpretation: "미국 도로교통안전국 필수 안전기준에 미달할 경우 판매 금지 조치됨",
          businessImpact: "통관 거부 및 전량 회수 손실 발생 가능",
          severity: "치명적",
          likelihood: "보통",
          financialImpact: "통관 거부 시 반송비용 및 과태료 약 3,000만원",
          mitigation: "계약 전 미국 인정 시험소(NHTSA 등록) 성적서 사전 확보",
          evidenceRefs: ["P-CERT-001"],
        },
      ],
      entryStrategy: {
        countryCode: "US",
        countryName: "미국",
        targetBuyer: "자동차 부품 수입상",
        primaryChannel: "KOTRA 1:1 상담회",
        initialProducts: "승용차용 타이어 18인치",
        positioning: "고성능 가성비 타이어",
        paymentTerms: "L/C at sight",
        pilotScope: "샘플 100개",
        expansionCondition: "DOT 인증 완료 후",
        evidenceRefs: ["P-COUNTRY-001"],
      },
      decisionGates: [],
      actionPlan: [],
      officialResearch: { summary: "웹조사 완료", keyFindings: [], queries: [], sources: [], conflicts: [] },
      assumptions: [],
      unresolvedItems: [],
      stopConditions: [],
      disclaimer: "법적 고지",
    };

    const normalized = normalizeReportDraft(rawV3Input, mockEvidenceBundle);

    expect(normalized.schemaVersion).toBe(3);
    expect(normalized.riskScoreboard?.certificationRisk).toBe("높음");
    expect(normalized.riskScoreboard?.tariffRisk).toBe("낮음");
    expect(normalized.decisionLogicSummary).toBe("UN Comtrade 수입규모 1위 국가이나 DOT 규제 미충족 시 반송 리스크가 큼");

    // Decision confidenceReason 및 immediateActions 세부 필드 검증
    expect(normalized.decision.confidenceReason).toBe("공식 웹 근거 2건 및 KOTRA 자료 검증 완료");
    expect(normalized.decision.immediateActions[0].priority).toBe("high");
    expect(normalized.decision.immediateActions[0].timeline).toBe("D+7");
    expect(normalized.decision.immediateActions[0].estimatedCost).toBe("약 500만원");
    expect(normalized.decision.immediateActions[0].govSupport).toBe("KOTRA 해외인증 지원사업 70% 보조");
    expect(normalized.decision.immediateActions[0].subSteps).toHaveLength(3);

    // DecisionReasons risk deep-dive 필드 검증
    const riskReason = normalized.decisionReasons.find((r) => r.type === "risk");
    expect(riskReason).toBeDefined();
    expect(riskReason?.severity).toBe("치명적");
    expect(riskReason?.financialImpact).toBe("통관 거부 시 반송비용 및 과태료 약 3,000만원");
    expect(riskReason?.mitigation).toBe("계약 전 미국 인정 시험소(NHTSA 등록) 성적서 사전 확보");
  });

  test("v2 레거시 데이터 로드 시 안전하게 v3으로 업그레이드되며 fallback 값이 적용되어야 함", () => {
    const rawV2Input = {
      schemaVersion: 2,
      decision: {
        verdict: "proceed",
        confidence: "medium",
        headline: "미국 수출 추진 가능",
        reason: "기존 관세율 저렴함",
        immediateActions: [{ action: "바이어 연락", owner: "영업", evidenceRefs: ["P-001"] }],
        evidenceRefs: ["P-001"],
      },
      decisionReasons: [{ type: "opportunity", title: "관세 낮음", interpretation: "FTA 적용", businessImpact: "마진 확보", evidenceRefs: ["P-001"] }],
      entryStrategy: { countryCode: "US", countryName: "미국", targetBuyer: "유통상", primaryChannel: "직접", initialProducts: "타이어", positioning: "가성비", paymentTerms: "TT", pilotScope: "100개", expansionCondition: "성공시", evidenceRefs: ["P-001"] },
      decisionGates: [],
      actionPlan: [],
      officialResearch: { summary: "요약", keyFindings: [], queries: [], sources: [], conflicts: [] },
      assumptions: [],
      unresolvedItems: [],
      stopConditions: [],
      disclaimer: "고지",
    };

    const normalized = normalizeReportDraft(rawV2Input, mockEvidenceBundle);
    expect(normalized.schemaVersion).toBe(3);
    expect(normalized.riskScoreboard).toBeDefined();
    expect(normalized.riskScoreboard?.tariffRisk).toBe("보통");
    expect(normalized.decisionLogicSummary).toContain("프로그램 자동 수집 데이터");
  });
});
