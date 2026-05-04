import { describe, expect, it } from "vitest";
import { collectActiveDomainRules, scoreDomainRuleAdjustment } from "../../supabase/functions/ai-hs-suggest/domain-rules";

describe("HS domain rule table", () => {
  it("activates memory semiconductor rule with industry code context", () => {
    const active = collectActiveDomainRules(new Set(["dram", "nand", "flash", "memory"]), "26111");
    const memoryRule = active.find((item) => item.rule.id === "memory-semiconductor");

    expect(memoryRule).toBeTruthy();
    expect(memoryRule?.industryMatched).toBe(true);
  });

  it("boosts memory chapter rows and penalizes manufacturing equipment rows", () => {
    const active = collectActiveDomainRules(new Set(["dram", "nand", "flash", "memory"]), "26111");

    const memoryCandidate = scoreDomainRuleAdjustment({
      hs6: "854232",
      rowSearch: "flash memory integrated circuits: memories",
      activeRules: active,
    });
    const machineCandidate = scoreDomainRuleAdjustment({
      hs6: "848640",
      rowSearch: "machines and mechanical appliances for making semiconductor devices transport, handling and storage",
      activeRules: active,
    });

    expect(memoryCandidate.score).toBeGreaterThan(0);
    expect(machineCandidate.score).toBeLessThan(0);
  });

  it("applies automotive deny chapters to food-like candidates", () => {
    const active = collectActiveDomainRules(new Set(["자동차", "차량", "백미러"]), "30331");

    const score = scoreDomainRuleAdjustment({
      hs6: "200811",
      rowSearch: "peanut butter preserved food",
      activeRules: active,
    });

    expect(score.score).toBeLessThan(0);
  });
});
