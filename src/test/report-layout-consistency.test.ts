import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "src/pages/Step6Report.tsx"), "utf8");

function section(start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe.skip("legacy report layout (replaced by shared decision report v2 layout)", () => {
  it("uses one reusable print section frame for top-level report blocks", () => {
    expect(source).toContain("function PrintReportSection");
    expect(source).toContain("mt-3 break-inside-avoid rounded-md border p-3");
    expect(source).toContain("<PrintReportSection");
  });

  it("renders selected-country feasibility, compliance, and strategy at full width", () => {
    const feasibility = section("function ReportFeasibilityPrint", "function ReportNewsImpactPrint");
    const compliance = section("function ReportCertRegChecklistPrint", "function ReportStrategyPrint");
    const strategy = section("function ReportStrategyPrint", "function renderKotraEntryStrategyEvidence");

    expect(feasibility).not.toContain("grid-cols-3");
    expect(compliance).not.toContain("grid-cols-3");
    expect(strategy).not.toContain("grid-cols-3");
    expect(compliance).toContain("grid-cols-2");
    expect(strategy).toContain("grid-cols-2");
  });

  it("uses the full report width for the selected-country evidence card", () => {
    const overview = section("function ReportDecisionOverview", "function uniqueDecisionFacts");

    expect(overview).toContain('print ? "mt-3 space-y-2"');
    expect(overview).toContain('grid-cols-[210px_1fr]');
  });

  it("keeps the mobile country caution content inside the standard information card", () => {
    const mobile = section("function MobileReportView", "function MobileInfoBlock");

    expect(mobile).toMatch(/<MobileInfoBlock title="[^"]+">\s*<CountryCautionCards/);
  });
});
