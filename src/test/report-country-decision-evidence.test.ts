import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "src/pages/Step6Report.tsx"), "utf8");

describe.skip("legacy country evidence board (replaced by decision report v2 evidence catalog)", () => {
  it("loads normalized decision facts and saved action statuses", () => {
    expect(source).toContain('.from("country_decision_facts")');
    expect(source).toContain('.from("country_action_items")');
    expect(source).toContain("decisionFacts:");
    expect(source).toContain("decisionActions:");
  });

  it("renders the selected-country evidence board in screen and PDF report views", () => {
    expect(source).toContain("ReportDecisionOverview");
    expect(source.match(/<ReportDecisionOverview/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(source).toContain("선택 국가 판단 근거");
    expect(source).toContain("미완료 실행 항목");
  });
});
