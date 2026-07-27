import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const functionPath = path.resolve(process.cwd(), "supabase/functions/ai-country-verdict/index.ts");

describe("ai-country-verdict HTTP responses", () => {
  it("returns no body for HTTP statuses that forbid response bodies", () => {
    const source = fs.readFileSync(functionPath, "utf8");

    expect(source).toContain("if (status === 204 || status === 205 || status === 304)");
    expect(source).toContain("return new Response(null, { status, headers });");
  });

  it("builds a verified evidence catalog before finalizing the model verdict", () => {
    const source = fs.readFileSync(functionPath, "utf8");

    expect(source).toContain("buildVerifiedEvidenceCatalog");
    expect(source).toContain("finalizeAiVerdict");
    expect(source).toContain("grounded.claims");
    expect(source).toContain("requiredCategories:");
    expect(source).toContain("evidenceIds");
    expect(source).toContain("ALLOWED VERIFIED EVIDENCE CATALOG");
  });

  it("includes exact program values and source metadata in the Gemini evidence input", () => {
    const source = fs.readFileSync(functionPath, "utf8");

    expect(source).toContain("근거 ID:");
    expect(source).toContain("원천 값:");
    expect(source).toContain("원문 URL:");
    expect(source).toContain("기준일:");
    expect(source).toContain("조회일:");
  });

  it("asks grounded research for claim-level official evidence rather than an uncited brief", () => {
    const source = fs.readFileSync(functionPath, "utf8");

    expect(source).toContain('"claims"');
    expect(source).toContain('"verificationStatus"');
    expect(source).toContain('"scopeMatch"');
    expect(source).toContain("Return strict JSON");
    expect(source).not.toContain("Write a concise Korean research brief. Do not output JSON.");
  });
});
