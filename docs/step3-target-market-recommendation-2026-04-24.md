# Step3 Recommendation Refactor (2026-04-24)

## Scope
- Replaced fixed-country scoring behavior with signal-first candidate extraction.
- Updated `recommend-countries` Edge Function, Step3/Step4 UI rationale rendering, and unit tests.

## Root Cause Confirmed
The previous flow generated candidates from a mostly fixed country seed and scored them directly.  
As a result, rank output could repeat (`ID > IN > BR`) even when product context changed.

## New Recommendation Flow
1. Read latest product (`name`, `description`, `hs_code`, `components.targetMarketNote`).
2. Build product tokens from product name/description/tags.
3. Extract candidate signals from:
   - KOTRA overseas certification data
   - KOTRA import regulation data
   - KOTRA overseas market news
   - target-market memo country parsing
4. Candidate inclusion rules:
   - Include only countries with at least one signal.
   - Signal types:
     - `HS 6-digit exact match`
     - `HS 4-digit prefix match`
     - `Product keyword matched`
     - `Market news matched`
     - `Certification data exists`
     - `Import regulation data exists`
     - `Included by target market memo`
5. Fallback:
   - Only when candidate count `< 3`.
   - Add from fallback pool and mark signal `Fallback included`.
6. Score only candidate countries:
   - Market `0~30` = `API evidence(0~30)` + AI market-fit mix (`60:40`).
   - Cert/Regulation/Payment/Safety axis preserved (`20/20/20/10`).
7. AI failure handling:
   - Use API-only fallback scoring (no hash/constant country ranking).
   - Return `state=partial_success`.
8. Persist rationale fields:
   - `target_markets`
   - `target_market_matched`
   - `inclusion_reason`
   - `recommendation_reason`
   - `low_recommendation_reason`
   - `alternative_markets`
   - `candidate_signals`
   - `sources`

## UI Changes
- Step3 top cards now show:
  - candidate signal list
  - inclusion reason
  - recommendation reason
  - low-score reason
  - alternatives
- Step3 target-market panel now shows:
  - target market score/rank
  - inclusion reason
  - low-score reason
  - alternatives
- Step4 header panel now shows:
  - final rank
  - candidate signal list
  - same rationale fields as Step3

## API Contract
`recommend-countries` response includes:
- `state`
- `message`
- `ai_used`
- `fallback_used`
- `candidate_count`
- `fallback_candidates`
- `target_market_codes`

## Test Coverage Added/Updated
- `src/test/recommendation-target-market.test.ts`
  - target-market parsing
  - candidate-only + fallback trigger
  - non-fixed ranking behavior with score change
  - partial-success state on fallback
  - bounded API-only fallback scores
- `src/test/step3-target-market-insight.test.ts`
  - target-market collection
  - insight rendering data (rank/reasons/alternatives)
