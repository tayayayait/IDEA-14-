# API Registry Syntax Fix (2026-04-23)

## Issue

- `src/lib/api-registry.ts` contained corrupted string literals with missing closing quotes.
- Vite failed to compile with:
  - `Unterminated string constant`
  - `Expected ',', got 'org'`

## Change

- Rewrote `src/lib/api-registry.ts` with valid UTF-8 string literals.
- Preserved all API identifiers and integration-critical fields:
  - `key`
  - `endpoint`
  - `secret`
- Normalized display text fields (`name`, `org`, `purpose`, `license`) to stable, parse-safe values.

## Result

- TypeScript parsing error source removed.
- Build-time import of `API_REGISTRY` can proceed without syntax failure.
