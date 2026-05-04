import { describe, expect, it } from "vitest";
import {
  formatSafetyResultCount,
  getSafetySearchBasis,
  normalizeSafetyMatchBasis,
  summarizeSafetyText,
} from "@/lib/step5-product-safety-results";

describe("step5 product safety result presentation", () => {
  it("marks product-name-only searches as low-confidence product candidates", () => {
    expect(getSafetySearchBasis({ productName: "유모차" })).toMatchObject({
      basisLabel: "제품명 기준",
      confidenceLabel: "낮음",
      badgeLabel: "제품명 후보",
    });
  });

  it("marks model-name searches as high-confidence model-based searches", () => {
    expect(getSafetySearchBasis({ productName: "유모차", modelName: "CM-1000" })).toMatchObject({
      basisLabel: "모델명 기준",
      confidenceLabel: "높음",
      badgeLabel: "모델명 일치",
    });
  });

  it("prioritizes KC certification number over other search fields", () => {
    expect(getSafetySearchBasis({ productName: "유모차", modelName: "CM-1000", certNum: "HU071234-25001" })).toMatchObject({
      basisLabel: "KC 인증번호 기준",
      confidenceLabel: "높음",
      badgeLabel: "KC번호 일치",
    });
  });

  it("formats visible count against total count", () => {
    expect(formatSafetyResultCount(2335, 10)).toBe("상위 10건 표시 / 전체 2,335건");
    expect(formatSafetyResultCount(5, 5)).toBe("전체 5건");
    expect(formatSafetyResultCount(0, 0)).toBe("전체 0건");
  });

  it("normalizes match basis labels for display", () => {
    expect(normalizeSafetyMatchBasis(["제품명 일치", "브랜드 보조 일치"], "제품명 후보")).toEqual([
      "제품명 후보",
      "브랜드 보조 일치",
    ]);
  });

  it("summarizes long recall descriptions to one line", () => {
    const text = "프탈레이트계 가소제 기준치 초과 ".repeat(10);
    expect(summarizeSafetyText(text, 40)).toMatch(/\.\.\.$/);
  });
});
