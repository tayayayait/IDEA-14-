# Step4 인증·규제 출처별 카드 분리

## 결론

Step4 국가 상세의 인증·규제 결과는 화면 기능 기준이 아니라 실제 데이터 출처 기준으로 분리한다.

- KOTRA 해외인증·규격
- KOTRA 수입규제·무역구제
- WTO ePing SPS/TBT

DOCX 활용가이드는 화면 기능이 아니라 KOTRA `DS00000128` API 명세 문서다. 중소벤처기업부 해외규격인증은 국가별 인증 목록 성격이 강하고 HS 확정 근거가 아니므로 Step4 국가 상세 카드에서 제외한다.

## 출처 판별 기준

기존 DB 스키마는 유지하고 각 row의 `source_org`, `raw.source_type`, `raw.match_confidence`, `raw.match_strategy`로 출처와 확정/검토 상태를 판별한다.

- `raw.source_type = kotra_overseas_cert`: KOTRA 해외인증·규격
- `raw.source_type = kotra_cache | kotra_api_sync | csv_backup`: KOTRA 수입규제
- `raw.source_type = wto_eping`: WTO ePing SPS/TBT

## KOTRA 수입규제 보강

KOTRA 수입규제·무역구제 카드는 `DS00000128` API/cache와 `대한무역투자진흥공사_국별 대세계 수입규제 현황_20250603.csv` 기반 CSV cache를 함께 사용한다.

- 1차: `DS00000128` API/cache에서 수입국, HS, 품목명, 규제유형, 시행일을 확인한다.
- 보강: API/cache에서 현재 조건 매칭이 없거나 캐시가 비어 있으면 CSV cache를 조회한다.
- 확정 조건: 수입국 일치, HS/HS6 일치, 한국 대상 여부가 명확한 경우.
- 검토 후보: 수입국과 제품명이 맞지만 HS 또는 한국 대상 여부가 불명확한 경우.

## WTO ePing 검색 성격

WTO ePing은 HS 확정 규제 DB가 아니라 SPS/TBT 통보문 검색 API다. 따라서 ePing 결과를 KOTRA 수입규제처럼 확정 규제 자료로 취급하지 않는다.

검색은 국가 필터를 반드시 포함하고 다음 순서로 넓힌다.

- `wto_eping_hs6_country`: 국가 + HS6
- `wto_eping_hs4_country`: 국가 + HS4
- `wto_eping_exact_product_country`: 국가 + 정확 제품어. 예: `DRAM`, `LED`, `PVC`
- `wto_eping_product_family_country`: 국가 + 제품군 키워드. 예: `semiconductor memory`, `integrated circuits`, `memory`

## WTO ePing 분류 기준

ePing 응답은 `direct_candidate`, `broad_reference`, `excluded_noise`로 분리한다.

- 직접 후보: HS6 일치, 정확 제품어가 제목/제품 설명에 직접 등장, 또는 HS4와 제품 직접 단서가 함께 있는 경우.
- 광역 참고: 국가는 맞지만 HS가 더 넓거나 제품군 수준만 맞는 경우. 화면에서는 별도 접힘 영역에 표시하며 “직접 규제 후보 아님” 문구를 고정한다.
- 제외: HS/제품군 불일치, 화장품·식품·농수산·비료 등 명백한 오탐.

직접 후보만 기존 규제 검토 후보 목록에 포함한다. 광역 참고는 검토 후보 수에 포함하지 않고 `raw.broad_references`에 보존한다. 제외 항목은 `raw.excluded_samples`와 count만 남긴다.

저장 필드는 다음을 사용한다.

- `raw.eping_classification`
- `raw.eping_score`
- `raw.eping_query_type`
- `raw.eping_reason`
- `raw.raw_count`
- `raw.direct_count`
- `raw.broad_count`
- `raw.excluded_count`
- `raw.broad_references`
- `raw.excluded_samples`

## 예시

베트남 DRAM의 경우 `HS 854232`, `HS 8542`, `DRAM`, `semiconductor memory`, `integrated circuits`, `memory`를 순차 검색한다.

- `DRAM` 직접 등장 또는 HS6 `854232` 일치: 직접 후보.
- `memory`로 잡힌 일반 데이터 저장/보안 통보문: 광역 참고.
- `integrated circuits` 검색 중 휴대폰 SAR처럼 완성품 규제에 가까운 통보문: 직접 후보가 아니라 광역 참고 또는 제외.
- 화장품, 식품, 농수산, 비료 통보문: 제외.

## 검증 기준

- 베트남 DRAM에서 화장품·비료·식품·의료기기 인증이 후보로 나오면 실패.
- 인도 승용차·상용차에서 AI/광역 추론은 확정 인증이 아니라 검토 후보 또는 광역 참고여야 한다.
- KOTRA 수입규제와 WTO ePing 결과가 같은 카드에 섞이면 실패.
- WTO ePing 0건은 키 없음, API 실패, 정상 조회 후 직접 후보 0건을 구분해야 한다.
