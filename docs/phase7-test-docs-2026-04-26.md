# Phase 7 테스트·문서화 (2026-04-26)

## 목표
- `src/test`에 다음 케이스 추가
  - country-detail 실패/성공 상태 렌더링 테스트
  - K-SURE 출처 URL Unauthorized API 엔드포인트 검증 테스트
  - HS 후보 무관 키워드 필터링 테스트
  - 리포트 문자열 조합 테스트
- 수정 후 `npm test` 실제 실행

## 코드 변경

### 1) country-detail 상태 렌더링 기준 함수 추가
- 파일: `src/lib/step4-detail-consistency.ts`
- 추가: `resolveCountryDetailApiState(...)`
  - 성공 시: `responseState ?? "success"`
  - 실패 시:
    - 저장된 상세행 존재: `partial_success`
    - 저장된 상세행 없음: `resultState`
- 적용: `src/pages/Step4CountryDetail.tsx`의 `runDetail` 상태 결정 로직을 위 함수로 통일

### 2) HS 후보 무관 키워드 필터 로직 추가
- 파일: `src/lib/hs-candidate-relevance.ts` (신규)
  - `filterRelevantHsCandidates(...)` 구현
  - 제품명/설명/구성품 토큰 기반으로 후보 설명/공식명 매칭 점수 계산
  - 무관 후보 제거, 단 전체 제거 시 원본 후보로 안전 복귀
- 적용: `src/pages/Step2Product.tsx`
  - `normalizeCandidates(...)`에서 컨텍스트(제품명/설명/태그) 기반 필터 수행

### 3) 리포트 문자열 조합 유틸 분리
- 파일: `src/lib/report-text.ts` (신규)
  - `normalizeReportText(...)`
  - `formatFlagTypeLabel(...)`
  - `composeFlagSummary(...)`
- 적용: `src/pages/Step6Report.tsx`
  - 기존 내부 문자열/레이블 함수 제거 후 유틸 사용
  - 핵심 리스크 문구 조합에 `composeFlagSummary` 적용

## 테스트 추가

### A. country-detail 실패/성공 상태 렌더링
- 파일: `src/test/step4-detail-consistency.test.ts`
- 추가 케이스:
  - invoke 성공 + success/partial_success 응답 상태 반영
  - invoke 실패 + 상세행 없음(`error`) / 상세행 있음(`partial_success`) 분기 검증

### B. K-SURE 출처 URL Unauthorized API 엔드포인트 검증
- 파일: `src/test/source-url.test.ts`
- 추가 케이스:
  - `KSURE_PUBLIC_SOURCE_URLS` 값이 `apis.data.go.kr`를 포함하지 않는지 확인
  - 모두 `data.go.kr` 공개 URL인지 확인

### C. HS 후보 무관 키워드 필터링
- 파일: `src/test/hs-candidate-relevance.test.ts` (신규)
- 추가 케이스:
  - 차량 부품 입력 시 `피넛 버터` 후보 제거 검증
  - 의미 있는 토큰이 없을 때 원본 유지
  - 필터 결과가 전부 제거될 때 원본 안전 복귀

### D. 리포트 문자열 조합
- 파일: `src/test/report-text.test.ts` (신규)
- 추가 케이스:
  - `strategic`/`product_safety` 라벨 한글 변환
  - 문자열 결합 시 오염 토큰(`strategic제공된`, `product_safetySafetyKorea`) 미발생 검증
  - HTML 엔티티/공백 정규화 검증

## 실행 결과
- 명령: `npm test`
- 결과: **21 files, 85 tests passed**
