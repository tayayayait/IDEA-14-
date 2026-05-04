import { describe, expect, it } from "vitest";
import { normalizeMainProduct } from "../../supabase/functions/api-kicox-search/main-product.ts";

describe("normalizeMainProduct", () => {
  it("removes empty comma tokens", () => {
    const normalized = normalizeMainProduct(", , , , computer, , aircon, gas chiller,,");
    expect(normalized).toBe("computer, aircon, gas chiller");
  });

  it("normalizes mixed separators into comma list", () => {
    const normalized = normalizeMainProduct("motor | sensor / controller \u00B7 valve; pump");
    expect(normalized).toBe("motor, sensor, controller, valve, pump");
  });

  it("deduplicates case-insensitively while preserving order", () => {
    const normalized = normalizeMainProduct("Sensor, sensor, SENSOR, motor, motor");
    expect(normalized).toBe("Sensor, motor");
  });

  it("returns empty string when there are no meaningful tokens", () => {
    const normalized = normalizeMainProduct(", , , ;;; |||");
    expect(normalized).toBe("");
  });

  it("keeps a single product token with compact spacing", () => {
    const normalized = normalizeMainProduct("   semiconductor   pkg   ");
    expect(normalized).toBe("semiconductor pkg");
  });
});
