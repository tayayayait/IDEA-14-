import { describe, expect, it } from "vitest";
import { classifyAiPipelineFailure } from "../../supabase/functions/ai-report-summary/ai-failure";
import { getReportGenerationFailure } from "@/lib/report-generation-state";

describe("AI report generation failure handling", () => {
  it("classifies a Gemini monthly spending cap as a non-retryable account action", () => {
    const failure = classifyAiPipelineFailure(
      "Gemini 429: Your project has exceeded its monthly spending cap. Go to AI Studio.",
    );

    expect(failure.code).toBe("gemini_spending_cap_exceeded");
    expect(failure.retryable).toBe(false);
    expect(failure.message).toContain("월간 지출 한도");
    expect(failure.message).toContain("Google AI Studio");
    expect(failure.message).not.toContain("Gemini 429");
  });

  it("treats a local fallback response as a failed regeneration", () => {
    const failure = getReportGenerationFailure({
      state: "local_fallback",
      message: "공식자료 재조사를 완료하지 못했습니다.",
      failure_code: "gemini_spending_cap_exceeded",
      retryable: false,
    });

    expect(failure).toEqual({
      code: "gemini_spending_cap_exceeded",
      message: "공식자료 재조사를 완료하지 못했습니다.",
      retryable: false,
    });
  });

  it("does not mark successful or partial AI output as a generation failure", () => {
    expect(getReportGenerationFailure({ state: "success" })).toBeNull();
    expect(getReportGenerationFailure({ state: "partial_success" })).toBeNull();
  });
});
