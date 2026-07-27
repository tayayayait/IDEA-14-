import { describe, expect, it } from "vitest";
import { buildSelectedCountryResearchInput } from "../../supabase/functions/ai-report-summary/selected-country-research";

describe("selected-country official research input", () => {
  it("keeps the selected United States target and removes alternative-country context", () => {
    const input = buildSelectedCountryResearchInput({
      company: { companyName: "스마트에스(주)" },
      product: { name: "반도체장비 부품", hskCode: "8486903010" },
      topCountries: [
        { countryCode: "US", countryName: "미합중국" },
        { countryCode: "DE", countryName: "독일연방공화국" },
        { countryCode: "VN", countryName: "베트남 사회주의 공화국" },
      ],
      programEvidenceCatalog: [
        { evidenceId: "P-COUNTRY-001", category: "country", value: "미합중국" },
        { evidenceId: "P-COUNTRY-002", category: "country", value: "독일연방공화국" },
        { evidenceId: "P-COUNTRY-003", category: "country", value: "베트남 사회주의 공화국" },
        { evidenceId: "P-CERT-001", category: "certification", value: "미국 인증 조회" },
      ],
      entryStrategies: [{ countryCode: "US", title: "미국 진입전략" }],
      gateInputs: { profitability: { targetMargin: "15" } },
      selectedDetailCounts: { certs: 1 },
      evidence: { cert: "available" },
      missingEvidence: ["미국 최종 HTS 확인"],
    });
    const serialized = JSON.stringify(input);

    expect(input.selectedCountry).toEqual({ countryCode: "US", countryName: "미합중국" });
    expect(input.programEvidenceCatalog).toEqual([
      { evidenceId: "P-COUNTRY-001", category: "country", value: "미합중국" },
      { evidenceId: "P-CERT-001", category: "certification", value: "미국 인증 조회" },
    ]);
    expect(serialized).not.toContain("독일연방공화국");
    expect(serialized).not.toContain("베트남 사회주의 공화국");
  });
});
