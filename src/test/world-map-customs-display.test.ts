import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("world map customs export display", () => {
  it("renders customs export amounts outside hover-only tooltip content", () => {
    const source = readFileSync(join(process.cwd(), "src/components/WorldMapChart.tsx"), "utf8");

    expect(source).toContain("최근 12개월 HS/HSK 수출액");
    expect(source).toContain('customsLookupState !== "idle" && top3.length > 0');
    expect(source).toContain("조회 결과 없음");
    expect(source).toContain("key={`${c.country_code}-customs-export`}");
  });
});
