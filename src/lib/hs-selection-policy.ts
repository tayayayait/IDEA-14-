export type HsSelectionStatus = "high_confidence" | "review_required" | "insufficient";

export interface HsScoreCandidateLike {
  confidence: number;
  match_score?: number;
}

export type AutoSelectionDecision<T> = {
  topCandidate: T | null;
  selectedCandidate: T | null;
  topScore: number | null;
  status: HsSelectionStatus | null;
  reviewRequired: boolean;
  autoApplied: boolean;
};

export const HIGH_CONFIDENCE_MIN_SCORE = 80;
export const REVIEW_REQUIRED_MIN_SCORE = 60;
export const AUTO_SELECTION_MIN_SCORE = HIGH_CONFIDENCE_MIN_SCORE;

export function resolveCandidateScore(candidate: HsScoreCandidateLike): number {
  if (Number.isFinite(candidate.match_score)) {
    return Math.round(Math.max(0, Math.min(100, Number(candidate.match_score))));
  }
  return Math.round(normalizeConfidence(candidate.confidence) * 100);
}

export function resolveSelectionStatus(score: number): HsSelectionStatus {
  if (score >= HIGH_CONFIDENCE_MIN_SCORE) return "high_confidence";
  if (score >= REVIEW_REQUIRED_MIN_SCORE) return "review_required";
  return "insufficient";
}

export function sortCandidatesByScore<T extends HsScoreCandidateLike>(
  items: T[],
  getKey: (candidate: T) => string,
): T[] {
  return [...items].sort((left, right) => {
    const scoreDiff = resolveCandidateScore(right) - resolveCandidateScore(left);
    if (scoreDiff !== 0) return scoreDiff;
    const confidenceDiff = normalizeConfidence(right.confidence) - normalizeConfidence(left.confidence);
    if (confidenceDiff !== 0) return confidenceDiff;
    return getKey(left).localeCompare(getKey(right));
  });
}

export function decideAutoSelection<T extends HsScoreCandidateLike>(
  rankedCandidates: T[],
): AutoSelectionDecision<T> {
  const topCandidate = rankedCandidates[0] ?? null;
  if (!topCandidate) {
    return {
      topCandidate: null,
      selectedCandidate: null,
      topScore: null,
      status: null,
      reviewRequired: false,
      autoApplied: false,
    };
  }

  const topScore = resolveCandidateScore(topCandidate);
  const autoApplied = topScore >= AUTO_SELECTION_MIN_SCORE;
  return {
    topCandidate,
    selectedCandidate: autoApplied ? topCandidate : null,
    topScore,
    status: autoApplied ? "high_confidence" : "review_required",
    reviewRequired: !autoApplied,
    autoApplied,
  };
}

function normalizeConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
