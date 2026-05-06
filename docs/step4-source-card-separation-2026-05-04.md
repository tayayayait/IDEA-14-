# Step4 Source Card Policy

## Current Scope

Step4 country detail now uses only these source groups for certification and regulation cards:

- KOTRA overseas certification
- KOTRA import regulation and trade-remedy data
- K-SURE country, industry, and payment risk data
- KOTRA national information and market news

## Removed Sources

The following sources are no longer used by Step4 runtime code, UI grouping, or API registry:

- WTO ePing SPS/TBT notification search
- Ministry of SMEs and Startups overseas certification dataset

Existing historical rows from those sources must not be displayed or counted in Step4 source cards.
Tests may still mention these source names only to assert that runtime code and UI cards do not use them.

## Verification

- `country-detail` must not import `../_shared/wto-eping.ts` or `../_shared/sme-cert.ts`.
- `country-detail` must not call `fetchWtoEpingNotifications`, `fetchSmeCertifications`, or `evaluateSmeCertificationsWithAI`.
- `country-detail` must not read `WTO_API_KEY` or persist `wto_eping` source rows.
- Step4 regulation rows are filtered to KOTRA import-regulation source types only.
- Step4 certification rows are filtered to KOTRA overseas-certification source types only.
