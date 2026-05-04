import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Step2 to Step3 AI recommendation gate", () => {
  it("requires AI country recommendation analysis before Step2 opens Step3", () => {
    const source = read("src/pages/Step2Product.tsx");
    const invokeIndex = source.indexOf('"recommend-countries"');
    const navigateIndex = source.indexOf("navigate(`/projects/${id}/countries`)");

    expect(invokeIndex).toBeGreaterThan(-1);
    expect(source).toContain("require_ai: true");
    expect(navigateIndex).toBeGreaterThan(invokeIndex);
  });

  it("requires AI rationale when Step3 reruns country recommendation", () => {
    const source = read("src/pages/Step3Countries.tsx");
    const invokeIndex = source.indexOf('"recommend-countries"');

    expect(invokeIndex).toBeGreaterThan(-1);
    expect(source).toContain("require_ai: true");
  });

  it("does not replace saved recommendations with API-only rationale when AI scoring is incomplete", () => {
    const source = read("supabase/functions/recommend-countries/index.ts");
    const aiGateIndex = source.indexOf("if (requireAi && !aiComplete)");
    const deleteIndex = source.indexOf('await supa.from("project_countries").delete()');

    expect(source).toContain("const requireAi = body.require_ai === true;");
    expect(source).not.toContain("API evidence and market context support this market.");
    expect(aiGateIndex).toBeGreaterThan(-1);
    expect(deleteIndex).toBeGreaterThan(aiGateIndex);
  });
});
