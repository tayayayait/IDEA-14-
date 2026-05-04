export const FEATURE_REQUIREMENT_TOTAL = 8;
export const PROJECT_PROGRESS_API_KEYS = [
  "kotra_country_info",
  "kotra_overseas_certification",
  "kotra_import_regulation",
  "ksure_country_risk",
  "ksure_industry_risk",
  "ksure_export_payment",
  "kicox_factory_production",
] as const;

export interface ProjectFeatureEvidence {
  companyReady: boolean;
  productReady: boolean;
  candidatesReady: boolean;
  certificationReady: boolean;
  regulationReady: boolean;
  countryIndustryRiskReady: boolean;
  exportPaymentRiskReady: boolean;
  reportReady: boolean;
}

export interface ProjectFeatureProgress {
  completed: number;
  total: number;
  percent: number;
}

export interface ProjectStepCompletion {
  1: boolean;
  2: boolean;
  3: boolean;
  4: boolean;
  5: boolean;
}

export function computeProjectFeatureProgress(
  evidence: ProjectFeatureEvidence,
): ProjectFeatureProgress {
  const completed = [
    evidence.companyReady,
    evidence.productReady,
    evidence.candidatesReady,
    evidence.certificationReady,
    evidence.regulationReady,
    evidence.countryIndustryRiskReady,
    evidence.exportPaymentRiskReady,
    evidence.reportReady,
  ].filter(Boolean).length;
  return {
    completed,
    total: FEATURE_REQUIREMENT_TOTAL,
    percent: Math.round((completed / FEATURE_REQUIREMENT_TOTAL) * 100),
  };
}

export function resolveProjectStepCompletion(
  evidence: ProjectFeatureEvidence,
): ProjectStepCompletion {
  return {
    1: evidence.companyReady,
    2: evidence.productReady,
    3: evidence.candidatesReady,
    4:
      evidence.certificationReady &&
      evidence.regulationReady &&
      evidence.countryIndustryRiskReady &&
      evidence.exportPaymentRiskReady,
    5: evidence.reportReady,
  };
}
