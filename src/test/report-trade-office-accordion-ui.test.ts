import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("report trade office accordion ui", () => {
  it("renders trade office execution details as a collapsed accordion", () => {
    const source = read("src/pages/Step6Report.tsx");

    expect(source).toContain("function TradeOfficeActionsAccordion");
    expect(source).toContain("<Accordion type=\"multiple\"");
    expect(source).toContain("value=\"trade-office-actions\"");
    expect(source).toContain("<AccordionTrigger");
    expect(source).toContain("<AccordionContent");
    expect(source).toContain("group-data-[state=open]:hidden");
    expect(source).toContain("hidden group-data-[state=open]:inline");
    expect(source).toContain("<TradeOfficeActionsAccordion actions={executionActions} />");
    expect(source).toContain("<TradeOfficeActionsAccordion actions={executionActions} print />");
  });
});
