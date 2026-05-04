/**
 * 수출 가능성 판정 로직 (Go / Conditional / Hold)
 *
 * 각 후보국의 인증·규제·결제위험 데이터 유무와
 * 전략물자·제품안전 플래그를 기반으로 진출 판정을 산정합니다.
 */

import type {
  ReportEvidenceBundle,
  ReportEvidenceCountry,
} from "@/lib/report-draft";
import { normalizeReportText, REPORT_UNKNOWN_TEXT } from "@/lib/report-text";
import { formatCustomsExportUsd } from "@/lib/customs-export-evidence";

export type FeasibilityGrade = "go" | "conditional" | "hold";

export interface CountryEvidenceSnapshot {
  countryCode: string;
  hasCerts: boolean;
  hasRegs: boolean;
  hasRisks: boolean;
  hasPaymentRisk: boolean;
  hasHighSeverityFlag: boolean;
  hasDirectNews: boolean;
  totalScore: number | null;
}

const GRADE_LABEL: Record<FeasibilityGrade, string> = {
  go: "진출 가능",
  conditional: "조건부 검토",
  hold: "보류 권고",
};

export const getFeasibilityLabel = (grade: FeasibilityGrade): string =>
  GRADE_LABEL[grade] ?? GRADE_LABEL.hold;

/**
 * 국가별 증거 스냅샷 생성
 */
export const buildCountryEvidenceSnapshot = (
  country: ReportEvidenceCountry,
  evidence: ReportEvidenceBundle,
): CountryEvidenceSnapshot => {
  const code = country.countryCode;
  return {
    countryCode: code,
    hasCerts: evidence.certs.some((r) => r.countryCode === code),
    hasRegs: evidence.regs.some((r) => r.countryCode === code),
    hasRisks: evidence.risks.some((r) => r.countryCode === code),
    hasPaymentRisk: evidence.risks.some(
      (r) =>
        r.countryCode === code &&
        safeText(r.category).toLowerCase().includes("payment"),
    ),
    hasHighSeverityFlag: evidence.safetyFlags.some(
      (f) => safeText(f.summary).toLowerCase().includes("high") ||
        safeText(f.summary).toLowerCase().includes("위험"),
    ),
    hasDirectNews: (country.evidenceSources ?? []).some(
      (s) => safeText(s.evidenceType).toLowerCase() === "direct",
    ),
    totalScore: country.totalScore,
  };
};

/**
 * 국가별 수출 가능성 등급 산정
 *
 * 판정 기준:
 * - Go: 인증·규제·결제위험 모두 확보 + 고위험 없음
 * - Hold: 핵심 데이터 미확보(인증+규제 모두 없음) 또는 고위험 플래그
 * - Conditional: 그 외
 */
export const evaluateFeasibilityGrade = (
  snapshot: CountryEvidenceSnapshot,
): FeasibilityGrade => {
  // 고위험 플래그가 있으면 Hold
  if (snapshot.hasHighSeverityFlag) return "hold";

  // 인증과 규제 모두 없으면 Hold
  if (!snapshot.hasCerts && !snapshot.hasRegs) return "hold";

  // 결제위험이 없고 인증·규제 중 하나라도 없으면 Conditional
  const allDataPresent = snapshot.hasCerts && snapshot.hasRegs && snapshot.hasRisks;
  if (!allDataPresent) return "conditional";

  // 모든 데이터 확보 + 고위험 없음
  return "go";
};

/**
 * 전체 수출 가능성 종합 소결 생성
 */
export const buildExportFeasibilitySummary = (
  countries: ReportEvidenceCountry[],
  evidence: ReportEvidenceBundle,
): string => {
  if (countries.length === 0) {
    return "추천 후보국 데이터가 없어 수출 가능성을 판단할 수 없습니다. 후보국 추천 단계를 먼저 완료하세요.";
  }

  const productName = safeText(evidence.product?.name) || "해당 품목";
  const grades = countries.slice(0, 3).map((c) => {
    const snapshot = buildCountryEvidenceSnapshot(c, evidence);
    const grade = evaluateFeasibilityGrade(snapshot);
    return {
      name: c.countryName,
      grade,
      label: GRADE_LABEL[grade],
      customsExportText: c.customsExport12mUsd ? formatCustomsExportUsd(c.customsExport12mUsd) : null,
    };
  });

  const goCountries = grades.filter((g) => g.grade === "go");
  const conditionalCountries = grades.filter((g) => g.grade === "conditional");
  const holdCountries = grades.filter((g) => g.grade === "hold");

  const parts: string[] = [];
  parts.push(`${productName} 수출 후보국 ${grades.length}개국 종합 판정:`);

  if (goCountries.length > 0) {
    parts.push(
      `${formatCountryGradeNames(goCountries)}은(는) 주요 데이터가 확보되어 수출 준비를 진행할 수 있습니다.`,
    );
  }
  if (conditionalCountries.length > 0) {
    parts.push(
      `${formatCountryGradeNames(conditionalCountries)}은(는) 일부 데이터가 미확보되어 추가 확인 후 판단하세요.`,
    );
  }
  if (holdCountries.length > 0) {
    parts.push(
      `${formatCountryGradeNames(holdCountries)}은(는) 핵심 근거가 부족하거나 고위험 요소가 있어 보류를 권고합니다.`,
    );
  }

  return parts.join(" ");
};

const formatCountryGradeNames = (
  rows: Array<{ name: string; customsExportText: string | null }>,
): string => rows
  .map((row) => row.customsExportText ? `${row.name}(최근 12개월 수출액 ${row.customsExportText})` : row.name)
  .join(", ");

/**
 * 수출 전 필수 체크리스트 생성
 */
export const buildPreExportChecklist = (
  evidence: ReportEvidenceBundle,
): string[] => {
  const hs = safeText(evidence.product?.hsCode) || "-";
  const hsk = safeText(evidence.product?.hskCode) || "-";
  const productName = safeText(evidence.product?.name) || "해당 품목";

  const checklist: string[] = [
    `HS 코드(${hs}) 및 HSK 코드(${hsk})가 제품과 정확히 일치하는지 관세사에게 확인`,
    `${productName}의 영문 제품명·성분·규격 정보를 수출 서류 기준으로 정리`,
    "Top 1 후보국의 수입 인증 요건을 원문 기관에서 재확인",
    "수입규제·NTM(비관세장벽) 적용 범위와 시행일 확인",
    "K-SURE 국가위험등급·결제위험 기준 거래조건(LC/TT/OA) 검토",
  ];

  // 전략물자 플래그가 있으면 추가
  const hasStrategicFlag = evidence.safetyFlags.some(
    (f) => safeText(f.flagType).includes("strategic") || safeText(f.flagType).includes("전략물자"),
  );
  if (hasStrategicFlag) {
    checklist.push("전략물자관리원에서 해당 품목의 전략물자 해당 여부 최종 확인");
  }

  // 제품안전 플래그가 있으면 추가
  const hasSafetyFlag = evidence.safetyFlags.some(
    (f) => safeText(f.flagType).includes("safety") || safeText(f.flagType).includes("recall"),
  );
  if (hasSafetyFlag) {
    checklist.push("SafetyKorea 리콜·안전 이력 확인 및 대상국 제품안전 규격 충족 여부 검토");
  }

  // HS 분류 검토 필요 시 추가
  if (evidence.product?.hsReviewRequired) {
    checklist.push("복수 품목 혼합 가능성이 있으므로 품목 분리 후 HS 코드 재확인");
  }

  checklist.push("무역관 또는 유관기관 상담 일정 확보");
  checklist.push("출처 표의 API 조회일과 원문 링크를 대조해 최신 데이터인지 확인");

  return checklist;
};

/**
 * 국가별 인증·규제 체크리스트 생성
 */
export const buildCertRegChecklist = (
  countryCode: string,
  evidence: ReportEvidenceBundle,
): string[] => {
  const items: string[] = [];
  const certs = evidence.certs.filter((r) => r.countryCode === countryCode);
  const regs = evidence.regs.filter((r) => r.countryCode === countryCode);

  if (certs.length > 0) {
    items.push(`해외인증 ${certs.length}건의 원문 적합성과 유효기간 확인`);
    const schemes = certs
      .map((c) => safeText(c.summary))
      .filter(Boolean)
      .slice(0, 3);
    if (schemes.length > 0) {
      items.push(`확인 대상 인증: ${schemes.join(", ")}`);
    }
  } else {
    items.push("해외인증 요구사항 정보 없음 — KOTRA 또는 인증 기관에서 직접 확인 필요");
  }

  if (regs.length > 0) {
    items.push(`수입규제 ${regs.length}건의 적용 범위와 시행일 확인`);
    const topics = regs
      .map((r) => safeText(r.category) || safeText(r.summary))
      .filter(Boolean)
      .slice(0, 3);
    if (topics.length > 0) {
      items.push(`확인 대상 규제: ${topics.join(", ")}`);
    }
  } else {
    items.push("수입규제·NTM 정보 없음 — 대상국 통관 요건을 별도 확인 필요");
  }

  return items;
};

/**
 * 국가별 결제 리스크 소결 생성
 */
export const buildPaymentRiskAssessment = (
  countryCode: string,
  evidence: ReportEvidenceBundle,
): string => {
  const countryRisks = evidence.risks.filter((r) => r.countryCode === countryCode);
  const paymentRisks = countryRisks.filter(
    (r) => safeText(r.category).toLowerCase().includes("payment"),
  );
  const countryRisk = countryRisks.find(
    (r) => safeText(r.category).toLowerCase().includes("k_sure") &&
      !safeText(r.category).toLowerCase().includes("industry") &&
      !safeText(r.category).toLowerCase().includes("payment"),
  );

  const parts: string[] = [];

  if (countryRisk) {
    parts.push(`국가위험: ${safeText(countryRisk.summary) || REPORT_UNKNOWN_TEXT}`);
  } else {
    parts.push("국가위험등급 정보 없음");
  }

  if (paymentRisks.length > 0) {
    const summary = paymentRisks
      .map((r) => safeText(r.summary))
      .filter(Boolean)
      .join("; ");
    parts.push(`결제위험: ${summary || REPORT_UNKNOWN_TEXT}`);
    parts.push("초기 거래는 LC(신용장) 또는 선금 조건을 검토하세요.");
  } else {
    parts.push("결제위험 데이터 미확보 — 원문 확인 전까지 보수적 거래조건 권고");
  }

  return parts.join(" | ");
};

const safeText = (value: unknown): string => {
  if (typeof value === "string") return normalizeReportText(value) ?? "";
  if (typeof value === "number") return String(value);
  return "";
};
