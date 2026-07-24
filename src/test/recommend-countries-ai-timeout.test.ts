import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isRetryableAiError, withAiRetry } from "../../supabase/functions/_shared/ai-retry.ts";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("recommend-countries AI request resilience", () => {
  it("uses a 30-second AI budget and retries one transient provider failure", () => {
    const source = read("supabase/functions/recommend-countries/index.ts");

    expect(source).toContain("const AI_FETCH_TIMEOUT_MS = 30000;");
    expect(source).toContain("const AI_MAX_ATTEMPTS = 2;");
    expect(source).toContain("withAiRetry");
  });

  it("recognizes an aborted request as retryable", () => {
    const source = read("supabase/functions/_shared/ai-retry.ts");

    expect(source).toContain("The signal has been aborted");
    expect(source).toContain("isRetryableAiError");
    expect(isRetryableAiError(new Error("The signal has been aborted"))).toBe(true);
    expect(isRetryableAiError(new Error("LOVABLE_API_KEY missing"))).toBe(false);
  });

  it("retries an aborted request once and returns the recovered result", async () => {
    let attempts = 0;

    const result = await withAiRetry(
      async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("The signal has been aborted");
        return "ok";
      },
      { maxAttempts: 2, delayMs: 0 },
    );

    expect(result).toBe("ok");
    expect(attempts).toBe(2);
  });
});
