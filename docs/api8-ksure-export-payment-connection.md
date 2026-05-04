# API 8 Connection Note (K-SURE Export Payment Info)

Date: 2026-04-23

## Source Spec
- Dataset: 한국무역보험공사_수출결제정보
- Version: `1.0.0`
- Function: `getPaymentInfo`
- Endpoint: `https://apis.data.go.kr/B552696/exportPayment/getPaymentInfo`

## Request Parameters Used
- `serviceKey` (required)
- `ctryCd` (optional; country code)
- `type=json` (runtime JSON response)

## Runtime Verification
Live call check on 2026-04-23:
- Country-filter call example (`ctryCd=VN`):
  - HTTP 200
  - `response.header.resultCode=3` (`데이터 없음`)
- Unfiltered call:
  - HTTP 200
  - `response.header.resultCode=0`
  - `response.header.resultMsg=NORMAL SERVICE.`
  - Payload fields confirmed:
    - `lastUpdateDate`
    - `yearList`
    - `paymentTerms[]`
    - `averagePaymentPeriod[]`
    - `latePaymentRate[]`
    - `averagelatePaymentPeriod[]`
    - `paymentPeriod[]`

Live call re-check on 2026-04-29:
- `ctryCd=JP` and `ctryCd=VN` both returned HTTP 200 with `response.header.resultCode=3` (`데이터 없음`).
- Unfiltered call returned HTTP 200/resultCode 0 with one aggregate item and fields `lastUpdateDate`, `yearList`, `paymentTerms`, `averagePaymentPeriod`, `latePaymentRate`, `averagelatePaymentPeriod`, `paymentPeriod`.
- `ctryNm=Japan` and `ctryNm=일본` returned the same aggregate-shaped item without country identifier fields; this is not confirmed country-level evidence.

Follow-up check on 2026-04-29:
- K-Sight UI uses its own numeric country codes for export-payment filters.
- Example: Malaysia is `pdrCtryCd=151` in K-Sight and `ctryCd=151` returns data from the public OpenAPI; ISO2 `ctryCd=MY` returns `resultCode=3`.
- The runtime now maps supported ISO2 country codes to K-Sight payment country codes before calling `getPaymentInfo`.

## Runtime Fallback Policy
1. Try country-filter request with `ctryCd={K-Sight payment country code}`. The app maps ISO2 codes such as `MY` -> `151`.
2. If no data (`resultCode=3`) or empty item, do not use the unfiltered aggregate as selected-country evidence.
3. Persist a `k_sure_payment` empty row with `detail_state="empty"` and a visible message explaining that country-level export payment data is unavailable.

## Response Mapping Used
Mapped to `project_risks` (category: `k_sure_payment`):
- `level` <- derived from late payment signals
  - late payment rate `>=20` -> `high`
  - late payment rate `>=10` -> `caution`
  - otherwise `info` (with avg late period check)
- `summary` <- scope/country, late rate, average payment period, late period, top payment term
- `raw` <- latest-year metrics and top payment-term detail

## Code Integration
- `supabase/functions/country-detail/index.ts`
  - Added endpoint constant `KSURE_EXPORT_PAYMENT_ENDPOINT`.
  - Added fetch pipeline:
    - `fetchKsureExportPayment`
    - `callKsureExportPayment`
    - normalization helpers for nested series blocks
  - Added K-SURE payment risk row in `project_risks` with `category="k_sure_payment"`.
  - Added API call logging with `api_key_name="ksure_export_payment"`.
  - Included export payment API source in country rationale sources.
  - Added response fields:
    - `ksure_payment_scope`
    - `ksure_payment_late_rate`
- `src/lib/api-registry.ts`
  - Updated `ksure_export_payment` endpoint to the Data.go.kr path.

## Current Scope
- This change covers API #8 in Step4 detail analysis.
- Selected-country payment facts are only displayed when the API returns a country-filtered item. The unfiltered aggregate is treated as a non-country reference and is not rendered as country evidence.
