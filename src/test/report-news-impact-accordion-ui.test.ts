import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("report news impact accordion ui", () => {
  it("renders country news impact details behind accordion triggers", () => {
    const source = read("src/pages/Step6Report.tsx");

    expect(source).toContain("@/components/ui/accordion");
    expect(source).toContain("NewsImpactAccordion");
    expect(source).toContain("<Accordion type=\"multiple\"");
    expect(source).toContain("<AccordionTrigger");
    expect(source).toContain("세부 내용 펼치기");
    expect(source).toContain("접기");
    expect(source).toContain("NewsImpactAnalysisContent value={strategy.newsImpactAnalysis}");
  });
});
