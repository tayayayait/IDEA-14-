import { describe, expect, it, vi } from "vitest";
import { fetchKicoxWithRetry, kicoxHttpErrorMessage } from "../../supabase/functions/api-kicox-search/retry.ts";

describe("KICOX transient failure recovery", () => {
  it("retries one HTTP 503 response and returns the next successful response", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response("<response />", { status: 200 }));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await fetchKicoxWithRetry("https://example.test/kicox", {
      fetcher,
      sleep,
      retryDelayMs: 0,
    });

    expect(result.response.status).toBe(200);
    expect(result.attempts).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("returns a clear manual-entry fallback message for HTTP 503", () => {
    const message = kicoxHttpErrorMessage(503);

    expect(message).toContain("KICOX 공공데이터 서버");
    expect(message).toContain("일시적으로 응답하지 않습니다");
    expect(message).toContain("직접 입력");
  });
});
