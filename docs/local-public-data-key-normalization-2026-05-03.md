# Local Public Data Key Normalization

Date: 2026-05-03

## Finding
- The local `.env` uses the valid public data portal key under `PUBLIC_DATA_API_KEY`.
- Supabase deployed secrets also contain `PUBLIC_DATA_API_KEY`.
- The DS00000128 KOTRA import-regulation API accepts this key and returns `resultCode=0`.
- A local manual PowerShell call can fail with HTTP 401 if the `.env` value is read literally with surrounding quotes.

## Change
- Edge functions now normalize API key env values before outbound calls.
- Supported key env names remain unchanged:
  - KOTRA flows: `KOTRA_API_KEY`, `PUBLIC_DATA_API_KEY`, `KICOX_API_KEY`
  - Import regulation sync: `KOTRA_API_KEY`, `PUBLIC_DATA_API_KEY`, `PUBLIC_DATA_PORTAL_KEY`
- Normalization trims whitespace and strips matching single or double quotes.

## Affected Functions
- `supabase/functions/country-detail/index.ts`
- `supabase/functions/recommend-countries/index.ts`
- `supabase/functions/recommend-country-news/index.ts`
- `supabase/functions/sync-kotra-import-regulations/index.ts`

## Operational Note
- Local `.env` does not need a separate `KOTRA_API_KEY` as long as `PUBLIC_DATA_API_KEY` is present.
- If running local Supabase Edge Functions, pass the env file to the serve command so Deno receives these variables.
