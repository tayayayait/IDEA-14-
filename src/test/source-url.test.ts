import { describe, expect, it } from "vitest";
import {
  KOTRA_PUBLIC_SOURCE_URLS,
  KSURE_PUBLIC_SOURCE_URLS,
  TRADE_SECURITY_PUBLIC_SOURCE_URL,
  buildSafetyKoreaRecallDetailUrl,
  buildKotraCertDetailUrl,
  buildKotraRegDetailUrl,
  resolveSafetyKoreaRecallDetailUrl,
  toPublicSourceUrl,
} from "@/lib/source-url";

describe("source URL normalization", () => {
  it("maps KOTRA authenticated API URLs to public KOTRA pages", () => {
    expect(toPublicSourceUrl("https://apis.data.go.kr/B410001/DS00000128/getDS00000128")).toBe(
      KOTRA_PUBLIC_SOURCE_URLS.importRegulation,
    );
    expect(toPublicSourceUrl("https://apis.data.go.kr/B410001/overseasAuthInfo/getOverseasAuthInfo")).toBe(
      KOTRA_PUBLIC_SOURCE_URLS.overseasCertification,
    );
  });

  it("maps K-SURE API URLs to K-Sight detail pages", () => {
    expect(toPublicSourceUrl("https://apis.data.go.kr/B552696/countrygrade/credit-grade")).toBe(
      KSURE_PUBLIC_SOURCE_URLS.countryGrade,
    );
    expect(toPublicSourceUrl("https://apis.data.go.kr/B552696/ksight/riskindex")).toBe(
      KSURE_PUBLIC_SOURCE_URLS.industryRiskIndex,
    );
    expect(toPublicSourceUrl("https://apis.data.go.kr/B552696/exportPayment/getPaymentInfo")).toBe(
      KSURE_PUBLIC_SOURCE_URLS.exportPayment,
    );
  });

  it("maps previous K-SURE data.go.kr OpenAPI guide pages to K-Sight pages", () => {
    expect(toPublicSourceUrl("https://www.data.go.kr/data/15140201/openapi.do")).toBe(
      KSURE_PUBLIC_SOURCE_URLS.countryGrade,
    );
    expect(toPublicSourceUrl("https://www.data.go.kr/data/15132755/openapi.do")).toBe(
      KSURE_PUBLIC_SOURCE_URLS.industryRiskIndex,
    );
    expect(toPublicSourceUrl("https://www.data.go.kr/data/15144259/openapi.do")).toBe(
      KSURE_PUBLIC_SOURCE_URLS.exportPayment,
    );
  });

  it("ensures K-SURE source URLs are K-Sight pages, not API endpoints or OpenAPI guides", () => {
    const values = Object.values(KSURE_PUBLIC_SOURCE_URLS);
    for (const url of values) {
      expect(url).toContain("ksight.ksure.or.kr");
      expect(url).not.toContain("apis.data.go.kr");
      expect(url).not.toContain("data.go.kr/data/");
    }
  });

  it("keeps already public source URLs unchanged", () => {
    const url = "https://dream.kotra.or.kr/dream/cms/com/index.do?MENU_ID=3700";
    expect(toPublicSourceUrl(url)).toBe(url);
  });

  it("maps yestrade openapi URL to public portal URL", () => {
    expect(toPublicSourceUrl("https://yestrade.go.kr/openapi")).toBe(TRADE_SECURITY_PUBLIC_SOURCE_URL);
    expect(toPublicSourceUrl("https://www.yestrade.go.kr/openapi")).toBe(TRADE_SECURITY_PUBLIC_SOURCE_URL);
  });

  it("maps SafetyKorea recallInfo URLs to working public detail pages", () => {
    expect(toPublicSourceUrl("https://www.safetykorea.kr/recall/recallInfo?recallUid=10021711")).toBe(
      "https://www.safetykorea.kr/recall/ajax/recallBoard?recallUid=10021711",
    );
    expect(toPublicSourceUrl("https://www.safetykorea.kr/recall/fRecallInfo?fRecallUid=10031501")).toBe(
      "https://www.safetykorea.kr/recall/ajax/fRecallBoard?recallUid=10031501",
    );
  });
});

describe("deep link builders", () => {
  it("builds certification deep link correctly", () => {
    const base = KOTRA_PUBLIC_SOURCE_URLS.overseasCertification;
    expect(buildKotraCertDetailUrl(null)).toBe(base);
    expect(buildKotraCertDetailUrl({})).toBe(base);
    expect(buildKotraCertDetailUrl({ subject: "PSE" })).toBe(`${base}&sSearchVal=PSE`);
    expect(buildKotraCertDetailUrl({ subject: " ", country: "일본" })).toBe(
      `${base}&sSearchVal=%EC%9D%BC%EB%B3%B8`,
    );
  });

  it("builds regulation source link with country preselection", () => {
    const base = KOTRA_PUBLIC_SOURCE_URLS.importRegulation;

    expect(buildKotraRegDetailUrl({ country_code_iso2: "MY" })).toBe(`${base}&pRegnCd=01&pNatCd=458`);
    expect(buildKotraRegDetailUrl({ country_code: "vn" })).toBe(`${base}&pRegnCd=01&pNatCd=704`);
    expect(buildKotraRegDetailUrl({ iso_wd2_nat_cd: "US" })).toBe(`${base}&pRegnCd=04&pNatCd=842`);
    expect(buildKotraRegDetailUrl({ ISO_WD2_NAT_CD: "JP" })).toBe(`${base}&pRegnCd=01&pNatCd=392`);
  });

  it("prefers selected country over raw ISO2 when building regulation source link", () => {
    const base = KOTRA_PUBLIC_SOURCE_URLS.importRegulation;
    expect(buildKotraRegDetailUrl({ country_code_iso2: "UA" }, { countryCodeIso2: "MY" })).toBe(
      `${base}&pRegnCd=01&pNatCd=458`,
    );
  });

  it("falls back to base regulation URL for unsupported country code", () => {
    const base = KOTRA_PUBLIC_SOURCE_URLS.importRegulation;
    expect(buildKotraRegDetailUrl(null)).toBe(base);
    expect(buildKotraRegDetailUrl({})).toBe(base);
    expect(buildKotraRegDetailUrl({ country_code_iso2: "XX" })).toBe(base);
    expect(buildKotraRegDetailUrl({ hs_code: "3901" })).toBe(base);
  });

  it("builds SafetyKorea recall detail links from record ids", () => {
    expect(buildSafetyKoreaRecallDetailUrl("10021711", "domestic")).toBe(
      "https://www.safetykorea.kr/recall/ajax/recallBoard?recallUid=10021711",
    );
    expect(buildSafetyKoreaRecallDetailUrl("10031501", "foreign")).toBe(
      "https://www.safetykorea.kr/recall/ajax/fRecallBoard?recallUid=10031501",
    );
  });

  it("repairs generic or legacy SafetyKorea recall URLs with the stored record id", () => {
    expect(resolveSafetyKoreaRecallDetailUrl("https://www.safetykorea.kr/release/recall", "10021711", "domestic")).toBe(
      "https://www.safetykorea.kr/recall/ajax/recallBoard?recallUid=10021711",
    );
    expect(resolveSafetyKoreaRecallDetailUrl("https://www.safetykorea.kr/recall/fRecallInfo?fRecallUid=10031501", null, "foreign")).toBe(
      "https://www.safetykorea.kr/recall/ajax/fRecallBoard?recallUid=10031501",
    );
  });
});
