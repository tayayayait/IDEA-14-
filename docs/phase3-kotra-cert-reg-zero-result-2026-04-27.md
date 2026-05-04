# Phase 3: KOTRA 인증·규제 0건 대응 강화 (2026-04-27)

## 변경 목표
- 해외인증/수입규제 0건 문제를 단순 빈 상태로 끝내지 않고, 검색 근거와 API 상태를 함께 표시.
- 인증/규제 검색 정밀도를 HS6/HSK10/품목 키워드 조합으로 재정비.
- 리포트에서 인증/규제 0건을 `상세 분석 미완료`로 명확히 분류.

## 구현 내용
- `supabase/functions/country-detail/index.ts`
  - `project_products` 조회에 `hsk_code`를 포함.
  - 상세 분석 컨텍스트에 `hskCode`, 영문 품목 토큰, 태그 토큰, 국가 토큰을 추가.
  - 인증 조회 fallback를 다중 조합 시도로 확장:
    - HS6 + 제품명
    - HS6/HSK6 + 영문 키워드
    - 키워드 + 국가키워드
    - HS only / keyword only / base query
  - 인증/규제 결과 객체에 `diagnostics`를 추가:
    - `query_terms`, `attempts`, `api_status`, `api_message`, `fallback_source_url`, `institution_review_required`
  - 인증/규제 placeholder raw에 검색조건/시도내역/API 상태/대체 링크/기관확인필요를 저장.
  - `api_call_logs.detail`에 동일 진단 메타데이터를 기록.
  - 수입규제 랭킹에서 국가만 맞는 느슨한 fallback을 제거하고, 국가+품목 신호(HS/HSK/토큰) 기반 strict 필터만 채택.

- `src/pages/Step4CountryDetail.tsx`
  - 인증/규제 섹션에서 `empty/error` 시 공통 상세 안내 카드(`DetailZeroResultNotice`)를 표시:
    - 사용 검색조건
    - API 응답 상태
    - 검색 시도 요약
    - 대체 확인 링크
    - 기관 확인 필요 문구

- `src/pages/Step6Report.tsx`
  - 상세완료 판정 로직에 인증/규제 `detail_state=empty`(0건)를 명시적으로 미완료 항목에 포함.
  - 결과적으로 배너 사유에 `해외인증(0건)`, `수입규제(0건)`이 표시됨.

## 기대 효과
- 공모전 핵심 항목(인증/규제)이 0건일 때도 근거 기반의 검토 상태를 제공.
- 잘못된 규제 매칭 노이즈를 줄이고, 0건 사유를 사용자/심사자가 추적 가능.
- Step4와 최종 리포트의 미완료 판단이 동일한 근거 구조를 공유.
