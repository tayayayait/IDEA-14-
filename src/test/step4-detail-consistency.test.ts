import { describe, expect, it } from "vitest";
import {
  filterRowsByCurrentDetailContext,
  getCertificationSourceKind,
  getRegulationSourceKind,
  getSuccessfulDetailRows,
  isCertificationReviewRequired,
  isIndustryMatchFailed,
  isKsureCategory,
  pickPlaceholderState,
  readDetailRowState,
  resolveCountryDetailApiState,
  resolveMatchedCountForDisplay,
  resolveSectionState,
} from "@/lib/step4-detail-consistency";

describe("step4-detail-consistency", () => {
  it("reads detail_state from raw payload", () => {
    expect(readDetailRowState({ raw: { detail_state: "success" } })).toBe("success");
    expect(readDetailRowState({ raw: { detail_state: "empty" } })).toBe("empty");
    expect(readDetailRowState({ raw: { detail_state: "error" } })).toBe("error");
    expect(readDetailRowState({ raw: { detail_state: "stale" } })).toBe("stale");
    expect(readDetailRowState({ raw: { detail_state: "unknown" } })).toBeNull();
  });

  it("filters placeholder rows from successful rows", () => {
    const rows = [
      { raw: { detail_state: "success" }, id: "a" },
      { raw: { detail_state: "empty" }, id: "b" },
      { raw: { detail_state: "error" }, id: "c" },
      { raw: { detail_state: "stale" }, id: "d" },
    ];
    const successful = getSuccessfulDetailRows(rows);
    expect(successful).toHaveLength(1);
    expect(successful[0].id).toBe("a");
  });

  it("detects placeholder state priority", () => {
    expect(pickPlaceholderState([{ raw: { detail_state: "empty" } }])).toBe("empty");
    expect(pickPlaceholderState([{ raw: { detail_state: "stale" } }])).toBe("stale");
    expect(pickPlaceholderState([{ raw: { detail_state: "error" } }])).toBe("error");
    expect(
      pickPlaceholderState([{ raw: { detail_state: "stale" } }, { raw: { detail_state: "empty" } }]),
    ).toBe("stale");
    expect(
      pickPlaceholderState([{ raw: { detail_state: "stale" } }, { raw: { detail_state: "error" } }]),
    ).toBe("error");
  });

  it("resolves section state", () => {
    expect(resolveSectionState({ detailExecuted: false, successfulRowCount: 0, placeholderState: null })).toBe("not_run");
    expect(resolveSectionState({ detailExecuted: true, successfulRowCount: 2, placeholderState: null })).toBe("ready");
    expect(resolveSectionState({ detailExecuted: true, successfulRowCount: 0, placeholderState: "empty" })).toBe("empty");
    expect(resolveSectionState({ detailExecuted: true, successfulRowCount: 0, placeholderState: "stale" })).toBe("stale");
    expect(resolveSectionState({ detailExecuted: true, successfulRowCount: 0, placeholderState: "error" })).toBe("error");
  });

  it("uses recommendation count before detail run, row count after detail run", () => {
    expect(resolveMatchedCountForDisplay({ detailExecuted: false, matchedCount: 15, successfulRowCount: 0 })).toBe(15);
    expect(resolveMatchedCountForDisplay({ detailExecuted: true, matchedCount: 15, successfulRowCount: 9 })).toBe(9);
  });

  it("identifies K-SURE categories only", () => {
    expect(isKsureCategory("k_sure")).toBe(true);
    expect(isKsureCategory("k_sure_industry")).toBe(true);
    expect(isKsureCategory("k_sure_payment")).toBe(true);
    expect(isKsureCategory("news")).toBe(false);
    expect(isKsureCategory(null)).toBe(false);
  });

  it("detects K-SURE industry mapping mismatch flag", () => {
    expect(isIndustryMatchFailed({ industry_match_failed: true })).toBe(true);
    expect(isIndustryMatchFailed({ industry_match_failed: "true" })).toBe(true);
    expect(isIndustryMatchFailed({ industry_match_failed: "false" })).toBe(false);
    expect(isIndustryMatchFailed({ industry_match_failed: false })).toBe(false);
    expect(isIndustryMatchFailed(null)).toBe(false);
  });

  it("renders country-detail as success when invoke succeeds", () => {
    expect(
      resolveCountryDetailApiState({
        ok: true,
        resultState: "idle",
        responseState: "success",
        hasLoadedDetailRows: false,
      }),
    ).toBe("success");
    expect(
      resolveCountryDetailApiState({
        ok: true,
        resultState: "idle",
        responseState: "partial_success",
        hasLoadedDetailRows: true,
      }),
    ).toBe("partial_success");
  });

  it("renders country-detail as failure or partial-success on invoke failure", () => {
    expect(
      resolveCountryDetailApiState({
        ok: false,
        resultState: "error",
        responseState: null,
        hasLoadedDetailRows: false,
      }),
    ).toBe("error");
    expect(
      resolveCountryDetailApiState({
        ok: false,
        resultState: "error",
        responseState: null,
        hasLoadedDetailRows: true,
      }),
    ).toBe("partial_success");
  });

  it("passes through stale response state", () => {
    expect(
      resolveCountryDetailApiState({
        ok: true,
        resultState: "success",
        responseState: "stale",
        hasLoadedDetailRows: true,
      }),
    ).toBe("stale");
  });

  it("excludes rows saved for a different product and HS context", () => {
    const rows = [
      {
        id: "old",
        raw: {
          detail_state: "success",
          input_country_code: "DE",
          input_product_name: "DRAM module",
          input_hs_code: "847330",
          hs_code: "847330",
          applicable_items: "DRAM modules",
        },
      },
      {
        id: "current",
        raw: {
          detail_state: "success",
          input_country_code: "DE",
          input_product_name: "stroller",
          input_hs_code: "871500",
          hs_code: "871500",
          applicable_items: "stroller safety",
        },
      },
    ];

    const filtered = filterRowsByCurrentDetailContext(rows, {
      countryCode: "DE",
      productName: "stroller",
      hsCode: "871500",
      hskCode: "8715000000",
    }, "certification");

    expect(filtered.map((row) => row.id)).toEqual(["current"]);
  });

  it("excludes saved certification rows whose stored input matches but item text does not match the current product", () => {
    const rows = [
      {
        id: "wireless-earphone",
        raw: {
          detail_state: "success",
          input_country_code: "CN",
          input_product_name: "반도체(DRAM)",
          input_hs_code: "854232",
          input_hsk_code: "8542321010",
          hs_code: "851762",
          match_confidence: "review_required",
          match_strategy: "country_product_fallback",
          match_basis: "국가=중화인민공화국 / HS=854232 / HSK=8542321010 / 제품명=반도체(DRAM)",
          applicable_items: "무선 이어폰 인증 제품",
          raw_system_desc: "무선송신설비 형식승인",
        },
      },
    ];

    const filtered = filterRowsByCurrentDetailContext(rows, {
      countryCode: "CN",
      productName: "반도체(DRAM)",
      hsCode: "854232",
      hskCode: "8542321010",
    }, "certification");

    expect(filtered).toEqual([]);
  });

  it("keeps saved certification rows when stored input and item text both match the current product", () => {
    const rows = [
      {
        id: "dram",
        raw: {
          detail_state: "success",
          input_country_code: "CN",
          input_product_name: "반도체(DRAM)",
          input_hs_code: "854232",
          input_hsk_code: "8542321010",
          hs_code: "854232",
          applicable_items: "DRAM memory module semiconductor",
        },
      },
    ];

    const filtered = filterRowsByCurrentDetailContext(rows, {
      countryCode: "CN",
      productName: "반도체(DRAM)",
      hsCode: "854232",
      hskCode: "8542321010",
    }, "certification");

    expect(filtered.map((row) => row.id)).toEqual(["dram"]);
  });

  it("keeps only legacy certification rows with both HS and product text evidence", () => {
    const rows = [
      {
        id: "implant",
        raw: {
          detail_state: "success",
          hs_code: "871500",
          applicable_items: "dental implant fixture",
        },
      },
      {
        id: "stroller",
        raw: {
          detail_state: "success",
          hs_code: "8715000000",
          applicable_items: "stroller safety equipment",
        },
      },
    ];

    const filtered = filterRowsByCurrentDetailContext(rows, {
      countryCode: "PL",
      productName: "stroller",
      hsCode: "871500",
      hskCode: "8715000000",
    }, "certification");

    expect(filtered.map((row) => row.id)).toEqual(["stroller"]);
  });

  it("does not count review-required certification rows as confirmed rows", () => {
    const rows = [
      { id: "confirmed", raw: { detail_state: "success", match_confidence: "high" } },
      {
        id: "review",
        raw: {
          detail_state: "success",
          match_confidence: "review_required",
          match_strategy: "country_product_fallback",
        },
      },
    ];

    const confirmed = rows.filter((row) => !isCertificationReviewRequired(row));
    const review = rows.filter(isCertificationReviewRequired);

    expect(confirmed.map((row) => row.id)).toEqual(["confirmed"]);
    expect(review.map((row) => row.id)).toEqual(["review"]);
  });

  it("classifies certification source rows by source_org and raw.source_type", () => {
    expect(getCertificationSourceKind({
      source_org: "KOTRA",
      raw: { source_type: "kotra_overseas_cert" },
    })).toBe("kotra_overseas_cert");
    expect(getCertificationSourceKind({
      source_org: "중소벤처기업부 (AI 분석)",
      raw: { source_type: "sme_overseas_cert" },
    })).toBe("sme_overseas_cert");
    expect(getCertificationSourceKind({
      source_org: "Unknown",
      raw: { source_type: "manual" },
    })).toBe("unknown_certification");
  });

  it("classifies regulation source rows without mixing KOTRA and WTO ePing", () => {
    expect(getRegulationSourceKind({
      source_org: "KOTRA",
      raw: { source_type: "csv_backup" },
    })).toBe("kotra_import_regulation");
    expect(getRegulationSourceKind({
      source_org: "WTO ePing",
      raw: { source_type: "wto_eping" },
    })).toBe("wto_eping");
    expect(getRegulationSourceKind({
      source_org: "Unknown",
      raw: { source_type: "manual" },
    })).toBe("unknown_regulation");
  });

  it("resolves current-context mismatch-only rows as empty after filtering", () => {
    const rows = [
      {
        raw: {
          detail_state: "success",
          input_product_name: "DRAM module",
          input_hs_code: "847330",
          applicable_items: "DRAM modules",
        },
      },
    ];
    const filtered = filterRowsByCurrentDetailContext(rows, {
      productName: "stroller",
      hsCode: "871500",
      hskCode: "8715000000",
    }, "certification");

    expect(filtered).toEqual([]);
    expect(
      resolveSectionState({
        detailExecuted: true,
        successfulRowCount: getSuccessfulDetailRows(filtered).length,
        placeholderState: pickPlaceholderState(filtered),
      }),
    ).toBe("empty");
  });
});
