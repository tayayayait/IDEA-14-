import { describe, expect, it } from "vitest";
import {
  buildCertificationMatchBasis,
  buildCertificationSearchAttempts,
  classifyKotraCertificationMatches,
  rankCertificationsByDetailRelevance,
  rankCertificationsByProductFallback,
  rankImportRegulationsByDetailRelevance,
  rankImportRegulationsByProductReview,
} from "../../supabase/functions/_shared/kotra-detail-tools";

describe("kotra-detail-tools", () => {
  const context = {
    countryCode: "JP",
    countryAliases: ["japan", "nippon"],
    hsCode: "285290",
    hskCode: "2852903000",
    productTokens: ["battery", "pack"],
  };

  it("keeps base_query even when attempt limit is reached", () => {
    const attempts = buildCertificationSearchAttempts({
      hsCode: "285290",
      hskCode: "2852903000",
      productName: "battery module",
      englishTerms: ["battery", "cell", "pack", "module"],
      tagTerms: ["secondary battery", "lithium"],
      countryTerms: ["JP", "Japan", "nippon"],
      maxAttempts: 3,
    });

    expect(attempts).toHaveLength(3);
    expect(attempts.at(-1)?.label).toBe("base_query");
    expect(attempts.at(-1)?.filters).toEqual({});
  });

  it("does not generate country-mixed search1 attempts", () => {
    const attempts = buildCertificationSearchAttempts({
      hsCode: "285290",
      hskCode: "2852903000",
      productName: "battery module",
      englishTerms: ["battery"],
      tagTerms: ["cell"],
      countryTerms: ["JP", "Japan"],
      maxAttempts: 20,
    });

    const labels = attempts.map((attempt) => attempt.label);
    expect(labels).not.toContain("keyword+country");
    expect(labels).not.toContain("country_only");

    for (const attempt of attempts) {
      const search1 = attempt.filters.search1?.toLowerCase() ?? "";
      expect(search1.includes("japan")).toBe(false);
      expect(search1.includes("jp")).toBe(false);
    }
  });

  it("does not generate keyword-only certification attempts", () => {
    const attempts = buildCertificationSearchAttempts({
      hsCode: "847330",
      hskCode: "8473304060",
      productName: "반도체(DRAM)",
      englishTerms: ["DRAM"],
      tagTerms: ["memory"],
      countryTerms: ["DE", "Germany"],
      maxAttempts: 20,
    });

    expect(attempts.map((attempt) => attempt.label)).not.toContain("keyword_only");
  });

  it("excludes certification rows with HS signal when product token is absent", () => {
    const ranked = rankCertificationsByDetailRelevance(
      [
        {
          systName: "Japan Battery Program",
          nttSj: "Battery compliance",
          hscd: "285290",
          nat: "Japan",
          regn: "Tokyo",
          ovrofInfo: "Tokyo Trade Center",
          applyTgtCmdltCn: "chemicals",
          expansApplyCmdltCn: "",
          cmdltDfnCn: "",
          systCn: "",
          basisRegltnCn: "",
          arcvCn: "",
          crtfcTyVal: "",
          othbcDt: "20251230",
          regDt: "20251230",
        },
      ],
      {
        ...context,
        productTokens: ["stroller"],
      },
    );

    expect(ranked).toEqual([]);
  });

  it("excludes certification rows when selected product token does not match the certification item", () => {
    const ranked = rankCertificationsByDetailRelevance(
      [
        certificationRow({
          systName: "Poland Dental Implant Program",
          nat: "Poland",
          hscd: "871500",
          applyTgtCmdltCn: "dental implant fixture",
          nttSj: "Dental implant import certification",
        }),
      ],
      {
        countryCode: "PL",
        countryAliases: ["poland", "republic of poland"],
        hsCode: "871500",
        hskCode: "8715000000",
        productTokens: ["stroller"],
      },
    );

    expect(ranked).toEqual([]);
  });

  it("excludes certification rows when country does not match the selected market", () => {
    const ranked = rankCertificationsByDetailRelevance(
      [
        certificationRow({
          systName: "China DRAM Program",
          nat: "China",
          hscd: "847330",
          applyTgtCmdltCn: "DRAM modules",
        }),
      ],
      {
        countryCode: "DE",
        countryAliases: ["germany", "deutschland"],
        hsCode: "847330",
        hskCode: "8473304060",
        productTokens: ["dram"],
      },
    );

    expect(ranked).toEqual([]);
  });

  it("does not match India certification context against Indonesia country text", () => {
    const ranked = rankCertificationsByDetailRelevance(
      [
        certificationRow({
          systName: "Indonesia DRAM Program",
          nat: "인도네시아",
          hscd: "847330",
          applyTgtCmdltCn: "DRAM modules",
        }),
      ],
      {
        countryCode: "IN",
        countryAliases: ["india", "인도"],
        hsCode: "847330",
        hskCode: "8473304060",
        productTokens: ["dram"],
      },
    );

    expect(ranked).toEqual([]);
  });

  it("excludes certification rows when HS differs even if country and product token match", () => {
    const ranked = rankCertificationsByDetailRelevance(
      [
        certificationRow({
          systName: "Germany DRAM Program",
          nat: "Germany",
          hscd: "842489",
          applyTgtCmdltCn: "DRAM modules",
        }),
      ],
      {
        countryCode: "DE",
        countryAliases: ["germany", "deutschland"],
        hsCode: "847330",
        hskCode: "8473304060",
        productTokens: ["dram"],
      },
    );

    expect(ranked).toEqual([]);
  });

  it("excludes certification rows with only HS4 prefix similarity", () => {
    const ranked = rankCertificationsByDetailRelevance(
      [
        certificationRow({
          systName: "Germany Peripheral Program",
          nat: "Germany",
          hscd: "847399",
          applyTgtCmdltCn: "DRAM modules",
        }),
      ],
      {
        countryCode: "DE",
        countryAliases: ["germany", "deutschland"],
        hsCode: "847330",
        hskCode: "8473304060",
        productTokens: ["dram"],
      },
    );

    expect(ranked).toEqual([]);
  });

  it("returns no certification rows when selected HS/HSK is missing", () => {
    const ranked = rankCertificationsByDetailRelevance(
      [
        certificationRow({
          systName: "Germany DRAM Program",
          nat: "Germany",
          hscd: "847330",
          applyTgtCmdltCn: "DRAM modules",
        }),
      ],
      {
        countryCode: "DE",
        countryAliases: ["germany", "deutschland"],
        hsCode: "",
        hskCode: "",
        productTokens: ["dram"],
      },
    );

    expect(ranked).toEqual([]);
  });

  it("keeps review-required certification fallback rows when country and product match but HS differs", () => {
    const ranked = rankCertificationsByProductFallback(
      [
        certificationRow({
          systName: "Germany DRAM Program",
          nat: "Germany",
          hscd: "842489",
          applyTgtCmdltCn: "DRAM modules",
        }),
        certificationRow({
          systName: "Germany DRAM Exact HS Program",
          nat: "Germany",
          hscd: "847330",
          applyTgtCmdltCn: "DRAM modules",
        }),
        certificationRow({
          systName: "Germany Unrelated Program",
          nat: "Germany",
          hscd: "999999",
          applyTgtCmdltCn: "medical device",
        }),
        certificationRow({
          systName: "China DRAM Program",
          nat: "China",
          hscd: "842489",
          applyTgtCmdltCn: "DRAM modules",
        }),
      ],
      {
        countryCode: "DE",
        countryAliases: ["germany", "deutschland"],
        hsCode: "847330",
        hskCode: "8473304060",
        productTokens: ["dram"],
      },
    );

    expect(ranked.map((item) => item.systName)).toEqual(["Germany DRAM Program"]);
  });

  it("ignores generic certification terms when ranking product fallback rows", () => {
    const ranked = rankCertificationsByProductFallback(
      [
        certificationRow({
          systName: "China Wireless Earphone Program",
          nat: "China",
          hscd: "851762",
          applyTgtCmdltCn: "무선 이어폰 인증 제품",
          systCn: "무선송신설비 형식승인",
        }),
        certificationRow({
          systName: "China Pesticide Program",
          nat: "China",
          hscd: "380891",
          applyTgtCmdltCn: "농약 제품 인증",
          systCn: "농약 등록",
        }),
      ],
      {
        countryCode: "CN",
        countryAliases: ["china", "중국", "중화인민공화국"],
        hsCode: "854232",
        hskCode: "8542321010",
        productTokens: ["dram", "반도체", "인증", "제품"],
      },
    );

    expect(ranked).toEqual([]);
  });

  it("ignores selected country aliases when ranking product fallback rows", () => {
    const ranked = rankCertificationsByProductFallback(
      [
        certificationRow({
          systName: "Germany General Product Program",
          nat: "Germany",
          hscd: "999999",
          applyTgtCmdltCn: "Germany product certification",
        }),
      ],
      {
        countryCode: "DE",
        countryAliases: ["germany", "deutschland"],
        hsCode: "847330",
        hskCode: "8473304060",
        productTokens: ["germany", "deutschland", "product", "certification"],
      },
    );

    expect(ranked).toEqual([]);
  });

  it("keeps certification rows only when selected country, HS, and product are compatible", () => {
    const ranked = rankCertificationsByDetailRelevance(
      [
        certificationRow({
          systName: "Germany Generic Electronics Program",
          nat: "Germany",
          hscd: "847330",
          applyTgtCmdltCn: "electronic parts",
          othbcDt: "20251229",
        }),
        certificationRow({
          systName: "Germany DRAM Program",
          nat: "Germany",
          hscd: "8473304060",
          applyTgtCmdltCn: "DRAM modules",
          othbcDt: "20251228",
        }),
      ],
      {
        countryCode: "DE",
        countryAliases: ["germany", "deutschland"],
        hsCode: "847330",
        hskCode: "8473304060",
        productTokens: ["dram"],
      },
    );

    expect(ranked.map((item) => item.systName)).toEqual(["Germany DRAM Program"]);
  });

  it("classifies HS strong certification matches as confirmed only after product and category checks", () => {
    const result = classifyKotraCertificationMatches(
      [
        certificationRow({
          systName: "Vietnam Wireless Communication Device Program",
          nat: "Socialist Republic of Vietnam",
          hscd: "851762",
          applyTgtCmdltCn: "wireless communication device",
          nttSj: "Wireless communication device certification",
        }),
        certificationRow({
          systName: "Vietnam Food Device Program",
          nat: "Vietnam",
          hscd: "851762",
          applyTgtCmdltCn: "food additive device",
          nttSj: "Food certification",
        }),
      ],
      {
        countryCode: "VN",
        countryAliases: ["Vietnam", "Socialist Republic of Vietnam"],
        hsCode: "851762",
        hskCode: "8517629000",
        productName: "wireless communication device",
        productTokens: ["wireless", "communication", "device"],
      },
    );

    expect(result.confirmed.map((row) => row.item.systName)).toEqual([
      "Vietnam Wireless Communication Device Program",
    ]);
    expect(result.excluded.map((row) => row.item.systName)).toContain("Vietnam Food Device Program");
  });

  it("allows HS-missing certification rows only as review when product relevance is strong", () => {
    const result = classifyKotraCertificationMatches(
      [
        certificationRow({
          systName: "Vietnam Wireless Device No HS Program",
          nat: "Vietnam",
          hscd: "",
          applyTgtCmdltCn: "wireless communication device",
          nttSj: "Wireless communication device certification",
        }),
        certificationRow({
          systName: "Vietnam General Product No HS Program",
          nat: "Vietnam",
          hscd: "",
          applyTgtCmdltCn: "general product certification",
          nttSj: "General product certification",
        }),
      ],
      {
        countryCode: "VN",
        countryAliases: ["Vietnam", "Socialist Republic of Vietnam"],
        hsCode: "851762",
        hskCode: "8517629000",
        productName: "wireless communication device",
        productTokens: ["wireless", "communication", "device"],
      },
    );

    expect(result.confirmed).toEqual([]);
    expect(result.review.map((row) => row.item.systName)).toEqual(["Vietnam Wireless Device No HS Program"]);
    expect(result.excluded.map((row) => row.item.systName)).toContain("Vietnam General Product No HS Program");
  });

  it("keeps HS partial certification matches out of confirmed results", () => {
    const result = classifyKotraCertificationMatches(
      [
        certificationRow({
          systName: "Vietnam Wireless Device HS4 Program",
          nat: "Vietnam",
          hscd: "851700",
          applyTgtCmdltCn: "wireless communication device",
          nttSj: "Wireless communication device certification",
        }),
      ],
      {
        countryCode: "VN",
        countryAliases: ["Vietnam", "Socialist Republic of Vietnam"],
        hsCode: "851762",
        hskCode: "8517629000",
        productName: "wireless communication device",
        productTokens: ["wireless", "communication", "device"],
      },
    );

    expect(result.confirmed).toEqual([]);
    expect(result.review.map((row) => row.item.systName)).toEqual(["Vietnam Wireless Device HS4 Program"]);
  });

  it("builds certification match basis from selected market, HS/HSK, and product", () => {
    expect(
      buildCertificationMatchBasis({
        countryName: "독일연방공화국(The Federal Republic of Germany)",
        countryCode: "DE",
        hsCode: "847330",
        hskCode: "8473304060",
        productName: "반도체(DRAM)",
      }),
    ).toBe("국가=독일연방공화국(The Federal Republic of Germany) / HS=847330 / HSK=8473304060 / 제품명=반도체(DRAM)");
  });

  it("keeps confirmed regulation rows only for selected import country, Korean/global origin, and HS6 match", () => {
    const ranked = rankImportRegulationsByDetailRelevance(
      [
        {
          HQURT_NAME: "North America HQ",
          CMDLT_NAME: "general battery product",
          HSCD: "285290",
          HSCD_CN: "",
          REG_DT: "20251230",
          REGL_CN: "korea origin hs match",
          ISO_WD2_NAT_CD: "US",
          REGL_STR_DE: "20251230",
          REGL_END_DE: "",
          PROBE_TGT_NAT_NAME: "Republic of Korea",
        },
        {
          HQURT_NAME: "North America HQ",
          CMDLT_NAME: "general battery product",
          HSCD: "285290",
          HSCD_CN: "",
          REG_DT: "20251231",
          REGL_CN: "global origin hs match",
          ISO_WD2_NAT_CD: "US",
          REGL_STR_DE: "20251231",
          REGL_END_DE: "",
          PROBE_TGT_NAT_NAME: "All countries",
        },
        {
          HQURT_NAME: "North America HQ",
          CMDLT_NAME: "general battery product",
          HSCD: "285290",
          HSCD_CN: "",
          REG_DT: "20251229",
          REGL_CN: "china origin should be excluded",
          ISO_WD2_NAT_CD: "US",
          REGL_STR_DE: "20251229",
          REGL_END_DE: "",
          PROBE_TGT_NAT_NAME: "China",
        },
        {
          HQURT_NAME: "North America HQ",
          CMDLT_NAME: "battery pack safety",
          HSCD: "999999",
          HSCD_CN: "",
          REG_DT: "20251228",
          REGL_CN: "product only should be excluded",
          ISO_WD2_NAT_CD: "US",
          REGL_STR_DE: "20251228",
          REGL_END_DE: "",
          PROBE_TGT_NAT_NAME: "Republic of Korea",
        },
      ],
      {
        countryCode: "US",
        countryAliases: ["united states", "usa"],
        hsCode: "285290",
        hskCode: "2852903000",
        productTokens: ["battery", "pack"],
      },
    );

    expect(ranked.map((item) => item.REGL_CN)).toEqual([
      "global origin hs match",
      "korea origin hs match",
    ]);
  });

  it("keeps review regulation candidates only when selected country and Korean/global origin match but HS does not", () => {
    const ranked = rankImportRegulationsByProductReview(
      [
        {
          HQURT_NAME: "North America HQ",
          CMDLT_NAME: "battery pack safety",
          HSCD: "999999",
          HSCD_CN: "",
          REG_DT: "20251231",
          REGL_CN: "korea origin product review",
          ISO_WD2_NAT_CD: "US",
          REGL_STR_DE: "20251231",
          REGL_END_DE: "",
          PROBE_TGT_NAT_NAME: "Republic of Korea",
        },
        {
          HQURT_NAME: "North America HQ",
          CMDLT_NAME: "battery pack safety",
          HSCD: "999999",
          HSCD_CN: "",
          REG_DT: "20251230",
          REGL_CN: "china origin should not be review",
          ISO_WD2_NAT_CD: "US",
          REGL_STR_DE: "20251230",
          REGL_END_DE: "",
          PROBE_TGT_NAT_NAME: "China",
        },
        {
          HQURT_NAME: "Tokyo HQ",
          CMDLT_NAME: "battery pack safety",
          HSCD: "999999",
          HSCD_CN: "",
          REG_DT: "20251229",
          REGL_CN: "wrong import country should not be review",
          ISO_WD2_NAT_CD: "JP",
          REGL_STR_DE: "20251229",
          REGL_END_DE: "",
          PROBE_TGT_NAT_NAME: "Republic of Korea",
        },
      ],
      {
        countryCode: "US",
        countryAliases: ["united states", "usa"],
        hsCode: "285290",
        hskCode: "2852903000",
        productTokens: ["battery", "pack"],
      },
    );

    expect(ranked.map((item) => item.REGL_CN)).toEqual(["korea origin product review"]);
  });

  it("does not promote unrelated regulation rows from generic material tokens", () => {
    const ranked = rankImportRegulationsByProductReview(
      [
        {
          HQURT_NAME: "North America HQ",
          CMDLT_NAME: "Certain Aluminum Foil",
          HSCD: "7606",
          HSCD_CN: "aluminum sheet and foil",
          REG_DT: "20231127",
          REGL_CN: "anti-dumping circumvention",
          ISO_WD2_NAT_CD: "US",
          REGL_STR_DE: "20231127",
          REGL_END_DE: "",
          PROBE_TGT_NAT_NAME: "Republic of Korea",
        },
        {
          HQURT_NAME: "North America HQ",
          CMDLT_NAME: "Polyethylene terephthalate sheet",
          HSCD: "392062",
          HSCD_CN: "plastic sheet",
          REG_DT: "20200910",
          REGL_CN: "anti-dumping",
          ISO_WD2_NAT_CD: "US",
          REGL_STR_DE: "20200910",
          REGL_END_DE: "",
          PROBE_TGT_NAT_NAME: "Republic of Korea",
        },
      ],
      {
        countryCode: "US",
        countryAliases: ["united states", "usa"],
        hsCode: "871500",
        hskCode: "8715000000",
        productTokens: ["stroller", "baby", "infant", "aluminum", "sheet"],
      },
    );

    expect(ranked).toEqual([]);
  });

  it("marks HS4 plus strong product matches as priority 3 review candidates", () => {
    const ranked = rankImportRegulationsByProductReview(
      [
        {
          HQURT_NAME: "North America HQ",
          CMDLT_NAME: "stroller frame",
          HSCD: "871599",
          HSCD_CN: "parts of vehicles",
          REG_DT: "20251231",
          REGL_CN: "product review candidate",
          ISO_WD2_NAT_CD: "US",
          REGL_STR_DE: "20251231",
          REGL_END_DE: "",
          PROBE_TGT_NAT_NAME: "Republic of Korea",
        },
      ],
      {
        countryCode: "US",
        countryAliases: ["united states", "usa"],
        hsCode: "871500",
        hskCode: "8715000000",
        productTokens: ["stroller"],
      },
    );

    expect(ranked).toHaveLength(1);
    expect(ranked[0].__match_priority).toBe(3);
    expect(ranked[0].__matched_tokens).toEqual(["stroller"]);
  });

  it("marks country plus strong product matches without HS support as priority 4 review candidates", () => {
    const ranked = rankImportRegulationsByProductReview(
      [
        {
          HQURT_NAME: "North America HQ",
          CMDLT_NAME: "stroller restraint system",
          HSCD: "950300",
          HSCD_CN: "children goods",
          REG_DT: "20251231",
          REGL_CN: "product-only review candidate",
          ISO_WD2_NAT_CD: "US",
          REGL_STR_DE: "20251231",
          REGL_END_DE: "",
          PROBE_TGT_NAT_NAME: "Republic of Korea",
        },
      ],
      {
        countryCode: "US",
        countryAliases: ["united states", "usa"],
        hsCode: "871500",
        hskCode: "8715000000",
        productTokens: ["stroller"],
      },
    );

    expect(ranked).toHaveLength(1);
    expect(ranked[0].__match_priority).toBe(4);
    expect(ranked[0].__matched_tokens).toEqual(["stroller"]);
  });
});

function certificationRow(
  overrides: Partial<Parameters<typeof rankCertificationsByDetailRelevance>[0][number]>,
): Parameters<typeof rankCertificationsByDetailRelevance>[0][number] {
  return {
    systName: "",
    nttSj: "",
    hscd: "",
    nat: "",
    regn: "",
    ovrofInfo: "",
    applyTgtCmdltCn: "",
    expansApplyCmdltCn: "",
    cmdltDfnCn: "",
    systCn: "",
    basisRegltnCn: "",
    arcvCn: "",
    crtfcTyVal: "",
    othbcDt: "20251230",
    regDt: "20251230",
    ...overrides,
  };
}
