import { describe, expect, it } from "vitest";
import {
  normalizeHsCode,
  normalizeYnBoolean,
} from "../../supabase/functions/_shared/kotra-csv-cache-normalizer";

describe("kotra csv cache normalizer", () => {
  it("normalizes hs code and reports truncation", () => {
    const result = normalizeHsCode("8501311000123");
    expect(result.valid).toBe(true);
    expect(result.issue).toBe("truncated");
    expect(result.normalized).toBe("8501311000");
  });

  it("rejects hs code shorter than 6 digits", () => {
    const result = normalizeHsCode("9027");
    expect(result.valid).toBe(false);
    expect(result.issue).toBe("too_short");
    expect(result.normalized).toBe("");
  });

  it("normalizes yn-like values into boolean", () => {
    expect(normalizeYnBoolean("Y")).toBe(true);
    expect(normalizeYnBoolean("yes")).toBe(true);
    expect(normalizeYnBoolean("0")).toBe(false);
  });
});
