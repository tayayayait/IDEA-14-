import { resolveSelectionStatus, type HsSelectionStatus } from "@/lib/hs-selection-policy";
export type { HsSelectionStatus } from "@/lib/hs-selection-policy";

export type HsSelectionSource = "auto" | "manual";

export interface ProductAnalysisCode {
  name: string;
  hsCode: string;
  hskCode: string;
  selectionSource: HsSelectionSource | null;
  selectionStatus: HsSelectionStatus | null;
  selectionScore: number | null;
  reviewRequired: boolean;
  selectedCandidateKey: string | null;
}

type ProductMeta = {
  hsSelectionSource?: unknown;
  hsReviewRequired?: unknown;
  hsSelectionScore?: unknown;
  hsSelectionStatus?: unknown;
  hsSelectedCandidateKey?: unknown;
};

export function buildProductAnalysisCode(raw: unknown): ProductAnalysisCode {
  const row = asRecord(raw);
  const hsCode = normalizeCode(row.hs_code);
  const hskCode = normalizeCode(row.hsk_code);
  const hasAnyCode = Boolean(hsCode || hskCode);
  const confirmed = Boolean(row.confirmed);
  const meta = parseProductMeta(row.components);
  const score = normalizeScore(meta.hsSelectionScore);
  const status = parseSelectionStatus(meta.hsSelectionStatus) ?? (score !== null ? resolveSelectionStatus(score) : null);
  const source = parseSelectionSource(meta.hsSelectionSource) ?? (hasAnyCode ? (confirmed ? "manual" : "auto") : null);
  const reviewRequired = typeof meta.hsReviewRequired === "boolean"
    ? meta.hsReviewRequired
    : status
      ? status !== "high_confidence"
      : hasAnyCode;

  return {
    name: asString(row.name),
    hsCode,
    hskCode,
    selectionSource: source,
    selectionStatus: status,
    selectionScore: score,
    reviewRequired,
    selectedCandidateKey: asString(meta.hsSelectedCandidateKey) || null,
  };
}

export function getSelectionSourceLabel(source: HsSelectionSource | null): string {
  if (source === "manual") return "사용자 수동 선택";
  if (source === "auto") return "검색 결과 1순위 자동 반영";
  return "선택 이력 없음";
}

export function getSelectionStatusLabel(status: HsSelectionStatus | null): string {
  if (status === "high_confidence") return "신뢰도 높음";
  if (status === "review_required") return "확인 필요";
  if (status === "insufficient") return "정보 부족";
  return "평가 정보 없음";
}

export function getSelectionStatusDetail(status: HsSelectionStatus | null): string {
  if (status === "high_confidence") return "공식 데이터 매칭 기준으로 상위 후보가 도출되었습니다.";
  if (status === "review_required") return "확인 필요 상태로 진행 중입니다. 계약 전 코드 재확인이 필요합니다.";
  if (status === "insufficient") return "입력 정보가 부족해 오분류 가능성이 있습니다.";
  return "후보 점수 정보 없음";
}

function parseProductMeta(raw: unknown): ProductMeta {
  const text = asString(raw);
  if (!text || !text.trim().startsWith("{")) return {};
  try {
    return asRecord(JSON.parse(text));
  } catch {
    return {};
  }
}

function parseSelectionSource(value: unknown): HsSelectionSource | null {
  if (value === "auto" || value === "manual") return value;
  return null;
}

function parseSelectionStatus(value: unknown): HsSelectionStatus | null {
  if (value === "high_confidence" || value === "review_required" || value === "insufficient") {
    return value;
  }
  return null;
}

function normalizeScore(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeCode(value: unknown): string {
  return asString(value).replace(/\D/g, "");
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}
