export type AiRetryOptions = {
  maxAttempts: number;
  delayMs: number;
  isRetryable?: (error: unknown) => boolean;
};

export function isRetryableAiError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /The signal has been aborted|abort|timeout|timed out|network|fetch failed|(?:^|\D)(?:429|500|502|503|504)(?:\D|$)/i.test(message);
}

export async function withAiRetry<T>(
  operation: () => Promise<T>,
  options: AiRetryOptions,
): Promise<T> {
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts));
  const delayMs = Math.max(0, Math.floor(options.delayMs));
  const retryable = options.isRetryable ?? isRetryableAiError;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !retryable(error)) throw error;
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("AI request failed");
}
