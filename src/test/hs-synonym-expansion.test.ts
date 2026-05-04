import { describe, expect, it } from "vitest";
import {
  expandWithSynonyms,
  computeDisambiguationPenalty,
  SYNONYM_ENTRIES,
} from "../../supabase/functions/ai-hs-suggest/synonym-dictionary";

describe("Synonym Dictionary", () => {
  describe("expandWithSynonyms", () => {
    it("expands '시트' to include '의자' in automotive context", () => {
      const tokens = new Map([["시트", 1.0]]);
      const expanded = expandWithSynonyms(tokens, "승용자동차 시트 제품");

      expect(expanded.has("의자")).toBe(true);
      expect(expanded.has("좌석")).toBe(true);
      expect(expanded.has("seat")).toBe(true);
    });

    it("expands '시트' to include '판' and 'sheet' in rubber context", () => {
      const tokens = new Map([["시트", 1.0]]);
      const expanded = expandWithSynonyms(tokens, "고무 시트 판재");

      expect(expanded.has("판")).toBe(true);
      expect(expanded.has("sheet")).toBe(true);
    });

    it("does NOT expand '시트' to '의자' when rubber context is present", () => {
      const tokens = new Map([["시트", 1.0]]);
      const expanded = expandWithSynonyms(tokens, "고무 시트 판재");

      // In rubber context, '시트' matches sheet-material, not seat
      // so '의자' should NOT be added
      expect(expanded.has("의자")).toBe(false);
    });

    it("expands '밸브' to include '콕' and 'valve'", () => {
      const tokens = new Map([["밸브", 1.0]]);
      const expanded = expandWithSynonyms(tokens, "유압 밸브 제품");

      expect(expanded.has("valve")).toBe(true);
    });

    it("expands '모터' to include '전동기'", () => {
      const tokens = new Map([["모터", 1.0]]);
      const expanded = expandWithSynonyms(tokens, "전기 모터");

      expect(expanded.has("전동기")).toBe(true);
      expect(expanded.has("motor")).toBe(true);
    });

    it("applies a reduced weight to expanded synonyms", () => {
      const tokens = new Map([["필터", 1.0]]);
      const expanded = expandWithSynonyms(tokens, "공기 필터");

      const weight = expanded.get("여과기");
      expect(weight).toBeDefined();
      expect(weight!).toBeLessThan(1.0);
      expect(weight!).toBeGreaterThan(0.5);
    });

    it("does not re-add tokens already in the original set", () => {
      const tokens = new Map([["시트", 1.0], ["의자", 0.8]]);
      const expanded = expandWithSynonyms(tokens, "자동차 시트");

      // '의자' is already in the original tokens, should not appear in expanded
      expect(expanded.has("의자")).toBe(false);
    });
  });

  describe("computeDisambiguationPenalty", () => {
    it("penalizes lavatory seat row when input context is automotive", () => {
      const penalty = computeDisambiguationPenalty(
        "변기용 시트(seat)와 커버 lavatory seats and covers",
        "승용자동차 시트",
        ["시트"],
      );

      expect(penalty).toBeGreaterThan(0);
    });

    it("penalizes rubber sheet row when input context is automotive seat", () => {
      const penalty = computeDisambiguationPenalty(
        "스모크드 시트(smoked sheet) smoked sheets",
        "승용자동차 시트",
        ["시트"],
      );

      expect(penalty).toBeGreaterThan(0);
    });

    it("does NOT penalize vehicle seat row when input context is automotive", () => {
      const penalty = computeDisambiguationPenalty(
        "차량용 의자 seats of a kind used for motor vehicles",
        "승용자동차 시트",
        ["시트"],
      );

      expect(penalty).toBe(0);
    });

    it("returns 0 when token is not a homonym", () => {
      const penalty = computeDisambiguationPenalty(
        "여과기 filter 장치",
        "공기 필터",
        ["필터"],
      );

      expect(penalty).toBe(0);
    });
  });

  describe("SYNONYM_ENTRIES structure", () => {
    it("contains at least 15 entries covering major categories", () => {
      expect(SYNONYM_ENTRIES.length).toBeGreaterThanOrEqual(15);
    });

    it("every entry has required fields", () => {
      for (const entry of SYNONYM_ENTRIES) {
        expect(entry.id).toBeTruthy();
        expect(entry.canonical).toBeTruthy();
        expect(entry.synonyms.length).toBeGreaterThanOrEqual(2);
        expect(Array.isArray(entry.context)).toBe(true);
        expect(Array.isArray(entry.antiContext)).toBe(true);
      }
    });

    it("seat and sheet-material share '시트' as a synonym (homonym)", () => {
      const seatEntry = SYNONYM_ENTRIES.find((e) => e.id === "seat");
      const sheetEntry = SYNONYM_ENTRIES.find((e) => e.id === "sheet-material");

      expect(seatEntry).toBeDefined();
      expect(sheetEntry).toBeDefined();
      expect(seatEntry!.synonyms).toContain("시트");
      expect(sheetEntry!.synonyms).toContain("시트");
    });
  });
});
