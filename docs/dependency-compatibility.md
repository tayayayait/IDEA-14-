# Dependency Compatibility

## Date Utilities

- `react-day-picker@8.10.1` requires `date-fns` peer range: `^2.28.0 || ^3.0.0`.
- This project pins `date-fns` to `^3.6.0` to satisfy that peer requirement.

## Install Command

- Preferred package manager: `pnpm`.
- Use `pnpm install` for dependency sync.
- Running `npm install` with `date-fns@4` causes a peer resolution failure (`ERESOLVE`).

## Vite Dev Server

- The dev server binds to `127.0.0.1:8080` with `strictPort: true`.
- Do not run separate `localhost:8080` and `127.0.0.1:8080` Vite servers at the same time. Mixed optimized dependency cache hashes can load multiple React module instances and trigger Radix/React invalid hook call errors.
- Vite dependency optimization is forced on dev server start to clear stale React/Radix optimized chunks.
