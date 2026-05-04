import { describe, expect, it } from "vitest";
import { computeProjectFeatureProgress, resolveProjectStepCompletion } from "@/lib/project-progress";

describe("computeProjectFeatureProgress", () => {
  it("returns 0% when no requirement is completed", () => {
    const progress = computeProjectFeatureProgress({
      companyReady: false,
      productReady: false,
      candidatesReady: false,
      certificationReady: false,
      regulationReady: false,
      countryIndustryRiskReady: false,
      exportPaymentRiskReady: false,
      reportReady: false,
    });
    expect(progress.completed).toBe(0);
    expect(progress.total).toBe(8);
    expect(progress.percent).toBe(0);
  });

  it("counts the combined country and industry risk requirement as one item", () => {
    const progress = computeProjectFeatureProgress({
      companyReady: true,
      productReady: true,
      candidatesReady: true,
      certificationReady: true,
      regulationReady: true,
      countryIndustryRiskReady: true,
      exportPaymentRiskReady: false,
      reportReady: false,
    });
    expect(progress.completed).toBe(6);
    expect(progress.percent).toBe(75);
  });

  it("returns 100% when all requirements are completed", () => {
    const progress = computeProjectFeatureProgress({
      companyReady: true,
      productReady: true,
      candidatesReady: true,
      certificationReady: true,
      regulationReady: true,
      countryIndustryRiskReady: true,
      exportPaymentRiskReady: true,
      reportReady: true,
    });
    expect(progress.completed).toBe(8);
    expect(progress.percent).toBe(100);
  });

  it("derives step completion with the same evidence rules as project progress", () => {
    const stepCompletion = resolveProjectStepCompletion({
      companyReady: true,
      productReady: true,
      candidatesReady: true,
      certificationReady: true,
      regulationReady: true,
      countryIndustryRiskReady: false,
      exportPaymentRiskReady: false,
      reportReady: false,
    });

    expect(stepCompletion[1]).toBe(true);
    expect(stepCompletion[2]).toBe(true);
    expect(stepCompletion[3]).toBe(true);
    expect(stepCompletion[4]).toBe(false);
    expect(stepCompletion[5]).toBe(false);
  });
});
