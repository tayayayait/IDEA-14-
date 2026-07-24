import { describe, expect, it } from "vitest";
import {
  normalizeAuthKeyValue,
  resolveKicoxApiKeys,
} from "../../supabase/functions/api-kicox-search/key.ts";

describe("KICOX API key resolution", () => {
  it("trims whitespace and matching quotes from a secret value", () => {
    expect(normalizeAuthKeyValue('  "public-key"  ')).toBe("public-key");
    expect(normalizeAuthKeyValue("  'kicox-key'  ")).toBe("kicox-key");
  });

  it("keeps the dedicated key first and includes a distinct public-data fallback", () => {
    expect(
      resolveKicoxApiKeys({
        KICOX_API_KEY: ' "kicox-key" ',
        PUBLIC_DATA_API_KEY: "public-key",
      }),
    ).toEqual(["kicox-key", "public-key"]);
  });

  it("removes empty and duplicate candidates", () => {
    expect(
      resolveKicoxApiKeys({
        KICOX_API_KEY: " public-key ",
        PUBLIC_DATA_API_KEY: '"public-key"',
      }),
    ).toEqual(["public-key"]);
  });
});
