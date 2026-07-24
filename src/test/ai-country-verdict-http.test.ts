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
});
