import { describe, expect, it } from "vitest";
import {
  buildAvailableEntryStrategy,
  normalizeEntryStrategyItems,
  resolveEntryStrategySearchTerm,
  selectLatestEntryStrategy,
} from "../../supabase/functions/_shared/kotra-entry-strategy";

describe("KOTRA entry strategy helpers", () => {
  it("normalizes single-item and array API responses", () => {
    const single = normalizeEntryStrategyItems({
      response: {
        body: {
          itemList: {
            item: {
              newsTitl: "2026 미국 진출전략",
              othbcDt: "2025-12-22",
              ovrofInfo: "워싱턴DC무역관",
              kotraNewsUrl: "https://dream.kotra.or.kr/article",
              newsBdt: "<p>III. 진출전략</p>",
              realAtfileInfoList: {
                realAtfileInfo: {
                  realAtfileName: "2026 미국 진출전략.pdf",
                  realAtfileUrl: "https://dream.kotra.or.kr/file.pdf",
                },
              },
            },
          },
        },
      },
    });

    const list = normalizeEntryStrategyItems({
      response: {
        body: {
          itemList: {
            item: [
              { newsTitl: "2025 미국 진출전략", othbcDt: "2024-12-26" },
              { newsTitl: "2026 미국 진출전략", othbcDt: "2025-12-22" },
            ],
          },
        },
      },
    });

    expect(single).toHaveLength(1);
    expect(single[0]).toMatchObject({
      title: "2026 미국 진출전략",
      publishedDate: "2025-12-22",
      tradeOffice: "워싱턴DC무역관",
      attachmentName: "2026 미국 진출전략.pdf",
      attachmentUrl: "https://dream.kotra.or.kr/file.pdf",
    });
    expect(single[0].basisSummary).toBe("");
    expect(list).toHaveLength(2);
  });

  it("maps top-country codes to KOTRA title search terms", () => {
    expect(resolveEntryStrategySearchTerm("US", "미합중국(The United States of America)")).toBe("미국");
    expect(resolveEntryStrategySearchTerm("VN", "베트남 사회주의 공화국")).toBe("베트남");
    expect(resolveEntryStrategySearchTerm("CN", "중화인민공화국")).toBe("중국");
    expect(resolveEntryStrategySearchTerm("DE", "독일연방공화국(Federal Republic of Germany)")).toBe("독일");
  });

  it("selects the latest strategy report and prefers titles containing 진출전략", () => {
    const selected = selectLatestEntryStrategy([
      { title: "2026 미국 일반자료", publishedDate: "2026-01-01", limitations: [] },
      { title: "2025 미국 진출전략", publishedDate: "2024-12-26", limitations: [] },
      { title: "2026 미국 진출전략", publishedDate: "2025-12-22", limitations: [] },
    ]);

    expect(selected?.title).toBe("2026 미국 진출전략");
  });

  it("does not select Indonesia when the target search term is India", () => {
    const selected = selectLatestEntryStrategy([
      { title: "2026 인도네시아 진출전략", publishedDate: "2025-12-22", limitations: [] },
      { title: "2025 인도 진출전략", publishedDate: "2024-12-26", limitations: [] },
    ], "인도");

    expect(selected?.title).toBe("2025 인도 진출전략");
  });

  it("returns no entry strategy when only a substring country match exists", () => {
    const selected = selectLatestEntryStrategy([
      { title: "2026 인도네시아 진출전략", publishedDate: "2025-12-22", limitations: [] },
    ], "인도");

    expect(selected).toBeNull();
  });

  it("keeps entry strategy metadata as link-only evidence", () => {
    const result = buildAvailableEntryStrategy({
      title: "2026 미국 진출전략",
      publishedDate: "2025-12-22",
      tradeOffice: "워싱턴DC무역관",
      sourceUrl: "https://dream.kotra.or.kr/article",
      attachmentName: "2026 미국 진출전략.pdf",
      attachmentUrl: "https://dream.kotra.or.kr/file.pdf",
      basisSummary: "I. 진출 환경 III. 진출전략",
      limitations: [],
    }, "PDF 본문 분석처럼 보이는 요약은 무시되어야 합니다.");

    expect(result).toMatchObject({
      status: "available",
      title: "2026 미국 진출전략",
      sourceUrl: "https://dream.kotra.or.kr/article",
      attachmentName: "2026 미국 진출전략.pdf",
      attachmentUrl: "https://dream.kotra.or.kr/file.pdf",
      usedPdf: false,
      basisSummary: "",
    });
  });
});
