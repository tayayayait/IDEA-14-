import { describe, expect, it } from "vitest";
import {
  buildCharacterBigrams,
  hasSubsequenceAbbreviation,
  overlapRatio,
} from "../../supabase/functions/ai-hs-suggest/token-utils";

describe("HS token utilities", () => {
  it("builds bigrams for korean tokens and computes overlap ratio", () => {
    const query = buildCharacterBigrams("전기차");
    const official = buildCharacterBigrams("전기자동차");

    expect(query.has("전기")).toBe(true);
    expect(query.has("기차")).toBe(true);
    expect(overlapRatio(query, official)).toBeGreaterThan(0);
  });

  it("supports generic english abbreviation matching without hardcoded words", () => {
    expect(hasSubsequenceAbbreviation("pkg", "package")).toBe(true);
    expect(hasSubsequenceAbbreviation("ev", "electric vehicle")).toBe(true);
    expect(hasSubsequenceAbbreviation("abc", "motor")).toBe(false);
  });
});
