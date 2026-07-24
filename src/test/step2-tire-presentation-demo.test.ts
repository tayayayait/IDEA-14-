import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Step2 tire presentation candidate", () => {
  it("passes the tire-US presentation flag when Step2 saves recommendations", () => {
    const source = read("src/pages/Step2Product.tsx");
    const invokeIndex = source.indexOf('"recommend-countries"');
    const flagIndex = source.indexOf("presentation_demo_tire_us", invokeIndex);

    expect(invokeIndex).toBeGreaterThan(-1);
    expect(source).toContain("shouldEnableTireUsPresentationDemo");
    expect(flagIndex).toBeGreaterThan(invokeIndex);
  });
});
