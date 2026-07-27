import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const verdictFunctionPath = path.resolve(
  process.cwd(),
  "supabase/functions/ai-country-verdict/index.ts",
);
const verdictCardPath = path.resolve(
  process.cwd(),
  "src/components/AiFinalVerdictCard.tsx",
);
const bizinfoModulePath = path.resolve(
  process.cwd(),
  "supabase/functions/_shared/bizinfo-support.ts",
);

describe("AI country verdict official support policy", () => {
  it("does not ask Gemini to invent execution metadata or government programs", () => {
    const source = fs.readFileSync(verdictFunctionPath, "utf8");

    expect(source).not.toContain('priority: "high | medium"');
    expect(source).not.toContain('timeline: "즉시');
    expect(source).not.toContain('difficulty: "쉬움');
    expect(source).not.toContain("estimatedCost:");
    expect(source).not.toContain("govSupport:");
    expect(source).toContain("정부지원사업명은 생성하지 마십시오");
  });

  it("removes AI-estimated metadata and AI government support from the action card", () => {
    const source = fs.readFileSync(verdictCardPath, "utf8");

    expect(source).not.toContain("예상 비용:");
    expect(source).not.toContain("정부 지원 활용:");
    expect(source).not.toContain("난이도:");
    expect(source).not.toContain("⏱️");
  });

  it("provides a dedicated official Bizinfo support module", () => {
    expect(fs.existsSync(bizinfoModulePath)).toBe(true);
  });
});
