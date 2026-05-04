import { describe, expect, it } from "vitest";
import {
  formatCustomsExportAmount,
  formatCustomsExportStatus,
  resolveStep3RunningMessage,
} from "@/pages/Step3Countries";
import { normalizeExecutionState } from "@/lib/execution-state";

describe("step3 ui state", () => {
  it("shows staged progress message while recommendation is running", () => {
    expect(resolveStep3RunningMessage(0)).toContain("시작");
    expect(resolveStep3RunningMessage(12)).toContain("후보국 데이터");
    expect(resolveStep3RunningMessage(28)).toContain("근거 데이터");
    expect(resolveStep3RunningMessage(52)).toContain("지연");
  });

  it("normalizes legacy API states to unified execution states", () => {
    expect(normalizeExecutionState("loading")).toBe("running");
    expect(normalizeExecutionState("empty")).toBe("partial_success");
    expect(normalizeExecutionState("stale")).toBe("stale");
  });

  it("formats customs export amounts for always-visible Step 3 labels", () => {
    expect(formatCustomsExportAmount(null)).toBe("-");
    expect(formatCustomsExportAmount(604_276_062)).toBe("$604.3M");
    expect(formatCustomsExportAmount(1_200_000_000)).toBe("$1.2B");
  });

  it("shows an explicit customs lookup state for countries without export amount", () => {
    expect(formatCustomsExportStatus(null, "loading")).toContain("조회 중");
    expect(formatCustomsExportStatus(null, "done")).toContain("조회 결과 없음");
    expect(formatCustomsExportStatus(null, "error")).toContain("조회 실패");
    expect(formatCustomsExportStatus(118_000, "done")).toBe("최근 12개월 HS/HSK 수출액 $118K");
  });
});
