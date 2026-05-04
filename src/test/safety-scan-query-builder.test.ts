import { describe, expect, it } from "vitest";
import {
  BRAND_ONLY_RECALL_EXCLUSION_REASON,
  buildSafetyKoreaRequests,
  filterSafetyRecallMatches,
  RECALL_NO_MATCH_MESSAGE,
  RECALL_REVIEW_REQUIRED_ACTION,
  normalizeSafetySearchInput,
} from "../../supabase/functions/safety-scan/safety-search";

describe("SafetyKorea request builder", () => {
  it("orders certification, domestic recall, and foreign recall conditions by identifier strength", () => {
    const input = normalizeSafetySearchInput({
      productName: "전자재료",
      modelName: "CM-1000",
      brandName: "ACME",
      certNum: "HU071234-25001",
      barcodeNum: "8801234567890",
    });

    expect(buildSafetyKoreaRequests(input, [])).toEqual([
      { scope: "cert", conditionKey: "certNum", conditionValue: "HU071234-25001" },
      { scope: "cert", conditionKey: "modelName", conditionValue: "CM-1000" },
      { scope: "cert", conditionKey: "productName", conditionValue: "전자재료" },
      { scope: "domestic", conditionKey: "barcodeNum", conditionValue: "8801234567890" },
      { scope: "domestic", conditionKey: "certNum", conditionValue: "HU071234-25001" },
      { scope: "domestic", conditionKey: "recallModelName", conditionValue: "CM-1000" },
      { scope: "domestic", conditionKey: "recallBrandName", conditionValue: "ACME" },
      { scope: "domestic", conditionKey: "recallProductName", conditionValue: "전자재료" },
      { scope: "foreign", conditionKey: "recallModelName", conditionValue: "CM-1000" },
      { scope: "foreign", conditionKey: "recallBrandName", conditionValue: "ACME" },
      { scope: "foreign", conditionKey: "recallProductName", conditionValue: "전자재료" },
    ]);
  });

  it("uses legacy product tokens as fallback and removes duplicate requests", () => {
    const input = normalizeSafetySearchInput({
      productName: "",
      modelName: "전자재료",
      brandName: "",
      certNum: "",
      barcodeNum: "",
    });

    expect(buildSafetyKoreaRequests(input, ["전자재료", "센서"])).toEqual([
      { scope: "cert", conditionKey: "modelName", conditionValue: "전자재료" },
      { scope: "cert", conditionKey: "productName", conditionValue: "센서" },
      { scope: "domestic", conditionKey: "recallModelName", conditionValue: "전자재료" },
      { scope: "domestic", conditionKey: "recallProductName", conditionValue: "센서" },
      { scope: "foreign", conditionKey: "recallModelName", conditionValue: "전자재료" },
      { scope: "foreign", conditionKey: "recallProductName", conditionValue: "센서" },
    ]);
  });

  it("excludes Samsung brand-only recall candidates for a DRAM model search", () => {
    const input = normalizeSafetySearchInput({
      productName: "반도체(DRAM)",
      modelName: "M378A1K43CB2-CTD",
      brandName: "삼성전자",
      certNum: "",
      barcodeNum: "",
    });

    const result = filterSafetyRecallMatches(
      [
        {
          source: "domestic_recall",
          productName: "전기 세탁기 (드럼세탁기)",
          modelName: "WF24A9500KB, WF24A9500KE",
          brandName: "삼성전자",
        },
        {
          source: "domestic_recall",
          productName: "스마트폰(배터리)",
          modelName: "SM-N930S, SM-N930K",
          brandName: "삼성전자",
        },
        {
          source: "domestic_recall",
          productName: "반도체 DRAM 모듈",
          modelName: "M378A1K43CB2-CTD",
          brandName: "삼성전자",
        },
        {
          source: "domestic_recall",
          productName: "메모리 모듈",
          modelName: "M378A1K43CB2",
          brandName: "삼성전자",
        },
      ],
      input,
    );

    expect(result.included.map((item) => item.productName)).toEqual(["반도체 DRAM 모듈", "메모리 모듈"]);
    expect(result.included[0].matchBasis).toEqual(["모델명 일치", "제품명 일치", "브랜드 보조 일치"]);
    expect(result.included[1].matchBasis).toEqual(["모델명 일치", "브랜드 보조 일치"]);
    expect(result.excluded.map((item) => item.excludedReason)).toEqual([
      BRAND_ONLY_RECALL_EXCLUSION_REASON,
      BRAND_ONLY_RECALL_EXCLUSION_REASON,
    ]);
  });

  it("applies the same product and model filter to foreign recalls", () => {
    const input = normalizeSafetySearchInput({
      productName: "반도체(DRAM)",
      modelName: "M378A1K43CB2-CTD",
      brandName: "삼성전자",
      certNum: "",
      barcodeNum: "",
    });

    const result = filterSafetyRecallMatches(
      [
        {
          source: "foreign_recall",
          productName: "Smartphone battery",
          modelName: "SM-N930S",
          brandName: "Samsung Electronics",
        },
        {
          source: "foreign_recall",
          productName: "DRAM memory module",
          modelName: "M378A1K43CB2-CTD",
          brandName: "Samsung Electronics",
        },
      ],
      input,
    );

    expect(result.included.map((item) => item.productName)).toEqual(["DRAM memory module"]);
    expect(result.excluded).toHaveLength(1);
  });

  it("returns no-match status text when all recall candidates are filtered out", () => {
    const input = normalizeSafetySearchInput({
      productName: "반도체(DRAM)",
      modelName: "M378A1K43CB2-CTD",
      brandName: "삼성전자",
      certNum: "",
      barcodeNum: "",
    });

    const result = filterSafetyRecallMatches(
      [
        {
          source: "domestic_recall",
          productName: "전기 세탁기 (드럼세탁기)",
          modelName: "WF24A9500KB",
          brandName: "삼성전자",
        },
      ],
      input,
    );

    expect(result.included).toHaveLength(0);
    expect(result.noMatchMessage).toBe(RECALL_NO_MATCH_MESSAGE);
    expect(result.recommendedAction).toBe(RECALL_REVIEW_REQUIRED_ACTION);
  });
});
