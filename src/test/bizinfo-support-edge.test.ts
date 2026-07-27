import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const edgePath = path.resolve(
  process.cwd(),
  "supabase/functions/api-bizinfo-support/index.ts",
);
const configPath = path.resolve(process.cwd(), "supabase/config.toml");
const envExamplePath = path.resolve(process.cwd(), ".env.example");

describe("api-bizinfo-support Edge Function contract", () => {
  it("uses authenticated project data and the server-only Bizinfo secret", () => {
    expect(fs.existsSync(edgePath)).toBe(true);
    const source = fs.readFileSync(edgePath, "utf8");

    expect(source).toContain("requireAuthenticatedUser");
    expect(source).toContain('Deno.env.get("BIZINFO_API_KEY")');
    expect(source).toContain('Deno.env.get("GEMINI_API_KEY")');
    expect(source).toContain('.from("project_companies")');
    expect(source).toContain('.from("project_products")');
    expect(source).toContain(
      '.select("name, description, hs_code, hsk_code, components")',
    );
    expect(source).toContain("fetchBizinfoPrograms");
    expect(source).toContain("selectRelevantBizinfoPrograms");
    expect(source).toContain("selectBizinfoProgramsWithAi");
    expect(source).toContain("verdict_signals");
    expect(source).toContain("candidate_count");
    expect(source).toContain("BIZINFO_AI_MODEL");
    expect(source).not.toContain("body.actions");
  });

  it("documents the server secret without exposing it as a Vite variable", () => {
    const envExample = fs.readFileSync(envExamplePath, "utf8");

    expect(envExample).toContain('BIZINFO_API_KEY=""');
    expect(envExample).not.toContain("VITE_BIZINFO_API_KEY");
  });

  it("uses in-function authentication because platform JWT verification is disabled", () => {
    const config = fs.readFileSync(configPath, "utf8");

    expect(config).toContain("[functions.api-bizinfo-support]");
    expect(config).toMatch(
      /\[functions\.api-bizinfo-support\][\s\S]*?verify_jwt\s*=\s*false/,
    );
  });
});
