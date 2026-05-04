# Phase 0 Baseline (2026-04-27)

## 목적

- 프로젝트 `6a5af2f0-fc48-493b-99fd-0f467f6e8717` 기준으로 현재 결함을 재현 가능한 상태로 고정.
- 코딩 수정 전 기준선(문서 + 스냅샷 + 데이터소스 상태)을 저장.
- 이후 Phase 작업에서 회귀 여부를 빠르게 판정할 수 있는 테스트 케이스 분리.

## 기준 정보

- 기준 프로젝트: `6a5af2f0-fc48-493b-99fd-0f467f6e8717`
- 기준 URL: `http://localhost:8080/projects`
- 수집 시각(UTC): `2026-04-27T11:01:59.050Z`
- 수집 시각(KST): `2026-04-27 20:01:59`

## 산출물 경로

- 기준선 폴더: `docs/phase0/baseline-2026-04-27`
- 상태 요약: `docs/phase0/baseline-2026-04-27/phase0-baseline-status.json`
- 데이터소스 상세 덤프: `docs/phase0/baseline-2026-04-27/data-sources-status.json`
- 데이터소스 DOM: `docs/phase0/baseline-2026-04-27/data-sources-dom-snapshot.txt`
- 재현 절차서: `docs/phase0/baseline-2026-04-27/repro-scenario.md`
- 무결성 해시: `docs/phase0/baseline-2026-04-27/manifest.sha256.txt`
- 스냅샷:
  - `01-step1-kicox-failure.png`
  - `02-step3-recommendation-mismatch.png`
  - `03-step4-cert-reg-zero-ksure-mismatch.png`
  - `04-step4-ai-task-failure-toast.png`
  - `05-step6-ai-summary-failure-toast.png`
  - `06-data-sources-status.png`
  - `07-data-sources-current-full.png`

## 테스트 케이스

### TC-01 KICOX 실패 (필수 파라미터 오류)

- 경로: `/projects/{id}/company`
- 절차:
1. 생산품 키워드에 `모터` 입력
2. `검색 실행` 클릭
- 기대: 공장/생산 조회 결과 반환
- 실제: `NO_MANDATORY_REQUEST_PARAMETERS_ERROR`
- 증적: `01-step1-kicox-failure.png`

### TC-02 필요 인증 0건

- 경로: `/projects/{id}/countries/DE` (상세 분석 실행 후)
- 기대: 인증 체크리스트(행 데이터) 노출
- 실제: `필요 인증` 섹션 `출처 패널·본문 행 수: 0건`
- 증적: `03-step4-cert-reg-zero-ksure-mismatch.png`

### TC-03 규제/NTM 0건

- 경로: `/projects/{id}/countries/DE` (상세 분석 실행 후)
- 기대: 규제/NTM 데이터 노출
- 실제: `규제·NTM` 섹션 `출처 패널·본문 행 수: 0건`
- 증적: `03-step4-cert-reg-zero-ksure-mismatch.png`

### TC-04 추천 근거 국가 불일치

- 경로: `/projects/{id}/countries`
- 기대: 추천 국가별 근거 뉴스가 해당 국가/품목 맥락과 일치
- 실제: 독일/중국 추천 근거에 `콜롬비아 산업용 변환기` 등 타 국가 문맥 기사 혼입
- 증적: `02-step3-recommendation-mismatch.png`

### TC-05 K-SURE 업종 불일치

- 경로: `/projects/{id}/countries/DE`
- 기대: 입력 업종(예: C281/산업용 모터 맥락) 중심 업종위험 표시
- 실제: 가죽/음료/식료품/펄프 등 비관련 업종이 상위 노출
- 증적: `03-step4-cert-reg-zero-ksure-mismatch.png`

### TC-06 AI 생성 실패

- 경로 A: `/projects/{id}/countries/DE` (`과제 생성`)
- 경로 B: `/projects/{id}/report` (`AI 요약 생성`)
- 기대: 생성 결과 렌더링
- 실제: `분석 서버 연결에 실패했습니다` 토스트 노출
- 증적:
  - `04-step4-ai-task-failure-toast.png`
  - `05-step6-ai-summary-failure-toast.png`

## /data-sources 기준 상태 (수정 전)

| API Key | 상태 | HTTP | 응답 건수 |
|---|---|---:|---:|
| `KICOX_Factory Production Info` | 미실행 | 정보 없음 | 정보 없음 |
| `KOTRA_Country Info` | 미실행 | 정보 없음 | 정보 없음 |
| `KOTRA_Overseas Market News` | 조회 성공 | 200 | 8 |
| `KOTRA_Overseas Certification Info` | 조회 결과 없음 | 200 | 0 |
| `KOTRA_Import Regulation Info` | 조회 성공 | 200 | 27 |
| `K-SURE_Country Risk Grade` | 조회 성공 | 200 | 1 |
| `K-SURE_Industry Risk Index` | 조회 성공 | 200 | 35 |
| `K-SURE_Export Payment Info` | 조회 성공 | 200 | 1 |
| `Trade Security Institute_HSK Strategic Item Info` | 조회 결과 없음 | 200 | 0 |
| `KATS_SafetyKorea_Recall` | 미실행(API 승인 대기) | 정보 없음 | 0 |

## 관찰 메모

- Step4 화면에서는 `규제·NTM 0건`인데, `/data-sources`에는 `KOTRA_Import Regulation Info 응답 27`이 기록됨.
- 즉, API 호출 성공과 화면 필터/매핑 결과가 분리되어 있어 Step4 표시 로직을 별도 점검해야 함.

## Phase 0 완료 판정

- 재현 시나리오 문서화: 완료
- 결함 6종 테스트 케이스 분리: 완료
- 수정 전 스냅샷 저장: 완료
- `/data-sources` 상태(JSON + DOM + 이미지) 저장: 완료
