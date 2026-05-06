# Dependency Compatibility

## Date Utilities

- `react-day-picker@8.10.1` requires `date-fns` peer range: `^2.28.0 || ^3.0.0`.
- This project pins `date-fns` to `^3.6.0` to satisfy that peer requirement.

## Install Command

- Preferred package manager: `pnpm`.
- Use `pnpm install` for dependency sync.
- Running `npm install` with `date-fns@4` causes a peer resolution failure (`ERESOLVE`).
- `package.json` declares `packageManager: pnpm@10.33.0` so Vercel/Corepack uses pnpm even though legacy npm/Bun lockfiles are still present.

## Vercel Deployment

- Vercel builds must run on Node.js 22.x for this Vite 5 build. Local verification on 2026-05-06: Node 24.12.0 exits after Vite module transform with code `3221226505`; Node 22.18.0 and Node 20.19.6 complete the same build.
- `package.json` declares `engines.node: 22.x` to override Vercel's current Node 24.x default.
- `vercel.json` pins the install command to `pnpm install --frozen-lockfile`, build command to `pnpm run build`, output directory to `dist`, framework preset to `vite`, and rewrites all SPA routes to `/index.html`.
- Vercel Project Settings must define at least `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`, `VITE_CONTEST_DEMO_EMAIL`, and `VITE_CONTEST_DEMO_PASSWORD` for the deployed client to behave like local `.env`.

## Vite Dev Server

- The dev server binds to `127.0.0.1:8080` with `strictPort: true`.
- Do not run separate `localhost:8080` and `127.0.0.1:8080` Vite servers at the same time. Mixed optimized dependency cache hashes can load multiple React module instances and trigger Radix/React invalid hook call errors.
- Vite dependency optimization is forced on dev server start to clear stale React/Radix optimized chunks.
