import { describe, expect, it } from "vitest";
import { getPageKeyForPath } from "@/lib/route-preload";

describe("route preload mapping", () => {
  it("maps public routes to their lazy page chunk", () => {
    expect(getPageKeyForPath("/")).toBe("index");
    expect(getPageKeyForPath("/auth")).toBe("auth");
    expect(getPageKeyForPath("/projects")).toBe("projects");
    expect(getPageKeyForPath("/data-sources")).toBe("dataSources");
    expect(getPageKeyForPath("/kc-recall")).toBe("kcRecallLookup");
  });

  it("maps project workflow routes to the correct step chunks", () => {
    expect(getPageKeyForPath("/projects/p1/company")).toBe("step1Company");
    expect(getPageKeyForPath("/projects/p1/product")).toBe("step2Product");
    expect(getPageKeyForPath("/projects/p1/countries")).toBe("step3Countries");
    expect(getPageKeyForPath("/projects/p1/countries/US")).toBe("step4CountryDetail");
    expect(getPageKeyForPath("/projects/p1/safety")).toBe("step3Countries");
    expect(getPageKeyForPath("/projects/p1/report?from=safety")).toBe("step6Report");
  });
});
