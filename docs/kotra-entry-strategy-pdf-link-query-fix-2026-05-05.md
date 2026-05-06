# KOTRA entry strategy PDF link query fix - 2026-05-05

## Cause

The KOTRA `entryStrategy` API provides downloadable attachment metadata through:

- `realAtfileInfoList.realAtfileInfo.realAtfileName`
- `realAtfileInfoList.realAtfileInfo.realAtfileUrl`

The PDF download URL is not just the path. It requires query parameters such as `gbn`, `nttSn`, `atFileSn`, and `pFrontYn`.

`normalizeReportDraft` previously normalized `sourceUrl` and `attachmentUrl` through `normalizeReportText`. That path is correct for prose, but it strips URL query strings. As a result, a valid KOTRA URL like:

```text
https://dream.kotra.or.kr/ajaxa/fileCpnt/fileDown.do?gbn=n01&nttSn=237789&atFileSn=114941&pFrontYn=Y
```

was reduced to:

```text
https://dream.kotra.or.kr/ajaxa/fileCpnt/fileDown.do
```

KOTRA cannot resolve `fileDown.do` without those parameters, so the browser shows the KOTRA "requested page not found" screen.

## Change

`src/lib/report-draft.ts` now normalizes KOTRA entry-strategy URL fields with `toSafePublicHref`.

This preserves non-sensitive query parameters and decodes HTML entities such as `&amp;`, while still removing sensitive keys such as `serviceKey`, `authKey`, and `apiKey`.

## Verification

Added coverage in `src/test/kotra-entry-strategy-report.test.ts` to ensure `realAtfileUrl` keeps the KOTRA download parameters after report draft normalization.
