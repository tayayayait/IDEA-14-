export type CustomsExportStatus = "available" | "empty";

export interface CustomsExportEvidenceSource {
  [key: string]: unknown;
  type: "customs_export_12m";
  title: string;
  summary: string;
  score_relevant: true;
  customsExport12mUsd: number | null;
  customsExportStatus: CustomsExportStatus;
}

export interface RationaleWithSources {
  summary?: string | null;
  sources?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface CustomsExportEvidenceSnapshot {
  customsExport12mUsd: number | null;
  customsExportStatus: CustomsExportStatus | null;
}

export const buildCustomsExportEvidenceSource = (
  amountUsd: number | null | undefined,
): CustomsExportEvidenceSource => {
  const normalizedAmount = normalizeAmount(amountUsd);
  const status: CustomsExportStatus = normalizedAmount == null ? "empty" : "available";
  const amountText = normalizedAmount == null ? "조회 결과 없음" : formatCustomsExportUsd(normalizedAmount);

  return {
    type: "customs_export_12m",
    title: "최근 12개월 HS/HSK 기준 수출액",
    summary: `최근 12개월 HS/HSK 기준 수출액 ${amountText}`,
    score_relevant: true,
    customsExport12mUsd: normalizedAmount,
    customsExportStatus: status,
  };
};

export const mergeCustomsExportEvidenceIntoRationale = (
  rationale: unknown,
  amountUsd: number | null | undefined,
): RationaleWithSources => {
  const base = rationale && typeof rationale === "object" && !Array.isArray(rationale)
    ? rationale as RationaleWithSources
    : {};
  const sources = Array.isArray(base.sources) ? base.sources : [];
  const withoutOldCustoms = sources.filter((source) => source?.type !== "customs_export_12m");

  return {
    ...base,
    sources: [
      ...withoutOldCustoms,
      buildCustomsExportEvidenceSource(amountUsd),
    ],
  };
};

export const extractCustomsExportEvidence = (
  rationale: unknown,
): CustomsExportEvidenceSnapshot => {
  const row = rationale && typeof rationale === "object" && !Array.isArray(rationale)
    ? rationale as RationaleWithSources
    : null;
  const sources = Array.isArray(row?.sources) ? row.sources : [];
  const source = sources.find((item) => item?.type === "customs_export_12m");
  if (!source) {
    return { customsExport12mUsd: null, customsExportStatus: null };
  }

  const status = source.customsExportStatus === "available" || source.customsExportStatus === "empty"
    ? source.customsExportStatus
    : null;
  return {
    customsExport12mUsd: normalizeAmount(source.customsExport12mUsd),
    customsExportStatus: status,
  };
};

export const formatCustomsExportUsd = (amountUsd: number): string => {
  if (amountUsd >= 1_000_000_000) return `$${trimFixed(amountUsd / 1_000_000_000)}B`;
  if (amountUsd >= 1_000_000) return `$${trimFixed(amountUsd / 1_000_000)}M`;
  if (amountUsd >= 1_000) return `$${trimFixed(amountUsd / 1_000)}K`;
  return `$${Math.round(amountUsd).toLocaleString("en-US")}`;
};

const normalizeAmount = (value: unknown): number | null => {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
};

const trimFixed = (value: number): string => (
  value.toFixed(1).replace(/\.0$/, "")
);
