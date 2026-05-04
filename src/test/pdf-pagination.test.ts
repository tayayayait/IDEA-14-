import { describe, expect, it } from "vitest";
import { buildPdfImagePlacements } from "@/lib/pdf-pagination";

describe("pdf pagination", () => {
  it("splits a tall report image across multiple A4 pages without shrinking it to one page", () => {
    const placements = buildPdfImagePlacements({
      canvasWidth: 1000,
      canvasHeight: 3000,
      pageWidth: 210,
      pageHeight: 297,
      margin: 10,
    });

    expect(placements.length).toBeGreaterThan(1);
    expect(placements[0]).toMatchObject({
      addPageBefore: false,
      x: 10,
      y: 10,
      width: 190,
    });
    expect(placements[1].addPageBefore).toBe(true);
    expect(placements[1].y).toBeLessThan(10);
  });

  it("keeps a short report on one page", () => {
    const placements = buildPdfImagePlacements({
      canvasWidth: 1200,
      canvasHeight: 900,
      pageWidth: 210,
      pageHeight: 297,
      margin: 10,
    });

    expect(placements).toHaveLength(1);
    expect(placements[0].addPageBefore).toBe(false);
    expect(placements[0].height).toBeLessThan(277);
  });
});
