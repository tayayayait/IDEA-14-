import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCustomsTradeSummary } from "../../supabase/functions/_shared/customs-trade";

const originalFetch = globalThis.fetch;

function customsXml(countryCode: string): string {
  return [
    "<response>",
    "<header><resultCode>00</resultCode><resultMsg>OK</resultMsg></header>",
    "<body><items><item>",
    "<year>2026.01</year>",
    `<statCd>${countryCode}</statCd>`,
    "<statCdCntnKor1>Country</statCdCntnKor1>",
    "<statKor>Product</statKor>",
    "<hsCd>854232</hsCd>",
    "<expWgt>1</expWgt>",
    "<expDlr>1000</expDlr>",
    "<impWgt>1</impWgt>",
    "<impDlr>500</impDlr>",
    "<balPayments>500</balPayments>",
    "</item></items></body>",
    "</response>",
  ].join("");
}

function emptyCustomsXml(countryCode: string): string {
  return [
    "<response>",
    "<header><resultCode>00</resultCode><resultMsg>OK</resultMsg></header>",
    "<body><items><item>",
    "<year>총계</year>",
    "<statCd>-</statCd>",
    "<statCdCntnKor1>-</statCdCntnKor1>",
    "<statKor>-</statKor>",
    "<hsCd>-</hsCd>",
    "<expWgt>0</expWgt>",
    "<expDlr>0</expDlr>",
    "<impWgt>0</impWgt>",
    "<impDlr>0</impDlr>",
    "<balPayments>0</balPayments>",
    "</item></items></body>",
    "</response>",
  ].join("");
}

describe("customs trade summary", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("limits concurrent country requests", async () => {
    let active = 0;
    let peak = 0;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      active += 1;
      peak = Math.max(peak, active);
      const url = new URL(String(input));
      const countryCode = url.searchParams.get("cntyCd") ?? "US";
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return new Response(customsXml(countryCode), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await fetchCustomsTradeSummary(
      "854232",
      ["US", "DE", "JP", "CN"],
      "service-key",
      { concurrency: 2 },
    );

    expect(peak).toBeLessThanOrEqual(2);
    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
    expect(result.size).toBe(4);
    expect(result.get("US")?.totalExpDlr).toBe(1000);
  });

  it("tries the guide-defined 10-digit item code before broader HS fallbacks", async () => {
    const requestedHsCodes: string[] = [];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const hsSgn = url.searchParams.get("hsSgn") ?? "";
      requestedHsCodes.push(hsSgn);
      if (hsSgn === "8542321020") {
        return new Response(emptyCustomsXml("US"), { status: 200 });
      }
      return new Response(customsXml("US"), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await fetchCustomsTradeSummary(
      "8542321020",
      ["US"],
      "service-key",
      { concurrency: 1 },
    );

    expect(requestedHsCodes).toEqual(["8542321020", "854232"]);
    expect(result.get("US")?.totalExpDlr).toBe(1000);
  });
});
