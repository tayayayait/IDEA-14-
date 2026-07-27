export interface ReportGenerationResponseState {
  state?: string;
  message?: string;
  failure_code?: string;
  retryable?: boolean;
}

export interface ReportGenerationFailure {
  code: string;
  message: string;
  retryable: boolean;
}

export function getReportGenerationFailure(
  response: ReportGenerationResponseState | null | undefined,
): ReportGenerationFailure | null {
  if (response?.state !== "local_fallback") return null;

  return {
    code: response.failure_code?.trim() || "ai_generation_failed",
    message: response.message?.trim() || "공식자료 재조사와 AI 종합판단을 완료하지 못했습니다.",
    retryable: response.retryable !== false,
  };
}
