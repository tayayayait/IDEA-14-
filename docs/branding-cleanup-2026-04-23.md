# Branding cleanup (2026-04-23)

## Summary
- Removed Lovable-facing branding from the web entry metadata.
- Removed the `lovable-tagger` development plugin to prevent Lovable UI tagging overlays.
- Replaced user-facing copy that mentioned `Lovable AI` with neutral `AI model (Gemini)`.
- Replaced browser tab icon assets (`favicon.svg`, `favicon.ico`) with project-owned icon files.
- Added explicit icon links in `index.html` with a version query to reduce favicon cache reuse.
- Rewrote `index.html` to remove malformed meta tag quotes and control-character corruption that caused Vite HTML parse errors.
- Removed `@tanstack/query-core` from Vite `resolve.dedupe` to prevent React Query core version mismatch during bundling.

## Changed files
- `index.html`
- `vite.config.ts`
- `src/pages/Step2Product.tsx`
- `public/favicon.svg`
- `public/favicon.ico`
- `package.json`
- `pnpm-lock.yaml`

## Verification
- `npm test`
