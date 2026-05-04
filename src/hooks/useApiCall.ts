import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ApiState } from "@/components/ApiStateChip";
import { normalizeExecutionState } from "@/lib/execution-state";

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_RETRY_500_MS = 1000;
const DEFAULT_RETRY_429_SEC = 60;
const EDGE_CPU_LIMIT_STATUS = 546;

const API_STATES: ApiState[] = [
  "idle",
  "running",
  "loading",
  "success",
  "partial_success",
  "empty",
  "error",
  "stale",
];

export interface ApiInvokeOptions {
  timeoutMs?: number;
  retryOn500?: boolean;
  retryOn429?: boolean;
  retry500DelayMs?: number;
  retry429DelaySec?: number;
  requireAuth?: boolean;
}

export interface ApiInvokeResult<T> {
  ok: boolean;
  data: T | null;
  state: ApiState;
  message: string | null;
  status: number | null;
  attempts: number;
  retried: boolean;
}

export function useApiCall() {
  const [retryInSec, setRetryInSec] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => clearRetryTimer();
  }, []);

  const clearRetryTimer = () => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startCountdown = (seconds: number) => {
    clearRetryTimer();
    setRetryInSec(seconds);
    timerRef.current = window.setInterval(() => {
      setRetryInSec((prev) => {
        if (prev <= 1) {
          clearRetryTimer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const invoke = async <T>(
    functionName: string,
    body: unknown,
    options: ApiInvokeOptions = {},
  ): Promise<ApiInvokeResult<T>> => {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const retryOn500 = options.retryOn500 ?? true;
    const retryOn429 = options.retryOn429 ?? true;
    const retry500DelayMs = options.retry500DelayMs ?? DEFAULT_RETRY_500_MS;
    const retry429DelaySec = options.retry429DelaySec ?? DEFAULT_RETRY_429_SEC;
    const requireAuth = options.requireAuth ?? true;

    const authHeaders = await resolveAuthHeaders(requireAuth);
    if (authHeaders.ok === false) {
      return {
        ok: false,
        data: null,
        state: "error",
        message: authHeaders.message,
        status: 401,
        attempts: 0,
        retried: false,
      };
    }

    const runOnce = async () => {
      const res = await (supabase.functions.invoke(functionName, {
        body,
        timeout: timeoutMs,
        headers: authHeaders.headers,
      }) as Promise<{ data: T | null; error: unknown; response?: Response }>);
      return res;
    };

    const first = await runOnce();
    const firstStatus = extractStatus(first.error, first.response);
    const firstTimeout = isTimeoutError(first.error);

    if (!first.error) {
      const state = deriveState(first.data);
      return {
        ok: state !== "error",
        data: first.data,
        state,
        message: extractMessage(first.data),
        status: firstStatus,
        attempts: 1,
        retried: false,
      };
    }

    if (firstStatus === 429 && retryOn429) {
      setIsRetrying(true);
      startCountdown(retry429DelaySec);
      await sleep(retry429DelaySec * 1000);
      clearRetryTimer();
      setRetryInSec(0);
      const second = await runOnce();
      setIsRetrying(false);
      if (!second.error) {
        const state = deriveState(second.data);
        return {
          ok: state !== "error",
          data: second.data,
          state,
          message: extractMessage(second.data),
          status: extractStatus(second.error, second.response),
          attempts: 2,
          retried: true,
        };
      }
      return normalizeError<T>(second.error, second.response, 2);
    }

    if (isRetriableServerStatus(firstStatus) && retryOn500) {
      setIsRetrying(true);
      await sleep(retry500DelayMs);
      const second = await runOnce();
      setIsRetrying(false);
      if (!second.error) {
        const state = deriveState(second.data);
        return {
          ok: state !== "error",
          data: second.data,
          state,
          message: extractMessage(second.data),
          status: extractStatus(second.error, second.response),
          attempts: 2,
          retried: true,
        };
      }
      return normalizeError<T>(second.error, second.response, 2);
    }

    if (firstTimeout) {
      return {
        ok: false,
        data: null,
        state: "stale",
        message: "요청 지연이 감지되었습니다. 잠시 후 다시 실행하거나 네트워크 상태를 확인해 주세요.",
        status: firstStatus,
        attempts: 1,
        retried: false,
      };
    }

    return normalizeError<T>(first.error, first.response, 1);
  };

  return {
    invoke,
    retryInSec,
    isRetrying,
  };
}

type AuthHeaderResult =
  | { ok: true; headers?: Record<string, string> }
  | { ok: false; message: string };

async function resolveAuthHeaders(requireAuth: boolean): Promise<AuthHeaderResult> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    const accessToken = data.session?.access_token;
    if (!accessToken) {
      if (!requireAuth) return { ok: true };
      return { ok: false, message: "로그인이 필요합니다. 다시 로그인해 주세요." };
    }

    return {
      ok: true,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    };
  } catch (error) {
    if (!requireAuth) return { ok: true };
    const message = String((error as { message?: unknown } | null | undefined)?.message ?? "").trim();
    return {
      ok: false,
      message: message || "로그인 세션을 확인할 수 없습니다. 다시 로그인해 주세요.",
    };
  }
}

function normalizeError<T>(error: unknown, response: Response | undefined, attempts: number): ApiInvokeResult<T> {
  const status = extractStatus(error, response);
  return {
    ok: false,
    data: null,
    state: "error",
    message: messageForError(status, error, attempts),
    status,
    attempts,
    retried: attempts > 1,
  };
}

function extractStatus(error: unknown, response?: Response): number | null {
  if (response?.status != null) return response.status;

  const context = (error as { context?: unknown } | null | undefined)?.context as
    | { status?: number }
    | undefined;
  if (typeof context?.status === "number") return context.status;

  const msg = (error as { message?: unknown } | null | undefined)?.message;
  if (typeof msg === "string") {
    const matched = msg.match(/\b(401|403|408|429|500|502|503|504|546)\b/);
    if (matched) return Number(matched[1]);
  }
  return null;
}

export function isRetriableServerStatus(status: number | null): boolean {
  return status != null && status >= 500 && status !== EDGE_CPU_LIMIT_STATUS;
}

function isTimeoutError(error: unknown): boolean {
  const msg = String((error as { message?: unknown } | null | undefined)?.message ?? "").toLowerCase();
  return msg.includes("abort") || msg.includes("timeout") || msg.includes("timed out");
}

function messageForError(status: number | null, error: unknown, attempts: number): string {
  if (status === 401 || status === 403) {
    return "API 접근 권한을 확인해 주세요. 권한 오류는 자동 재시도하지 않습니다.";
  }
  if (status === 429) {
    return attempts > 1
      ? "요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요."
      : "요청 한도를 초과했습니다. 60초 후 자동 재시도합니다.";
  }
  if (status === EDGE_CPU_LIMIT_STATUS) {
    return "Edge Function CPU limit exceeded. Retry is disabled for this deterministic server resource error.";
  }
  if (status != null && status >= 500) {
    return attempts > 1
      ? "제공기관 API가 불안정합니다. 잠시 후 다시 시도해 주세요."
      : "제공기관 API가 불안정합니다. 1회 자동 재시도합니다.";
  }
  if (isTimeoutError(error)) {
    return "요청 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (isEdgeTransportError(error)) {
    return "분석 서버 연결에 실패했습니다. 네트워크 상태 또는 서버 배포 상태를 확인한 뒤 다시 시도해 주세요.";
  }
  return (
    String((error as { message?: unknown } | null | undefined)?.message ?? "").trim() ||
    "요청 처리 중 오류가 발생했습니다."
  );
}

function isEdgeTransportError(error: unknown): boolean {
  const msg = String((error as { message?: unknown } | null | undefined)?.message ?? "").toLowerCase();
  return (
    msg.includes("failed to send a request to the edge function") ||
    msg.includes("failed to fetch") ||
    msg.includes("network error")
  );
}

function deriveState<T>(data: T | null): ApiState {
  const state = (data as { state?: unknown } | null | undefined)?.state;
  if (typeof state === "string" && API_STATES.includes(state as ApiState)) {
    return normalizeLegacyState(state as ApiState);
  }
  if ((data as { partial_score?: unknown } | null | undefined)?.partial_score === true) {
    return "partial_success";
  }
  return "success";
}

function extractMessage<T>(data: T | null): string | null {
  const message = (data as { message?: unknown } | null | undefined)?.message;
  if (typeof message === "string" && message.trim()) return message;

  const error = (data as { error?: unknown } | null | undefined)?.error;
  if (typeof error === "string" && error.trim()) return error;
  return null;
}

function normalizeLegacyState(state: ApiState): ApiState {
  const normalized = normalizeExecutionState(state, "idle");
  if (normalized === "running") return "running";
  if (normalized === "partial_success") return "partial_success";
  return normalized;
}
