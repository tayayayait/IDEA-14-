import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

function readNumberConstant(source: string, name: string): number | null {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*(\\d+)`));
  return match ? Number(match[1]) : null;
}

function resolveTimeoutValue(source: string, value: string): number | null {
  if (/^\d+$/.test(value)) return Number(value);
  return readNumberConstant(source, value);
}

describe("ai-hs-suggest timeout budget", () => {
  it("keeps Step 2 client timeout above the Edge AI rerank timeout", () => {
    const edgeSource = read("supabase/functions/ai-hs-suggest/index.ts");
    const step2Source = read("src/pages/Step2Product.tsx");
    const serverAiTimeout = readNumberConstant(edgeSource, "AI_TIMEOUT_MS");

    expect(serverAiTimeout).toBeGreaterThan(0);

    const calls = [...step2Source.matchAll(
      /"ai-hs-suggest"[\s\S]{0,500}?timeoutMs:\s*([A-Za-z0-9_]+)/g,
    )];

    expect(calls.length).toBeGreaterThan(0);

    for (const call of calls) {
      const clientTimeout = resolveTimeoutValue(step2Source, call[1]);
      expect(clientTimeout).toBeGreaterThan(0);
      expect(clientTimeout! - serverAiTimeout!).toBeGreaterThanOrEqual(4000);
    }
  });

  it("keeps HS catalog ranking initialization outside the Edge entrypoint", () => {
    const edgeSource = read("supabase/functions/ai-hs-suggest/index.ts");

    expect(edgeSource).not.toContain("HS_CATALOG.map");
    expect(edgeSource).not.toContain("function rankCandidates");
  });
});
