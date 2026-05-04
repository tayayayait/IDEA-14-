import { describe, expect, it } from "vitest";
import {
  PROCEED_REVIEW_REQUIRED_LABEL,
  REQUIRE_PRODUCT_CONFIRMATION_FOR_STEP3,
} from "@/lib/step3-entry-policy";

describe("step3 entry policy", () => {
  it("exposes proceed-review label text", () => {
    expect(PROCEED_REVIEW_REQUIRED_LABEL).toBe("확인 필요 상태로 진행");
  });

  it("uses boolean flag for confirmation requirement", () => {
    expect(typeof REQUIRE_PRODUCT_CONFIRMATION_FOR_STEP3).toBe("boolean");
  });
});
