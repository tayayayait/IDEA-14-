import { describe, expect, it } from "vitest";
import {
  buildProductFeatures,
  buildProductInterpretationHint,
  buildProductOverview,
  deriveProductSubject,
  type ProductDescriptionInput,
} from "../../supabase/functions/_shared/product-description-rules";

const EMPTY_INPUT: ProductDescriptionInput = {
  companyName: "",
  industrialComplex: "",
  industryCode: "",
  region: "",
  mainProduct: "",
  productKeyword: "",
  components: "",
};

describe("product description rules", () => {
  it("interprets passenger automobile seat from the product name", () => {
    const productName = "\uC2B9\uC6A9\uC790\uB3D9\uCC28 \uC2DC\uD2B8";
    const subject = deriveProductSubject(productName);

    expect(subject).toBe("\uC2B9\uC6A9 \uC790\uB3D9\uCC28 \uC2DC\uD2B8");
    expect(buildProductInterpretationHint(productName, EMPTY_INPUT)).toContain(
      "\uB0B4\uBD80 \uC88C\uC11D \uBD80\uD488",
    );
    expect(buildProductOverview(subject)).toContain("\uC2E4\uB0B4\uC5D0 \uC7A5\uCC29");
    expect(buildProductOverview(subject)).not.toContain("\uBB34\uC5C7\uC778\uAC00\uC694");
    expect(buildProductFeatures(subject, EMPTY_INPUT)).toContain("\uCDA9\uACA9 \uD761\uC218");
  });

  it("starts rule-based known-product overviews as direct definitions", () => {
    const overview = buildProductOverview("\uCDA9\uC804\uC9C0");

    expect(overview).not.toContain("\uBB34\uC5C7\uC778\uAC00\uC694");
    expect(overview).toContain("\uC804\uAE30 \uC5D0\uB108\uC9C0");
  });

  it("does not fall back to the unknown generic wording for recognized vehicle seats", () => {
    const subject = deriveProductSubject("\uC2B9\uC6A9\uCC28 \uC2DC\uD2B8");
    const description = `${buildProductOverview(subject)} ${buildProductFeatures(subject, EMPTY_INPUT)}`;

    expect(description).not.toContain("\uC81C\uD488\uBA85\uC5D0\uC11C \uD655\uC778\uB418\uB294");
    expect(description).not.toContain("\uD655\uC2E4\uD55C \uC815\uBCF4 \uC5C6\uC74C");
  });

  it("interprets electronic material typo-like input instead of generic fallback", () => {
    const productName = "\uC804\uC790\uC790\uB8CC";
    const subject = deriveProductSubject(productName);
    const description = `${buildProductOverview(subject)} ${buildProductFeatures(subject, EMPTY_INPUT)}`;

    expect(subject).toBe("\uC804\uC790\uC7AC\uB8CC");
    expect(buildProductInterpretationHint(productName, EMPTY_INPUT)).toContain(
      "\uC804\uC790\uC7AC\uB8CC \uB610\uB294 \uC804\uC790\uBD80\uD488 \uACC4\uC5F4",
    );
    expect(description).toContain("\uC804\uC790\uBD80\uD488 \uC81C\uC870");
    expect(description).not.toContain("\uC81C\uD488\uBA85\uC5D0\uC11C \uD655\uC778\uB418\uB294");
  });
});
