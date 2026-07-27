export type AiPipelineFailureCode =
  | "gemini_spending_cap_exceeded"
  | "gemini_rate_limited"
  | "gemini_generation_failed";

export interface AiPipelineFailure {
  code: AiPipelineFailureCode;
  message: string;
  retryable: boolean;
}

export function classifyAiPipelineFailure(errorMessage: string): AiPipelineFailure {
  const normalized = errorMessage.toLowerCase();

  if (normalized.includes("monthly spending cap") || normalized.includes("spending cap")) {
    return {
      code: "gemini_spending_cap_exceeded",
      message: "Gemini 월간 지출 한도가 초과되어 공식자료 재조사와 AI 종합판단을 완료하지 못했습니다. Google AI Studio에서 프로젝트 지출 한도를 상향하거나 한도 초기화 후 다시 생성해 주세요.",
      retryable: false,
    };
  }

  if (
    normalized.includes("429")
    || normalized.includes("rate limit")
    || normalized.includes("resource_exhausted")
  ) {
    return {
      code: "gemini_rate_limited",
      message: "Gemini 요청 한도에 도달해 공식자료 재조사를 완료하지 못했습니다. 잠시 후 AI 리포트를 다시 생성해 주세요.",
      retryable: true,
    };
  }

  return {
    code: "gemini_generation_failed",
    message: "Gemini 공식자료 재조사와 AI 종합판단을 완료하지 못했습니다. 잠시 후 다시 생성해 주세요.",
    retryable: true,
  };
}
