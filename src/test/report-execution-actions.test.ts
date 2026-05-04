import { describe, expect, it } from "vitest";
import { buildCountryExecutionActions } from "@/lib/report-execution-actions";

describe("report execution actions", () => {
  it("extracts trade office actions and ignores removed exhibition actions", () => {
    const rows = buildCountryExecutionActions([
      {
        country_code: "VN",
        country_name: "베트남",
        rationale: {
          sources: [
            {
              type: "trade_office_action",
              title: "호치민 무역관 문의",
              url: "https://example.org/office?token=abc",
            },
            {
              type: "exhibition_action",
              title: "하노이 모터 전시회",
              url: "https://example.org/exhibition#plan",
              summary: "9월 개최 예정",
            },
          ],
        },
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].tradeOffices).toHaveLength(1);
    expect(rows[0].tradeOffices[0].url).toBe("https://example.org/office");
  });

  it("deduplicates repeated entries and enforces max 3 rows", () => {
    const rows = buildCountryExecutionActions([
      {
        country_code: "US",
        country_name: "미국",
        rationale: {
          sources: [
            { type: "trade_office_action", title: "LA 무역관", url: "https://example.org/la" },
            { type: "trade_office_action", title: "LA 무역관", url: "https://example.org/la" },
            { type: "trade_office_action", title: "NY 무역관", url: "https://example.org/ny" },
            { type: "trade_office_action", title: "시카고 무역관", url: "https://example.org/chicago" },
            { type: "trade_office_action", title: "휴스턴 무역관", url: "https://example.org/houston" },
          ],
        },
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].tradeOffices).toHaveLength(3);
    expect(rows[0].tradeOffices.map((entry) => entry.title)).toEqual([
      "LA 무역관",
      "NY 무역관",
      "시카고 무역관",
    ]);
  });

  it("rebuilds trade office paragraphs from structured fields before using stored truncated summaries", () => {
    const rows = buildCountryExecutionActions([
      {
        country_code: "CN",
        country_name: "중화인민공화국",
        rationale: {
          sources: [
            {
              type: "trade_office_action",
              title: "Trade office contact: 베이징 무역관",
              url: "https://example.org/beijing?serviceKey=secret",
              summary:
                "베이징 무역관은 Beijing Puxiang Zhongxin 29th Floor에 있으며 공항 접근은 공항 기준 1km...",
              office_name: "베이징 무역관",
              office_address:
                "무역관주소: Beijing Puxiang Zhongxin 29th Floor, Hongtadongjie, Wangjing, Chaoyang District, Beijing",
              airport_route_text: "공항 접근: 베이징 공항 기준 약 1km, 약 7분 소요, 이동수단 택시, 버스.",
              summary_source: "rule",
            },
          ],
        },
      },
    ]);

    expect(rows[0].tradeOffices[0].displaySummary).toBe(
      "베이징 무역관은 Beijing Puxiang Zhongxin 29th Floor, Hongtadongjie, Wangjing, Chaoyang District, Beijing에 있습니다. 공항 접근은 베이징 공항 기준으로 약 1km 거리, 약 7분 소요입니다. 이동수단은 택시, 버스입니다.",
    );
    expect(rows[0].tradeOffices[0].displaySummary).not.toContain("...");
    expect(rows[0].tradeOffices[0].url).toBe("https://example.org/beijing");
  });

  it("hides unfinished legacy summaries when no complete sentence is available", () => {
    const rows = buildCountryExecutionActions([
      {
        country_code: "TR",
        country_name: "튀르키예",
        rationale: {
          sources: [
            {
              type: "trade_office_action",
              title: "이스탄불 무역관",
              summary: "이스탄불 무역관은 Korea Trade Center, Maslak, AKSOY PLAZA, Ahi Evran Cd. NO: 6 D:KAT. 3, 34398...",
            },
          ],
        },
      },
    ]);

    expect(rows[0].tradeOffices[0].summary).toContain("...");
    expect(rows[0].tradeOffices[0].displaySummary).toBeNull();
  });

  it("keeps only complete sentences from legacy summaries that end with ellipsis", () => {
    const rows = buildCountryExecutionActions([
      {
        country_code: "US",
        country_name: "미합중국",
        rationale: {
          sources: [
            {
              type: "trade_office_action",
              title: "뉴욕 무역관",
              summary:
                "뉴욕 무역관은 460 Park Avenue, 14th Floor, New York, NY 10022에 있습니다. JFK 공항 기준 약 15마일 거리입니다. 택시 요금은 $70...",
            },
          ],
        },
      },
    ]);

    expect(rows[0].tradeOffices[0].displaySummary).toBe(
      "뉴욕 무역관은 460 Park Avenue, 14th Floor, New York, NY 10022에 있습니다. JFK 공항 기준 약 15마일 거리입니다.",
    );
  });
});
