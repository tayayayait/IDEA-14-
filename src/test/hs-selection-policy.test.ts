import { describe, expect, it } from "vitest";
import {
  AUTO_SELECTION_MIN_SCORE,
  decideAutoSelection,
  resolveCandidateScore,
  resolveSelectionStatus,
  sortCandidatesByScore,
  type HsScoreCandidateLike,
} from "@/lib/hs-selection-policy";

type Candidate = HsScoreCandidateLike & { key: string };

describe("HS selection policy", () => {
  it("sorts candidates by score then confidence", () => {
    const items: Candidate[] = [
      { key: "a", match_score: 72, confidence: 0.7 },
      { key: "b", match_score: 88, confidence: 0.4 },
      { key: "c", match_score: 88, confidence: 0.9 },
    ];

    const sorted = sortCandidatesByScore(items, (candidate) => candidate.key);
    expect(sorted.map((candidate) => candidate.key)).toEqual(["c", "b", "a"]);
  });

  it("applies auto selection only for high confidence top score", () => {
    const high = decideAutoSelection([
      { key: "high", match_score: AUTO_SELECTION_MIN_SCORE, confidence: 0.7 },
      { key: "low", match_score: 55, confidence: 0.9 },
    ]);
    expect(high.autoApplied).toBe(true);
    expect(high.status).toBe("high_confidence");
    expect((high.selectedCandidate as { key: string } | null)?.key).toBe("high");

    const low = decideAutoSelection([
      { key: "review", match_score: AUTO_SELECTION_MIN_SCORE - 1, confidence: 0.95 },
    ]);
    expect(low.autoApplied).toBe(false);
    expect(low.status).toBe("review_required");
    expect(low.selectedCandidate).toBeNull();
  });

  it("keeps score and status thresholds deterministic", () => {
    expect(resolveCandidateScore({ confidence: 0.64 })).toBe(64);
    expect(resolveSelectionStatus(80)).toBe("high_confidence");
    expect(resolveSelectionStatus(79)).toBe("review_required");
    expect(resolveSelectionStatus(59)).toBe("insufficient");
  });
});
