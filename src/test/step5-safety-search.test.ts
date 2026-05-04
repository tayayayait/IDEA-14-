import { describe, expect, it } from "vitest";
import {
  buildInitialSafetySearch,
  mergeSafetySearchIntoComponents,
  normalizeSafetySearchForm,
  parseSafetySearchFromComponents,
} from "@/lib/step5-safety-search";

describe("step5 safety search form", () => {
  it("loads saved safety search values and falls back to the product name", () => {
    const saved = JSON.stringify({
      tags: ["전자재료"],
      safetySearch: {
        productName: "제어 모듈",
        modelName: "CM-1000",
        brandName: "ACME",
        certNum: "HU071234-25001",
        barcodeNum: "8801234567890",
      },
    });

    expect(buildInitialSafetySearch({ name: "전자재료", components: saved })).toEqual({
      productName: "제어 모듈",
      modelName: "CM-1000",
      brandName: "ACME",
      certNum: "HU071234-25001",
      barcodeNum: "8801234567890",
    });

    expect(buildInitialSafetySearch({ name: "전자재료", components: "{}" }).productName).toBe("전자재료");
  });

  it("normalizes blank fields and preserves existing component metadata", () => {
    const current = JSON.stringify({
      tags: ["전자재료"],
      hsSelectionSource: "manual",
    });
    const normalized = normalizeSafetySearchForm({
      productName: "  전자재료  ",
      modelName: " CM-1000 ",
      brandName: "",
      certNum: " HU071234-25001 ",
      barcodeNum: "",
    });
    const merged = mergeSafetySearchIntoComponents(current, normalized, "2026-04-29T00:00:00.000Z");

    expect(parseSafetySearchFromComponents(merged)).toEqual({
      productName: "전자재료",
      modelName: "CM-1000",
      brandName: "",
      certNum: "HU071234-25001",
      barcodeNum: "",
    });
    expect(JSON.parse(merged)).toMatchObject({
      tags: ["전자재료"],
      hsSelectionSource: "manual",
      safetySearch: {
        updatedAt: "2026-04-29T00:00:00.000Z",
      },
    });
  });
});
