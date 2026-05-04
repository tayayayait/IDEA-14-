# Phase 2 - KOTRA CSV Cache Integration (2026-04-29)

## Scope

- Step 3 추천 점수에 `수출 지역 순위` 정량 근거를 반영.
- Step 4 규제 상세에서 `국별 대세계 수입규제 현황` CSV 백업 근거를 연결.
- Step 6 리포트에 `무역관 정보` + `해외전시회 정보` 실행 액션 블록을 추가.

## Backend Changes

### `supabase/functions/recommend-countries/index.ts`

- `kotra_csv_export_region_rank_cache` 조회 결과를 국가별 정량 근거로 매핑.
- `deriveExportRegionRankMarketBoost` 점수(0~12)를 `apiMarketScore`에 합산.
- `rationale.sources`에 다음 타입을 추가:
  - `export_region_rank`
  - `trade_office_action`
  - `exhibition_action`
- `kotra_csv_trade_office_cache`, `kotra_csv_overseas_exhibition_cache`를 국가별 실행 액션으로 연결.

### `supabase/functions/_shared/recommendation.ts`

- `deriveExportRegionRankMarketBoost` 추가:
  - rank, 점유율, HS 매칭 여부 기반 시장성 보정치 계산.

### `supabase/functions/country-detail/index.ts`

- `fetchKotraImportRegulations`에 CSV 백업 경로 추가.
  - 캐시 상태 오류 / stale / 캐시 조회 오류 / 캐시 매칭 0건 시:
    - `kotra_csv_import_regulation_cache` 조회
    - 국가/HS/키워드 기반 재랭킹 후 규제 항목 생성
- 규제 row raw 메타데이터 확장:
  - `source_type` (`kotra_cache` | `csv_backup`)
  - `backup_row_id`
  - `backup_source_url`
- 백업 데이터 사용 시 `source_url`을 공공데이터포털 백업 링크로 저장.

## Frontend Changes

### `src/pages/Step4CountryDetail.tsx`

- 규제 항목 소스 URL 분기:
  - 기본: KOTRA 규제 상세 URL 생성 로직
  - 백업: row의 `source_url`(CSV 백업 링크) 직접 사용
- 백업 근거 배지/문구 노출:
  - "백업 근거 사용: 국별 대세계 수입규제 현황(CSV)"
- 규제 상세 모달에 `근거 소스` 표시.

### `src/pages/Step6Report.tsx`

- 국가별 실행 연결 블록 추가(데스크톱/모바일 공통):
  - 무역관 액션(`trade_office_action`)
  - 해외전시회 액션(`exhibition_action`)
- `project_countries.rationale.sources`의 `type/title/url/summary`를 파싱하여 국가별 실행 경로 렌더링.

## Validation Notes

- 백업 규제 매핑은 국가 매칭(코드/별칭) + HS/키워드 랭킹을 함께 사용.
- `source_type`으로 primary/backup 출처를 명시해 UI에서 오인 표시를 방지.
