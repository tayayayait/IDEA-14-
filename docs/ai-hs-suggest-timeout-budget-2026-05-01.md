# ai-hs-suggest Timeout Budget Fix

Date: 2026-05-01

## Facts

- Step 2 called `ai-hs-suggest` with a 12,000 ms client timeout.
- `ai-hs-suggest` also allowed the optional AI rerank request to run for 12,000 ms.
- If the optional AI rerank stalled, the server fallback response could be produced at the same time the client aborted the request.
- Browser DevTools then showed a failed Fetch/XHR request with no response body.

## Fix

- Edge AI rerank timeout: 15,000 ms.
- Step 2 `ai-hs-suggest` client timeout: 20,000 ms.
- Removed duplicate HS catalog ranking initialization from the Edge entrypoint. Ranking now initializes only in `candidate-ranking.ts`.

## Verification

- Added `src/test/ai-hs-suggest-timeout-budget.test.ts`.
- The test enforces at least a 4,000 ms margin between the Edge AI rerank timeout and every Step 2 `ai-hs-suggest` client timeout.
- The test also prevents reintroducing `HS_CATALOG.map` into the Edge entrypoint.
