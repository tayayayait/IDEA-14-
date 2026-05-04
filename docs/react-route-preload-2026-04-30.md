# React route preload optimization (2026-04-30)

## Scope
- Applied the Vercel React best-practice `bundle-preload` pattern to the Vite React router setup.
- Kept the existing route-level `React.lazy` split points and reused the same dynamic import loaders for intent-based preloading.

## Changes
- Added `src/lib/route-preload.ts` to centralize lazy page loaders and route-to-page mapping.
- Updated `src/App.tsx` to consume the shared page loaders, preventing separate lazy/preload import definitions.
- Added hover/focus preloading to top navigation, side step navigation, and mobile step navigation.
- Added route mapping tests in `src/test/route-preload.test.ts`.

## Expected effect
- Route chunks can start downloading on user intent before click/tap navigation.
- The behavior does not change server data fetching or Supabase calls.

## Verification
- `npm test` passed: 43 test files, 229 tests.
- `node ./node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit` passed.
- `npm run build` did not complete in this local Windows environment: `node.exe` exited with `-1073740791` after Vite transformed 3334 modules, with no TypeScript or Vite error line emitted.
