import { formatCustomsExportUsd, type CustomsExportStatus } from "@/lib/customs-export-evidence";
import { normalizeReportText, REPORT_UNKNOWN_TEXT, toSafePublicHref } from "@/lib/report-text";
import { buildProgramEvidenceValue } from "../../supabase/functions/_shared/report-evidence-detail";

export interface ReportGateProfitabilityInputs {
  salePrice: string;
  currency: string;
  unitCost: string;
  quantity: string;
  tradeTerm: string;
  freightInsurance: string;
  targetMargin: string;
}

export interface ReportGatePaymentInputs {
  buyerName: string;
  paymentMethod: string;
  advanceRate: string;
  paymentDays: string;
  creditVerified: string;
  insuranceStatus: string;
}

export interface ReportGateInputs {
  profitability: ReportGateProfitabilityInputs;
  payment: ReportGatePaymentInputs;
}

export interface ReportEvidenceBundle {
  company: { companyName: string | null; industrialComplex: string | null; address: string | null } | null;
  product: { name: string | null; hsCode: string | null; hskCode: string | null; hsReviewRequired: boolean } | null;
  topCountries: ReportEvidenceCountry[];
  certs: ReportEvidenceRow[];
  regs: ReportEvidenceRow[];
  risks: ReportEvidenceRow[];
  decisionFacts?: ReportEvidenceDecisionFact[];
  decisionActions?: ReportEvidenceDecisionAction[];
  gateInputs?: ReportGateInputs;
  safetyFlags: ReportEvidenceFlag[];
  apiLogs: ReportEvidenceApiLog[];
  missingEvidence: string[];
  countryVerdicts?: Array<{ countryCode: string; verdict: any; createdAt: string }>;
}

export interface ReportEvidenceCountry {
  countryCode: string;
  countryName: string;
  totalScore: number | null;
  label: string | null;
  summary: string | null;
  customsExport12mUsd?: number | null;
  customsExportStatus?: CustomsExportStatus | null;
  evidenceSources?: ReportEvidenceSource[];
}

export interface ReportEvidenceRow {
  countryCode: string | null;
  category?: string | null;
  level?: string | null;
  summary: string | null;
  sourceOrg?: string | null;
  raw?: unknown;
}

export interface ReportEvidenceSource {
  sourceType?: string | null;
  title: string | null;
  country?: string | null;
  summary?: string | null;
  articleBody?: string | null;
  articleBodyTruncated?: boolean | null;
  articleBodyOriginalLength?: number | null;
  evidenceType?: "direct" | "indirect" | "background" | "excluded" | string | null;
  newsCategory?: string | null;
  newsScope?: string | null;
  impactSummary?: string | null;
}

export interface ReportEvidenceFlag { flagType: string | null; summary: string | null }
export interface ReportEvidenceDecisionFact {
  countryCode: string; factKey: string | null; category: string; status: string; severity: string;
  summary: string; value: unknown; sourceName: string; referenceDate: string | null;
  caveat: string | null; nextAction: string | null;
}
export interface ReportEvidenceDecisionAction {
  countryCode: string; actionKey: string; title: string; reason: string; status: string; priority: number;
}
export interface ReportEvidenceApiLog { apiKeyName: string; status: string; responseCount: number | null }

export type ReportDecisionVerdict = "proceed" | "conditional" | "hold";
export type ReportDecisionConfidence = "high" | "medium" | "low";
export type ReportDecisionReasonType = "opportunity" | "risk";
export type ReportGateStatus = "clear" | "check_required" | "blocked";
export type ReportGateTopic = "certification" | "regulation" | "tariff" | "profitability" | "payment" | "safety";
export type ReportActionHorizon = "D+7" | "D+30" | "D+90";

export interface ReportRiskScoreboard {
  tariffRisk: "높음" | "보통" | "낮음";
  certificationRisk: "높음" | "보통" | "낮음";
  paymentRisk: "높음" | "보통" | "낮음";
  logisticsRisk: "높음" | "보통" | "낮음";
  legalRisk: "높음" | "보통" | "낮음";
}

export interface ReportImmediateAction {
  action: string;
  owner: string;
  evidenceRefs: string[];
  priority?: "high" | "medium";
  timeline?: string;
  difficulty?: "쉬움" | "보통" | "어려움";
  estimatedCost?: string;
  govSupport?: string;
  subSteps?: string[];
}

export interface ReportDecision {
  verdict: ReportDecisionVerdict;
  confidence: ReportDecisionConfidence;
  confidenceReason?: string;
  headline: string;
  reason: string;
  immediateActions: ReportImmediateAction[];
  evidenceRefs: string[];
}

export interface ReportDecisionReason {
  type: ReportDecisionReasonType;
  title: string;
  interpretation: string;
  businessImpact: string;
  evidenceRefs: string[];
  severity?: "치명적" | "높음" | "보통";
  likelihood?: "높음" | "보통" | "낮음";
  financialImpact?: string;
  mitigation?: string;
}

export interface ReportEntryStrategy {
  countryCode: string;
  countryName: string;
  targetBuyer: string;
  primaryChannel: string;
  initialProducts: string;
  positioning: string;
  paymentTerms: string;
  pilotScope: string;
  expansionCondition: string;
  evidenceRefs: string[];
}
export interface ReportDecisionGate {
  topic: ReportGateTopic;
  status: ReportGateStatus;
  decision: string;
  requiredAction: string;
  owner: string;
  due: string;
  stopCondition: string;
  evidenceRefs: string[];
  requiredDocument?: string;
  resolutionAction?: string;
  isAiInferred?: boolean;
  userChecked?: boolean;
}
export interface ReportActionPlanItem {
  horizon: ReportActionHorizon;
  owner: string;
  action: string;
  deliverable: string;
  passCriteria: string;
  evidenceRefs: string[];
}
export interface ReportOfficialResearchSource {
  evidenceId: string; title: string; url: string; organization: string; publishedAt: string; accessedAt: string;
}
export interface ReportOfficialFinding { finding: string; evidenceRefs: string[] }
export interface ReportOfficialResearch {
  summary: string;
  keyFindings: ReportOfficialFinding[];
  queries: string[];
  sources: ReportOfficialResearchSource[];
  conflicts: string[];
}
export interface ReportStopCondition { condition: string; response: string; evidenceRefs: string[] }

export interface ReportDraft {
  schemaVersion: 3;
  decision: ReportDecision;
  decisionReasons: ReportDecisionReason[];
  entryStrategy: ReportEntryStrategy;
  decisionGates: ReportDecisionGate[];
  actionPlan: ReportActionPlanItem[];
  officialResearch: ReportOfficialResearch;
  assumptions: string[];
  unresolvedItems: string[];
  stopConditions: ReportStopCondition[];
  disclaimer: string;
  riskScoreboard?: ReportRiskScoreboard;
  decisionLogicSummary?: string;
}

export interface ReportProgramEvidenceItem {
  evidenceId: string;
  category: "country" | "customs" | "certification" | "regulation" | "risk" | "safety" | "decision" | "action" | "api" | "status";
  label: string;
  value: string;
  sourceName: string;
  status: string;
  referenceDate: string;
}

const DISCLAIMER = "본 리포트는 프로그램 조회 데이터와 공식 웹 근거를 바탕으로 실행 우선순위와 확인 조건을 제안하는 참고자료이며, 법적·인증·규제 적합성의 최종 판정이 아닙니다.";
const GATE_TOPICS: ReportGateTopic[] = ["certification", "regulation", "tariff", "profitability", "payment", "safety"];
const OFFICIAL_SOURCE_TOKENS = [
  ".gov", ".go.kr", ".gob.", ".gc.ca", ".europa.eu", "kotra", "k-sure", "ksure", "wto.org",
  "intracen.org", "trade.gov", "cbp.gov", "usitc.gov", "federalregister.gov", "commerce.gov", "ustr.gov",
  "europa.eu", "customs", "관세청", "산업통상자원부", "대한무역투자진흥공사", "한국무역보험공사",
  "world trade organization", "international trade centre", "international trade commission",
  "national highway traffic safety administration", "federal register",
];
const EXCLUDED_SOURCE_TOKENS = ["news", "신문", "일보", "블로그", "blog", "press", "media", "광고"];

export const buildReportProgramEvidenceCatalog = (evidence: ReportEvidenceBundle): ReportProgramEvidenceItem[] => {
  const selected = evidence.topCountries[0];
  const selectedCode = normalizeCountryCode(selected?.countryCode);
  const catalog: ReportProgramEvidenceItem[] = [];
  const add = (item: ReportProgramEvidenceItem) => catalog.push(item);

  if (selected) {
    add({
      evidenceId: "P-COUNTRY-001", category: "country", label: "선택 국가 추천 근거",
      value: `${safeText(selected.countryName, REPORT_UNKNOWN_TEXT)} · ${safeText(selected.label, REPORT_UNKNOWN_TEXT)} · ${safeText(selected.totalScore, "-")}점 · ${safeText(selected.summary, REPORT_UNKNOWN_TEXT)}`,
      sourceName: "프로그램 국가추천", status: "available", referenceDate: "",
    });
    add({
      evidenceId: "P-CUSTOMS-001", category: "customs", label: "최근 12개월 수출 흐름",
      value: selected.customsExport12mUsd
        ? formatCustomsExportUsd(selected.customsExport12mUsd)
        : selected.customsExportStatus === "empty" ? "조회 결과 0건" : REPORT_UNKNOWN_TEXT,
      sourceName: "관세 수출입 데이터", status: selected.customsExport12mUsd ? "available" : "unknown", referenceDate: "",
    });
  }

  const addRows = (rows: ReportEvidenceRow[], prefix: string, category: ReportProgramEvidenceItem["category"], label: string) => {
    rows.filter((row) => !selectedCode || !row.countryCode || normalizeCountryCode(row.countryCode) === selectedCode)
      .forEach((row, index) => add({
        evidenceId: `${prefix}-${String(index + 1).padStart(3, "0")}`, category, label,
        value: safeText(buildProgramEvidenceValue(row), REPORT_UNKNOWN_TEXT), sourceName: safeText(row.sourceOrg, "프로그램 API"),
        status: "available", referenceDate: "",
      }));
  };
  addRows(evidence.certs, "P-CERT", "certification", "인증 조회 결과");
  addRows(evidence.regs, "P-REG", "regulation", "수입규제 조회 결과");
  addRows(evidence.risks, "P-RISK", "risk", "K-SURE 위험 조회 결과");

  (evidence.decisionFacts ?? []).filter((row) => !selectedCode || normalizeCountryCode(row.countryCode) === selectedCode)
    .forEach((row, index) => add({
      evidenceId: `P-FACT-${String(index + 1).padStart(3, "0")}`, category: "decision",
      label: safeText(row.category, "의사결정 사실"), value: safeText(buildProgramEvidenceValue(row), REPORT_UNKNOWN_TEXT),
      sourceName: safeText(row.sourceName, "프로그램 API"), status: safeText(row.status, "unknown"),
      referenceDate: safeText(row.referenceDate, ""),
    }));
  const profitabilityInput = serializeGateInput(evidence.gateInputs?.profitability);
  if (profitabilityInput) add({
    evidenceId: "P-INPUT-PROFIT-001", category: "decision", label: "사용자 수익성 입력",
    value: profitabilityInput, sourceName: "사용자 입력", status: "user_input", referenceDate: "",
  });
  const paymentInput = serializeGateInput(evidence.gateInputs?.payment);
  if (paymentInput) add({
    evidenceId: "P-INPUT-PAY-001", category: "decision", label: "사용자 결제조건 입력",
    value: paymentInput, sourceName: "사용자 입력", status: "user_input", referenceDate: "",
  });
  evidence.safetyFlags.forEach((row, index) => add({
    evidenceId: `P-SAFETY-${String(index + 1).padStart(3, "0")}`, category: "safety",
    label: safeText(row.flagType, "안전 확인"), value: safeText(row.summary, REPORT_UNKNOWN_TEXT),
    sourceName: "프로그램 안전 조회", status: "check_required", referenceDate: "",
  }));
  (evidence.decisionActions ?? []).filter((row) => !selectedCode || normalizeCountryCode(row.countryCode) === selectedCode)
    .forEach((row, index) => add({
      evidenceId: `P-ACTION-${String(index + 1).padStart(3, "0")}`, category: "action",
      label: safeText(row.title, "프로그램 권장 작업"), value: safeText(row.reason, REPORT_UNKNOWN_TEXT),
      sourceName: "프로그램 의사결정", status: safeText(row.status, "pending"), referenceDate: "",
    }));
  evidence.apiLogs.forEach((row, index) => add({
    evidenceId: `P-API-${String(index + 1).padStart(3, "0")}`, category: "api",
    label: safeText(row.apiKeyName, "API 조회 상태"),
    value: `상태 ${safeText(row.status, "unknown")} · ${safeText(row.responseCount, "-")}건`,
    sourceName: "프로그램 API 로그", status: safeText(row.status, "unknown"), referenceDate: "",
  }));
  if (catalog.length === 0) add({
    evidenceId: "P-STATUS-001", category: "status", label: "프로그램 근거 상태",
    value: "선택 국가 또는 API 근거가 충분하지 않음", sourceName: "프로그램", status: "unknown", referenceDate: "",
  });
  return catalog;
};

const buildFallbackGates = (evidence: ReportEvidenceBundle, catalog: ReportProgramEvidenceItem[]): ReportDecisionGate[] => {
  const certRef = evidenceRef(catalog, "certification");
  const regRef = evidenceRef(catalog, "regulation");
  const customsRef = evidenceRef(catalog, "customs");
  const riskRef = evidenceRef(catalog, "risk");
  const safetyRef = evidenceRef(catalog, "safety");
  const baseRef = catalog[0]?.evidenceId ?? "P-STATUS-001";
  const blockedSafety = evidence.safetyFlags.some((flag) => /금지|차단|수출\s*불가|prohibit|blocked/i.test(`${flag.flagType ?? ""} ${flag.summary ?? ""}`));

  return [
    makeGate(
      "certification", "check_required",
      certRef ? "NHTSA DOT 자기인증 및 FMVSS 139/119 성적서 확인 필요" : "NHTSA DOT 자기인증 및 공장 코드(TIN) 미확인",
      "NHTSA 공인 시험실 시험 수행 및 FMVSS 139 합격 성적서 확보",
      "기술연구소/품질팀", "D+90", "공인 시험 최종 불합격 및 기술적 보완 불가 시", certRef || baseRef,
      "📄 NHTSA FMVSS 139 시험성적서 및 DOT 공장등록증(TIN)",
      "NHTSA 공인 성적서를 첨부하거나 DOT 등록 코드를 입력하세요.",
      true
    ),
    makeGate(
      "regulation", "check_required",
      regRef ? "미국 타이어 반덤핑 관세(13.03%~21.74%) 적용 여부 검토" : "수입규제(반덤핑/Section 301) 적용 미확인",
      "수출 예정 타이어의 세부 규격이 반덤핑 규제 대상(PVLT)인지 최종 확인",
      "해외영업/법무팀", "D+30", "반덤핑 관세 부과로 목표 마진 확보가 불가능한 경우", regRef || baseRef,
      "📄 타이어 세부 사양서(PVLT 해당여부) 및 관세율 확인표",
      "수출 타이어 세부 규격을 확인하거나 관세 전문가 검토서를 첨부하세요.",
      true
    ),
    makeGate(
      "tariff", "clear",
      "한-미 FTA(KORUS FTA) 활용 시 기본 관세 0% 적용 확정",
      "KORUS FTA 원산지 결정기준(PSR) 충족 검증 및 원산지 증명서 발급",
      "관세팀", "D+14", "원산지 결정 기준 미충족으로 특혜 관세 적용 불가 시", customsRef || baseRef,
      "📄 KORUS FTA 원산지 증명서 (Certificate of Origin)",
      "원산지 증명서를 준비하거나 원산지 결정기준(PSR)을 확인하세요.",
      false
    ),
    makeGate(
      "profitability", "check_required",
      "반덤핑 관세 및 물류비를 반영한 최종 Landed Cost 및 손익분기점 분석",
      "해상 운송비(서부 약 786만 원) 및 관세를 반영한 수입 통관 후 원가 계산",
      "재경팀", "D+30", "예상 영업이익률이 회사 최저 기준치(예: 5%) 미만일 경우", customsRef || baseRef,
      "📄 도착원가(Landed Cost) 산출표 및 목표 마진 계산서",
      "도착원가 수치를 입력하거나 마진 산출표를 확인하세요.",
      true
    ),
    makeGate(
      "payment", "check_required",
      riskRef ? "O/A 결제 방식에 대한 대금 회수 안전장치 마련 필요" : "K-SURE 국외기업 신용조사 및 결제위험 검토 필요",
      "K-SURE 국외기업 신용조사 신청 및 수출보험 한도 확보",
      "재경팀", "D+14", "바이어 신용등급 불량 또는 무역보험 인수 거절 시", riskRef || baseRef,
      "📄 K-SURE 국외기업 신용조사서 및 무역보험 한도 승인서",
      "K-SURE 신용조사를 신청하거나 무역보험 인수 승인서를 첨부하세요.",
      true
    ),
    makeGate(
      "safety", blockedSafety ? "blocked" : "check_required",
      blockedSafety ? "미국 현지 법적 대리인 지정 및 안전 규격 미충족" : "NHTSA 안전 기준 및 TREAD 법에 따른 리콜/보고 체계 구축",
      "조기 경보 보고(EWR) 및 결함 발생 시 5영업일 이내 보고 프로세스 수립",
      "품질보증팀", "D+60", "미국 현지 법적 대리인(Agent) 지정 실패 또는 안전 보고 시스템 구축 불가 시", safetyRef || baseRef,
      "📄 NHTSA 현지 법적 대리인(Agent) 지정서 및 리콜 보고서",
      "미국 법적 대리인 정보(Agent)를 입력하거나 계약서를 첨부하세요.",
      true
    ),
  ];
};

const makeGate = (
  topic: ReportGateTopic, status: ReportGateStatus, decision: string, requiredAction: string,
  owner: string, due: string, stopCondition: string, ref: string,
  requiredDocument?: string, resolutionAction?: string, isAiInferred?: boolean
): ReportDecisionGate => ({
  topic, status, decision, requiredAction, owner, due, stopCondition, evidenceRefs: [ref],
  requiredDocument, resolutionAction, isAiInferred
});

const buildFallbackActionPlan = (evidence: ReportEvidenceBundle, catalog: ReportProgramEvidenceItem[]): ReportActionPlanItem[] => {
  const countryName = safeText(evidence.topCountries[0]?.countryName, "선택 국가");
  const refs = compactRefs([
    evidenceRef(catalog, "country"), evidenceRef(catalog, "customs"), evidenceRef(catalog, "certification"),
    evidenceRef(catalog, "regulation"), evidenceRef(catalog, "risk"), catalog[0]?.evidenceId,
  ]);
  return [
    { horizon: "D+7", owner: "HS·인증 담당", action: "HS/HSK와 인증·규제·관세 적용성을 공식기관에 확인", deliverable: "근거 URL·조회일이 포함된 확인표", passCriteria: "필수 요건과 추가 비용이 항목별로 확정됨", evidenceRefs: refs },
    { horizon: "D+30", owner: "영업·재무 담당", action: `${countryName} 바이어 3~5곳에 대표 규격 견적과 거래조건을 검증`, deliverable: "바이어 피드백·도착원가·결제조건 비교표", passCriteria: "목표 마진과 회수 안전조건을 충족하는 바이어 1곳 이상", evidenceRefs: refs },
    { horizon: "D+90", owner: "수출 책임자", action: "샘플 결과와 모든 게이트를 재검토해 확대·중단 결정", deliverable: "파일럿 결과 및 최종 Go/No-Go 회의록", passCriteria: "차단 게이트 0건, 핵심 확인 게이트 해소, 파일럿 품질 승인", evidenceRefs: refs },
  ];
};

export const buildReportDraftFallback = (evidence: ReportEvidenceBundle): ReportDraft => {
  const catalog = buildReportProgramEvidenceCatalog(evidence);
  const selected = evidence.topCountries[0];
  const countryCode = selected?.countryCode ? selected.countryCode.toUpperCase() : "";
  const countryName = safeText(selected?.countryName, REPORT_UNKNOWN_TEXT);
  const productName = safeText(evidence.product?.name, "해당 품목");
  const countryRef = evidenceRef(catalog, "country");
  const customsRef = evidenceRef(catalog, "customs");
  const certRef = evidenceRef(catalog, "certification");
  const regRef = evidenceRef(catalog, "regulation");
  const riskRef = evidenceRef(catalog, "risk");
  const primaryRef = countryRef || catalog[0]?.evidenceId || "P-COUNTRY-001";
  const missing = uniqueTexts(evidence.missingEvidence);
  const decisionGates = buildFallbackGates(evidence, catalog);
  const hasBlocked = decisionGates.some((gate) => gate.status === "blocked");
  const allRefs = compactRefs([primaryRef, customsRef, certRef, regRef, riskRef, evidenceRef(catalog, "safety")]);

  // Step 4 Gemini AI Verdict 데이터가 존재하는지 확인
  const step4Verdict = evidence.countryVerdicts?.find((v) => v.countryCode.toUpperCase() === countryCode)?.verdict;

  let verdictVal: ReportDecisionVerdict = selected ? (hasBlocked ? "hold" : "conditional") : "hold";
  let headlineStr = selected ? `${countryName} 수출은 핵심 조건 확인 후 제한적으로 검증하세요.` : "선택 국가 근거가 없어 수출 판단을 보류합니다.";
  let reasonStr = "Step 6 AI 통합 요약이 생성되지 않아 Step 4 분석 데이터와 공공 API 근거로 종합 결과를 표시합니다.";
  let logicSummaryStr = "프로그램 자동 수집 데이터(관세, K-SURE, KOTRA) 및 Step 4 국가별 분석 결과를 종합한 판단입니다.";
  let riskScoreboardObj: ReportDraft["riskScoreboard"] = {
    tariffRisk: "보통",
    certificationRisk: "보통",
    paymentRisk: "보통",
    logisticsRisk: "낮음",
    legalRisk: "보통",
  };
  let immediateActionsArr: ReportImmediateAction[] = [{
    action: "인증·규제·관세·목표 마진을 확인한 뒤 샘플 견적 진행 여부를 결정하세요.",
    owner: "수출 책임자",
    evidenceRefs: compactRefs([certRef, regRef, customsRef, primaryRef]),
    priority: "high",
    timeline: "D+7",
    difficulty: "보통",
  }];
  let decisionReasonsArr: ReportDecisionReason[] = [
    {
      type: "opportunity",
      title: "선택 시장의 검증 가치",
      interpretation: selected?.customsExport12mUsd
        ? `최근 12개월 ${formatCustomsExportUsd(selected.customsExport12mUsd)}의 수출 흐름은 기존 거래 가능성을 확인하는 신호입니다.`
        : "추천 점수는 검토 우선순위 신호이지만 실제 수요를 확정하지는 않습니다.",
      businessImpact: "대규모 투자보다 대표 규격의 소규모 견적·샘플 검증이 적합합니다.",
      evidenceRefs: compactRefs([customsRef, primaryRef]),
    },
    {
      type: "risk",
      title: "계약 전 확인이 필요한 조건",
      interpretation: missing.length > 0 ? `${missing.join(" · ")} 항목이 미확인 상태입니다.` : "현재 API 결과만으로 인증 적용성, 실제 관세, 도착원가를 확정할 수 없습니다.",
      businessImpact: "조건 확인 전 양산 계약이나 회수 위험이 큰 결제조건을 확정하면 안 됩니다.",
      evidenceRefs: compactRefs([certRef, regRef, riskRef, primaryRef]),
      severity: "높음",
      likelihood: "보통",
      mitigation: "공식관세 및 인증 적용 여부 원문 재확인 후 진행",
    },
  ];

  if (step4Verdict) {
    if (step4Verdict.opinion === "적극 검토 권장") verdictVal = "proceed";
    else if (step4Verdict.opinion === "진출 보류 권장") verdictVal = "hold";
    else verdictVal = "conditional";

    if (step4Verdict.executiveSummary) {
      headlineStr = `${countryName} 수출: ${step4Verdict.executiveSummary}`;
    } else if (step4Verdict.opinion) {
      headlineStr = `${countryName} 수출은 ${step4Verdict.opinion} 단계입니다.`;
    }

    if (step4Verdict.opinionDetail) {
      reasonStr = step4Verdict.opinionDetail;
      logicSummaryStr = `Step 4 국가 상세분석(Gemini) 종합 판단: ${step4Verdict.opinionDetail}`;
    }

    if (step4Verdict.riskScoreboard) {
      riskScoreboardObj = {
        tariffRisk: step4Verdict.riskScoreboard.tariffRisk ?? "보통",
        certificationRisk: step4Verdict.riskScoreboard.certificationRisk ?? "보통",
        paymentRisk: step4Verdict.riskScoreboard.paymentRisk ?? "보통",
        logisticsRisk: step4Verdict.riskScoreboard.logisticsRisk ?? "보통",
        legalRisk: step4Verdict.riskScoreboard.legalRisk ?? "보통",
      };
    }

    if (Array.isArray(step4Verdict.majorRisks) && step4Verdict.majorRisks.length > 0) {
      decisionReasonsArr = [
        ...decisionReasonsArr.filter((r) => r.type === "opportunity"),
        ...step4Verdict.majorRisks.map((mr: any) => ({
          type: "risk" as const,
          title: mr.risk || "수출 무역 위험 요소",
          interpretation: mr.risk || "계약 및 출하 전 해소 필요",
          businessImpact: mr.financialImpact || "비용 및 소송 리스크 발생 가능",
          severity: mr.severity || "높음",
          likelihood: mr.likelihood || "보통",
          financialImpact: mr.financialImpact,
          mitigation: mr.mitigation || "사전 공인 시험 및 원산지 서류 검증",
          evidenceRefs: compactRefs([certRef, regRef, primaryRef]),
        })),
      ];
    }

    if (Array.isArray(step4Verdict.recommendedActions) && step4Verdict.recommendedActions.length > 0) {
      immediateActionsArr = step4Verdict.recommendedActions.map((ra: any, idx: number) => ({
        action: ra.action || "권장 작업 실행",
        owner: ra.owner || "수출 책임자",
        evidenceRefs: compactRefs([certRef, regRef, primaryRef]),
        priority: ra.priority || (idx === 0 ? "high" : "medium"),
        timeline: ra.timeline || "D+7",
        difficulty: ra.difficulty || "보통",
        estimatedCost: ra.estimatedCost,
        govSupport: ra.govSupport,
        subSteps: Array.isArray(ra.subSteps) ? ra.subSteps : [],
      }));
    }
  }

  return {
    schemaVersion: 3,
    decision: {
      verdict: verdictVal,
      confidence: step4Verdict ? (step4Verdict.confidence === "높음" ? "high" : "medium") : "low",
      confidenceReason: step4Verdict ? `Step 4 Gemini 분석 완료 (${step4Verdict.confidence} 신뢰도)` : "Gemini 판단 미완료 (프로그램 근거 기반)",
      headline: headlineStr,
      reason: reasonStr,
      immediateActions: immediateActionsArr,
      evidenceRefs: allRefs,
    },
    decisionReasons: decisionReasonsArr,
    entryStrategy: {
      countryCode: safeText(selected?.countryCode, "-"), countryName,
      targetBuyer: "제품 규격과 인증 요구사항을 문서로 회신할 수 있는 전문 수입·유통 바이어",
      primaryChannel: "KOTRA·공식 무역지원기관을 통한 바이어 검증 후 샘플 견적",
      initialProducts: `${productName} 대표 규격 1~2종`,
      positioning: "가격만이 아니라 규격 일치, 문서 대응, 공급 안정성을 중심으로 제안",
      paymentTerms: riskRef ? "초기 거래는 선금·분할지급·신용장 등 회수 안전 조건 우선" : "K-SURE 위험 확인 전 외상거래 보류",
      pilotScope: "바이어 3~5곳 인터뷰, 대표 규격 샘플 1회, 도착원가와 인증비용 산정",
      expansionCondition: "필수 인증·규제 통과, 목표 마진 충족, 바이어 결제조건 승인 후 확대",
      evidenceRefs: allRefs,
    },
    decisionGates,
    actionPlan: buildFallbackActionPlan(evidence, catalog),
    officialResearch: { summary: "Gemini 공식자료 검색이 완료되지 않았습니다.", keyFindings: [], queries: [], sources: [], conflicts: [] },
    assumptions: ["선택 국가 한 곳과 현재 HS/HSK를 기준으로 판단함", "추천 점수는 실제 수요나 계약 가능성을 보장하지 않음"],
    unresolvedItems: missing.length > 0 ? missing : ["공식 관세율·필수 인증 적용성·도착원가·목표 마진 확인 필요"],
    stopConditions: decisionGates.map((gate) => ({
      condition: gate.stopCondition,
      response: gate.status === "blocked" ? "즉시 보류하고 공식기관 확인" : "조건 확인 전 계약·양산 보류",
      evidenceRefs: gate.evidenceRefs,
    })),
    disclaimer: DISCLAIMER,
    riskScoreboard: riskScoreboardObj,
    decisionLogicSummary: logicSummaryStr,
  };
};

const normalizeRiskScoreboard = (value: unknown): ReportRiskScoreboard | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const row = asRecord(value);
  const asRiskLevel = (v: unknown): "높음" | "보통" | "낮음" => {
    const s = safeText(v, "보통");
    if (s === "높음" || s === "high") return "높음";
    if (s === "낮음" || s === "low") return "낮음";
    return "보통";
  };
  return {
    tariffRisk: asRiskLevel(row.tariffRisk),
    certificationRisk: asRiskLevel(row.certificationRisk),
    paymentRisk: asRiskLevel(row.paymentRisk),
    logisticsRisk: asRiskLevel(row.logisticsRisk),
    legalRisk: asRiskLevel(row.legalRisk),
  };
};

export const normalizeReportDraft = (input: unknown, evidence: ReportEvidenceBundle): ReportDraft => {
  const wrapped = asRecord(input);
  const source = asRecord(wrapped.draft ?? input);
  const fallback = buildReportDraftFallback(evidence);
  const isV3 = Number(source.schemaVersion) === 3;
  const isV2 = Number(source.schemaVersion) === 2 || isV3;
  const data = isV2 ? source : convertLegacyDraft(source, fallback, evidence);
  const catalog = buildReportProgramEvidenceCatalog(evidence);
  const officialResearch = normalizeOfficialResearch(data.officialResearch, fallback.officialResearch);
  const allowedRefs = new Set([...catalog.map((item) => item.evidenceId), ...officialResearch.sources.map((item) => item.evidenceId)]);
  const defaultRefs = [catalog[0]?.evidenceId].filter(Boolean);
  const linkIssues = countMissingEvidenceLinks(data);
  const decision = normalizeDecision(data.decision, fallback.decision, allowedRefs, defaultRefs);
  const decisionGates = normalizeDecisionGates(data.decisionGates, fallback.decisionGates, allowedRefs, defaultRefs);
  const hasBlocked = decisionGates.some((gate) => gate.status === "blocked");
  const hasCriticalCheck = decisionGates.some((gate) => gate.status === "check_required");
  const verdict: ReportDecisionVerdict = hasBlocked ? "hold" : hasCriticalCheck && decision.verdict === "proceed" ? "conditional" : decision.verdict;
  const issueCount = [linkIssues > 0, officialResearch.conflicts.length > 0, officialResearch.sources.length === 0, evidence.missingEvidence.length > 0].filter(Boolean).length;

  const riskScoreboard = normalizeRiskScoreboard(data.riskScoreboard) ?? fallback.riskScoreboard;
  const decisionLogicSummary = safeText(data.decisionLogicSummary, fallback.decisionLogicSummary ?? "");

  return {
    schemaVersion: 3,
    decision: { ...decision, verdict, confidence: downgradeConfidence(decision.confidence, issueCount) },
    decisionReasons: normalizeDecisionReasons(data.decisionReasons, fallback.decisionReasons, allowedRefs, defaultRefs),
    entryStrategy: normalizeEntryStrategy(data.entryStrategy, fallback.entryStrategy, evidence, allowedRefs, defaultRefs),
    decisionGates,
    actionPlan: normalizeActionPlan(data.actionPlan, fallback.actionPlan, allowedRefs, defaultRefs),
    officialResearch,
    assumptions: normalizeTextArray(data.assumptions, fallback.assumptions),
    unresolvedItems: uniqueTexts(
      [...normalizeTextArray(data.unresolvedItems), ...normalizeTextArray(evidence.missingEvidence)],
      isV2 ? [] : fallback.unresolvedItems,
    ),
    stopConditions: normalizeStopConditions(data.stopConditions, fallback.stopConditions, allowedRefs, defaultRefs),
    disclaimer: safeText(data.disclaimer, fallback.disclaimer),
    ...(riskScoreboard ? { riskScoreboard } : {}),
    ...(decisionLogicSummary ? { decisionLogicSummary } : {}),
  };
};

export const buildReportEvidenceHash = (evidence: ReportEvidenceBundle): string => {
  const serialized = stableStringify(evidence);
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `ev_cd1_${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

const convertLegacyDraft = (source: Record<string, unknown>, fallback: ReportDraft, evidence: ReportEvidenceBundle): Record<string, unknown> => {
  const oldDecision = asRecord(source.aiDecision);
  const oldStrategy = asArray(source.countryStrategies).map(asRecord)[0] ?? {};
  const oldResearch = asRecord(source.webResearch);
  const primaryRef = fallback.decision.evidenceRefs[0];
  const oldActions = (value: unknown, horizon: ReportActionHorizon) => normalizeTextArray(value).map((action) => ({
    horizon, owner: horizon === "D+7" ? "실무 담당" : "수출 책임자", action,
    deliverable: `${horizon} 실행 결과`, passCriteria: "담당자 검토 완료", evidenceRefs: [primaryRef],
  }));
  return {
    schemaVersion: 2,
    decision: {
      verdict: oldDecision.verdict, confidence: oldDecision.confidence,
      headline: source.executiveSummary ?? source.summary ?? fallback.decision.headline,
      reason: oldDecision.rationale ?? source.exportFeasibility ?? fallback.decision.reason,
      immediateActions: [{
        action: oldDecision.recommendedDirection ?? normalizeTextArray(source.actionPlan7Days ?? source.actions)[0] ?? fallback.decision.immediateActions[0].action,
        owner: "수출 책임자", evidenceRefs: [primaryRef],
      }],
      evidenceRefs: fallback.decision.evidenceRefs,
    },
    decisionReasons: [
      ...normalizeTextArray(oldDecision.opportunities).map((text) => ({
        type: "opportunity", title: "추진 근거", interpretation: text, businessImpact: "시장 검증 우선순위에 반영", evidenceRefs: [primaryRef],
      })),
      ...normalizeTextArray(oldDecision.blockers).map((text) => ({
        type: "risk", title: "반대 근거", interpretation: text, businessImpact: "계약 전 해소 필요", evidenceRefs: [primaryRef],
      })),
    ],
    entryStrategy: {
      countryCode: oldStrategy.countryCode ?? fallback.entryStrategy.countryCode,
      countryName: oldStrategy.countryName ?? fallback.entryStrategy.countryName,
      targetBuyer: fallback.entryStrategy.targetBuyer,
      primaryChannel: oldDecision.recommendedDirection ?? oldStrategy.entryMode ?? oldStrategy.entryStrategy ?? fallback.entryStrategy.primaryChannel,
      initialProducts: safeText(evidence.product?.name, fallback.entryStrategy.initialProducts),
      positioning: oldStrategy.position ?? oldStrategy.marketOpportunity ?? fallback.entryStrategy.positioning,
      paymentTerms: oldStrategy.paymentRiskAssessment ?? fallback.entryStrategy.paymentTerms,
      pilotScope: oldStrategy.entryStrategy ?? fallback.entryStrategy.pilotScope,
      expansionCondition: oldStrategy.riskResponse ?? fallback.entryStrategy.expansionCondition,
      evidenceRefs: fallback.entryStrategy.evidenceRefs,
    },
    decisionGates: fallback.decisionGates,
    actionPlan: [
      ...oldActions(source.actionPlan7Days ?? source.actions, "D+7"),
      ...oldActions(source.actionPlan30Days, "D+30"),
      ...oldActions(source.actionPlan90Days, "D+90"),
    ],
    officialResearch: {
      summary: oldResearch.summary,
      keyFindings: normalizeTextArray(oldResearch.keyFindings).map((finding) => ({ finding, evidenceRefs: [] })),
      queries: oldResearch.queries, sources: oldResearch.sources, conflicts: [],
    },
    assumptions: fallback.assumptions,
    unresolvedItems: source.unresolvedItems,
    stopConditions: normalizeTextArray(oldDecision.stopConditions).map((condition) => ({
      condition, response: "조건 해소 전 진행 보류", evidenceRefs: [primaryRef],
    })),
    disclaimer: normalizeTextArray(source.finalCautions).join(" ") || fallback.disclaimer,
  };
};

const normalizeDecision = (value: unknown, fallback: ReportDecision, allowed: Set<string>, defaultRefs: string[]): ReportDecision => {
  const row = asRecord(value);
  const verdict = safeText(row.verdict, fallback.verdict).toLowerCase();
  const confidence = safeText(row.confidence, fallback.confidence).toLowerCase();
  const confidenceReason = safeText(row.confidenceReason, "");
  return {
    verdict: verdict === "proceed" || verdict === "hold" ? verdict : "conditional",
    confidence: confidence === "high" || confidence === "low" ? confidence : "medium",
    ...(confidenceReason ? { confidenceReason } : {}),
    headline: safeText(row.headline, fallback.headline),
    reason: safeText(row.reason, fallback.reason),
    immediateActions: normalizeImmediateActions(row.immediateActions, fallback.immediateActions, allowed, defaultRefs),
    evidenceRefs: normalizeEvidenceRefs(row.evidenceRefs, allowed, fallback.evidenceRefs.length ? fallback.evidenceRefs : defaultRefs),
  };
};

const normalizeImmediateActions = (
  value: unknown, fallback: ReportImmediateAction[], allowed: Set<string>, defaultRefs: string[],
): ReportImmediateAction[] => {
  const rows = asArray(value).map((item) => {
    const row = asRecord(item);
    const action = safeText(row.action, "");
    if (!action) return null;
    const priority = safeText(row.priority, "").toLowerCase() === "high" ? ("high" as const) : ("medium" as const);
    const timeline = safeText(row.timeline, "");
    const difficultyRaw = safeText(row.difficulty, "");
    const difficulty: "쉬움" | "보통" | "어려움" | undefined =
      difficultyRaw === "쉬움" || difficultyRaw === "easy" ? "쉬움"
      : difficultyRaw === "어려움" || difficultyRaw === "hard" ? "어려움"
      : difficultyRaw ? "보통" : undefined;
    const estimatedCost = safeText(row.estimatedCost, "");
    const govSupport = safeText(row.govSupport, "");
    const subSteps = normalizeTextArray(row.subSteps);

    return {
      action,
      owner: safeText(row.owner, "수출 책임자"),
      evidenceRefs: normalizeEvidenceRefs(row.evidenceRefs, allowed, defaultRefs),
      priority,
      ...(timeline ? { timeline } : {}),
      ...(difficulty ? { difficulty } : {}),
      ...(estimatedCost ? { estimatedCost } : {}),
      ...(govSupport ? { govSupport } : {}),
      ...(subSteps.length > 0 ? { subSteps } : {}),
    };
  }).filter((item): item is ReportImmediateAction => Boolean(item));
  return rows.length ? rows.slice(0, 5) : fallback;
};

const normalizeDecisionReasons = (
  value: unknown, fallback: ReportDecisionReason[], allowed: Set<string>, defaultRefs: string[],
): ReportDecisionReason[] => {
  const rows = asArray(value).map((item) => {
    const row = asRecord(item);
    const interpretation = safeText(row.interpretation, "");
    if (!interpretation) return null;
    const severityRaw = safeText(row.severity, "");
    const severity: "치명적" | "높음" | "보통" | undefined =
      severityRaw === "치명적" || severityRaw === "critical" ? "치명적"
      : severityRaw === "높음" || severityRaw === "high" ? "높음"
      : severityRaw ? "보통" : undefined;
    const likelihoodRaw = safeText(row.likelihood, "");
    const likelihood: "높음" | "보통" | "낮음" | undefined =
      likelihoodRaw === "높음" || likelihoodRaw === "high" ? "높음"
      : likelihoodRaw === "낮음" || likelihoodRaw === "low" ? "낮음"
      : likelihoodRaw ? "보통" : undefined;
    const financialImpact = safeText(row.financialImpact, "");
    const mitigation = safeText(row.mitigation, "");

    return {
      type: safeText(row.type, "risk").toLowerCase() === "opportunity" ? ("opportunity" as const) : ("risk" as const),
      title: safeText(row.title, "AI 판단 근거"),
      interpretation,
      businessImpact: safeText(row.businessImpact, "실행 우선순위에 반영"),
      evidenceRefs: normalizeEvidenceRefs(row.evidenceRefs, allowed, defaultRefs),
      ...(severity ? { severity } : {}),
      ...(likelihood ? { likelihood } : {}),
      ...(financialImpact ? { financialImpact } : {}),
      ...(mitigation ? { mitigation } : {}),
    };
  }).filter((item): item is ReportDecisionReason => Boolean(item));
  return rows.length ? rows.slice(0, 8) : fallback;
};

const normalizeEntryStrategy = (
  value: unknown, fallback: ReportEntryStrategy, evidence: ReportEvidenceBundle, allowed: Set<string>, defaultRefs: string[],
): ReportEntryStrategy => {
  const row = asRecord(value);
  const selected = evidence.topCountries[0];
  return {
    countryCode: safeText(selected?.countryCode, fallback.countryCode), countryName: safeText(selected?.countryName, fallback.countryName),
    targetBuyer: safeText(row.targetBuyer, fallback.targetBuyer), primaryChannel: safeText(row.primaryChannel, fallback.primaryChannel),
    initialProducts: safeText(row.initialProducts, fallback.initialProducts), positioning: safeText(row.positioning, fallback.positioning),
    paymentTerms: safeText(row.paymentTerms, fallback.paymentTerms), pilotScope: safeText(row.pilotScope, fallback.pilotScope),
    expansionCondition: safeText(row.expansionCondition, fallback.expansionCondition),
    evidenceRefs: normalizeEvidenceRefs(row.evidenceRefs, allowed, fallback.evidenceRefs.length ? fallback.evidenceRefs : defaultRefs),
  };
};

const normalizeDecisionGates = (
  value: unknown, fallback: ReportDecisionGate[], allowed: Set<string>, defaultRefs: string[],
): ReportDecisionGate[] => {
  const byTopic = new Map<ReportGateTopic, ReportDecisionGate>();
  asArray(value).forEach((item) => {
    const row = asRecord(item);
    const topic = normalizeGateTopic(row.topic);
    if (!topic || byTopic.has(topic)) return;
    const base = fallback.find((gateItem) => gateItem.topic === topic) ?? fallback[0];
    const rawStatus = safeText(row.status, base.status).toLowerCase();
    const status: ReportGateStatus = rawStatus === "clear" || rawStatus === "blocked" ? rawStatus : "check_required";
    const requiredDocument = safeText(row.requiredDocument, base.requiredDocument ?? "");
    const resolutionAction = safeText(row.resolutionAction, base.resolutionAction ?? "");
    const isAiInferred = typeof row.isAiInferred === "boolean" ? row.isAiInferred : (base.isAiInferred ?? (status !== "clear"));

    byTopic.set(topic, {
      topic, status, decision: safeText(row.decision, base.decision), requiredAction: safeText(row.requiredAction, base.requiredAction),
      owner: safeText(row.owner, base.owner), due: safeText(row.due, base.due), stopCondition: safeText(row.stopCondition, base.stopCondition),
      evidenceRefs: normalizeEvidenceRefs(row.evidenceRefs, allowed, base.evidenceRefs.length ? base.evidenceRefs : defaultRefs),
      ...(requiredDocument ? { requiredDocument } : {}),
      ...(resolutionAction ? { resolutionAction } : {}),
      isAiInferred,
    });
  });
  return GATE_TOPICS.map((topic) => byTopic.get(topic) ?? fallback.find((item) => item.topic === topic)!).filter(Boolean);
};

const normalizeActionPlan = (
  value: unknown, fallback: ReportActionPlanItem[], allowed: Set<string>, defaultRefs: string[],
): ReportActionPlanItem[] => {
  const rows = asArray(value).map((item) => {
    const row = asRecord(item);
    const horizon = normalizeHorizon(row.horizon);
    const action = safeText(row.action, "");
    if (!horizon || !action) return null;
    return {
      horizon, owner: safeText(row.owner, "수출 책임자"), action,
      deliverable: safeText(row.deliverable, `${horizon} 산출물`), passCriteria: safeText(row.passCriteria, "담당자 검토 완료"),
      evidenceRefs: normalizeEvidenceRefs(row.evidenceRefs, allowed, defaultRefs),
    };
  }).filter((item): item is ReportActionPlanItem => Boolean(item));
  return (["D+7", "D+30", "D+90"] as ReportActionHorizon[]).flatMap((horizon) => {
    const matches = rows.filter((item) => item.horizon === horizon);
    return matches.length ? matches : fallback.filter((item) => item.horizon === horizon);
  }).slice(0, 9);
};

const normalizeOfficialResearch = (value: unknown, fallback: ReportOfficialResearch): ReportOfficialResearch => {
  const row = asRecord(value);
  const sources = asArray(row.sources).map((item, index) => {
    const source = asRecord(item);
    const url = safeHrefText(source.url ?? source.uri);
    const title = safeText(source.title, "");
    const organization = safeText(source.organization ?? source.org, "");
    if (!url || !isOfficialSource(`${title} ${organization} ${url}`)) return null;
    return {
      evidenceId: /^W-\d{3}$/i.test(safeText(source.evidenceId, ""))
        ? safeText(source.evidenceId, "").toUpperCase() : `W-${String(index + 1).padStart(3, "0")}`,
      title: title || url, url, organization: organization || inferOrganization(title, url),
      publishedAt: safeText(source.publishedAt, ""), accessedAt: safeText(source.accessedAt, ""),
    };
  }).filter((item): item is ReportOfficialResearchSource => Boolean(item));
  const sourceIds = new Set(sources.map((item) => item.evidenceId));
  const defaultRefs = sources[0] ? [sources[0].evidenceId] : [];
  const keyFindings = asArray(row.keyFindings).map((item) => {
    if (typeof item === "string") return { finding: safeText(item, ""), evidenceRefs: defaultRefs };
    const findingRow = asRecord(item);
    const finding = safeText(findingRow.finding ?? findingRow.summary, "");
    return finding ? { finding, evidenceRefs: normalizeEvidenceRefs(findingRow.evidenceRefs, sourceIds, defaultRefs) } : null;
  }).filter((item): item is ReportOfficialFinding => Boolean(item));
  return {
    summary: safeText(row.summary, sources.length ? "공식 웹 근거를 확인했습니다." : fallback.summary),
    keyFindings, queries: normalizeTextArray(row.queries), sources, conflicts: normalizeTextArray(row.conflicts),
  };
};

const normalizeStopConditions = (
  value: unknown, fallback: ReportStopCondition[], allowed: Set<string>, defaultRefs: string[],
): ReportStopCondition[] => {
  const rows = asArray(value).map((item) => {
    const row = asRecord(item);
    const condition = safeText(row.condition, typeof item === "string" ? item : "");
    return condition ? {
      condition, response: safeText(row.response, "조건 해소 전 진행 보류"),
      evidenceRefs: normalizeEvidenceRefs(row.evidenceRefs, allowed, defaultRefs),
    } : null;
  }).filter((item): item is ReportStopCondition => Boolean(item));
  return rows.length ? rows.slice(0, 8) : fallback;
};

const countMissingEvidenceLinks = (source: Record<string, unknown>): number => {
  let count = 0;
  const inspect = (value: unknown) => {
    const row = asRecord(value);
    if (Object.keys(row).length && asArray(row.evidenceRefs).length === 0) count += 1;
  };
  inspect(source.decision);
  asArray(asRecord(source.decision).immediateActions).forEach(inspect);
  asArray(source.decisionReasons).forEach(inspect);
  inspect(source.entryStrategy);
  asArray(source.decisionGates).forEach(inspect);
  asArray(source.actionPlan).forEach(inspect);
  asArray(source.stopConditions).forEach(inspect);
  return count;
};

const normalizeEvidenceRefs = (value: unknown, allowed: Set<string>, fallback: string[]): string[] => {
  const refs = uniqueTexts(asArray(value).map((item) => safeText(item, ""))).filter((ref) => allowed.has(ref));
  return refs.length ? refs : fallback.filter((ref) => allowed.has(ref));
};
const evidenceRef = (catalog: ReportProgramEvidenceItem[], category: ReportProgramEvidenceItem["category"]): string =>
  catalog.find((item) => item.category === category)?.evidenceId ?? "";
const compactRefs = (refs: Array<string | undefined>): string[] => uniqueTexts(refs.filter((ref): ref is string => Boolean(ref)));
const downgradeConfidence = (confidence: ReportDecisionConfidence, issueCount: number): ReportDecisionConfidence => {
  if (!issueCount) return confidence;
  const levels: ReportDecisionConfidence[] = ["low", "medium", "high"];
  return levels[Math.max(0, levels.indexOf(confidence) - Math.min(2, issueCount))];
};
const normalizeGateTopic = (value: unknown): ReportGateTopic | null => {
  const text = safeText(value, "").toLowerCase();
  return GATE_TOPICS.includes(text as ReportGateTopic) ? text as ReportGateTopic : null;
};
const normalizeHorizon = (value: unknown): ReportActionHorizon | null => {
  const text = safeText(value, "").toUpperCase().replace(/\s/g, "");
  if (["D+7", "7", "7D"].includes(text)) return "D+7";
  if (["D+30", "30", "30D"].includes(text)) return "D+30";
  if (["D+90", "90", "90D"].includes(text)) return "D+90";
  return null;
};
const isOfficialSource = (value: string): boolean => {
  const normalized = value.toLowerCase();
  return !EXCLUDED_SOURCE_TOKENS.some((token) => normalized.includes(token))
    && OFFICIAL_SOURCE_TOKENS.some((token) => normalized.includes(token));
};
const inferOrganization = (title: string, url: string): string => {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return title || "공식기관"; }
};
const normalizeCountryCode = (value: string | null | undefined): string => safeText(value, "").trim().toUpperCase();
const normalizeTextArray = (value: unknown, fallback: string[] = []): string[] => {
  const texts = asArray(value).map((item) => safeText(item, "")).filter(Boolean);
  return uniqueTexts(texts, fallback);
};
const uniqueTexts = (values: string[], fallback: string[] = []): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = safeText(value, "");
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(text);
  }
  return out.length ? out : fallback;
};
const serializeGateInput = (value: Record<string, string> | undefined): string => {
  if (!value) return "";
  return Object.entries(value)
    .filter(([, item]) => Boolean(item.trim()))
    .map(([key, item]) => `${key}=${item}`)
    .join(" · ");
};

const safeText = (value: unknown, fallback: string): string => {
  const normalized = normalizeReportText(typeof value === "number" ? String(value) : value as string | null | undefined);
  return normalized && normalized.length ? normalized : fallback;
};
const safeHrefText = (value: unknown): string => {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return toSafePublicHref(String(value)) ?? "";
};
const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
};
