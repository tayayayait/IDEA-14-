# Step 4 국가 상세 의사결정 API

## 호출 계약

- Method: POST
- Edge Function: country-detail
- 인증: Authorization Bearer 사용자 세션 토큰
- 제한시간: 클라이언트 45초, 공급자별 10초
- 요청 본문: project_id, country_code, 선택 force_refresh

백엔드는 프로젝트의 최신 제품에서 제품명, HS6, HSK10을 읽습니다. 네 값 중 하나라도 없으면 HTTP 422와 missing_fields를 반환합니다.

요청 예시:

    {
      "project_id": "project-uuid",
      "country_code": "US",
      "force_refresh": true
    }

## 성공·부분 성공 응답

응답 state는 success, partial_success, stale 중 하나입니다. 외부 공급자 일부가 실패해도 HTTP 200으로 정상 결과와 공급자별 상태를 함께 반환합니다.

    {
      "state": "partial_success",
      "message": "상세 데이터 일부 항목이 미완료입니다.",
      "analysis_run_id": "run-uuid",
      "decision_fact_count": 12,
      "action_item_count": 8,
      "provider_statuses": [
        {
          "key": "un_comtrade",
          "label": "UN Comtrade",
          "state": "success",
          "itemCount": 1,
          "message": "2025년 HS6 무역통계 조회",
          "fetchedAt": "2026-07-19T00:00:00.000Z"
        }
      ],
      "detail_incomplete": true,
      "detail_incomplete_items": ["한국수출입은행 환율"]
    }

공급자 상태:

| 상태 | 의미 | 화면 처리 |
|---|---|---|
| success | 검증된 결과 저장 | 확인 또는 추정 근거 표시 |
| empty | 직접 일치 결과 0건 | 규제 없음이 아닌 직접 일치 없음 표시 |
| error | 제한시간, 429, 5xx, 형식 오류 | 마지막 정상 근거를 오래된 데이터로 유지 |
| not_run | 키 또는 입력 부재로 미실행 | 미실행 사유와 다음 행동 표시 |

## 정규화 결과

country_decision_facts의 각 행은 다음 의미를 갖습니다.

| 필드 | 설명 |
|---|---|
| category | 관세·FTA, 인증, 수입규제, 세관장확인, 통관서류, 결제, 비용, 시장, 제재, 전략물자 |
| status | confirmed, estimated, needs_verification, not_run, unavailable |
| severity | info, caution, blocker |
| scope_level | hsk10, hs6, product_name, country |
| source_name, source_url | 출처 기관과 공식 원문 |
| reference_date, fetched_at | 데이터 기준일과 실제 조회 시각 |
| caveat, next_action | 한계와 사용자 후속 행동 |
| is_stale | 이번 공급자 실패로 마지막 정상값을 유지하는지 여부 |

## 공급자별 요청·출력

| 공급자 | 주요 요청 | 주요 출력 | 판정 범위 |
|---|---|---|---|
| 관세청 세관장확인 | serviceKey, hsSgn=HSK10, imexTpcd=1 | HS부호, 법령, 승인기관, 구비요건, 적용일 | HSK10 확인 |
| UN Comtrade | reporterCode, period, partnerCode 0·410, cmdCode=HS6 | 목적국 전체 수입, 한국산 수입, 점유율, 중량 | HS6 추정 |
| WITS·UNCTAD TRAINS | reporter, partner=000, product=HS6, year=all, datatype=reported | 단순평균, 최저·최고 관세율, HS 개정분류 | HS6 관세 범위 추정 |
| 수출입은행 환율 | authkey, searchdate, data=AP01 | 통화, 매매기준율, 전신환율 | 국가 통화 확인 |
| KOTRA 해외인증 | 국가, HS·HSK, 제품명 | 인증 후보, 기관, 절차, 비용·기간 | 직접 일치와 검토 후보 분리 |
| KOTRA 수입규제 | 국가, HS, 제품명 | 규제 유형, 시행일, 원문 | 직접 일치와 검토 후보 분리 |
| K-SURE | 국가, 입력 업종 | 국가등급, 업종위험, 결제기간·연체율 | 국가·업종 참고 |
| KOSTI HSK 연계표 | serviceKey, HSK10 | 통제번호 후보, 국·영문 품명, 데이터 기준일 | HSK10 후보이며 최종판정 아님 |
| 관세청 해상수출 운송비 | serviceKey, 목적국→공개 권역 | 기준월, 권역별 40ft FCL 평균, 천원/2TEU | 국가 권역 참고값 |

## 오류 정책

- 429와 5xx만 한 번 재시도합니다.
- 4xx는 즉시 오류로 종료합니다.
- XML, JSON, CSV는 공급자 어댑터에서 파싱하고 Zod 검증 통과분만 저장합니다.
- 새 데이터가 성공한 공급자만 기존 행을 교체합니다.
- 체크리스트 상태는 재분석 후에도 보존합니다.
- API 키는 Edge Function 환경변수에서만 읽고 응답과 로그에 포함하지 않습니다.

필요 서버 환경변수 이름:

- PUBLIC_DATA_API_KEY
- UN_COMTRADE_API_KEY
- KOREAEXIM_AUTH_KEY
- 기존 KOTRA 및 K-SURE 키

## 현재 제한

- HS6만으로 목적국 세부 관세와 특혜관세를 확정하지 않습니다.
- 가격, 수량, 중량, Incoterms가 없으므로 총 도착원가는 산출 불가입니다.
- 구매자명과 주소가 없으면 기업·개인 제재검색은 미실행입니다.
- 인증과 전략물자 연계 결과는 기술사양에 따른 최종판정이 아닙니다.
- KOSTI·해상운송비 자동변환 API는 공공데이터포털에서 서비스별 활용승인이 없으면 해당 공급자만 부분 실패로 표시합니다.
- 해상운송비는 CIF·CFR 신고 통계의 권역 평균으로 실시간 포워더 견적이 아닙니다.
