import { describe, expect, it } from "vitest";
import { isStoredReportFresh, normalizeStoredReport } from "@/lib/report-persistence";

describe("report persistence", () => {
  it("treats a stored successful report as fresh only when the evidence hash matches", () => {
    const row = normalizeStoredReport({
      draft: { executiveSummary: "저장된 리포트" },
      evidence_hash: "ev_12345678",
      ai_state: "success",
      generated_at: "2026-05-02T00:00:00.000Z",
    });

    expect(isStoredReportFresh(row, "ev_12345678")).toBe(true);
    expect(isStoredReportFresh(row, "ev_87654321")).toBe(false);
  });

  it("does not reuse missing, failed, or malformed stored reports", () => {
    expect(isStoredReportFresh(null, "ev_12345678")).toBe(false);
    expect(isStoredReportFresh(normalizeStoredReport({ evidence_hash: "ev_12345678", ai_state: "error" }), "ev_12345678")).toBe(false);
    expect(isStoredReportFresh(normalizeStoredReport({ draft: null, evidence_hash: "ev_12345678", ai_state: "success" }), "ev_12345678")).toBe(false);
  });
});
