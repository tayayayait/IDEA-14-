import { describe, expect, it } from "vitest";
import {
  buildNationalInfoPresentation,
  classifyNationalInfoParagraph,
  extractCompleteSummaryBullets,
  inferHsProductFamilies,
} from "@/lib/kotra-national-info";

describe("kotra national info relevance", () => {
  it("infers broad product families from HS chapter only as first-pass context", () => {
    expect(inferHsProductFamilies("845611", "8456111000").map((family) => family.key)).toContain("machinery_electronics");
    expect(inferHsProductFamilies("870350", "8703500000").map((family) => family.key)).toContain("vehicle");
    expect(inferHsProductFamilies("210690", "2106909099").map((family) => family.key)).toContain("food_agriculture");
    expect(inferHsProductFamilies("300490", "3004909000").map((family) => family.key)).toContain("pharmaceutical");
    expect(inferHsProductFamilies("330499", "3304999000").map((family) => family.key)).toContain("cosmetics");
    expect(inferHsProductFamilies("392690", "3926909000").map((family) => family.key)).toContain("plastic");
    expect(inferHsProductFamilies("721049", "7210490000").map((family) => family.key)).toContain("steel_metal");
    expect(inferHsProductFamilies("901890", "9018909000").map((family) => family.key)).toContain("precision_medical_optical");
  });

  it("classifies unrelated product regulations away from semiconductor machinery context", () => {
    const context = {
      productName: "반도체 부품 제조",
      hsCode: "845611",
      hskCode: "8456111000",
    };

    for (const paragraph of [
      "자동차 및 차량 부품은 별도 형식승인 대상이다.",
      "농산물은 검역증명서를 제출해야 한다.",
      "비료 수입은 사전 등록이 필요하다.",
      "식품은 위생검사와 식품안전 인증 대상이다.",
      "의료기기는 보건부 등록을 받아야 한다.",
      "완구는 어린이 안전 인증 대상이다.",
    ]) {
      expect(classifyNationalInfoParagraph(paragraph, context).relevance).toBe("unrelated");
    }
  });

  it("keeps direct, conditional, and common paragraphs distinct", () => {
    const context = {
      productName: "반도체 부품 제조",
      hsCode: "845611",
      hskCode: "8456111000",
    };

    expect(classifyNationalInfoParagraph("HS 845611 레이저 가공기 부품은 통관 전 사전 확인이 필요하다.", context).relevance).toBe(
      "direct",
    );
    expect(classifyNationalInfoParagraph("중고 장비로 수출하는 경우 중고 기계설비 수입요건을 확인해야 한다.", context).relevance).toBe(
      "conditional",
    );
    expect(classifyNationalInfoParagraph("전기전자제품으로 분류되는 경우 RoHS 등 환경규제 적용 여부를 확인해야 한다.", context).relevance).toBe(
      "conditional",
    );
    expect(classifyNationalInfoParagraph("모든 수입품은 HS 코드 사전 확인과 관세율 확인이 필요하다.", context).relevance).toBe(
      "common",
    );
    expect(classifyNationalInfoParagraph("FTA 특혜세율 적용 시 원산지증명서 제출 요건을 확인해야 한다.", context).relevance).toBe(
      "common",
    );
  });
});

describe("kotra national info sentence summaries", () => {
  it("does not split decimal numbers or percentage ranges as sentence endings", () => {
    const bullets = extractCompleteSummaryBullets(
      "베트남 통계총국에 따르면 2025년 1~3분기 누적 GDP는 전년 동기 대비 7.85% 성장했습니다. " +
        "2024년 GDP 성장률은 7.09%를 기록했습니다. " +
        "2025년 성장률 목표는 6.5~7.0% 수준으로 제시되었습니다.",
    );

    expect(bullets).toEqual([
      "베트남 통계총국에 따르면 2025년 1~3분기 누적 GDP는 전년 동기 대비 7.85% 성장했습니다.",
      "2024년 GDP 성장률은 7.09%를 기록했습니다.",
      "2025년 성장률 목표는 6.5~7.0% 수준으로 제시되었습니다.",
    ]);
  });

  it("excludes incomplete and overlong sentences from default bullets", () => {
    const bullets = extractCompleteSummaryBullets(
      "2025년 1~3분기 누적 GDP는 전년 동기 대비 7. " +
        "제조업과 서비스업이 경제 성장을 견인하고 있습니다. " +
        `${"매우 긴 설명 ".repeat(80)}입니다.`,
    );

    expect(bullets).toEqual(["제조업과 서비스업이 경제 성장을 견인하고 있습니다."]);
  });

  it("builds default presentation without exposing unrelated raw paragraphs", () => {
    const presentation = buildNationalInfoPresentation({
      label: "TBT / 기술규제",
      text:
        "모든 수입품은 HS 코드 사전 확인과 관세율 확인이 필요하다.\n\n" +
        "HS 845611 레이저 가공기 부품은 통관 전 사전 확인이 필요하다.\n\n" +
        "식품은 위생검사와 식품안전 인증 대상이다.\n\n" +
        "전기전자제품으로 분류되는 경우 RoHS 등 환경규제 적용 여부를 확인해야 한다.",
      context: {
        productName: "반도체 부품 제조",
        hsCode: "845611",
        hskCode: "8456111000",
      },
      kind: "regulated",
    });

    expect(presentation.direct).toContain("HS 845611 레이저 가공기 부품은 통관 전 사전 확인이 필요하다.");
    expect(presentation.common).toContain("모든 수입품은 HS 코드 사전 확인과 관세율 확인이 필요하다.");
    expect(presentation.conditional).toContain("전기전자제품으로 분류되는 경우 RoHS 등 환경규제 적용 여부를 확인해야 한다.");
    expect(presentation.defaultBullets.join(" ")).not.toContain("식품");
    expect(presentation.rawText).toContain("식품은 위생검사와 식품안전 인증 대상이다.");
  });
});
