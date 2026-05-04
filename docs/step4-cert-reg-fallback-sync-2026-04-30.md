# Step4 인증/규제 fallback 및 동기화 개선 (2026-04-30)

## 변경 목적
- 필요 인증은 `국가 + HS/HSK` 매칭을 우선하되, HS 선택 오류 가능성을 고려해 `국가 + 제품명/키워드` 후보를 검토 필요 항목으로 표시한다.
- 규제·NTM은 정상 캐시를 우선 사용하고, 캐시 불능 상태에서만 KOTRA 수입규제 API 동기화를 시도한다.

## 필요 인증
- 1차 판정: `country_hs`
  - 국가 신호와 HS/HSK 신호가 모두 있는 인증만 확정 수준 후보로 저장한다.
  - `raw.match_confidence = "high"`, `raw.hs_match = true`.
- 2차 판정: `country_product_fallback`
  - 1차 결과가 0건일 때만 국가와 제품명/영문 키워드가 맞는 후보를 저장한다.
  - `raw.match_confidence = "review_required"`, `raw.hs_match = false`.
  - UI에는 `HS 미검증 대체 후보`로 표시한다.
- 일부 API 시도에서 오류가 있어도 성공 응답이 하나 이상 있으면 전체 인증 조회를 오류로 확정하지 않는다.

## 규제·NTM
- 정상 캐시 + 매칭 있음: `kotra_cache` 결과를 사용한다.
- 정상 캐시 + 매칭 0건: API 재동기화나 CSV 백업을 수행하지 않고 `empty`로 판정한다.
- 캐시 불능(`active_batch_id` 없음, stale, cache read error): `sync-kotra-import-regulations`를 호출해 DS00000128 캐시 동기화를 시도한다.
- API 동기화 성공 후 캐시를 재조회하고, 이때 생성된 결과는 `source_type = "kotra_api_sync"`로 표시한다.
- API 동기화 실패 시에만 `kotra_csv_import_regulation_cache`를 백업으로 조회하며, 결과는 `source_type = "csv_backup"`로 표시한다.

## 검증
- `src/test/kotra-detail-tools.test.ts`
  - HS strict 매칭과 제품명 fallback 랭킹을 검증한다.
- `src/test/kotra-import-cache.test.ts`
  - 캐시 불능 조건에서만 API 동기화를 시도하는 정책을 검증한다.
