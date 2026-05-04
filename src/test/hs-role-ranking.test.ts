import { describe, expect, it } from "vitest";
import {
  analyzeSearchRoles,
  normalizeMatchScores,
  rankHsCandidates,
  toHsCandidate,
  type HsSearchInput,
} from "../../supabase/functions/ai-hs-suggest/candidate-ranking";

const input = (overrides: Partial<HsSearchInput>): HsSearchInput => ({
  name: "",
  description: "제품 설명은 테스트 목적의 충분한 길이를 가진 문장입니다.",
  components: "",
  modelName: "",
  targetMarketNote: "",
  industryCode: "",
  ...overrides,
});

const candidateIndex = (items: ReturnType<typeof toHsCandidate>[], prefix: string): number =>
  items.findIndex((candidate) => candidate.hs_code.startsWith(prefix) || candidate.hsk_code.startsWith(prefix));

describe("HS role-based ranking", () => {
  it("prioritizes official stroller HSK when product name is stroller with part words in description", () => {
    const ranked = rankHsCandidates(input({
      name: "\uC720\uBAA8\uCC28",
      description:
        "\uC720\uBAA8\uCC28\uB294 \uC601\uC720\uC544\uB97C \uC549\uD788\uAC70\uB098 \uB204\uD600\uC11C \uC548\uC804\uD558\uAC8C \uC774\uB3D9\uC2DC\uD0A4\uB294 \uC6B4\uC1A1 \uAE30\uAD6C\uC785\uB2C8\uB2E4. \uC2DC\uD2B8, \uD504\uB808\uC784, \uBC14\uD034\uB85C \uAD6C\uC131\uB429\uB2C8\uB2E4.",
      components: "\uC720\uBAA8\uCC28",
      industryCode: "31991",
    })).slice(0, 12).map(toHsCandidate);

    const strollerIdx = candidateIndex(ranked, "871500");
    const lavatorySeatIdx = candidateIndex(ranked, "392220");

    expect(strollerIdx).toBe(0);
    expect(lavatorySeatIdx === -1 || strollerIdx < lavatorySeatIdx).toBe(true);
    expect(ranked[0].hsk_code).toBe("8715000000");
  });

  it("still prioritizes lavatory seat rows when product name is lavatory seat", () => {
    const ranked = rankHsCandidates(input({
      name: "\uBCC0\uAE30\uC6A9 \uC2DC\uD2B8",
      description:
        "\uD50C\uB77C\uC2A4\uD2F1 \uBCC0\uAE30\uC6A9 \uC2DC\uD2B8\uC640 \uCEE4\uBC84",
    })).slice(0, 12).map(toHsCandidate);

    const lavatorySeatIdx = candidateIndex(ranked, "392220");
    const strollerIdx = candidateIndex(ranked, "871500");

    expect(lavatorySeatIdx).toBe(0);
    expect(strollerIdx === -1 || lavatorySeatIdx < strollerIdx).toBe(true);
  });

  it("prioritizes vehicle seat rows over complete vehicle and generic auto-part rows", () => {
    const ranked = rankHsCandidates(input({
      name: "승용자동차 시트",
      description: "승용자동차에 장착되는 좌석용 시트 제품",
      industryCode: "30331",
    })).slice(0, 12).map(toHsCandidate);

    const seatIndex = candidateIndex(ranked, "940120");
    const vehicleIndex = candidateIndex(ranked, "8703");
    const autoPartIndex = candidateIndex(ranked, "8708");

    expect(seatIndex).toBeGreaterThanOrEqual(0);
    expect(vehicleIndex === -1 || seatIndex < vehicleIndex).toBe(true);
    expect(autoPartIndex === -1 || seatIndex < autoPartIndex).toBe(true);
  });

  it("separates semiconductor equipment case into core item and usage terms", () => {
    const roles = analyzeSearchRoles(input({
      name: "반도체 장비 케이스",
      description: "반도체 장비 외장 보호용 케이스",
    }));

    expect(roles.coreTerms).toContain("케이스");
    expect(roles.usageTerms).toEqual(expect.arrayContaining(["반도체", "장비"]));
  });

  it("uses material and partness as secondary modifiers for plastic filter parts", () => {
    const roles = analyzeSearchRoles(input({
      name: "플라스틱 필터 부품",
      description: "플라스틱 소재 필터 교체용 부품",
      components: "필터, 플라스틱",
    }));

    expect(roles.coreTerms).toContain("필터");
    expect(roles.materialTerms).toContain("플라스틱");
    expect(roles.partTerms).toContain("부품");
  });

  it("does not auto-confirm broad automotive part queries without a core item term", () => {
    const ranked = rankHsCandidates(input({
      name: "자동차 부품",
      description: "자동차에 사용되는 일반 부품",
      industryCode: "30331",
    }));

    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0].score).toBeLessThan(80);
  });

  it("ranks 차량용 의자(940120) above 변기용 시트(392220) for '승용자동차 시트'", () => {
    const ranked = rankHsCandidates(input({
      name: "승용자동차 시트",
      industryCode: "30331",
    })).slice(0, 12).map(toHsCandidate);

    const vehicleSeatIdx = candidateIndex(ranked, "940120");
    const lavatorySeatIdx = candidateIndex(ranked, "392220");
    const smokedSheetIdx = candidateIndex(ranked, "400121");

    expect(vehicleSeatIdx).toBeGreaterThanOrEqual(0);
    expect(lavatorySeatIdx === -1 || vehicleSeatIdx < lavatorySeatIdx).toBe(true);
    expect(smokedSheetIdx === -1 || vehicleSeatIdx < smokedSheetIdx).toBe(true);
  });

  it("correctly matches '고무 시트' to rubber sheet codes, not vehicle seats", () => {
    const ranked = rankHsCandidates(input({
      name: "고무 시트",
      description: "천연고무 시트 판재",
    })).slice(0, 10).map(toHsCandidate);

    const rubberIdx = candidateIndex(ranked, "4001");
    const seatIdx = candidateIndex(ranked, "9401");

    expect(rubberIdx === -1 || seatIdx === -1 || rubberIdx < seatIdx).toBe(true);
  });

  it("finds 차량용 의자(940120) when user searches '자동차 좌석' via synonym expansion", () => {
    const ranked = rankHsCandidates(input({
      name: "자동차 좌석",
    })).slice(0, 10).map(toHsCandidate);

    const seatIdx = candidateIndex(ranked, "940120");
    expect(seatIdx).toBeGreaterThanOrEqual(0);
  });

  it("normalizes scores so top candidate is below 100 and subsequent candidates have lower scores", () => {
    const raw = rankHsCandidates(input({
      name: "승용자동차 시트",
      description: "승용자동차에 장착되는 좌석용 시트 제품",
      industryCode: "30331",
    }));
    const normalized = normalizeMatchScores(raw.slice(0, 5));
    const scores = normalized.map((r) => r.score);

    // 1위는 100 미만 (ceiling 적용)
    expect(scores[0]).toBeLessThanOrEqual(98);
    expect(scores[0]).toBeGreaterThan(0);

    // 후보 간 차등이 존재
    expect(scores[0]).toBeGreaterThan(scores[scores.length - 1]);

    // toHsCandidate 변환 후에도 차등 유지
    const candidates = normalized.map(toHsCandidate);
    expect(candidates[0].match_score).toBeGreaterThan(candidates[candidates.length - 1].match_score);
  });

  it("applies lower ceiling for weak matches", () => {
    const raw = rankHsCandidates(input({
      name: "고무 호스",
    }));
    const normalized = normalizeMatchScores(raw.slice(0, 5));

    // 약한 매칭은 ceiling이 낮음 (75 이하)
    expect(normalized[0].score).toBeLessThanOrEqual(75);
    expect(normalized[0].score).toBeGreaterThan(0);
  });
});
