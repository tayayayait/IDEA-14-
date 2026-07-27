import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildReportDraftFallback,
  buildReportProgramEvidenceCatalog,
  normalizeReportDraft,
  type ReportEvidenceBundle,
} from "@/lib/report-draft";

const semiconductorEvidence = (): ReportEvidenceBundle => ({
  company: {
    companyName: "스마트에스(주)",
    industrialComplex: "흥덕 IT밸리",
    address: "경기도 용인시",
  },
  product: {
    name: "반도체장비 부품",
    hsCode: "848690",
    hskCode: "8486903010",
    hsReviewRequired: false,
  },
  topCountries: [
    {
      countryCode: "US",
      countryName: "미국",
      recommendationRank: 2,
      totalScore: 100,
      label: "우선검토",
      summary: "반도체 장비 수요와 한국산 수입 실적을 확인했습니다.",
      customsExport12mUsd: 533_900_000,
      customsExportStatus: "available",
    },
    {
      countryCode: "DE",
      countryName: "독일",
      recommendationRank: 1,
      totalScore: 91,
      label: "검토권장",
      summary: "정밀기계 산업 기반을 확인했습니다.",
    },
    {
      countryCode: "VN",
      countryName: "베트남",
      recommendationRank: 3,
      totalScore: 86,
      label: "검토권장",
      summary: "전자산업 투자 확대를 확인했습니다.",
    },
  ],
  certs: [{
    countryCode: "US",
    category: "certification",
    summary: "제품 사양에 따른 안전규격 적용 여부 확인 필요",
    sourceOrg: "KOTRA",
  }],
  regs: [{
    countryCode: "US",
    category: "regulation",
    summary: "미국 수입규제 적용 범위 확인 필요",
    sourceOrg: "KOTRA",
  }],
  risks: [{
    countryCode: "US",
    category: "payment",
    level: "보통",
    summary: "결제조건과 신용위험 확인 필요",
    sourceOrg: "K-SURE",
  }],
  decisionFacts: [{
    countryCode: "US",
    factKey: "tariff_fta:usitc_hts_candidates",
    category: "tariff_fta",
    status: "needs_verification",
    severity: "caution",
    summary: "미국 HTS 후보를 확인했습니다.",
    value: { candidate: "8486.90.00.00", generalRate: "Free" },
    sourceName: "USITC Harmonized Tariff Schedule",
    referenceDate: "2026",
    caveat: "제품 사양에 따른 최종 세번 확인이 필요합니다.",
    nextAction: "미국 관세사와 최종 세번 및 추가관세를 확인하세요.",
  }],
  decisionActions: [{
    countryCode: "US",
    actionKey: "verify_hts",
    title: "미국 HTS 최종 분류 확인",
    reason: "부품의 용도와 적용 장비에 따라 세번이 달라질 수 있습니다.",
    status: "pending",
    priority: 1,
  }],
  countryVerdicts: [],
  safetyFlags: [],
  apiLogs: [],
  missingEvidence: ["공식 인증 적용성", "추가관세 적용 여부"],
});

describe("three-layer export report synthesis", () => {
  it("builds a product-safe fallback without unrelated industry templates", () => {
    const draft = buildReportDraftFallback(semiconductorEvidence());
    const serialized = JSON.stringify(draft);

    expect(draft.schemaVersion).toBe(4);
    expect(draft.decision.confidence).toBe("low");
    expect(draft.analysisBasis.programDataSummary).toContain("반도체장비 부품");
    expect(draft.analysisBasis.programDataSummary).toContain("미국");
    expect(draft.analysisBasis.programDataSummary).toContain("독일");
    expect(draft.analysisBasis.programDataSummary).toContain("베트남");
    expect(draft.analysisBasis.programDataSummary).toContain("1순위 독일");
    expect(draft.analysisBasis.programDataSummary).toContain("2순위 미국");
    expect(draft.analysisBasis.programDataSummary).toContain("3순위 베트남");
    expect(draft.analysisBasis.officialDataSummary).toContain("완료되지");
    expect(draft.analysisBasis.aiInterpretation).toContain("가설");
    expect(serialized).not.toMatch(/NHTSA|FMVSS|PVLT|DOT 공장|타이어/);
    expect(draft.decisionGates.every((gate) => (
      gate.requiredDocument?.includes("반도체장비 부품")
    ))).toBe(true);
  });

  it("uses selected-country Step 4 counts even when AI evidence rows are filtered", () => {
    const evidence = semiconductorEvidence();
    evidence.certs.push({
      countryCode: "DE",
      category: "certification",
      summary: "독일 인증 근거",
      sourceOrg: "KOTRA",
    });
    evidence.regs.push({
      countryCode: "DE",
      category: "regulation",
      summary: "독일 규제 근거",
      sourceOrg: "KOTRA",
    });
    evidence.risks.push({
      countryCode: "DE",
      category: "payment",
      level: "보통",
      summary: "독일 위험 근거",
      sourceOrg: "K-SURE",
    });
    evidence.decisionFacts?.push({
      countryCode: "DE",
      factKey: "tariff_fta:de",
      category: "tariff_fta",
      status: "needs_verification",
      severity: "caution",
      summary: "독일 관세 근거",
      value: null,
      sourceName: "EU TARIC",
      referenceDate: "2026",
      caveat: null,
      nextAction: null,
    });
    evidence.selectedDetailCounts = {
      certs: 7,
      regs: 6,
      risks: 5,
      facts: 4,
    };

    const draft = buildReportDraftFallback(evidence);

    expect(draft.analysisBasis.programDataSummary).toContain(
      "인증 7건·규제 6건·위험 5건·의사결정 사실 4건",
    );
  });

  it("keeps all Step 3 Top 3 candidates in the program evidence layer", () => {
    const countries = buildReportProgramEvidenceCatalog(semiconductorEvidence())
      .filter((item) => item.category === "country");

    expect(countries.map((item) => item.evidenceId)).toEqual([
      "P-COUNTRY-001",
      "P-COUNTRY-002",
      "P-COUNTRY-003",
    ]);
    expect(countries.map((item) => item.value).join(" ")).toContain("독일");
    expect(countries.map((item) => item.value).join(" ")).toContain("베트남");
  });

  it("normalizes and preserves the three analysis layers returned by AI", () => {
    const draft = normalizeReportDraft({
      schemaVersion: 4,
      analysisBasis: {
        programDataSummary: "1~4단계 데이터 요약",
        programEvidenceRefs: ["P-COUNTRY-001", "P-FACT-001"],
        officialDataSummary: "공식기관 재검증 요약",
        officialEvidenceRefs: ["W-001"],
        aiInterpretation: "두 근거를 종합한 AI 해석",
      },
      officialResearch: {
        summary: "공식자료 확인",
        keyFindings: [{ finding: "미국 세번 후보 확인", evidenceRefs: ["W-001"] }],
        queries: ["site:usitc.gov 848690"],
        sources: [{
          evidenceId: "W-001",
          title: "Harmonized Tariff Schedule",
          url: "https://hts.usitc.gov/",
          organization: "USITC",
          publishedAt: "",
          accessedAt: "2026-07-27",
        }],
        conflicts: [],
      },
    }, semiconductorEvidence());

    expect(draft.analysisBasis.programDataSummary).not.toBe("1~4단계 데이터 요약");
    expect(draft.analysisBasis.programDataSummary).toContain("1순위 독일");
    expect(draft.analysisBasis.programDataSummary).toContain("2순위 미국");
    expect(draft.analysisBasis.programEvidenceRefs).toEqual(
      expect.arrayContaining(["P-COUNTRY-001", "P-FACT-001"]),
    );
    expect(draft.analysisBasis.officialEvidenceRefs).toEqual(["W-001"]);
    expect(draft.analysisBasis.aiInterpretation).toBe("두 근거를 종합한 AI 해석");
  });

  it("requests a three-layer synthesis and loads all Top 3 candidates", () => {
    const edgeSource = readFileSync(
      join(process.cwd(), "supabase/functions/ai-report-summary/index.ts"),
      "utf8",
    );
    const pageSource = readFileSync(
      join(process.cwd(), "src/pages/Step6Report.tsx"),
      "utf8",
    );

    expect(edgeSource).toContain("PROGRAM DATA");
    expect(edgeSource).toContain("OFFICIAL RESEARCH");
    expect(edgeSource).toContain("AI INTERPRETATION");
    expect(edgeSource).toContain(".slice(0, 3)");
    expect(edgeSource).not.toContain("e.g. '📄 NHTSA FMVSS 139");
    expect(pageSource).toContain("return baseQuery().limit(3)");
  });

  it("logs the failed AI pipeline stage without exposing provider secrets", () => {
    const edgeSource = readFileSync(
      join(process.cwd(), "supabase/functions/ai-report-summary/index.ts"),
      "utf8",
    );

    expect(edgeSource).toContain(
      'console.error("[ai-report-summary] AI pipeline failed"',
    );
    expect(edgeSource).toContain("stage: aiStage");
    expect(edgeSource).toContain("gemini_key_present: Boolean(Deno.env.get(\"GEMINI_API_KEY\"))");
    expect(edgeSource).not.toContain("api_key: apiKey");
  });

  it("restores the selected detail country when browser selection state is missing", () => {
    const pageSource = readFileSync(
      join(process.cwd(), "src/pages/Step6Report.tsx"),
      "utf8",
    );

    expect(pageSource).toContain("savedReportCountryCode");
    expect(pageSource).toContain("latestVerdictCountryCode");
    expect(pageSource).toContain("resolvedSelectedCountryCode");
    expect(pageSource).toContain("hasFreshGeneratedDraft");
  });

  it("renders Step 4 country insights for the selected country only", () => {
    const pageSource = readFileSync(
      join(process.cwd(), "src/pages/Step6Report.tsx"),
      "utf8",
    );

    expect(pageSource).toContain(
      "country.country_code === bundle.selectedCountryCode",
    );
    expect(pageSource).toContain(
      "return selectedCountry ? [selectedCountry].map",
    );
    expect(pageSource).not.toContain(
      "return bundle.countries.slice(0, 3).map",
    );
  });
});
