import { describe, expect, it } from "vitest";
import {
  isSourceReadyForCompletion,
  SAFETYKOREA_APPROVAL_PENDING_LABEL,
  resolveSourceStatusView,
} from "@/lib/source-status";

describe("source-status", () => {
  it("maps success status to 조회 성공", () => {
    const view = resolveSourceStatusView(
      { status: "success", response_count: 2, error_code: null, http_status: 200 },
      "kotra_country_info",
    );
    expect(view.statusLabel).toBe("조회 성공");
    expect(view.statusNote).toBeNull();
    expect(view.chipState).toBe("success");
  });

  it("maps empty status to 조회 결과 없음", () => {
    const view = resolveSourceStatusView(
      { status: "empty", response_count: 0, error_code: null, http_status: 200 },
      "kotra_market_news",
    );
    expect(view.statusLabel).toBe("조회 결과 없음");
    expect(view.chipState).toBe("partial_success");
  });

  it("maps running status to 실행 중", () => {
    const view = resolveSourceStatusView(
      { status: "running", response_count: 0, error_code: null, http_status: null },
      "kotra_market_news",
    );
    expect(view.statusLabel).toBe("실행 중");
    expect(view.chipState).toBe("running");
  });

  it("maps missing log to 미실행", () => {
    const view = resolveSourceStatusView(null, "ksure_country_risk");
    expect(view.statusLabel).toBe("미실행");
    expect(view.chipState).toBe("idle");
  });

  it("maps safetykorea key missing to API 승인 대기 note", () => {
    const view = resolveSourceStatusView(
      { status: "error", response_count: 0, error_code: "safetykorea_api_key_missing", http_status: null },
      "safetykorea_recall",
    );
    expect(view.statusLabel).toBe("미실행");
    expect(view.statusNote).toBe(SAFETYKOREA_APPROVAL_PENDING_LABEL);
    expect(view.chipState).toBe("idle");
  });

  it("does not mark core API with zero response as ready", () => {
    const ready = isSourceReadyForCompletion(
      { status: "success", response_count: 0, error_code: null, http_status: 200 },
      "kotra_country_info",
    );
    expect(ready).toBe(false);
  });

  it("marks non-core empty response as ready when call completed", () => {
    const ready = isSourceReadyForCompletion(
      { status: "empty", response_count: 0, error_code: null, http_status: 200 },
      "trade_security_hsk_strategic",
    );
    expect(ready).toBe(true);
  });
});
