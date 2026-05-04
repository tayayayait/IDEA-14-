export type Step4RiskLikeRow = {
  id: string;
  category: string | null;
  level: string | null;
  summary: string | null;
  source_url?: string | null;
  raw?: Record<string, unknown> | null;
};

export type Step4KsureRiskGroups<T extends Step4RiskLikeRow = Step4RiskLikeRow> = {
  countryRisk: T | null;
  industryRisks: T[];
  paymentRisk: T | null;
};

export function groupKsureRiskRows<T extends Step4RiskLikeRow>(
  rows: T[],
  options?: { industryLimit?: number },
): Step4KsureRiskGroups<T> {
  const industryLimit = options?.industryLimit ?? 3;

  const countryRisks = rows.filter((row) => normalizeCategory(row.category) === "k_sure");
  const industryRisks = rows.filter((row) => isScorableIndustryRiskRow(row));
  const paymentRisks = rows.filter((row) => normalizeCategory(row.category) === "k_sure_payment");

  return {
    countryRisk: pickLatestCountryRisk(countryRisks),
    industryRisks: sortIndustryRiskRows(industryRisks).slice(0, industryLimit),
    paymentRisk: pickPaymentRisk(paymentRisks),
  };
}

export function toRiskLevelLabel(level: string | null | undefined): string {
  const normalized = normalizeText(level).toLowerCase();
  if (normalized === "high") return "고위험";
  if (normalized === "caution") return "주의";
  if (normalized === "info") return "정보";
  if (normalized === "unavailable") return "조회 실패";
  if (!normalized) return "확실한 정보 없음";
  return normalized;
}

export function sortIndustryRiskRows<T extends Step4RiskLikeRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const byRisk = getRiskIndexValue(b) - getRiskIndexValue(a);
    if (byRisk !== 0) return byRisk;
    return a.id.localeCompare(b.id);
  });
}

export function isGlobalPaymentScope(row: Step4RiskLikeRow | null | undefined): boolean {
  if (!row?.raw) return false;
  const scope = normalizeText(row.raw.scope).toLowerCase();
  return scope === "global";
}

export function isIndustryMatchFailedRiskRow(row: Step4RiskLikeRow | null | undefined): boolean {
  if (!row?.raw) return false;
  const flag = row.raw.industry_match_failed;
  if (typeof flag === "boolean") return flag;
  if (typeof flag === "string") return normalizeText(flag).toLowerCase() === "true";
  return false;
}

export function isScorableIndustryRiskRow(row: Step4RiskLikeRow | null | undefined): boolean {
  if (!row) return false;
  if (normalizeCategory(row.category) !== "k_sure_industry") return false;
  if (isIndustryMatchFailedRiskRow(row)) return false;
  const detailState = normalizeText(row.raw?.detail_state).toLowerCase();
  if (!detailState) return true;
  return detailState === "success";
}

export function resolveKsurePaymentUnavailableMessage(row: Step4RiskLikeRow | null | undefined): string {
  if (!row || normalizeCategory(row.category) !== "k_sure_payment") return "";
  const detailState = normalizeText(row.raw?.detail_state).toLowerCase();
  if (detailState !== "empty" && detailState !== "error") return "";

  const detailMessage = normalizeText(row.raw?.detail_message);
  if (detailMessage) return detailMessage;

  const countryCode = normalizeText(row.raw?.country_code);
  const countryName = normalizeText(row.raw?.country_name);
  const countryLabel = countryName && countryCode
    ? `${countryName}/${countryCode}`
    : countryName || countryCode || "선택 국가";

  if (detailState === "error") {
    const apiMessage = normalizeText(row.raw?.api_message) || normalizeText(row.summary);
    return `K-SURE 수출결제 조회 실패 (${countryLabel})${apiMessage ? `: ${apiMessage}` : ""}`;
  }

  return `${countryLabel} 기준 국가 단위 수출결제 데이터 없음. 전세계 집계는 국가 단위가 아니므로 표시하지 않습니다.`;
}

export function resolveKsurePaymentUnavailableSourceUrl(row: Step4RiskLikeRow | null | undefined): string {
  if (!row || normalizeCategory(row.category) !== "k_sure_payment") return "";
  const detailState = normalizeText(row.raw?.detail_state).toLowerCase();
  if (detailState !== "empty" && detailState !== "error") return "";
  return normalizeText(row.source_url);
}

function pickLatestCountryRisk<T extends Step4RiskLikeRow>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  return [...rows].sort((a, b) => {
    const byDate = getCountryEvalDateScore(b) - getCountryEvalDateScore(a);
    if (byDate !== 0) return byDate;
    return a.id.localeCompare(b.id);
  })[0];
}

function pickPaymentRisk<T extends Step4RiskLikeRow>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  const countryScoped = rows.find((row) => !isGlobalPaymentScope(row));
  if (countryScoped) return countryScoped;
  return null;
}

function getCountryEvalDateScore(row: Step4RiskLikeRow): number {
  const fromRaw = normalizeText(row.raw?.eval_date) || normalizeText(row.raw?.eval_dd);
  const digits = fromRaw.replace(/\D/g, "");
  if (digits.length === 8) {
    return Number(digits);
  }
  return 0;
}

function getRiskIndexValue(row: Step4RiskLikeRow): number {
  const fromRaw = toNumber(row.raw?.risk_index) ?? toNumber(row.raw?.risk_idx);
  if (fromRaw != null) return fromRaw;
  const fromLevel = normalizeText(row.level).toLowerCase();
  if (fromLevel === "high") return 4;
  if (fromLevel === "caution") return 3;
  if (fromLevel === "info") return 2;
  if (fromLevel === "unavailable") return -1;
  return 0;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCategory(value: string | null | undefined): string {
  return normalizeText(value).toLowerCase();
}

function normalizeText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}
