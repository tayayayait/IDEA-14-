import { describe, expect, it } from "vitest";
import {
  groupKsureRiskRows,
  resolveKsurePaymentUnavailableMessage,
  resolveKsurePaymentUnavailableSourceUrl,
  isGlobalPaymentScope,
  isIndustryMatchFailedRiskRow,
  isScorableIndustryRiskRow,
  sortIndustryRiskRows,
  toRiskLevelLabel,
  type Step4RiskLikeRow,
} from "@/lib/step4-risk-presenter";

function makeRow(overrides: Partial<Step4RiskLikeRow>): Step4RiskLikeRow {
  return {
    id: "row-default",
    category: "k_sure",
    level: "info",
    summary: null,
    raw: {},
    ...overrides,
  };
}

describe("step4-risk-presenter", () => {
  it("groups country, industry, and payment rows", () => {
    const rows: Step4RiskLikeRow[] = [
      makeRow({ id: "country-old", category: "k_sure", raw: { eval_date: "2025-12-30" } }),
      makeRow({ id: "country-new", category: "k_sure", raw: { eval_date: "2026-01-31" } }),
      makeRow({ id: "industry-1", category: "k_sure_industry", raw: { risk_index: 3.2, detail_state: "success" } }),
      makeRow({ id: "payment-1", category: "k_sure_payment", raw: { scope: "country" } }),
    ];

    const grouped = groupKsureRiskRows(rows);
    expect(grouped.countryRisk?.id).toBe("country-new");
    expect(grouped.industryRisks).toHaveLength(1);
    expect(grouped.paymentRisk?.id).toBe("payment-1");
  });

  it("sorts industry rows by descending risk index and keeps top 3", () => {
    const rows: Step4RiskLikeRow[] = [
      makeRow({ id: "industry-low", category: "k_sure_industry", raw: { risk_index: 1.2, detail_state: "success" } }),
      makeRow({ id: "industry-top", category: "k_sure_industry", raw: { risk_index: 4.6, detail_state: "success" } }),
      makeRow({ id: "industry-mid", category: "k_sure_industry", raw: { risk_index: 3.1, detail_state: "success" } }),
      makeRow({ id: "industry-extra", category: "k_sure_industry", raw: { risk_index: 2.7, detail_state: "success" } }),
    ];

    const sorted = sortIndustryRiskRows(rows);
    expect(sorted.map((row) => row.id)).toEqual(["industry-top", "industry-mid", "industry-extra", "industry-low"]);

    const grouped = groupKsureRiskRows(rows);
    expect(grouped.industryRisks.map((row) => row.id)).toEqual(["industry-top", "industry-mid", "industry-extra"]);
  });

  it("detects global payment scope", () => {
    const globalRow = makeRow({ id: "payment-global", category: "k_sure_payment", raw: { scope: "global" } });
    const countryRow = makeRow({ id: "payment-country", category: "k_sure_payment", raw: { scope: "country" } });

    expect(isGlobalPaymentScope(globalRow)).toBe(true);
    expect(isGlobalPaymentScope(countryRow)).toBe(false);
  });

  it("prefers country-scoped payment row over global fallback", () => {
    const rows: Step4RiskLikeRow[] = [
      makeRow({ id: "payment-global", category: "k_sure_payment", raw: { scope: "global" } }),
      makeRow({ id: "payment-country", category: "k_sure_payment", raw: { scope: "country" } }),
    ];

    const grouped = groupKsureRiskRows(rows);
    expect(grouped.paymentRisk?.id).toBe("payment-country");
  });

  it("does not use global payment fallback as selected-country payment evidence", () => {
    const rows: Step4RiskLikeRow[] = [
      makeRow({ id: "payment-global", category: "k_sure_payment", raw: { scope: "global" } }),
    ];

    const grouped = groupKsureRiskRows(rows);
    expect(grouped.paymentRisk).toBeNull();
  });

  it("builds a country-scoped payment unavailable message from an empty payment row", () => {
    const row = makeRow({
      id: "payment-empty",
      category: "k_sure_payment",
      summary: "No K-SURE export payment rows matched 'JP'.",
      raw: {
        detail_state: "empty",
        scope: "country",
        country_code: "JP",
        api_message: "데이터 없음",
      },
    });

    expect(resolveKsurePaymentUnavailableMessage(row)).toContain("JP");
    expect(resolveKsurePaymentUnavailableMessage(row)).toContain("국가 단위 수출결제 데이터 없음");
  });

  it("maps risk levels to non-empty display labels", () => {
    expect(toRiskLevelLabel("info")).not.toHaveLength(0);
    expect(toRiskLevelLabel("caution")).not.toHaveLength(0);
    expect(toRiskLevelLabel("high")).not.toHaveLength(0);
    expect(toRiskLevelLabel("unavailable")).not.toHaveLength(0);
  });

  it("keeps the K-SURE source URL available for an empty payment row", () => {
    const row = makeRow({
      id: "payment-empty",
      category: "k_sure_payment",
      source_url: "https://ksight.ksure.or.kr/analysis/risk-advisor/payment",
      raw: {
        detail_state: "empty",
        scope: "country",
      },
    });

    expect(resolveKsurePaymentUnavailableSourceUrl(row)).toBe(
      "https://ksight.ksure.or.kr/analysis/risk-advisor/payment",
    );
  });

  it("excludes industry mismatch rows from scorable industry risks", () => {
    const mismatch = makeRow({
      id: "industry-mismatch",
      category: "k_sure_industry",
      raw: { detail_state: "empty", industry_match_failed: true },
    });
    const success = makeRow({
      id: "industry-success",
      category: "k_sure_industry",
      raw: { detail_state: "success", risk_index: 2.4 },
    });

    expect(isIndustryMatchFailedRiskRow(mismatch)).toBe(true);
    expect(isScorableIndustryRiskRow(mismatch)).toBe(false);
    expect(isScorableIndustryRiskRow(success)).toBe(true);

    const grouped = groupKsureRiskRows([mismatch, success]);
    expect(grouped.industryRisks.map((row) => row.id)).toEqual(["industry-success"]);
  });
});
