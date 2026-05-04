import type { ApiState } from "@/components/ApiStateChip";

export type SourceExecutionStatus = "조회 성공" | "조회 결과 없음" | "미실행" | "실행 중" | "오류";

export interface SourceLogLike {
  status?: string | null;
  error_code?: string | null;
  response_count?: number | null;
  http_status?: number | null;
}

export interface SourceStatusView {
  chipState: ApiState;
  statusLabel: SourceExecutionStatus;
  statusNote: string | null;
}

export const SAFETYKOREA_APPROVAL_PENDING_LABEL = "API 승인 대기";
export const CORE_API_KEYS_REQUIRE_NON_ZERO_RESPONSE = new Set<string>([
  "kicox_factory_production",
  "kotra_country_info",
  "kotra_market_news",
  "kotra_overseas_certification",
  "kotra_import_regulation",
  "ksure_country_risk",
  "ksure_industry_risk",
  "ksure_export_payment",
]);

export function resolveSourceStatusView(
  log: SourceLogLike | null | undefined,
  apiKey: string,
): SourceStatusView {
  if (isSafetyKoreaApprovalPending(log, apiKey)) {
    return {
      chipState: "idle",
      statusLabel: "미실행",
      statusNote: SAFETYKOREA_APPROVAL_PENDING_LABEL,
    };
  }

  const status = normalizeApiStatus(log?.status);
  if (status === "success") {
    return { chipState: "success", statusLabel: "조회 성공", statusNote: null };
  }
  if (status === "error") {
    return { chipState: "error", statusLabel: "오류", statusNote: null };
  }
  if (status === "running") {
    return { chipState: "running", statusLabel: "실행 중", statusNote: null };
  }
  if (status === "partial_success") {
    if (hasPositiveResponseCount(log?.response_count)) {
      return { chipState: "partial_success", statusLabel: "조회 성공", statusNote: null };
    }
    if (isHttpError(log?.http_status) || Boolean(log?.error_code)) {
      return { chipState: "partial_success", statusLabel: "오류", statusNote: null };
    }
    return { chipState: "partial_success", statusLabel: "조회 결과 없음", statusNote: null };
  }

  if (status === "stale") {
    return { chipState: "stale", statusLabel: "실행 중", statusNote: null };
  }

  return { chipState: "idle", statusLabel: "미실행", statusNote: null };
}

export function isSourceReadyForCompletion(
  log: SourceLogLike | null | undefined,
  apiKey: string,
): boolean {
  const view = resolveSourceStatusView(log, apiKey);
  if (
    view.chipState === "idle" ||
    view.chipState === "running" ||
    view.chipState === "loading" ||
    view.chipState === "stale" ||
    view.chipState === "error"
  ) {
    return false;
  }

  if (view.statusLabel === "미실행" || view.statusLabel === "오류") {
    return false;
  }

  if (CORE_API_KEYS_REQUIRE_NON_ZERO_RESPONSE.has(apiKey)) {
    return hasPositiveResponseCount(log?.response_count);
  }

  return true;
}

export function isSafetyKoreaApprovalPending(
  log: SourceLogLike | null | undefined,
  apiKey: string | null | undefined,
): boolean {
  if (apiKey !== "safetykorea_recall") return false;
  const errorCode = (log?.error_code ?? "").toLowerCase();
  return errorCode.includes("safetykorea_api_key_missing");
}

function normalizeApiStatus(value: string | null | undefined): ApiState {
  const status = (value ?? "idle").toLowerCase();
  if (
    status === "idle" ||
    status === "running" ||
    status === "loading" ||
    status === "success" ||
    status === "partial_success" ||
    status === "error" ||
    status === "stale"
  ) {
    if (status === "loading") return "running";
    return status;
  }
  if (status === "empty") return "partial_success";
  return "idle";
}

function hasPositiveResponseCount(value: number | null | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isHttpError(value: number | null | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 400;
}
