import { describe, expect, it } from "vitest";
import {
  buildSmeCertificationFallbackRecommendations,
  filterSmeCertificationsByCountry,
  filterSmeCertificationRecommendationsByProductRelevance,
  parseSmeCertificationAiResponse,
  type SmeCertItem,
} from "../../supabase/functions/_shared/sme-cert";

describe("sme-cert", () => {
  it("matches India exactly without pulling Indonesia rows", () => {
    const rows: SmeCertItem[] = [
      { "연번": 1, "국가": "인도", "인증명": "BIS", "설명": "(인도제품인증)" },
      { "연번": 2, "국가": "인도네시아", "인증명": "BPOM", "설명": "(인도네시아 식품의약품등록)" },
    ];

    const filtered = filterSmeCertificationsByCountry(rows, "IN", "인도(The Republic of India)");

    expect(filtered.map((row) => row.인증명)).toEqual(["BIS"]);
  });

  it("does not dump every country certification when product relevance is missing", () => {
    const rows: SmeCertItem[] = [
      { "연번": 121, "국가": "베트남", "인증명": "CR Mark", "설명": "(베트남안전규격인증)" },
      { "연번": 143, "국가": "베트남", "인증명": "DAV", "설명": "(베트남보건부의약청 화장품등록)" },
      { "연번": 152, "국가": "베트남", "인증명": "DMEC", "설명": "(베트남의료기기 수입허가)" },
      { "연번": 414, "국가": "베트남", "인증명": "PPD", "설명": "(베트남 비료허가)" },
      { "연번": 510, "국가": "베트남", "인증명": "VFA", "설명": "(베트남 식품 인허가)" },
      { "연번": 511, "국가": "베트남", "인증명": "VNEEP", "설명": "(베트남에너지효율인증)" },
      { "연번": 512, "국가": "베트남", "인증명": "VNTA", "설명": "(베트남유무선통신인증)" },
    ];

    const recommendations = buildSmeCertificationFallbackRecommendations(rows, {
      productName: "반도체(DRAM)",
      hsCode: "854232",
    });

    expect(recommendations).toEqual([]);
  });

  it("keeps only product-relevant country fallback recommendations", () => {
    const rows: SmeCertItem[] = [
      { "연번": 1, "국가": "베트남", "인증명": "VNTA", "설명": "(베트남유무선통신인증)" },
      { "연번": 2, "국가": "베트남", "인증명": "DAV", "설명": "(베트남보건부의약청 화장품등록)" },
    ];

    const recommendations = buildSmeCertificationFallbackRecommendations(rows, {
      productName: "블루투스 무선 통신 모듈",
      hsCode: "851762",
    });

    expect(recommendations).toEqual([
      {
        certName: "VNTA",
        rationale: "(베트남유무선통신인증) - 중소벤처기업부 해외규격인증정보의 국가별 등록 인증입니다. 제품 적용 여부는 기관 확인이 필요합니다.",
        confidence: "medium",
        source: "country_fallback",
      },
    ]);
  });

  it("parses the first valid Gemini JSON array when trailing tokens are appended", () => {
    const recommendations = parseSmeCertificationAiResponse(
      '[{"certName":"BIS","rationale":"required","confidence":"high"}] ]',
    );

    expect(recommendations).toEqual([
      {
        certName: "BIS",
        rationale: "required",
        confidence: "high",
        source: "ai",
      },
    ]);
  });

  it("filters SME AI recommendations through the same product relevance gate", () => {
    const rows: SmeCertItem[] = [
      { "연번": 39, "국가": "인도", "인증명": "ARAI", "설명": "(인도자동차 시스템부품인증)" },
      { "연번": 59, "국가": "인도", "인증명": "BIS", "설명": "(인도제품인증)" },
      { "연번": 95, "국가": "인도", "인증명": "CDSCO", "설명": "(인도화장품등록)" },
    ];

    const filtered = filterSmeCertificationRecommendationsByProductRelevance(
      [
        { certName: "ARAI", rationale: "자동차 인증", confidence: "high", source: "ai" },
        { certName: "CDSCO", rationale: "화장품 등록", confidence: "high", source: "ai" },
      ],
      rows,
      { productName: "승용차, 상용차 등", hsCode: "870350" },
    );

    expect(filtered.map((item) => item.certName)).toEqual(["ARAI"]);
  });

  it("removes AI-selected food/cosmetic/medical/fertilizer certifications for DRAM", () => {
    const rows: SmeCertItem[] = [
      { "연번": 143, "국가": "베트남", "인증명": "DAV", "설명": "(베트남보건부의약청 화장품등록)" },
      { "연번": 152, "국가": "베트남", "인증명": "DMEC", "설명": "(베트남의료기기 수입허가)" },
      { "연번": 414, "국가": "베트남", "인증명": "PPD", "설명": "(베트남 비료허가)" },
      { "연번": 510, "국가": "베트남", "인증명": "VFA", "설명": "(베트남 식품 인허가)" },
    ];

    const filtered = filterSmeCertificationRecommendationsByProductRelevance(
      [
        { certName: "DAV", rationale: "화장품 등록", confidence: "high", source: "ai" },
        { certName: "DMEC", rationale: "의료기기 수입허가", confidence: "high", source: "ai" },
        { certName: "PPD", rationale: "비료허가", confidence: "medium", source: "ai" },
        { certName: "VFA", rationale: "식품 인허가", confidence: "medium", source: "ai" },
      ],
      rows,
      { productName: "반도체(DRAM)", hsCode: "854232" },
    );

    expect(filtered).toEqual([]);
  });
});
