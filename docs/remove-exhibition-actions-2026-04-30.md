# 전시회/행사 기능 제거

## 변경일
- 2026-04-30

## 제거 범위
- Step 6 리포트의 `전시회/행사` 및 `해외전시회` 실행 연결 표시 제거
- `recommend-countries` 함수의 `kotra_csv_overseas_exhibition_cache` 조회 제거
- `rationale.sources`의 `exhibition_action` 생성 제거
- `/data-sources` CSV 캐시 상태 목록에서 `해외전시회 정보` 제외
- `scripts/ingest_kotra_csv_cache.mjs`의 해외전시회 CSV 수집 대상 제외

## 유지 범위
- 기존 마이그레이션의 `kotra_csv_overseas_exhibition_cache` 생성 기록은 삭제하지 않음
- 이유: 이미 적용된 DB 이력과 충돌하지 않도록 런타임 사용 경로만 제거

## 검증 기준
- 기존 데이터에 `exhibition_action`이 남아 있어도 리포트 실행 연결 경로에는 표시하지 않음
- 신규 추천 생성에서는 `exhibition_action`을 생성하지 않음
- CSV 캐시 상태 화면은 3종만 표시
