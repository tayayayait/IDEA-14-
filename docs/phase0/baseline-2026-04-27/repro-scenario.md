# Phase 0 재현 시나리오 (고정본)

## 전제

- 프로젝트 ID: `6a5af2f0-fc48-493b-99fd-0f467f6e8717`
- 기준 URL: `http://localhost:8080/projects`
- 테스트 일시(KST): `2026-04-27 20:01:59` 전후

## 시나리오 A: 회사/공장 조회 및 추천 단계

1. `/projects`에서 프로젝트 `6a5af2f0-fc48-493b-99fd-0f467f6e8717`로 진입한다.
2. Step1 회사/공장 조회 화면에서 생산품 키워드 `모터`를 입력한다.
3. `검색 실행`을 누른다.
4. 결과 확인:
   - 실제: `NO_MANDATORY_REQUEST_PARAMETERS_ERROR` 노출
   - 증적: `01-step1-kicox-failure.png`
5. Step3 추천 국가 화면으로 이동한다.
6. 결과 확인:
   - 실제: 추천 근거에 목표 국가와 맥락이 맞지 않는 기사(예: 콜롬비아 맥락) 혼입
   - 증적: `02-step3-recommendation-mismatch.png`

## 시나리오 B: 국가 상세 분석/리포트 단계

1. `/projects/{id}/countries/DE` 또는 `/projects/{id}/countries/CN` 상세 화면으로 이동한다.
2. `필요 인증` 및 `규제·NTM` 카드 상태를 확인한다.
3. 결과 확인:
   - 실제: `출처 패널·본문 행 수 0건`, `조회 결과 없음`
   - 증적: `03-step4-cert-reg-zero-ksure-mismatch.png`
4. 같은 화면에서 K-SURE 업종 위험 상위 3개를 확인한다.
5. 결과 확인:
   - 실제: 입력 품목/업종과 무관한 업종 노출
   - 증적: `03-step4-cert-reg-zero-ksure-mismatch.png`
6. `과제 생성`을 실행한다.
7. 결과 확인:
   - 실제: `분석 서버 연결에 실패했습니다` 토스트
   - 증적: `04-step4-ai-task-failure-toast.png`
8. `/projects/{id}/report`로 이동해 `AI 요약 생성`을 실행한다.
9. 결과 확인:
   - 실제: `분석 서버 연결에 실패했습니다` 토스트
   - 증적: `05-step6-ai-summary-failure-toast.png`

## 시나리오 C: /data-sources 기준 상태 고정

1. `/data-sources`로 이동한다.
2. API 상태 표 전체를 캡처한다.
3. 결과 확인:
   - `KICOX_Factory Production Info`: 미실행
   - `KOTRA_Country Info`: 미실행
   - `KOTRA_Overseas Certification Info`: HTTP 200, 0건
   - `KOTRA_Import Regulation Info`: HTTP 200, 27건
   - `K-SURE_*`: HTTP 200, 데이터 존재
   - `Trade Security Institute_HSK Strategic Item Info`: HTTP 200, 0건
   - `KATS_SafetyKorea_Recall`: API 승인 대기
4. 증적:
   - `06-data-sources-status.png`
   - `data-sources-status.json`
   - `data-sources-dom-snapshot.txt`

## 결론

- Phase 0 기준선은 위 3개 시나리오로 재현 가능.
- 이후 수정 단계는 각 TC별로 동일 경로/동일 입력으로 회귀 검증한다.
