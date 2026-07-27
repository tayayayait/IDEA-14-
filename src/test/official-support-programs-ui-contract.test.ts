import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const verdictCardPath = path.resolve(
  process.cwd(),
  "src/components/AiFinalVerdictCard.tsx",
);
const supportSectionPath = path.resolve(
  process.cwd(),
  "src/components/OfficialSupportProgramsSection.tsx",
);

describe("official support programs UI contract", () => {
  it("renders official support separately after AI action guidance", () => {
    const verdictCard = fs.readFileSync(verdictCardPath, "utf8");

    expect(verdictCard).toContain("<OfficialSupportProgramsSection");
    expect(verdictCard).toContain('source: "action"');
    expect(verdictCard).toContain('source: "risk"');
    expect(verdictCard).toContain("verdict.executiveSummary");
    expect(verdictCard).toContain("verdictSignals={supportVerdictSignals}");
  });

  it("loads only the official Edge Function and exposes verification details", () => {
    expect(fs.existsSync(supportSectionPath)).toBe(true);
    const source = fs.readFileSync(supportSectionPath, "utf8");

    expect(source).toContain('"api-bizinfo-support"');
    expect(source).toContain("AI 맞춤형 정부지원사업 추천");
    expect(source).toContain("제품명·HS/HSK 코드");
    expect(source).toContain("AI 판단 연결 근거");
    expect(source).toContain("공고 확인 근거");
    expect(source).toContain("programEvidence");
    expect(source).toContain("verdict_signals");
    expect(source).toContain("최신 지원사업 다시 확인");
    expect(source).toContain("공식 공고 보기");
    expect(source).toContain("최종 확인");
    expect(source).toContain(
      "AI가 현재 수출 업무에 직접 도움이 된다고 판단한 지원사업이 없습니다",
    );
    expect(source).not.toContain("VITE_BIZINFO_API_KEY");
  });
});
