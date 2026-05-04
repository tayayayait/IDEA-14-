import { describe, expect, it } from "vitest";
import {
  buildWtoEpingTermPlan,
  classifyWtoEpingNotification,
  buildWtoEpingSearchUrl,
  buildWtoEpingSummary,
  normalizeWtoEpingNotification,
  resolveWtoEpingCountryIds,
} from "../../supabase/functions/_shared/wto-eping";

describe("wto-eping", () => {
  it("maps target market ISO2 codes to WTO ePing member ids", () => {
    expect(resolveWtoEpingCountryIds("CN")).toEqual(["C156"]);
    expect(resolveWtoEpingCountryIds("DE")).toEqual(["C276", "U918"]);
    expect(resolveWtoEpingCountryIds("PL")).toEqual(["C616", "U918"]);
    expect(resolveWtoEpingCountryIds("ZZ")).toEqual([]);
  });

  it("builds the official WTO ePing notification search URL", () => {
    const url = new URL(
      buildWtoEpingSearchUrl("https://api.wto.org/eping/notifications/search", {
        countryIds: ["C156"],
        hsCode: "8542321010",
        page: 2,
        pageSize: 5,
      }),
    );

    expect(url.origin + url.pathname).toBe("https://api.wto.org/eping/notifications/search");
    expect(url.searchParams.get("language")).toBe("1");
    expect(url.searchParams.get("countryIds")).toBe("C156");
    expect(url.searchParams.get("hs")).toBe("854232");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("pageSize")).toBe("5");
  });

  it("supports HS4 and freeText search parameters from the official ePing API", () => {
    const hs4Url = new URL(
      buildWtoEpingSearchUrl("https://api.wto.org/eping/notifications/search", {
        countryIds: ["C840"],
        hsCode: "8542",
      }),
    );
    const freeTextUrl = new URL(
      buildWtoEpingSearchUrl("https://api.wto.org/eping/notifications/search", {
        countryIds: ["C840"],
        freeText: "DRAM",
      }),
    );

    expect(hs4Url.searchParams.get("hs")).toBe("8542");
    expect(freeTextUrl.searchParams.get("freeText")).toBe("DRAM");
    expect(freeTextUrl.searchParams.has("hs")).toBe(false);
  });

  it("builds exact and product-family freeText terms for WTO ePing search", () => {
    const plan = buildWtoEpingTermPlan({
      productName: "반도체(DRAM)",
      productDescription: "memory semiconductor device",
      productTags: ["memory"],
      hsCode: "854232",
      englishTerms: ["DRAM"],
      tagTerms: [],
    });

    expect(plan.exactTerms).toContain("DRAM");
    expect(plan.familyTerms).toContain("semiconductor memory");
    expect(plan.familyTerms).toContain("integrated circuits");
    expect(plan.familyTerms).toContain("memory");
  });

  it("classifies WTO ePing results as direct, broad, or excluded for semiconductor memory", () => {
    const context = {
      hsCode: "854232",
      exactTerms: ["DRAM"],
      familyTerms: ["semiconductor memory", "integrated circuits", "memory"],
    };

    const direct = classifyWtoEpingNotification({
      documentSymbol: "G/TBT/N/AAA/1",
      title: "DRAM conformity assessment",
      productsText: "Electronic integrated circuits; DRAM memory",
      hsCodeText: "854232",
      notifyingMember: "Example",
      notificationType: "Regular notification",
      area: "TBT",
      distributionDate: "2026-01-01",
      commentDeadlineDate: "",
      sourceUrl: "",
      queryType: "exact_product",
      matchText: "DRAM",
    }, context);
    const memoryStorage = classifyWtoEpingNotification({
      documentSymbol: "G/TBT/N/VNM/239",
      title: "cryptographic technical specifications used in civil cryptography products under data storage security products group",
      productsText: "8471 - Automatic data processing machines and units thereof",
      hsCodeText: "8471",
      notifyingMember: "Viet Nam",
      notificationType: "Regular notification",
      area: "TBT",
      distributionDate: "2022-10-25",
      commentDeadlineDate: "",
      sourceUrl: "",
      queryType: "product_family",
      matchText: "memory",
    }, context);
    const mobileSar = classifyWtoEpingNotification({
      documentSymbol: "G/TBT/N/VNM/298",
      title: "Draft National technical regulation on Specific Absorption Rates for Mobile Phone",
      productsText: "Mobile phone using E-UTRA technology; HS code 8517.13.00",
      hsCodeText: "85171",
      notifyingMember: "Viet Nam",
      notificationType: "Regular notification",
      area: "TBT",
      distributionDate: "2024-05-27",
      commentDeadlineDate: "",
      sourceUrl: "",
      queryType: "product_family",
      matchText: "integrated circuits",
    }, context);
    const cosmetics = classifyWtoEpingNotification({
      documentSymbol: "G/TBT/N/VNM/393",
      title: "Draft Decree on the Management of Cosmetics",
      productsText: "Cosmetics",
      hsCodeText: "33",
      notifyingMember: "Viet Nam",
      notificationType: "Regular notification",
      area: "TBT",
      distributionDate: "2026-03-02",
      commentDeadlineDate: "",
      sourceUrl: "",
      queryType: "product_family",
      matchText: "electronic integrated circuits",
    }, context);
    const chapter85 = classifyWtoEpingNotification({
      documentSymbol: "G/TBT/N/USA/1598",
      title: "Human Exposure to Radiofrequency Electromagnetic Fields",
      productsText: "Radiofrequency electromagnetic fields",
      hsCodeText: "85",
      notifyingMember: "United States of America",
      notificationType: "Regular notification",
      area: "TBT",
      distributionDate: "2020-04-07",
      commentDeadlineDate: "",
      sourceUrl: "",
      queryType: "hs6",
      matchText: "854232",
    }, context);

    expect(direct.classification).toBe("direct_candidate");
    expect(memoryStorage.classification).toBe("broad_reference");
    expect(mobileSar.classification).toBe("broad_reference");
    expect(cosmetics.classification).toBe("excluded_noise");
    expect(chapter85.classification).not.toBe("direct_candidate");
  });

  it("normalizes notification payloads for display and storage", () => {
    const item = normalizeWtoEpingNotification({
      documentSymbol: "G/TBT/N/CHN/2149",
      title: "<p>Integrated circuit test rules</p>",
      products: "Integrated circuits",
      hsCodes: "8542",
      distributionDate: "2025-11-26T00:00:00",
      notifyingMember: { name: "China" },
      notificationType: { name: "TBT" },
      notifiedDocumentLink: "https://example.test/notification",
    });

    expect(item.documentSymbol).toBe("G/TBT/N/CHN/2149");
    expect(item.title).toBe("Integrated circuit test rules");
    expect(item.productsText).toBe("Integrated circuits");
    expect(item.hsCodeText).toBe("8542");
    expect(item.notifyingMember).toBe("China");
    expect(item.area).toBe("TBT");
    expect(item.distributionDate).toBe("2025-11-26");
    expect(item.sourceUrl).toBe("https://example.test/notification");
  });

  it("summarizes the fields a reviewer needs first", () => {
    const summary = buildWtoEpingSummary({
      documentSymbol: "G/TBT/N/CHN/2149",
      title: "Integrated circuit test rules",
      productsText: "Integrated circuits",
      hsCodeText: "8542",
      notifyingMember: "China",
      notificationType: "Regular notification",
      area: "TBT",
      distributionDate: "2025-11-26",
      commentDeadlineDate: "2026-01-25",
      sourceUrl: "https://example.test/notification",
    });

    expect(summary).toContain("TBT");
    expect(summary).toContain("G/TBT/N/CHN/2149");
    expect(summary).toContain("Integrated circuits");
    expect(summary).toContain("HS: 8542");
  });
});
