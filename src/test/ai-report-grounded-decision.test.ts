import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "supabase/functions/ai-report-summary/index.ts"), "utf8");

describe("grounded AI decision report", () => {
  it("locks Gemini 3.1 Pro and uses Google Search grounding", () => {
    expect(source).toContain('const GEMINI_REPORT_MODEL = "gemini-3.1-pro-preview";');
    expect(source).toContain("google_search: {}");
    expect(source).toContain("groundingMetadata");
  });

  it("uses the selected-country v2 decision contract and consistency rules", () => {
    expect(source).toContain("decisionReasons");
    expect(source).toContain("decisionGates");
    expect(source).toContain("officialResearch");
    expect(source).toContain("OFFICIAL WEB EVIDENCE");
    expect(source).toContain("차단 게이트가 하나라도 있으면");
    expect(source).toContain("핵심 게이트가 check_required");
    expect(source).toContain('decision.verdict = "hold"');
    expect(source).toContain('decision.verdict = "conditional"');
  });

  it("limits research to official authorities", () => {
    expect(source).toContain("government, customs, certification authorities, KOTRA, K-SURE, WTO, and ITC");
    expect(source).toContain("Do not search for or use news, media, blogs, social posts, or advertising content");
    expect(source).not.toContain("NEWS IMPACT ANALYSIS");
    expect(source).not.toContain("at least 150 characters");
    expect(source).not.toContain("at least 100 characters");
  });

  it("preserves a sanitized Gemini API error for fallback diagnostics", () => {
    expect(source).toContain("async function buildGeminiHttpError(response: Response)");
    expect(source).toContain("await response.text()");
    expect(source).toContain("sanitizeGeminiError");
    expect(source.match(/throw await buildGeminiHttpError\(response\);/g)).toHaveLength(2);
  });
});
