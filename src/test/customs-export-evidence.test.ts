import { describe, expect, it } from "vitest";
import {
  buildCustomsExportEvidenceSource,
  mergeCustomsExportEvidenceIntoRationale,
} from "@/lib/customs-export-evidence";

describe("customs export evidence", () => {
  it("builds a stable 12-month customs export evidence source", () => {
    const source = buildCustomsExportEvidenceSource(15_300_000);

    expect(source).toMatchObject({
      type: "customs_export_12m",
      score_relevant: true,
      customsExport12mUsd: 15_300_000,
      customsExportStatus: "available",
    });
    expect(source.title).toContain("최근 12개월");
    expect(source.summary).toContain("$15.3M");
  });

  it("merges customs export evidence without duplicating stale sources", () => {
    const rationale = mergeCustomsExportEvidenceIntoRationale(
      {
        summary: "기존 추천 근거",
        sources: [
          { type: "market_profile", title: "시장 프로필" },
          { type: "customs_export_12m", title: "이전 수출액", customsExport12mUsd: 1 },
        ],
      },
      32_800_000,
    );

    const sources = rationale.sources ?? [];
    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatchObject({ type: "market_profile" });
    expect(sources[1]).toMatchObject({
      type: "customs_export_12m",
      customsExport12mUsd: 32_800_000,
      customsExportStatus: "available",
    });
  });
});
