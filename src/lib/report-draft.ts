import { normalizeReportText, REPORT_UNKNOWN_TEXT } from "@/lib/report-text";
import { formatCustomsExportUsd, type CustomsExportStatus } from "@/lib/customs-export-evidence";
import type { FeasibilityGrade, CountryEvidenceSnapshot } from "@/lib/report-feasibility";
import {
  buildCountryEvidenceSnapshot,
  buildExportFeasibilitySummary,
  buildPreExportChecklist,
  buildCertRegChecklist,
  buildPaymentRiskAssessment,
  evaluateFeasibilityGrade,
  getFeasibilityLabel,
} from "@/lib/report-feasibility";

export interface ReportEvidenceBundle {
  company: {
    companyName: string | null;
    industrialComplex: string | null;
    address: string | null;
  } | null;
  product: {
    name: string | null;
    hsCode: string | null;
    hskCode: string | null;
    hsReviewRequired: boolean;
  } | null;
  topCountries: ReportEvidenceCountry[];
  certs: ReportEvidenceRow[];
  regs: ReportEvidenceRow[];
  risks: ReportEvidenceRow[];
  safetyFlags: ReportEvidenceFlag[];
  apiLogs: ReportEvidenceApiLog[];
  missingEvidence: string[];
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

export interface ReportEvidenceFlag {
  flagType: string | null;
  summary: string | null;
}

export interface ReportEvidenceApiLog {
  apiKeyName: string;
  status: string;
  responseCount: number | null;
}

export interface ReportDraft {
  executiveSummary: string;
  exportFeasibility: string;
  topCountryReason: string;
  countryStrategies: ReportCountryStrategy[];
  countryCautionAnalysisStatus: CountryCautionAnalysisStatus;
  countryCautionAnalyses: CountryCautionAnalysis[];
  preExportChecklist: string[];
  actionPlan7Days: string[];
  actionPlan30Days: string[];
  actionPlan90Days: string[];
  unresolvedItems: string[];
  finalCautions: string[];
}

export type CountryCautionAnalysisStatus = "generated" | "not_generated";

export type CountryCautionSectionKind =
  | "certification"
  | "regulation"
  | "ksure_country_risk"
  | "ksure_industry_risk"
  | "ksure_payment";

export interface CountryCautionFact {
  label: string;
  value: string;
  meaning: string;
}

export interface CountryCautionSection {
  kind: CountryCautionSectionKind;
  title: string;
  facts: CountryCautionFact[];
  interpretation: string;
}

export interface CountryCautionAnalysis {
  countryCode: string;
  countryName: string;
  coreSummary: string;
  sections: CountryCautionSection[];
}

export interface ReportCountryStrategy {
  countryCode: string;
  countryName: string;
  feasibilityGrade: FeasibilityGrade;
  oneLineDecision: string;
  position: string;
  entryMode: string;
  entryStrategy: string;
  requiredChecks: string[];
  certRegChecklist: string[];
  paymentRiskAssessment: string;
  riskResponse: string;
  evidenceLimits: string[];
  evidenceRefs: string[];
  opportunity?: string;
  newsImpactAnalysis: string;
  marketOpportunity: string;
  kotraEntryStrategy?: ReportKotraEntryStrategy;
}

export interface ReportKotraEntryStrategy {
  status: "available" | "empty" | "failed" | "pdf_failed";
  title: string;
  publishedDate: string;
  tradeOffice: string;
  sourceUrl: string;
  attachmentName: string;
  attachmentUrl: string;
  usedPdf: boolean;
  basisSummary: string;
  limitations: string[];
}

const FINAL_CAUTION =
  "본 리포트는 공공데이터 조회 결과와 AI 요약을 결합한 참고자료이며, 전략물자·인증·규제 적합성의 최종 판정이 아닙니다.";
const GEMINI_NEWS_BODY_ANALYSIS_PENDING_TEXT =
  "Gemini 뉴스 본문 분석 미생성 — Step3 뉴스 본문은 리포트 근거에 포함되었지만 Gemini 분석 결과가 아직 생성되지 않았습니다. Step6에서 AI 요약 생성을 실행하세요.";
const COUNTRY_CAUTION_SECTION_ORDER: CountryCautionSectionKind[] = [
  "certification",
  "regulation",
  "ksure_country_risk",
  "ksure_industry_risk",
  "ksure_payment",
];
const COUNTRY_CAUTION_SECTION_TITLES: Record<CountryCautionSectionKind, string> = {
  certification: "인증",
  regulation: "규제",
  ksure_country_risk: "K-SURE 국가위험",
  ksure_industry_risk: "K-SURE 업종위험",
  ksure_payment: "K-SURE 수출결제",
};

export const buildReportDraftFallback = (evidence: ReportEvidenceBundle): ReportDraft => {
  const productName = safeText(evidence.product?.name, "해당 품목");
  const topCountry = evidence.topCountries[0];
  const topCountryName = safeText(topCountry?.countryName, REPORT_UNKNOWN_TEXT);
  const hsText = buildHsText(evidence);
  const missingEvidence = normalizeTextArray(evidence.missingEvidence);

  return {
    executiveSummary: `${productName} 기준 우선 검토 국가는 ${topCountryName}입니다. ${hsText} 기준으로 Top 3 국가의 인증·규제·결제위험·제품안전 근거를 확인해야 합니다.`,
    exportFeasibility: buildExportFeasibilitySummary(evidence.topCountries, evidence),
    topCountryReason: topCountry
      ? `${topCountryName}은 추천 점수 ${topCountry.totalScore ?? "-"}점(${safeText(topCountry.label, REPORT_UNKNOWN_TEXT)})으로 1순위입니다. ${safeText(topCountry.summary, "세부 추천 근거는 출처 표와 국가별 유의사항에서 확인해야 합니다.")}`
      : `추천 국가 근거는 ${REPORT_UNKNOWN_TEXT}입니다.`,
    countryStrategies: buildFallbackCountryStrategies(evidence),
    countryCautionAnalysisStatus: "not_generated",
    countryCautionAnalyses: [],
    preExportChecklist: buildPreExportChecklist(evidence),
    actionPlan7Days: build7DayActions(evidence),
    actionPlan30Days: build30DayActions(evidence),
    actionPlan90Days: build90DayActions(evidence),
    unresolvedItems: missingEvidence.length > 0 ? missingEvidence : [REPORT_UNKNOWN_TEXT],
    finalCautions: [FINAL_CAUTION, "미조회·실패 API 항목은 원문 기관에서 재확인한 뒤 제출용 리포트를 확정해야 합니다."],
  };
};

export const buildReportEvidenceHash = (evidence: ReportEvidenceBundle): string => {
  const serialized = stableStringify(evidence);
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `ev_${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

export const normalizeReportDraft = (input: unknown, evidence: ReportEvidenceBundle): ReportDraft => {
  const source = asRecord(asRecord(input).draft ?? input);
  const fallback = buildReportDraftFallback(evidence);
  const countryStrategies = sanitizeCountryStrategiesAgainstEvidence(
    normalizeCountryStrategies(source.countryStrategies, fallback.countryStrategies),
    evidence,
  );
  const countryCautionAnalyses = sanitizeCountryCautionAnalysesAgainstEvidence(
    normalizeCountryCautionAnalyses(source.countryCautionAnalyses),
    evidence,
  );
  const countryCautionAnalysisStatus: CountryCautionAnalysisStatus =
    countryCautionAnalyses.length > 0 ? "generated" : "not_generated";

  return {
    executiveSummary: safeText(source.executiveSummary ?? source.summary, fallback.executiveSummary),
    exportFeasibility: safeText(source.exportFeasibility, fallback.exportFeasibility),
    topCountryReason: safeText(source.topCountryReason, fallback.topCountryReason),
    countryStrategies,
    countryCautionAnalysisStatus,
    countryCautionAnalyses: countryCautionAnalysisStatus === "generated" ? countryCautionAnalyses : [],
    preExportChecklist: normalizeTextArray(source.preExportChecklist, fallback.preExportChecklist),
    actionPlan7Days: normalizeTextArray(source.actionPlan7Days ?? source.actions, fallback.actionPlan7Days),
    actionPlan30Days: normalizeTextArray(source.actionPlan30Days, fallback.actionPlan30Days),
    actionPlan90Days: normalizeTextArray(source.actionPlan90Days, fallback.actionPlan90Days),
    unresolvedItems: uniqueTexts([
      ...normalizeTextArray(source.unresolvedItems),
      ...normalizeTextArray(evidence.missingEvidence),
    ], fallback.unresolvedItems),
    finalCautions: uniqueTexts(normalizeTextArray(source.finalCautions), fallback.finalCautions),
  };
};

const buildFallbackCountryStrategies = (evidence: ReportEvidenceBundle): ReportCountryStrategy[] => {
  if (evidence.topCountries.length === 0) {
    return [{
      countryCode: "-",
      countryName: REPORT_UNKNOWN_TEXT,
      feasibilityGrade: "hold" as FeasibilityGrade,
      oneLineDecision: "추천 국가 데이터가 없어 수출 우선순위를 판단할 수 없습니다.",
      position: REPORT_UNKNOWN_TEXT,
      entryMode: "추천 국가 데이터가 없어 국가별 전략을 확정할 수 없습니다.",
      entryStrategy: "후보국 추천 데이터 확보 후 진입 전략을 수립하세요.",
      requiredChecks: ["후보국 추천 단계를 재실행하세요.", "API 출처 표에서 실패 항목을 확인하세요."],
      certRegChecklist: ["인증·규제 데이터 없음"],
      paymentRiskAssessment: "결제 리스크 데이터 없음",
      riskResponse: "근거 데이터 확보 전에는 진출 우선순위를 확정하지 마세요.",
      evidenceLimits: ["후보국 추천 근거 없음"],
      evidenceRefs: [],
      newsImpactAnalysis: "대상국 일치 직접 뉴스 근거 없음 — 관련 뉴스 모니터링 필요",
      marketOpportunity: "후보국 추천 데이터가 없어 시장 기회를 평가할 수 없습니다.",
    }];
  }

  return evidence.topCountries.slice(0, 3).map((country, index) => {
    const countryName = safeText(country.countryName, REPORT_UNKNOWN_TEXT);
    const countryCode = safeText(country.countryCode, "-");
    const snapshot = buildCountryEvidenceSnapshot(country, evidence);
    const feasibilityGrade = evaluateFeasibilityGrade(snapshot);
    const requiredChecks = buildCountryRequiredChecks(evidence, country.countryCode);
    const evidenceRefs = buildCountryEvidenceRefs(country);
    const evidenceLimits = buildCountryEvidenceLimits(evidence, country, evidenceRefs);
    return {
      countryCode,
      countryName,
      feasibilityGrade,
      oneLineDecision: buildCountryOneLineDecision(country, index, feasibilityGrade, snapshot, evidenceRefs),
      position: buildCountryPosition(country, index),
      entryMode: buildCountryEntryMode(evidence, country, evidenceRefs),
      entryStrategy: buildCountryEntryMode(evidence, country, evidenceRefs),
      requiredChecks,
      certRegChecklist: buildCertRegChecklist(countryCode, evidence),
      paymentRiskAssessment: buildPaymentRiskAssessment(countryCode, evidence),
      riskResponse: buildCountryRiskResponse(evidence, countryCode),
      evidenceLimits,
      evidenceRefs,
      newsImpactAnalysis: buildCountryNewsImpact(country),
      marketOpportunity: buildCountryMarketOpportunity(country, snapshot, index),
    };
  });
};

const buildCountryOneLineDecision = (
  country: ReportEvidenceCountry,
  index: number,
  feasibilityGrade: FeasibilityGrade,
  snapshot: CountryEvidenceSnapshot,
  evidenceRefs: string[],
): string => {
  const countryName = safeText(country.countryName, REPORT_UNKNOWN_TEXT);
  const rank = index === 0 ? "1순위" : `${index + 1}순위`;
  const certRegText = snapshot.hasCerts && snapshot.hasRegs
    ? "인증·규제 근거 확인"
    : snapshot.hasCerts || snapshot.hasRegs
      ? "인증·규제 일부 확인"
      : "인증·규제 근거 부족";
  const newsText = evidenceRefs.length > 0 ? "직접 뉴스 근거 있음" : "직접 뉴스 근거 부족";
  const paymentText = snapshot.hasPaymentRisk ? "결제위험 반영 필요" : "결제위험 확인 필요";
  return `${countryName}: ${rank} ${getFeasibilityLabel(feasibilityGrade)} - ${certRegText}, ${newsText}, ${paymentText}.`;
};

const buildCountryPosition = (country: ReportEvidenceCountry, index: number): string => {
  const countryName = safeText(country.countryName, REPORT_UNKNOWN_TEXT);
  const label = safeText(country.label, REPORT_UNKNOWN_TEXT);
  const score = country.totalScore ?? "-";
  const rankText = index === 0 ? "Top 1 우선 검증국" : `Top ${index + 1} 검토 후보국`;
  const customsText = buildCustomsExportSentence(country);
  return `${countryName}은 ${rankText}입니다. 추천 점수 ${score}점, 판정 라벨은 ${label}입니다.${customsText ? ` ${customsText}` : ""}`;
};

const buildCountryEntryMode = (
  evidence: ReportEvidenceBundle,
  country: ReportEvidenceCountry,
  evidenceRefs: string[],
): string => {
  const countryName = safeText(country.countryName, REPORT_UNKNOWN_TEXT);
  const hs = safeText(evidence.product?.hsCode, "-");
  const hsk = safeText(evidence.product?.hskCode, "-");
  const evidenceText = evidenceRefs.length > 0
    ? "대상국 일치 근거를 우선 검토하고"
    : "대상국 일치 직접 뉴스 근거가 부족하므로";
  const customsText = country.customsExport12mUsd
    ? `최근 수출 실적(${formatCustomsExportUsd(country.customsExport12mUsd)})을 초기 수요 검증 신호로 참고하되`
    : "최근 수출 실적이 충분히 확인되지 않았으므로";
  return `${countryName}은 ${customsText} ${evidenceText} HS/HSK ${hs}/${hsk}, 인증, 수입규제, 결제위험을 원문 기준으로 확인한 뒤 무역관 상담 또는 샘플 수출을 검토하세요.`;
};

const buildCountryRiskResponse = (evidence: ReportEvidenceBundle, countryCode: string): string => {
  const paymentRows = evidence.risks.filter(
    (row) => row.countryCode === countryCode && safeText(row.category, "").toLowerCase().includes("payment"),
  );
  if (paymentRows.length > 0) {
    return "K-SURE 결제위험 근거를 거래조건에 반영하고 초기 거래는 선금·분할지급·LC 등 보수 조건을 검토하세요.";
  }
  return "결제위험 근거가 부족하므로 원문 확인 전까지 거래조건을 보수적으로 설정하세요.";
};

const buildCountryNewsImpact = (country: ReportEvidenceCountry): string => {
  const sources = buildCountryNewsImpactSources(country);
  if (sources.length === 0) {
    return "대상국 일치 직접 뉴스 근거 없음 — 관련 뉴스 모니터링 필요";
  }
  return GEMINI_NEWS_BODY_ANALYSIS_PENDING_TEXT;
};

const buildCountryMarketOpportunity = (
  country: ReportEvidenceCountry,
  snapshot: CountryEvidenceSnapshot,
  index: number,
): string => {
  const countryName = safeText(country.countryName, REPORT_UNKNOWN_TEXT);
  const score = country.totalScore ?? "-";
  const rank = index === 0 ? "1순위 우선 검증국" : `${index + 1}순위 검토 후보국`;
  const dataStatus = snapshot.hasCerts && snapshot.hasRegs
    ? "인증·규제 데이터가 확보되어 구체적 진입 준비가 가능합니다."
    : "추가 데이터 확보 후 시장 기회를 재평가하세요.";
  const customsText = country.customsExport12mUsd
    ? `최근 12개월 HS/HSK 수출액 ${formatCustomsExportUsd(country.customsExport12mUsd)}가 확인되어 기존 거래 흐름이 있는 시장으로 해석할 수 있습니다.`
    : "최근 12개월 HS/HSK 수출액 근거는 확실한 정보 없음입니다.";
  return `${countryName}은 추천 점수 ${score}점으로 ${rank}입니다. ${customsText} ${dataStatus}`;
};

const buildCountryRequiredChecks = (evidence: ReportEvidenceBundle, countryCode: string): string[] => {
  const certCount = evidence.certs.filter((row) => row.countryCode === countryCode).length;
  const regCount = evidence.regs.filter((row) => row.countryCode === countryCode).length;
  const riskCount = evidence.risks.filter((row) => row.countryCode === countryCode).length;
  return [
    `HS/HSK ${safeText(evidence.product?.hsCode, "-")}/${safeText(evidence.product?.hskCode, "-")} 품목 분류 재확인`,
    buildCustomsRequiredCheck(evidence.topCountries.find((country) => country.countryCode === countryCode)),
    certCount > 0 ? `인증 근거 ${certCount}건 원문 적합성 확인` : "인증 요구사항 확실한 정보 없음",
    regCount > 0 ? `수입규제 근거 ${regCount}건 적용 범위 확인` : "수입규제 확실한 정보 없음",
    riskCount > 0 ? `K-SURE 위험 근거 ${riskCount}건 거래조건 반영` : "K-SURE 위험 확실한 정보 없음",
  ];
};

const buildCustomsExportSentence = (country: ReportEvidenceCountry): string | null => {
  if (country.customsExport12mUsd) {
    return `최근 12개월 HS/HSK 수출액은 ${formatCustomsExportUsd(country.customsExport12mUsd)}입니다.`;
  }
  if (country.customsExportStatus === "empty") {
    return "최근 12개월 HS/HSK 수출액 조회 결과가 없습니다.";
  }
  return null;
};

const buildCustomsRequiredCheck = (country: ReportEvidenceCountry | undefined): string => {
  if (country?.customsExport12mUsd) {
    return `최근 12개월 수출액 ${formatCustomsExportUsd(country.customsExport12mUsd)} 기준 기존 거래 흐름 확인`;
  }
  return "최근 12개월 HS/HSK 수출액 확실한 정보 없음";
};

const buildCountryEvidenceRefs = (country: ReportEvidenceCountry): string[] => {
  const refs = (country.evidenceSources ?? [])
    .filter((source) => isDirectCountryEvidence(source, country))
    .map((source) => safeText(source.title, ""))
    .filter((title) => !isNoEvidencePlaceholder(title))
    .filter(Boolean)
    .slice(0, 3);
  return uniqueTexts(refs);
};

const buildCountryNewsImpactSources = (country: ReportEvidenceCountry): ReportEvidenceSource[] => {
  const seen = new Set<string>();
  const sources: ReportEvidenceSource[] = [];

  for (const source of country.evidenceSources ?? []) {
    if (!isReportableNewsImpactSource(source, country)) continue;
    const key = [
      safeText(source.evidenceType, "").toLowerCase(),
      safeText(source.title, "").toLowerCase(),
      safeText(source.summary, "").toLowerCase(),
      safeText(source.articleBody, "").toLowerCase(),
      safeText(source.impactSummary, "").toLowerCase(),
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push(source);
  }

  return sources;
};

const NEWS_IMPACT_SOURCE_TYPES = new Set(["product_evidence", "country_background", "news"]);

const isReportableNewsImpactSource = (
  source: ReportEvidenceSource,
  country: ReportEvidenceCountry,
): boolean => {
  if (!hasNewsImpactSourceIdentity(source)) return false;
  const evidenceType = safeText(source.evidenceType, "").toLowerCase();
  if (evidenceType !== "direct" && evidenceType !== "background") return false;
  if (isNoEvidencePlaceholder(safeText(source.title, ""))) return false;
  const sourceCountry = safeText(source.country, "");
  if (sourceCountry && !countryNameMatches(sourceCountry, country)) return false;
  if (mentionsDifferentKnownCountry(`${safeText(source.title, "")} ${safeText(source.summary, "")}`, country)) {
    return false;
  }
  return Boolean(
    safeText(source.title, "") ||
    safeText(source.summary, "") ||
    safeText(source.articleBody, "") ||
    safeText(source.impactSummary, "")
  );
};

const hasNewsImpactSourceIdentity = (source: ReportEvidenceSource): boolean => {
  const sourceType = safeText(source.sourceType, "").toLowerCase();
  if (sourceType) return NEWS_IMPACT_SOURCE_TYPES.has(sourceType);
  return Boolean(
    safeText(source.newsCategory, "") ||
    safeText(source.newsScope, "") ||
    safeText(source.impactSummary, "")
  );
};

const buildCountryEvidenceLimits = (
  evidence: ReportEvidenceBundle,
  country: ReportEvidenceCountry,
  evidenceRefs: string[],
): string[] => {
  const countryCode = safeText(country.countryCode, "-");
  const limits: string[] = [];
  const hasOffTargetNews = (country.evidenceSources ?? []).some((source) => {
    const evidenceType = safeText(source.evidenceType, "").toLowerCase();
    return evidenceType === "indirect" || evidenceType === "excluded";
  });

  if (evidenceRefs.length === 0) limits.push("대상국 일치 직접 뉴스 근거 없음");
  if (hasOffTargetNews) limits.push("대상국 불일치 뉴스는 전략 본문에서 제외");
  if (!evidence.certs.some((row) => row.countryCode === countryCode)) limits.push("인증 요구사항 확실한 정보 없음");
  if (!evidence.regs.some((row) => row.countryCode === countryCode)) limits.push("수입규제 확실한 정보 없음");
  if (!evidence.risks.some((row) => row.countryCode === countryCode)) limits.push("K-SURE 위험 확실한 정보 없음");
  limits.push("인증·규제·전략물자·제품안전 최종 판정 아님");

  return uniqueTexts(limits);
};

const isDirectCountryEvidence = (
  source: ReportEvidenceSource,
  country: ReportEvidenceCountry,
): boolean => {
  const evidenceType = safeText(source.evidenceType, "").toLowerCase();
  if (evidenceType === "excluded" || evidenceType === "indirect") return false;
  if (evidenceType === "background") return false;
  if (isNoEvidencePlaceholder(safeText(source.title, ""))) return false;
  const sourceCountry = safeText(source.country, "");
  if (sourceCountry && !countryNameMatches(sourceCountry, country)) return false;
  if (mentionsDifferentKnownCountry(`${safeText(source.title, "")} ${safeText(source.summary, "")}`, country)) {
    return false;
  }
  return evidenceType === "direct";
};

const countryNameMatches = (sourceCountry: string, country: ReportEvidenceCountry): boolean => {
  const sourceTokens = buildCountryTokens(sourceCountry, country.countryCode);
  const targetTokens = buildCountryTokens(country.countryName, country.countryCode);
  return sourceTokens.some((source) => targetTokens.some((target) => source.includes(target) || target.includes(source)));
};

const buildCountryTokens = (value: string | null | undefined, countryCode: string | null | undefined): string[] => {
  const tokens = new Set<string>();
  const normalizedValue = normalizeCountryToken(value);
  if (normalizedValue) tokens.add(normalizedValue);

  const code = safeText(countryCode, "").toUpperCase();
  for (const alias of COUNTRY_ALIASES[code] ?? []) tokens.add(normalizeCountryToken(alias));
  return [...tokens].filter(Boolean);
};

const mentionsDifferentKnownCountry = (value: string, country: ReportEvidenceCountry): boolean => {
  const normalized = normalizeCountryToken(value);
  if (!normalized) return false;
  const targetCode = safeText(country.countryCode, "").toUpperCase();
  for (const [code, aliases] of Object.entries(COUNTRY_ALIASES)) {
    if (code === targetCode) continue;
    if (aliases.some((alias) => normalized.includes(normalizeCountryToken(alias)))) return true;
  }
  return false;
};

const isNoEvidencePlaceholder = (value: string): boolean => {
  const normalized = normalizeCountryToken(value);
  return (
    normalized.includes("직접근거없음") ||
    normalized.includes("확실한정보없음") ||
    normalized.includes("nomatched") ||
    normalized.includes("noevidence")
  );
};

const COUNTRY_ALIASES: Record<string, string[]> = {
  US: ["미국", "미합중국", "unitedstates", "usa", "america"],
  CN: ["중국", "중화인민공화국", "china", "peoplesrepublicofchina"],
  PL: ["폴란드", "폴란드공화국", "poland", "republicofpoland"],
  DE: ["독일", "독일연방공화국", "germany", "federalrepublicofgermany"],
  VE: ["베네수엘라", "venezuela"],
  DK: ["덴마크", "denmark"],
};

const normalizeCountryToken = (value: string | null | undefined): string => (
  safeText(value, "")
    .toLowerCase()
    .replace(/the\s+/g, "")
    .replace(/[^a-z0-9가-힣]/g, "")
);

const build7DayActions = (evidence: ReportEvidenceBundle): string[] => [
  `HS/HSK ${safeText(evidence.product?.hsCode, "-")}/${safeText(evidence.product?.hskCode, "-")}와 제품 영문명을 재확인하세요.`,
  "Top 3 국가의 인증·수입규제·결제위험 원문 링크와 조회일을 정리하세요.",
  "전략물자·제품안전 플래그의 원문 결과를 확인하고 미확인 항목을 분리하세요.",
];

const build30DayActions = (evidence: ReportEvidenceBundle): string[] => [
  `${safeText(evidence.topCountries[0]?.countryName, "Top 1 후보국")} 기준 인증 서류, 시험 필요 여부, 예상 리드타임을 체크리스트로 확정하세요.`,
  "수입규제·통관 요구사항을 적용 범위와 시행일 기준으로 검토하세요.",
  "K-SURE 결제위험을 기준으로 OA/TT/LC 등 거래조건과 회수 리스크 대응안을 정리하세요.",
];

const build90DayActions = (evidence: ReportEvidenceBundle): string[] => [
  "Top 1 후보국 대상 샘플·견적·라벨·통관서류 준비 여부를 점검하세요.",
  "무역관 또는 유관기관 상담 결과를 리포트 근거에 추가하세요.",
  `${safeText(evidence.product?.name, "해당 품목")}의 인증·규제·안전 확인 결과를 반영해 수출 착수 여부를 재검토하세요.`,
];

const normalizeCountryStrategies = (value: unknown, fallback: ReportCountryStrategy[]): ReportCountryStrategy[] => {
  const rows = asArray(value)
    .map((row, index) => {
      const data = asRecord(row);
      const countryCode = safeText(data.countryCode, "-");
      const countryName = safeText(data.countryName, REPORT_UNKNOWN_TEXT);
      const fallbackRow = fallback.find((item) => (
        item.countryCode === countryCode ||
        (countryName !== REPORT_UNKNOWN_TEXT && item.countryName === countryName)
      )) ?? fallback[index];
      const position = safeText(data.position ?? data.opportunity, REPORT_UNKNOWN_TEXT);
      const entryMode = safeText(data.entryMode ?? data.entryStrategy, REPORT_UNKNOWN_TEXT);
      const rawGrade = safeText(data.feasibilityGrade, "conditional").toLowerCase();
      const feasibilityGrade: FeasibilityGrade =
        rawGrade === "go" ? "go" : rawGrade === "hold" ? "hold" : "conditional";
      return {
        countryCode,
        countryName,
        feasibilityGrade,
        oneLineDecision: safeText(
          data.oneLineDecision ?? data.oneLineJudgment ?? data.decisionSummary ?? fallbackRow?.oneLineDecision,
          fallbackRow?.oneLineDecision ?? position,
        ),
        position,
        entryMode,
        entryStrategy: safeText(data.entryStrategy ?? data.entryMode, REPORT_UNKNOWN_TEXT),
        requiredChecks: normalizeTextArray(data.requiredChecks),
        certRegChecklist: normalizeTextArray(data.certRegChecklist),
        paymentRiskAssessment: safeText(data.paymentRiskAssessment, REPORT_UNKNOWN_TEXT),
        riskResponse: safeText(data.riskResponse, REPORT_UNKNOWN_TEXT),
        evidenceLimits: normalizeTextArray(data.evidenceLimits),
        evidenceRefs: normalizeTextArray(data.evidenceRefs),
        opportunity: position,
        newsImpactAnalysis: safeText(data.newsImpactAnalysis, "대상국 일치 직접 뉴스 근거 없음 — 관련 뉴스 모니터링 필요"),
        marketOpportunity: safeText(data.marketOpportunity, REPORT_UNKNOWN_TEXT),
        kotraEntryStrategy: normalizeKotraEntryStrategy(data.kotraEntryStrategy) ?? fallbackRow?.kotraEntryStrategy,
      };
    })
    .filter((row) => row.countryName !== REPORT_UNKNOWN_TEXT || row.countryCode !== "-");

  return rows.length > 0 ? rows : fallback;
};

const normalizeKotraEntryStrategy = (value: unknown): ReportKotraEntryStrategy | undefined => {
  const data = asRecord(value);
  const status = safeText(data.status, "").toLowerCase();
  if (!status) return undefined;
  const normalizedStatus: ReportKotraEntryStrategy["status"] =
    status === "available" || status === "empty" || status === "failed" || status === "pdf_failed"
      ? status
      : "failed";

  return {
    status: normalizedStatus,
    title: safeText(data.title, ""),
    publishedDate: safeText(data.publishedDate ?? data.published_date, ""),
    tradeOffice: safeText(data.tradeOffice ?? data.trade_office, ""),
    sourceUrl: safeText(data.sourceUrl ?? data.source_url, ""),
    attachmentName: safeText(data.attachmentName ?? data.attachment_name, ""),
    attachmentUrl: safeText(data.attachmentUrl ?? data.attachment_url, ""),
    usedPdf: false,
    basisSummary: "",
    limitations: normalizeTextArray(data.limitations),
  };
};

const normalizeCountryCautionAnalyses = (value: unknown): CountryCautionAnalysis[] => {
  return asArray(value)
    .map((entry) => {
      const row = asRecord(entry);
      const countryCode = safeText(row.countryCode, "-");
      const countryName = safeText(row.countryName, REPORT_UNKNOWN_TEXT);
      const coreSummary = safeText(row.coreSummary ?? row.summary, "");
      const sections = normalizeCountryCautionSections(row.sections ?? row.items);

      if (countryCode === "-" && countryName === REPORT_UNKNOWN_TEXT) return null;
      if (!coreSummary || sections.length !== COUNTRY_CAUTION_SECTION_ORDER.length) return null;

      return {
        countryCode,
        countryName,
        coreSummary,
        sections,
      };
    })
    .filter((entry): entry is CountryCautionAnalysis => Boolean(entry));
};

const normalizeCountryCautionSections = (value: unknown): CountryCautionSection[] => {
  const byKind = new Map<CountryCautionSectionKind, CountryCautionSection>();

  for (const item of asArray(value)) {
    const row = asRecord(item);
    const kind = normalizeCountryCautionSectionKind(row.kind ?? row.title);
    if (!kind || byKind.has(kind)) continue;

    const interpretation = safeText(row.interpretation, "");
    const facts = normalizeCountryCautionFacts(row.facts);
    if (!interpretation && facts.length === 0) continue;

    byKind.set(kind, {
      kind,
      title: safeText(row.title, COUNTRY_CAUTION_SECTION_TITLES[kind]),
      facts,
      interpretation,
    });
  }

  return COUNTRY_CAUTION_SECTION_ORDER
    .map((kind) => byKind.get(kind))
    .filter((entry): entry is CountryCautionSection => Boolean(entry));
};

const normalizeCountryCautionFacts = (value: unknown): CountryCautionFact[] => {
  return asArray(value)
    .map((item) => {
      const row = asRecord(item);
      const label = safeText(row.label, "");
      const valueText = safeText(row.value, "");
      const meaning = safeText(row.meaning, "");
      if (!label || !valueText || !meaning) return null;
      return { label, value: valueText, meaning };
    })
    .filter((entry): entry is CountryCautionFact => Boolean(entry));
};

const sanitizeCountryStrategiesAgainstEvidence = (
  strategies: ReportCountryStrategy[],
  evidence: ReportEvidenceBundle,
): ReportCountryStrategy[] => {
  return strategies.map((strategy) => {
    const availability = getCountryCertRegAvailability(evidence, strategy.countryCode);
    if (availability.hasCerts || availability.hasRegs) {
      const missingItems = [
        availability.hasCerts ? "" : "확정 필요 인증 0건: 현재 제품·HS 기준으로 확인된 인증명 없음",
        availability.hasRegs ? "" : "확정 수입규제 0건: 현재 제품·HS 기준으로 확인된 규제 없음",
      ].filter(Boolean);
      return {
        ...strategy,
        certRegChecklist: uniqueTexts([...missingItems, ...strategy.certRegChecklist]),
      };
    }

    return {
      ...strategy,
      certRegChecklist: [
        "확정 필요 인증 0건: 현재 제품·HS 기준으로 확인된 인증명 없음",
        "확정 수입규제 0건: 현재 제품·HS 기준으로 확인된 규제 없음",
      ],
    };
  });
};

const sanitizeCountryCautionAnalysesAgainstEvidence = (
  analyses: CountryCautionAnalysis[],
  evidence: ReportEvidenceBundle,
): CountryCautionAnalysis[] => {
  return analyses.map((analysis) => {
    const availability = getCountryCertRegAvailability(evidence, analysis.countryCode);
    const sections = analysis.sections.map((section) => {
      if (section.kind === "certification" && !availability.hasCerts) {
        return buildNoConfirmedCertRegSection("certification");
      }
      if (section.kind === "regulation" && !availability.hasRegs) {
        return buildNoConfirmedCertRegSection("regulation");
      }
      return section;
    });
    return { ...analysis, sections };
  });
};

const getCountryCertRegAvailability = (
  evidence: ReportEvidenceBundle,
  countryCode: string,
): { hasCerts: boolean; hasRegs: boolean } => {
  const code = normalizeCountryCode(countryCode);
  if (!code) return { hasCerts: false, hasRegs: false };
  return {
    hasCerts: evidence.certs.some((row) => normalizeCountryCode(row.countryCode) === code),
    hasRegs: evidence.regs.some((row) => normalizeCountryCode(row.countryCode) === code),
  };
};

const buildNoConfirmedCertRegSection = (
  kind: "certification" | "regulation",
): CountryCautionSection => {
  if (kind === "certification") {
    return {
      kind,
      title: COUNTRY_CAUTION_SECTION_TITLES.certification,
      facts: [{
        label: "확정 필요 인증",
        value: "0건",
        meaning: "현재 제품·HS 기준으로 확정된 인증 근거가 없어 특정 인증명을 확정할 수 없음",
      }],
      interpretation: "상세 단계에서 현재 제품·HS 기준 확정 인증이 조회되지 않았으므로 특정 인증명을 리포트 확정값으로 표시하지 않습니다. KOTRA 또는 인증기관 확인이 필요합니다.",
    };
  }

  return {
    kind,
    title: COUNTRY_CAUTION_SECTION_TITLES.regulation,
    facts: [{
      label: "확정 수입규제",
      value: "0건",
      meaning: "현재 제품·HS 기준으로 확정된 수입규제 근거가 없어 특정 규제를 확정할 수 없음",
    }],
    interpretation: "상세 단계에서 현재 제품·HS 기준 확정 수입규제가 조회되지 않았으므로 리포트에서 규제명을 임의 확정하지 않습니다. 대상국 통관 요건은 별도 확인이 필요합니다.",
  };
};

const normalizeCountryCode = (value: string | null | undefined): string =>
  safeText(value, "").trim().toUpperCase();

const normalizeCountryCautionSectionKind = (value: unknown): CountryCautionSectionKind | null => {
  const normalized = safeText(value, "").toLowerCase().replace(/[\s_·/-]+/g, "");
  if (COUNTRY_CAUTION_SECTION_ORDER.includes(normalized as CountryCautionSectionKind)) {
    return normalized as CountryCautionSectionKind;
  }
  if (normalized === "cert" || normalized.includes("certification") || normalized.includes("인증")) {
    return "certification";
  }
  if (normalized === "reg" || normalized.includes("regulation") || normalized.includes("규제")) {
    return "regulation";
  }
  if (
    normalized.includes("countryrisk") ||
    normalized.includes("ksurecountry") ||
    normalized.includes("국가위험")
  ) {
    return "ksure_country_risk";
  }
  if (
    normalized.includes("industryrisk") ||
    normalized.includes("ksureindustry") ||
    normalized.includes("업종위험")
  ) {
    return "ksure_industry_risk";
  }
  if (
    normalized.includes("payment") ||
    normalized.includes("exportpayment") ||
    normalized.includes("수출결제") ||
    normalized.includes("결제위험")
  ) {
    return "ksure_payment";
  }
  return null;
};

const buildHsText = (evidence: ReportEvidenceBundle): string => {
  const hs = safeText(evidence.product?.hsCode, "-");
  const hsk = safeText(evidence.product?.hskCode, "-");
  const review = evidence.product?.hsReviewRequired ? "분류 검토가 필요하며" : "분류 기준을 사용해";
  return `HS ${hs} · HSK ${hsk} ${review}`;
};

const normalizeTextArray = (value: unknown, fallback: string[] = []): string[] => {
  const texts = asArray(value).map((item) => safeText(item, "")).filter(Boolean);
  return uniqueTexts(texts, fallback);
};

const uniqueTexts = (values: string[], fallback: string[] = []): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = safeText(value, "");
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out.length > 0 ? out : fallback;
};

const safeText = (value: unknown, fallback: string): string => {
  const normalized = normalizeReportText(typeof value === "number" ? String(value) : value as string | null | undefined);
  return normalized && normalized.length > 0 ? normalized : fallback;
};

const asRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
};
