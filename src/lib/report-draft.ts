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
  selectedDetailCounts?: {
    certs: number;
    regs: number;
    risks: number;
    facts: number;
  };
  safetyFlags: ReportEvidenceFlag[];
  apiLogs: ReportEvidenceApiLog[];
  missingEvidence: string[];
  countryVerdicts?: Array<{ countryCode: string; verdict: any; createdAt: string }>;
}

export interface ReportEvidenceCountry {
  countryCode: string;
  countryName: string;
  recommendationRank?: number | null;
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
export interface ReportAnalysisBasis {
  programDataSummary: string;
  programEvidenceRefs: string[];
  officialDataSummary: string;
  officialEvidenceRefs: string[];
  aiInterpretation: string;
}

export interface ReportDraft {
  schemaVersion: 4;
  analysisBasis: ReportAnalysisBasis;
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

  evidence.topCountries.slice(0, 3).forEach((country, index) => {
    const recommendationRank = country.recommendationRank ?? index + 1;
    add({
      evidenceId: `P-COUNTRY-${String(index + 1).padStart(3, "0")}`,
      category: "country",
      label: index === 0
        ? `선택 국가 · 추천 ${recommendationRank}순위 근거`
        : `후보국 추천 ${recommendationRank}순위 근거`,
      value: `${recommendationRank}순위 · ${safeText(country.countryName, REPORT_UNKNOWN_TEXT)} · ${safeText(country.label, REPORT_UNKNOWN_TEXT)} · ${safeText(country.totalScore, "-")}점 · ${safeText(country.summary, REPORT_UNKNOWN_TEXT)}`,
      sourceName: "프로그램 국가추천", status: "available", referenceDate: "",
    });
  });
  if (selected) {
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
  (evidence.countryVerdicts ?? [])
    .filter((row) => !selectedCode || normalizeCountryCode(row.countryCode) === selectedCode)
    .forEach((row, index) => add({
      evidenceId: `P-VERDICT-${String(index + 1).padStart(3, "0")}`,
      category: "decision",
      label: "Step 4 AI 국가판단",
      value: [
        safeText(row.verdict?.opinion, ""),
        safeText(row.verdict?.executiveSummary, ""),
        safeText(row.verdict?.opinionDetail, ""),
      ].filter(Boolean).join(" · ") || REPORT_UNKNOWN_TEXT,
      sourceName: "Step 4 Gemini 분석",
      status: "ai_interpretation",
      referenceDate: safeText(row.createdAt, ""),
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
  const productName = safeText(evidence.product?.name, "해당 품목");
  const codeText = compactRefs([evidence.product?.hskCode ?? undefined, evidence.product?.hsCode ?? undefined]).join(" / ");
  const productContext = codeText ? `${productName}(${codeText})` : productName;
  const blockedSafety = evidence.safetyFlags.some((flag) => /금지|차단|수출\s*불가|prohibit|blocked/i.test(`${flag.flagType ?? ""} ${flag.summary ?? ""}`));

  return [
    makeGate(
      "certification", "check_required",
      certRef ? "1~4단계 인증 조회 결과는 있으나 제품별 최종 적용성 확인이 필요합니다." : "제품별 필수 인증과 시험규격이 아직 확정되지 않았습니다.",
      `${productContext}의 용도·사양서를 기준으로 목적국 공식 인증기관에 적용 여부, 시험규격, 비용을 확인하세요.`,
      "인증·품질 담당", "D+7", "필수 인증 취득이 불가능하거나 인증비가 목표 원가를 초과하는 경우", certRef || baseRef,
      `📄 ${productName} 인증 적용성 확인서(공식기관 답변·시험규격 포함)`,
      "공식기관 URL·조회일·담당기관·적용 규격을 확인표에 기록하세요.",
      true
    ),
    makeGate(
      "regulation", "check_required",
      regRef ? "1~4단계 수입규제 조회 결과의 제품 적용 범위를 공식 원문으로 재확인해야 합니다." : "목적국 수입규제와 무역구제조치 적용 여부가 아직 확정되지 않았습니다.",
      `${productContext}의 목적국 세번과 제품 사양을 기준으로 시행일, 적용 범위, 예외를 공식 원문에서 확인하세요.`,
      "통관·법무 담당", "D+7", "수입 금지 또는 수용할 수 없는 제한·추가비용이 확인되는 경우", regRef || baseRef,
      `📄 ${productName} 수입규제 적용 확인표(세번·시행일·공식 URL 포함)`,
      "적용·비적용 근거 문구와 공식 원문 링크를 함께 보관하세요.",
      true
    ),
    makeGate(
      "tariff", "check_required",
      customsRef ? "프로그램 관세 자료가 있으나 최종 세번·기본관세·추가관세의 동시 확인이 필요합니다." : "목적국 최종 세번과 실제 적용 관세가 아직 확정되지 않았습니다.",
      `${productContext}의 용도와 재질을 근거로 목적국 세번, 기본관세, 특혜관세, 추가관세를 관세사와 확인하세요.`,
      "HS·관세 담당", "D+7", "총 관세와 무역구제조치 반영 후 목표 마진을 충족하지 못하는 경우", customsRef || baseRef,
      `📄 ${productName} 목적국 세번·기본/추가관세 판정표`,
      "최종 세번과 각 세율의 공식 근거 URL·조회일을 기록하세요.",
      true
    ),
    makeGate(
      "profitability", "check_required",
      "인증·관세·물류·보험비를 반영한 도착원가와 목표 마진이 아직 확정되지 않았습니다.",
      `${productName} 대표 규격의 견적 조건별 도착원가와 보수·기준·낙관 시나리오 마진을 계산하세요.`,
      "재무·원가 담당", "D+30", "보수 시나리오의 공헌이익이 회사 기준보다 낮은 경우", customsRef || baseRef,
      `📄 ${productName} 도착원가(Landed Cost)·목표 마진 산출표`,
      "단가·수량·운임·보험·인증·관세 가정을 모두 표시하세요.",
      true
    ),
    makeGate(
      "payment", "check_required",
      riskRef ? "O/A 결제 방식에 대한 대금 회수 안전장치 마련 필요" : "K-SURE 국외기업 신용조사 및 결제위험 검토 필요",
      "K-SURE 국외기업 신용조사 신청 및 수출보험 한도 확보",
      "영업·재무 담당", "D+30", "바이어 신용등급 불량 또는 회수 안전장치 없는 외상거래만 요구하는 경우", riskRef || baseRef,
      `📄 ${productName} 거래용 바이어 신용조사서·결제조건 승인표`,
      "K-SURE 신용조사를 신청하거나 무역보험 인수 승인서를 첨부하세요.",
      true
    ),
    makeGate(
      "safety", blockedSafety ? "blocked" : "check_required",
      blockedSafety ? "1~4단계 안전 데이터에서 수출 차단 가능성이 확인되었습니다." : "제품안전·전략물자·라벨링의 최종 적용 범위가 아직 확정되지 않았습니다.",
      `${productContext}의 기능·최종사용자·구성기술을 기준으로 공식 안전 및 수출통제 판정을 받으세요.`,
      "안전·수출통제 담당", "D+7", "수출통제 또는 필수 안전요건을 충족할 수 없는 경우", safetyRef || baseRef,
      `📄 ${productName} 제품안전·수출통제 공식 판정자료`,
      "판정기관, 판정일, 대상 사양, 유효범위와 후속 조치를 기록하세요.",
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
  const productName = safeText(evidence.product?.name, "해당 품목");
  const refs = compactRefs([
    evidenceRef(catalog, "country"), evidenceRef(catalog, "customs"), evidenceRef(catalog, "certification"),
    evidenceRef(catalog, "regulation"), evidenceRef(catalog, "risk"), catalog[0]?.evidenceId,
  ]);
  const pendingActions = [...(evidence.decisionActions ?? [])]
    .filter((item) => item.status !== "done")
    .sort((a, b) => a.priority - b.priority);
  const factActions = (evidence.decisionFacts ?? [])
    .map((item) => item.nextAction)
    .filter((item): item is string => Boolean(item));
  const firstProgramAction = pendingActions[0]?.title || factActions[0];
  const secondProgramAction = pendingActions[1]?.title || factActions[1];
  return [
    {
      horizon: "D+7",
      owner: "HS·규제 담당",
      action: firstProgramAction || `${productName}의 HS/HSK·인증·규제·관세 적용성을 공식기관 자료로 재확인`,
      deliverable: "1~4단계 값과 공식기관 재조회 결과를 나란히 기록한 근거 확인표",
      passCriteria: "각 핵심 주장에 공식 URL·조회일·담당기관·적용 여부가 연결됨",
      evidenceRefs: refs,
    },
    {
      horizon: "D+30",
      owner: "영업·재무 담당",
      action: secondProgramAction || `${countryName} 바이어 3~5곳에 ${productName} 대표 사양의 수요·규격·가격·결제조건을 검증`,
      deliverable: "바이어 피드백·요구규격·도착원가·결제조건 비교표",
      passCriteria: "공식 요건과 목표 마진·회수 조건을 충족하는 파일럿 후보 1곳 이상 확보",
      evidenceRefs: refs,
    },
    {
      horizon: "D+90",
      owner: "수출 책임자",
      action: "공식 근거 갱신 결과와 샘플·견적 검증 결과를 종합해 확대·보류·중단 결정",
      deliverable: "근거별 검증상태와 파일럿 결과가 포함된 최종 Go/No-Go 회의록",
      passCriteria: "차단 조건 0건, 미확인 핵심 근거 해소, 파일럿 품질·수익성 승인",
      evidenceRefs: refs,
    },
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
  const programRefs = catalog.map((item) => item.evidenceId);
  const candidateSummary = evidence.topCountries.slice(0, 3)
    .map((country, index) => ({ country, rank: country.recommendationRank ?? index + 1 }))
    .sort((left, right) => left.rank - right.rank)
    .map(({ country, rank }) => `${rank}순위 ${safeText(country.countryName, REPORT_UNKNOWN_TEXT)}(${safeText(country.totalScore, "-")}점)`)
    .join(", ");
  const selectedCode = normalizeCountryCode(selected?.countryCode);
  const selectedRowCount = <T extends { countryCode: string | null }>(rows: T[]) => rows.filter((row) => (
    !selectedCode || !row.countryCode || normalizeCountryCode(row.countryCode) === selectedCode
  )).length;
  const selectedDetailCounts = evidence.selectedDetailCounts ?? {
    certs: selectedRowCount(evidence.certs),
    regs: selectedRowCount(evidence.regs),
    risks: selectedRowCount(evidence.risks),
    facts: selectedRowCount(evidence.decisionFacts ?? []),
  };
  const programDataSummary = [
    `${safeText(evidence.company?.companyName, "기업정보 미확인")}의 ${productName}`,
    `HS ${safeText(evidence.product?.hsCode, "-")} · HSK ${safeText(evidence.product?.hskCode, "-")}`,
    candidateSummary ? `후보국 ${candidateSummary}` : "후보국 미확인",
    `선택국 상세 근거 인증 ${selectedDetailCounts.certs}건·규제 ${selectedDetailCounts.regs}건·위험 ${selectedDetailCounts.risks}건·의사결정 사실 ${selectedDetailCounts.facts}건`,
  ].join(" / ");

  // Step 4 Gemini AI Verdict 데이터가 존재하는지 확인
  const step4Verdict = evidence.countryVerdicts?.find((v) => v.countryCode.toUpperCase() === countryCode)?.verdict;

  let verdictVal: ReportDecisionVerdict = selected ? (hasBlocked ? "hold" : "conditional") : "hold";
  let headlineStr = selected ? `${countryName} 수출은 핵심 조건 확인 후 제한적으로 검증하세요.` : "선택 국가 근거가 없어 수출 판단을 보류합니다.";
  let reasonStr = "공식기관 웹 재검색이 완료되지 않아 1~4단계 데이터와 기존 AI 분석을 바탕으로 보수적인 임시 판단을 표시합니다. 공식 근거가 연결되기 전에는 법적·인증·관세 관련 내용을 확정값으로 사용하지 마세요.";
  let logicSummaryStr = "1~4단계 프로그램 데이터에서 시장성과 미확인 조건을 추출했습니다. 공식기관 재검색이 완료되지 않아 AI 해석은 실행 우선순위를 정하는 가설로만 사용했습니다.";
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
      reasonStr = `Step 4 AI 분석은 '${step4Verdict.opinion}' 의견을 제시했습니다. 다만 해당 설명의 공식기관 재검증이 완료되지 않았으므로 현재 리포트에서는 저신뢰 가설로만 반영합니다.`;
      logicSummaryStr = "1~4단계 프로그램 데이터와 Step 4 AI 의견을 비교해 우선 확인 과제를 도출했습니다. 공식기관 웹 근거가 확보되지 않은 주장은 사실 확정이 아닌 AI 가설로 분리했습니다.";
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
    schemaVersion: 4,
    analysisBasis: {
      programDataSummary,
      programEvidenceRefs: programRefs,
      officialDataSummary: "공식기관 웹 재검색이 완료되지 않았습니다. 현재 리포트에는 W-* 공식 웹 근거가 없으므로 법적·인증·관세 주장을 확정하지 않습니다.",
      officialEvidenceRefs: [],
      aiInterpretation: step4Verdict
        ? `Step 4 AI 의견(${safeText(step4Verdict.opinion, "의견 미확인")})과 1~4단계 데이터를 조합해 확인 순서를 제안한 가설입니다. 공식 근거 확보 후 다시 판단해야 합니다.`
        : "1~4단계 데이터의 빈칸과 위험 신호를 바탕으로 확인 순서를 제안한 AI 가설입니다. 공식 근거 확보 후 다시 판단해야 합니다.",
    },
    decision: {
      verdict: verdictVal,
      confidence: "low",
      confidenceReason: "공식기관 웹 근거 미확보(W 0건) · 1~4단계 데이터와 AI 가설만 반영",
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
  const isV4 = Number(source.schemaVersion) === 4;
  const isV3 = Number(source.schemaVersion) === 3 || isV4;
  const isV2 = Number(source.schemaVersion) === 2 || isV3;
  const data = isV2 ? source : convertLegacyDraft(source, fallback, evidence);
  const catalog = buildReportProgramEvidenceCatalog(evidence);
  const officialResearch = normalizeOfficialResearch(data.officialResearch, fallback.officialResearch);
  const allowedRefs = new Set([...catalog.map((item) => item.evidenceId), ...officialResearch.sources.map((item) => item.evidenceId)]);
  const defaultRefs = [catalog[0]?.evidenceId].filter(Boolean);
  const analysisBasis = normalizeAnalysisBasis(data.analysisBasis, {
    ...fallback.analysisBasis,
    officialDataSummary: officialResearch.sources.length
      ? officialResearch.summary
      : fallback.analysisBasis.officialDataSummary,
    officialEvidenceRefs: officialResearch.sources.map((item) => item.evidenceId),
  }, allowedRefs);
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
    schemaVersion: 4,
    analysisBasis,
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
  return `ev_cd2_${(hash >>> 0).toString(16).padStart(8, "0")}`;
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

const normalizeAnalysisBasis = (
  value: unknown,
  fallback: ReportAnalysisBasis,
  allowedRefs: Set<string>,
): ReportAnalysisBasis => {
  const row = asRecord(value);
  return {
    // 1~4단계 값은 현재 프로그램 데이터로만 결정해 오래되거나 재서술된 AI 응답이
    // 추천 순위와 선택국 상세 건수를 덮어쓰지 못하게 한다.
    programDataSummary: fallback.programDataSummary,
    programEvidenceRefs: fallback.programEvidenceRefs.filter((ref) => (
      ref.startsWith("P-") && allowedRefs.has(ref)
    )),
    officialDataSummary: safeText(row.officialDataSummary, fallback.officialDataSummary),
    officialEvidenceRefs: normalizeEvidenceRefs(
      row.officialEvidenceRefs,
      allowedRefs,
      fallback.officialEvidenceRefs,
    ).filter((ref) => ref.startsWith("W-")),
    aiInterpretation: safeText(row.aiInterpretation, fallback.aiInterpretation),
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
