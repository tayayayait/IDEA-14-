# Contest demo login

## Change
- Added optional contest demo credentials through `VITE_CONTEST_DEMO_EMAIL` and `VITE_CONTEST_DEMO_PASSWORD`.
- When both values exist, the auth page pre-fills the sign-in form and shows a `공모전 데모 로그인` button.
- The button calls Supabase email/password sign-in with the configured demo account.

## Security note
- The actual demo password is kept in local `.env`, not in tracked source files.
- Because Vite `VITE_*` variables are exposed to the browser bundle, this setting is only appropriate for a public demo account.

## Validation
- `npm test -- src/test/auth-demo-login.test.tsx`
- `npm test`
