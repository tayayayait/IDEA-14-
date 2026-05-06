import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeReportDraft, type ReportEvidenceBundle } from "@/lib/report-draft";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const evidence: ReportEvidenceBundle = {
  company: null,
  product: { name: "반도체(DRAM)", hsCode: "854232", hskCode: "8542321010", hsReviewRequired: false },
  topCountries: [{ countryCode: "US", countryName: "미국", totalScore: 100, label: "우선검토", summary: "미국 후보" }],
  certs: [],
  regs: [],
  risks: [],
  safetyFlags: [],
  apiLogs: [],
  missingEvidence: [],
};

describe("KOTRA entry strategy report integration", () => {
  it("normalizes kotraEntryStrategy as link metadata only", () => {
    const draft = normalizeReportDraft({
      countryStrategies: [{
        countryCode: "US",
        countryName: "미국",
        feasibilityGrade: "conditional",
        position: "Top 1",
        entryMode: "무역관 상담",
        entryStrategy: "기존 인증·규제·뉴스 근거로 진입 방식을 검토합니다.",
        requiredChecks: ["HS 확인"],
        certRegChecklist: ["인증 확인"],
        paymentRiskAssessment: "LC 검토",
        riskResponse: "보수적 조건",
        evidenceLimits: [],
        evidenceRefs: [],
        newsImpactAnalysis: "뉴스 분석",
        marketOpportunity: "반도체 수요",
        kotraEntryStrategy: {
          status: "available",
          title: "2026 미국 진출전략",
          publishedDate: "2025-12-22",
          tradeOffice: "워싱턴DC무역관",
          sourceUrl: "https://dream.kotra.or.kr/article",
          attachmentName: "2026 미국 진출전략.pdf",
          attachmentUrl: "https://dream.kotra.or.kr/file.pdf",
          usedPdf: true,
          basisSummary: "반도체, AI, 첨단산업 인프라 확장",
          limitations: [],
        },
      }],
    }, evidence);

    expect(draft.countryStrategies[0].kotraEntryStrategy).toMatchObject({
      status: "available",
      title: "2026 미국 진출전략",
      publishedDate: "2025-12-22",
      tradeOffice: "워싱턴DC무역관",
      sourceUrl: "https://dream.kotra.or.kr/article",
      attachmentName: "2026 미국 진출전략.pdf",
      attachmentUrl: "https://dream.kotra.or.kr/file.pdf",
      usedPdf: false,
      basisSummary: "",
    });
  });

  it("preserves KOTRA attachment query params in normalized report drafts", () => {
    const rawAttachmentUrl =
      "https://dream.kotra.or.kr/ajaxa/fileCpnt/fileDown.do?gbn=n01&amp;nttSn=237789&amp;atFileSn=114941&amp;pFrontYn=Y";

    const draft = normalizeReportDraft({
      countryStrategies: [{
        countryCode: "US",
        countryName: "US",
        feasibilityGrade: "conditional",
        position: "Top 1",
        entryMode: "Office consultation",
        entryStrategy: "Use current evidence.",
        requiredChecks: [],
        certRegChecklist: [],
        paymentRiskAssessment: "",
        riskResponse: "",
        evidenceLimits: [],
        evidenceRefs: [],
        newsImpactAnalysis: "",
        marketOpportunity: "",
        kotraEntryStrategy: {
          status: "available",
          title: "2026 US Entry Strategy",
          publishedDate: "2025-12-22",
          tradeOffice: "Washington DC",
          sourceUrl: "https://dream.kotra.or.kr/kotranews/cms/news/actionKotraBoardDetail.do?MENU_ID=70&CONTENTS_NO=1&bbsGbn=00&bbsSn=506&pNttSn=237789",
          attachmentName: "2026 US Entry Strategy.pdf",
          attachmentUrl: rawAttachmentUrl,
          usedPdf: false,
          basisSummary: "",
          limitations: [],
        },
      }],
    }, evidence);

    expect(draft.countryStrategies[0].kotraEntryStrategy?.attachmentUrl).toBe(
      "https://dream.kotra.or.kr/ajaxa/fileCpnt/fileDown.do?gbn=n01&nttSn=237789&atFileSn=114941&pFrontYn=Y",
    );
  });

  it("does not preserve PDF-analysis assumptions in report drafts", () => {
    const draft = normalizeReportDraft({
      countryStrategies: [{
        countryCode: "US",
        countryName: "誘멸뎅",
        feasibilityGrade: "conditional",
        position: "Top 1",
        entryMode: "臾댁뿭愿 ?곷떞",
        entryStrategy: "newsBdt fallback",
        requiredChecks: [],
        certRegChecklist: [],
        paymentRiskAssessment: "",
        riskResponse: "",
        evidenceLimits: [],
        evidenceRefs: [],
        newsImpactAnalysis: "",
        marketOpportunity: "",
        kotraEntryStrategy: {
          status: "pdf_failed",
          title: "2026 誘멸뎅 吏꾩텧?꾨왂",
          publishedDate: "2025-12-22",
          tradeOffice: "?뚯떛?퀱C臾댁뿭愿",
          sourceUrl: "https://dream.kotra.or.kr/article",
          attachmentName: "2026 誘멸뎅 吏꾩텧?꾨왂.pdf",
          attachmentUrl: "https://dream.kotra.or.kr/file.pdf",
          usedPdf: false,
          basisSummary: "newsBdt 목차 fallback",
          limitations: ["첨부 PDF 분석 실패"],
        },
      }],
    }, evidence);

    expect(draft.countryStrategies[0].kotraEntryStrategy).toMatchObject({
      status: "pdf_failed",
      title: "2026 誘멸뎅 吏꾩텧?꾨왂",
      usedPdf: false,
      basisSummary: "",
    });
  });

  it("renders KOTRA entry strategy evidence in print and mobile Step6 sections", () => {
    const source = read("src/pages/Step6Report.tsx");

    expect(source).toContain("KOTRA 진출전략 참고 링크");
    expect(source).toContain("renderKotraEntryStrategyEvidence");
    expect(source).toContain("strategy.kotraEntryStrategy");
    expect(source).toContain("첨부 PDF");
  });

  it("renders KOTRA entry strategy as reference links only in Step6", () => {
    const source = read("src/pages/Step6Report.tsx");

    expect(source).toContain("KOTRA 진출전략 참고 링크");
    expect(source).toContain("담당 무역관");
    expect(source).toContain("공개일");
    expect(source).toContain("const attachmentHref = toSafePublicHref(strategy.attachmentUrl ?? \"\")");
    expect(source).toContain("href={attachmentHref}");
    expect(source).toContain("target=\"_blank\"");
    expect(source).not.toContain("const sourceHref = toSafePublicHref");
    expect(source).not.toContain("href={sourceHref}");
    expect(source).not.toContain("KOTRA 원문");
    expect(source).not.toContain("첨부 PDF 분석 반영");
    expect(source).not.toContain("첨부 PDF 분석 실패");
    expect(source).not.toContain("sanitize(strategy.basisSummary)");
  });

  it("does not use KOTRA entry strategy as a country caution fallback when AI analysis is missing", () => {
    const source = read("src/pages/Step6Report.tsx");

    expect(source).not.toContain("KOTRA 진출전략 기반 유의사항");
    expect(source).not.toContain("kotraEntryStrategy={findCountryStrategy");
  });

  it("does not run or configure KOTRA entry strategy PDF analysis", () => {
    const reportFunction = read("supabase/functions/ai-report-summary/index.ts");

    expect(reportFunction).toContain("buildAvailableEntryStrategy(selected, null)");
    expect(reportFunction).toContain("TODO: PDF parsing is intentionally out of scope");
    expect(reportFunction).not.toContain("function shouldAnalyzeEntryStrategyPdf");
    expect(reportFunction).not.toContain("KOTRA_ENTRY_STRATEGY_PDF_ANALYSIS");
    expect(reportFunction).not.toContain("downloadEntryStrategyPdf");
    expect(reportFunction).not.toContain("callAiPdfSummary");
  });

  it("uses entry strategy only as Step6 reference metadata, not AI input or recommendation scoring", () => {
    const reportFunction = read("supabase/functions/ai-report-summary/index.ts");
    const recommendFunction = read("supabase/functions/recommend-countries/index.ts");

    expect(reportFunction).toContain("fetchKotraEntryStrategies");
    expect(reportFunction).toContain("kotraEntryStrategy");
    expect(reportFunction).toContain("function findEntryStrategyForCountry");
    expect(reportFunction).toContain("function normalizeKotraEntryStrategy");
    expect(reportFunction).toContain("fallbackRow?.kotraEntryStrategy");
    expect(reportFunction).not.toContain("Use its basisSummary to strengthen");
    expect(reportFunction).not.toContain("KOTRA ENTRY STRATEGY:");
    expect(reportFunction).not.toContain("basisSummary: limitText");
    expect(recommendFunction).not.toContain("entryStrategy/entryStrategy");
    expect(recommendFunction).not.toContain("kotraEntryStrategy");
  });
});
