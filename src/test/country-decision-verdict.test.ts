import { describe, expect, it } from "vitest";
import { computeEvidenceHash } from "@/lib/country-decision-verdict";
import type { DecisionFact } from "@/lib/country-decision";

const baseFact: DecisionFact = {
  id: "fact-1",
  factKey: "tariff_fta:national_tariff_candidates",
  category: "tariff_fta",
  status: "confirmed",
  severity: "info",
  summary: "일본 관세표 세율 후보",
  value: { mfnRate: "Free" },
  scope: "hs6",
  sourceName: "Japan Customs",
  sourceUrl: "https://www.customs.go.jp/english/tariff/",
  referenceDate: "2026-04-01",
  fetchedAt: "2026-07-27T00:00:00.000Z",
  caveat: null,
  nextAction: null,
  isStale: false,
};

describe("country verdict evidence hash", () => {
  it("changes when an official source value changes without changing the fact id or status", () => {
    const before = computeEvidenceHash([baseFact]);
    const after = computeEvidenceHash([{ ...baseFact, value: { mfnRate: "3.0%" } }]);

    expect(after).not.toBe(before);
  });

  it("changes when the source reference date changes", () => {
    const before = computeEvidenceHash([baseFact]);
    const after = computeEvidenceHash([{ ...baseFact, referenceDate: "2026-07-01" }]);

    expect(after).not.toBe(before);
  });

  it("changes when the opportunity score or target context changes", () => {
    const before = computeEvidenceHash([baseFact], { countryCode: "JP", hs6: "848210", opportunityScore: 80 });
    const changedScore = computeEvidenceHash([baseFact], { countryCode: "JP", hs6: "848210", opportunityScore: 72 });
    const changedHs = computeEvidenceHash([baseFact], { countryCode: "JP", hs6: "848220", opportunityScore: 80 });

    expect(changedScore).not.toBe(before);
    expect(changedHs).not.toBe(before);
  });
});
