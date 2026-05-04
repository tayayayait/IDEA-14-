import { describe, expect, it } from "vitest";
import {
  getRegionSearchTokens,
  matchesRegionFilter,
  toApiRegionParam,
} from "../../supabase/functions/api-kicox-search/region.ts";

describe("kicox region normalization", () => {
  it("converts short region names to API-friendly full names", () => {
    expect(toApiRegionParam("경북")).toBe("경상북도");
    expect(toApiRegionParam("강원")).toBe("강원특별자치도");
    expect(toApiRegionParam("")).toBe("");
  });

  it("expands search tokens for short and full region aliases", () => {
    expect(getRegionSearchTokens("경북")).toEqual(["경상북도", "경북"]);
    expect(getRegionSearchTokens("전북")).toEqual(["전북특별자치도", "전라북도", "전북"]);
  });

  it("matches filter when address uses a full region but query uses abbreviation", () => {
    expect(matchesRegionFilter("경북", "경상북도 구미시 3공단2로 300", "")).toBe(true);
  });

  it("does not match unrelated regions", () => {
    expect(matchesRegionFilter("서울", "경기도 성남시 분당구", "경기도")).toBe(false);
  });
});
