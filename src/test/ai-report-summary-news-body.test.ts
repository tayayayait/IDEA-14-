import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "supabase/functions/ai-report-summary/index.ts"), "utf8");

describe("ai report official-source policy", () => {
  it("removes news analysis and legacy summary fields", () => {
    expect(source).toContain("official-source-only");
    expect(source).toContain("evidenceRefs");
    expect(source).not.toContain("newsImpactAnalysis");
    expect(source).not.toContain("articleBody");
    expect(source).not.toContain("article_body");
    expect(source).not.toContain("executiveSummary");
    expect(source).not.toContain("exportFeasibility");
    expect(source).not.toContain("topCountryReason");
  });

  it("uses bounded official and program evidence inputs", () => {
    expect(source).toContain("const AI_TIMEOUT_MS = 110000;");
    expect(source).toContain("programEvidenceCatalog");
    expect(source).toContain("officialSources");
    expect(source).toContain("temperature: 0.2");
  });
});
