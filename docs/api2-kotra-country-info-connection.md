# API 2 Connection Note (KOTRA Country Info)

Date: 2026-04-23

## Source Spec
- Dataset: 대한무역투자진흥공사_국가정보
- Service name (guide): `natnInfo`
- Service ID (guide): `IF_API_1003`
- Base URL: `https://apis.data.go.kr/B410001/kotra_nationalInformation/natnInfo/natnInfo`

## Request Parameters
- `serviceKey` (required)
- `isoWd2CntCd` (required, 2-letter country code, e.g. `VN`)
- `_type=json` (used in runtime to enforce JSON response)

## Runtime Verification
Live call check on 2026-04-23:
- `type=json` => HTTP 500
- `_type=json` => HTTP 200 + JSON (`resultCode=00`)
- `type=xml` => HTTP 200 + XML

## Response Mapping Used
Input path: `response.body.itemList.item`

Used fields:
- `natnNm` / `natnHdsttNm` -> `country_name`
- `ecnmyTrendCntnt` / `ecnmyPrsptCntnt` / `mainInditArcv` / `poltcCntnt` -> rationale summary text

## Code Integration
- `supabase/functions/recommend-countries/index.ts`
  - Added live KOTRA fetch per seeded country using `isoWd2CntCd`.
  - Key resolution order: `KOTRA_API_KEY` -> `PUBLIC_DATA_API_KEY` -> `KICOX_API_KEY`.
  - Falls back to deterministic scoring when API is unavailable.
  - Logs API status to `api_call_logs` as `success`, `partial_success`, or `error`.
