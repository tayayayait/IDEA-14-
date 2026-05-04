export interface StoredReportSnapshot {
  draft: unknown;
  evidenceHash: string;
  aiState: string;
  generatedAt: string | null;
}

export const normalizeStoredReport = (value: unknown): StoredReportSnapshot | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const evidenceHash = typeof row.evidence_hash === "string" ? row.evidence_hash : "";
  const aiState = typeof row.ai_state === "string" ? row.ai_state : "";
  const generatedAt = typeof row.generated_at === "string" ? row.generated_at : null;

  return {
    draft: row.draft ?? null,
    evidenceHash,
    aiState,
    generatedAt,
  };
};

export const isStoredReportFresh = (
  storedReport: StoredReportSnapshot | null,
  currentEvidenceHash: string,
): boolean => {
  if (!storedReport) return false;
  if (!currentEvidenceHash || storedReport.evidenceHash !== currentEvidenceHash) return false;
  if (storedReport.aiState !== "success" && storedReport.aiState !== "partial_success" && storedReport.aiState !== "local_fallback") {
    return false;
  }
  return Boolean(storedReport.draft && typeof storedReport.draft === "object");
};
