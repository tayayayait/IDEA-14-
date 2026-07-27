import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "src/pages/Step6Report.tsx"), "utf8");
const activeRender = source.slice(source.indexOf("export default function Step6Report"), source.indexOf("function Block"));
const decisionContent = source.slice(source.indexOf("function DecisionReportContent"), source.indexOf("async function saveReportDraft"));

describe("decision report v2 UI", () => {
  it("uses the same consolidated decision content for mobile and PDF", () => {
    expect(activeRender.match(/<DecisionReportContent/g)?.length).toBe(2);
    expect(decisionContent).toContain('data-report-schema="decision-v4"');
    [
      "1. 1~4단계 통합 요약",
      "2. AI 종합 판단",
      "3. AI 추천 진입전략",
      "4. 실질 행동 가이드",
      "5. 근거 보기",
    ].forEach((title) => expect(decisionContent).toContain(title));
  });

  it("shows each analysis stage and turns the AI plan into accountable actions", () => {
    ["기업·공장", "제품·HS 코드", "후보국 추천", "국가 상세"].forEach((label) => {
      expect(decisionContent).toContain(label);
    });
    ["D+7", "D+30", "D+90", "담당", "산출물", "완료 기준"].forEach((label) => {
      expect(decisionContent).toContain(label);
    });
    expect(decisionContent).toContain("draft.actionPlan");
  });

  it("shows distinct success, partial, fallback, and stale states", () => {
    expect(decisionContent).toContain("Gemini AI 판단 완료 · 프로그램 근거");
    expect(decisionContent).toContain("일부 근거 미확인 · 조건부 판단");
    expect(decisionContent).toContain("규칙 기반 임시 결과 · Gemini 판단 미완료");
    expect(decisionContent).toContain("저장 리포트 근거 변경 · 재생성 필요");
  });

  it("does not render legacy duplicate, news, or separate trade-office sections", () => {
    expect(activeRender).not.toContain("<ReportNewsImpactPrint");
    expect(activeRender).not.toContain("<ExecutiveSummaryPanel");
    expect(activeRender).not.toContain("<ReportFeasibilityPrint");
    expect(activeRender).not.toContain("<TradeOfficeActionsAccordion");
    expect(activeRender).not.toContain("<CountryCautionCards");
    expect(decisionContent).toContain("bundle.countries.slice(0, 3)");
  });

  it("keeps API values and official sources in the evidence appendix", () => {
    expect(decisionContent).toContain("buildReportProgramEvidenceCatalog(evidence)");
    expect(decisionContent).toContain("프로그램 API 근거");
    expect(decisionContent).toContain("공식 웹 근거");
    expect(decisionContent).toContain("<Accordion");
    expect(decisionContent).toContain("expandEvidence ? content");
    expect(activeRender).toContain("setPdfEvidenceOpen(true)");
    expect(activeRender).toContain("expandEvidence={pdfEvidenceOpen}");
  });
});
