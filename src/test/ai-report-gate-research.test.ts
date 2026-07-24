import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "supabase/functions/ai-report-summary/index.ts"), "utf8");

describe("gate-targeted official research", () => {
  it("runs two bounded official research tasks covering only the six decision gates", () => {
    expect(source).toContain('gateTopics: ["certification", "safety"]');
    expect(source).toContain('gateTopics: ["regulation", "tariff", "profitability", "payment"]');
    expect(source).toContain("Promise.all(GATE_RESEARCH_TASKS.map");
    expect(source).toContain("callGateGroundedResearch");
    expect(source).toContain("Do not expand into other gates.");
  });

  it("uses the country-detail grounded-search pattern and only accepts official sources", () => {
    expect(source).toContain('const GEMINI_REPORT_MODEL = "gemini-3.1-pro-preview"');
    expect(source).toContain("tools: [{ google_search: {} }]");
    expect(source).toContain("government, customs, certification authorities, KOTRA, K-SURE, WTO, and ITC sources");
    expect(source).toContain("Do not search for or use news, media, blogs, social posts, or advertising content.");
  });

  it("passes the official gate research together with program evidence into the existing report judgment", () => {
    expect(source).toContain("programEvidence: promptInput");
    expect(source).toContain("officialWebEvidence: grounded.text");
    expect(source).toContain("officialSources: grounded.sources");
    expect(source).toContain("webSearchQueries: grounded.webSearchQueries");
    expect(source).toContain("Profitability and payment must remain check_required unless explicit business-input evidence");
  });
});
