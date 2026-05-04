import { filterVisibleSources } from "@/pages/Step4CountryDetail";
import { describe, expect, it } from "vitest";

describe("Step4 source sidebar filter", () => {
  it("hides trade office action rows from the Step 4 sidebar", () => {
    const visible = filterVisibleSources([
      {
        type: "trade_office_action",
        title: "New York trade office",
        url: "https://example.com/kotra-ny",
        summary: "Airport access details",
      },
      {
        type: "product_evidence",
        title: "US premium stroller demand expands",
        url: "https://example.com/news",
        summary: "HS 871500 demand signal",
      },
    ]);

    expect(visible.map((source) => source.title)).toEqual([
      "US premium stroller demand expands",
    ]);
  });

  it("hides generic KOTRA country profile and export-rank sidebar rows", () => {
    const visible = filterVisibleSources([
      {
        type: "country_background",
        title: "China country and market profile",
        url: "https://example.com/kotra-profile",
        summary: "Country overview",
      },
      {
        type: "country_background",
        title: "China market overview",
        url: "https://example.com/kotra-rank",
        summary: "Export region rank 1",
      },
      {
        type: "country_background",
        title: "Export region rank 1",
        url: null,
        summary: null,
      },
      {
        type: "product_evidence",
        title: "China brake component demand expands",
        url: "https://example.com/news",
        summary: "HS 870830 demand signal",
      },
    ]);

    expect(visible.map((source) => source.title)).toEqual([
      "China brake component demand expands",
    ]);
  });

  it("decodes KOTRA html entities before rendering sidebar source text", () => {
    const visible = filterVisibleSources([
      {
        type: "country_background",
        title: "중국 바이오제약의 도약, 이제 &#39;육성&#39;이 아닌 &rsquo;성장&rsquo;의 주역",
        url: "https://example.com/news",
        summary: "톈진항&middot;보세구 활용법 &amp; 수출환경",
        keywords: ["K-소비재&middot;보세구", "이커머스&hellip;"],
        ai_reason: "AI 판정 &hellip; 시장 배경",
      },
    ]);

    expect(visible[0].title).toBe("중국 바이오제약의 도약, 이제 '육성'이 아닌 '성장'의 주역");
    expect(visible[0].summary).toBe("톈진항·보세구 활용법 & 수출환경");
    expect(visible[0].keywords).toEqual(["K-소비재·보세구", "이커머스..."]);
    expect(visible[0].ai_reason).toBe("AI 판정 ... 시장 배경");
  });
});
