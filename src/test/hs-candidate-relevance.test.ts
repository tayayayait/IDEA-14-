import { describe, expect, it } from "vitest";
import { filterRelevantHsCandidates, type HsCandidateLike } from "@/lib/hs-candidate-relevance";

const peanutButter: HsCandidateLike = {
  hs_code: "200811",
  hsk_code: "2008111000",
  description: "피넛 버터 (Peanut butter) · 표준품명: 피넛버터(잼 혼합)",
};

const mirrorPart: HsCandidateLike = {
  hs_code: "700910",
  hsk_code: "7009100000",
  description: "백미러(차량용으로 한정한다) (Rear-view mirrors for vehicles)",
};

const memoryMachine: HsCandidateLike = {
  hs_code: "847990",
  hsk_code: "8479903000",
  description: "반도체 제조용 기기의 것 (Of machines and mechanical appliances for making semiconductor devices)",
};

const flashMemory: HsCandidateLike = {
  hs_code: "854232",
  hsk_code: "8542321030",
  description: "플래시 메모리 (Flash memory)",
};

const flashBulbMachine: HsCandidateLike = {
  hs_code: "847510",
  hsk_code: "8475100000",
  description: "전기램프나 전자램프ㆍ튜브ㆍ밸브ㆍ섬광전구(flashbulb)의 조립기계 (Machines for assembling flashbulbs)",
};

const flashEliminator: HsCandidateLike = {
  hs_code: "930591",
  hsk_code: "9305911070",
  description: "소염기와 그 부분품 (Flash eliminators and parts thereof)",
};

describe("hs-candidate relevance filtering", () => {
  it("filters out unrelated food keyword candidates for vehicle part products", () => {
    const filtered = filterRelevantHsCandidates([peanutButter, mirrorPart], {
      productName: "차량유리 백밀러케이스",
      description: "자동차 백미러 및 유리 주변 조립 부품",
      components: ["백미러", "차량유리"],
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].hsk_code).toBe("7009100000");
  });

  it("returns original list when no meaningful product tokens are provided", () => {
    const original = [peanutButter, mirrorPart];
    const filtered = filterRelevantHsCandidates(original, {
      productName: "",
      description: "",
      components: [],
    });

    expect(filtered).toEqual(original);
  });

  it("falls back to original list when every candidate is filtered out", () => {
    const original = [peanutButter];
    const filtered = filterRelevantHsCandidates(original, {
      productName: "자동차 부품",
      description: "차량용 하우징",
      components: ["사출"],
    });

    expect(filtered).toEqual(original);
  });

  it("blocks machine-like semiconductor equipment candidates for memory chip products", () => {
    const filtered = filterRelevantHsCandidates([memoryMachine, flashMemory], {
      productName: "DRAM. NAND Flash",
      description: "메모리 반도체 제품",
      components: ["DRAM", "NAND", "Flash"],
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].hsk_code).toBe("8542321030");
  });

  it("does not treat flashbulb machinery as memory candidate for NAND flash products", () => {
    const filtered = filterRelevantHsCandidates([flashBulbMachine, flashMemory], {
      productName: "NAND Flash",
      description: "메모리 반도체 칩",
      components: ["NAND", "Flash memory"],
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].hsk_code).toBe("8542321030");
  });

  it("excludes flash-eliminator candidate for memory chip query", () => {
    const filtered = filterRelevantHsCandidates([flashEliminator, flashMemory], {
      productName: "DRAM, NAND Flash",
      description: "메모리 반도체 칩",
      components: ["DRAM", "NAND", "Flash memory"],
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].hsk_code).toBe("8542321030");
  });
});
