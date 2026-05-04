import { describe, expect, it } from "vitest";
import { deriveExportRegionRankMarketBoost } from "../../supabase/functions/_shared/recommendation";

describe("export-region-rank market boost", () => {
  it("returns zero when rank is missing", () => {
    expect(
      deriveExportRegionRankMarketBoost({
        rank: null,
        exportShare: 12,
        hsMatched: true,
      }),
    ).toBe(0);
  });

  it("caps very strong signal at upper bound", () => {
    expect(
      deriveExportRegionRankMarketBoost({
        rank: 1,
        exportShare: 15,
        hsMatched: true,
      }),
    ).toBe(12);
  });

  it("scores mid-rank and mid-share country", () => {
    expect(
      deriveExportRegionRankMarketBoost({
        rank: 12,
        exportShare: 5.4,
        hsMatched: false,
      }),
    ).toBe(6);
  });

  it("keeps low boost for deep rank country", () => {
    expect(
      deriveExportRegionRankMarketBoost({
        rank: 60,
        exportShare: 0.3,
        hsMatched: false,
      }),
    ).toBe(1);
  });

  it("adds HS match point when available", () => {
    expect(
      deriveExportRegionRankMarketBoost({
        rank: 50,
        exportShare: 1.1,
        hsMatched: true,
      }),
    ).toBe(4);
  });
});
