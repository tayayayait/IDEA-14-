type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type RetryOptions = {
  fetcher?: FetchLike;
  sleep?: (delayMs: number) => Promise<void>;
  maxAttempts?: number;
  retryDelayMs?: number;
};

const TRANSIENT_HTTP_STATUSES = new Set([502, 503, 504]);

export async function fetchKicoxWithRetry(
  input: RequestInfo | URL,
  options: RetryOptions = {},
): Promise<{ response: Response; attempts: number }> {
  const fetcher = options.fetcher ?? fetch;
  const sleep = options.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
  const maxAttempts = Math.max(1, options.maxAttempts ?? 2);
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? 500);

  for (let attempts = 1; attempts <= maxAttempts; attempts += 1) {
    const response = await fetcher(input);
    const shouldRetry = TRANSIENT_HTTP_STATUSES.has(response.status) && attempts < maxAttempts;
    if (!shouldRetry) return { response, attempts };
    await sleep(retryDelayMs);
  }

  throw new Error("KICOX retry loop ended unexpectedly");
}

export function kicoxHttpErrorMessage(status: number): string {
  if (TRANSIENT_HTTP_STATUSES.has(status)) {
    return `KICOX 공공데이터 서버가 일시적으로 응답하지 않습니다 (HTTP ${status}). 잠시 후 다시 시도하거나 아래에서 직접 입력해 주세요.`;
  }
  return `HTTP ${status}`;
}
