import type { ApiState } from "@/components/ApiStateChip";

export type ExecutionState = "idle" | "running" | "partial_success" | "success" | "error" | "stale";

const EXECUTION_STATE_MAP: Record<string, ExecutionState> = {
  idle: "idle",
  running: "running",
  loading: "running",
  success: "success",
  partial_success: "partial_success",
  empty: "partial_success",
  error: "error",
  stale: "stale",
};

export function normalizeExecutionState(
  value: string | null | undefined,
  fallback: ExecutionState = "idle",
): ExecutionState {
  const normalized = (value ?? "").toLowerCase();
  return EXECUTION_STATE_MAP[normalized] ?? fallback;
}

export function toApiChipState(state: ExecutionState): ApiState {
  if (state === "running") return "running";
  return state;
}

export function isExecutionRunning(state: ExecutionState): boolean {
  return state === "running";
}

