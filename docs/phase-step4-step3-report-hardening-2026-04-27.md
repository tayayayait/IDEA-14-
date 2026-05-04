# Phase Update (2026-04-27): Step 4/Step 3/Report 신뢰성 보강

## 적용 범위
- Step 4 인증/규제 결과의 품목-국가 관련성 필터 강제
- Report 상단 요약에 Step 4 부분 실패 상태를 `상세 분석 미완료`로 명시
- Step 3 시장 배경 뉴스의 관련성 임계치 강화

## 변경 사항
### 1) Step 4 인증/규제 필터 강제
- 파일: `supabase/functions/country-detail/index.ts`
- 변경:
  - 인증 데이터 조회에서 국가만 일치하는 fallback 반환 경로 제거
  - 인증/규제 랭킹에서 품목 신호(HS 또는 품목 토큰) 미충족 항목 제외를 강제
  - 국가 별칭 해석 실패 시 무조건 통과시키던 로직 제거(빈 별칭이면 빈 결과 반환)
  - 주요 국가(CN/DE/JP/US) 별칭 추가
- 기대 효과:
  - Step 4 표에 무관 인증/규제가 섞이는 문제를 차단

### 2) Report 상단 요약의 부분 실패 승격
- 파일: `src/pages/Step6Report.tsx`
- 변경:
  - 상단 핵심 리스크 문구를 `상세 분석 미실행` 중심에서 `상세 분석 미완료` 중심으로 승격
  - Step 4 API 일부 실패/미실행 시 요약 패널에 `상세 분석 미완료: ...` 형태로 명시
  - 근거 주의 문구도 `상세 분석 미완료` 기준으로 정렬
- 기대 효과:
  - 심사 관점에서 부분 실패 상태가 상단에서 즉시 식별됨

### 3) Step 3 시장 배경 뉴스 임계치 강화
- 파일:
  - `supabase/functions/_shared/recommendation.ts`
  - `supabase/functions/recommend-countries/index.ts`
  - `src/test/recommendation-news-relevance.test.ts`
- 변경:
  - 배경 뉴스 전용 평가(`assessBackgroundNewsRelevance`) 추가
  - 국가 키워드 + 최소 품목 관련성(강한 토큰/HS/최소 점수) 미충족 뉴스 제외
  - 국가 뉴스 중 직접 근거 수준(`scoreRelevant`)은 점수 반영 후보로 승격
  - 2글자 국가코드 오탐(예: `us` 일반대명사)을 줄이기 위해 코드 자동 매칭을 제한하고 명시 코드/별칭 중심으로 판정
- 기대 효과:
  - 무관 시장 뉴스가 점수 근거 또는 배경 근거에 유입되는 비율 감소

## 검증
- `npm test` 실행으로 회귀 확인
