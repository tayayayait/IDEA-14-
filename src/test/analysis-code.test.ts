import { describe, expect, it } from "vitest";
import { buildProductAnalysisCode, getSelectionStatusDetail } from "@/lib/analysis-code";

describe("analysis-code parser", () => {
  it("parses step2 selection metadata from components json", () => {
    const result = buildProductAnalysisCode({
      name: "DRAM package",
      hs_code: "854232",
      hsk_code: "8542321020",
      confirmed: false,
      components: JSON.stringify({
        hsSelectionSource: "auto",
        hsSelectionStatus: "high_confidence",
        hsSelectionScore: 95,
        hsReviewRequired: false,
        hsSelectedCandidateKey: "854232:8542321020",
      }),
    });

    expect(result.name).toBe("DRAM package");
    expect(result.hsCode).toBe("854232");
    expect(result.hskCode).toBe("8542321020");
    expect(result.selectionSource).toBe("auto");
    expect(result.selectionStatus).toBe("high_confidence");
    expect(result.selectionScore).toBe(95);
    expect(result.reviewRequired).toBe(false);
    expect(result.selectedCandidateKey).toBe("854232:8542321020");
  });

  it("falls back to manual source when confirmed=true and source is missing", () => {
    const result = buildProductAnalysisCode({
      name: "manual entry",
      hs_code: "903082",
      hsk_code: "9030820000",
      confirmed: true,
      components: JSON.stringify({ tags: ["test"] }),
    });

    expect(result.selectionSource).toBe("manual");
    expect(result.selectionStatus).toBe(null);
    expect(result.selectionScore).toBe(null);
    expect(result.reviewRequired).toBe(true);
  });

  it("keeps default values when components is not json", () => {
    const result = buildProductAnalysisCode({
      hs_code: "870380",
      hsk_code: "8703801000",
      components: "전기차 배터리",
      confirmed: false,
    });

    expect(result.selectionSource).toBe("auto");
    expect(result.selectionStatus).toBe(null);
    expect(result.selectionScore).toBe(null);
    expect(result.reviewRequired).toBe(true);
  });

  it("uses review-required detail message with proceed wording", () => {
    expect(getSelectionStatusDetail("review_required")).toContain("확인 필요 상태로 진행");
  });
});
