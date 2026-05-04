import { describe, expect, it } from "vitest";
import { HS_CATALOG } from "../../supabase/functions/ai-hs-suggest/hs-catalog";

function byHsk(code: string) {
  return HS_CATALOG.find((row) => row.hsk === code);
}

describe("HS catalog mappings", () => {
  it("preserves official source metadata for stroller HSK", () => {
    const stroller = byHsk("8715000000") as
      | (NonNullable<ReturnType<typeof byHsk>> & Record<string, string>)
      | undefined;

    expect(stroller).toBeTruthy();
    expect(stroller?.ko_name).toBe("\uC720\uBAA8\uCC28\uC640 \uADF8 \uBD80\uBD84\uD488");
    expect(stroller?.en_name).toBe("Baby carriages and parts thereof.");
    expect(stroller?.start_date).toBe("2002-01-01");
    expect(stroller?.end_date).toBe("2026-12-31");
    expect(stroller?.weight_unit).toBe("KG");
    expect(stroller?.nature_code_name).toBe("\uAE30\uD0C0 \uC218\uC1A1\uC7A5\uBE44");
  });

  it("maps DRAM/SRAM HSK codes to official customs names", () => {
    const dram = byHsk("8542321010");
    const sram = byHsk("8542321020");

    expect(dram).toBeTruthy();
    expect(sram).toBeTruthy();

    expect(dram?.ko_name).toBe("디램");
    expect(dram?.en_name).toContain("DRAM");
    expect(sram?.ko_name).toBe("에스램");
    expect(sram?.en_name).toContain("SRAM");
  });

  it("keeps hs6 consistent with hsk prefix", () => {
    const rows = HS_CATALOG.filter((row) => row.hsk.startsWith("854232"));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.hs6).toBe(row.hsk.slice(0, 6));
    }
  });
});
