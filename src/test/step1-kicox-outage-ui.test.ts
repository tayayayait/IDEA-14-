import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Step1 KICOX outage guidance", () => {
  it("labels a lookup failure without incorrectly blaming API authentication", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/Step1Company.tsx"), "utf8");

    expect(source).toContain("KICOX 조회에 실패했습니다");
    expect(source).not.toContain("API 인증 정보 미설정 또는 호출 실패");
  });
});
