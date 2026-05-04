import { cn } from "@/lib/utils";

export type ApiState =
  | "idle"
  | "running"
  | "success"
  | "partial_success"
  | "error"
  | "stale"
  | "loading"
  | "empty";

const MAP: Record<ApiState, { ko: string; cls: string }> = {
  idle: { ko: "대기", cls: "bg-muted text-muted-foreground" },
  running: { ko: "실행 중", cls: "bg-risk-reviewable-soft text-risk-reviewable" },
  loading: { ko: "조회 중", cls: "bg-risk-reviewable-soft text-risk-reviewable" },
  success: { ko: "정상", cls: "bg-risk-priority-soft text-risk-priority" },
  partial_success: { ko: "부분 산출", cls: "bg-risk-caution-soft text-risk-caution" },
  empty: { ko: "조회 결과 없음", cls: "bg-risk-unknown-soft text-risk-unknown" },
  error: { ko: "오류", cls: "bg-risk-high-soft text-risk-high" },
  stale: { ko: "오래됨", cls: "bg-risk-unknown-soft text-risk-unknown" },
};

export function ApiStateChip({ state, className }: { state: ApiState; className?: string }) {
  const mapped = MAP[state];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium", mapped.cls, className)}>
      {mapped.ko}
    </span>
  );
}
