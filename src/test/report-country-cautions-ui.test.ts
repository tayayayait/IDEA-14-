import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("report country caution cards", () => {
  it("renders AI country caution cards instead of raw API caution list calls", () => {
    const source = read("src/pages/Step6Report.tsx");

    expect(source).toContain("CountryCautionCards");
    expect(source).toContain("CountryCautionIntegratedAnalysis");
    expect(source).toContain("인증·규제 확인");
    expect(source).toContain("K-SURE 위험·결제 조건");
    expect(source).toContain("AI 국가별 유의사항 분석 미생성");
    expect(source).toContain("Gemini 분석 결과가 없어 원천 데이터 단순 나열을 표시하지 않습니다.");
    expect(source).not.toContain("buildCountryCautions(bundle, country)");
    expect(source).not.toContain("CountryCautionSectionView");
    expect(source).not.toContain("{index}. {section.title}");
  });
});
