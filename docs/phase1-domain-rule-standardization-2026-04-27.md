# Phase 1 도메인 규칙화 (2026-04-27)

## 목적
- 산업코드/품목 키워드 기반 HS 챕터 allow/deny 규칙 테이블을 도입한다.
- 무관 키워드(예: 제조용 기기/식품류) 감점 규칙을 표준화한다.

## 변경 파일
- `supabase/functions/ai-hs-suggest/domain-rules.ts`
  - 도메인 규칙 테이블 신설:
    - `memory-semiconductor`
    - `automotive-parts`
    - `chemical-materials`
  - 규칙 항목:
    - `triggerTokens`
    - `allowChapters` / `denyChapters`
    - `rowBoostKeywords` / `rowPenaltyKeywords`
    - `industryCodePrefixes` / `industryMatchBonus`
  - 표준 무관 키워드 감점 규칙(`STANDARD_IRRELEVANT_PENALTIES`) 추가

- `supabase/functions/ai-hs-suggest/index.ts`
  - 도메인 규칙 모듈 연동:
    - `collectActiveDomainRules()`
    - `scoreDomainRuleAdjustment()`
  - 기존 메모리 전용 하드코딩 의도 점수 함수 제거
  - 입력에 `industry_code` 수용(`SearchInput.industryCode`)
  - AI 보조 재정렬 프롬프트에 산업코드 포함

- `src/pages/Step2Product.tsx`
  - `ai-hs-suggest` 호출 시 `industry_code` 전달:
    - 초기 리프레시 요청
    - 사용자 수동 조회 요청

## 테스트
- `src/test/hs-domain-rules.test.ts` 신설
  - 메모리 규칙 활성화 + 산업코드 매칭 검증
  - 메모리 챕터 가점/제조장비 감점 검증
  - 자동차 질의에서 식품 챕터 감점 검증

## 기대 효과
- 동일 키워드 오탐 시에도 도메인별 챕터 안전망으로 상위 후보 왜곡 확률을 낮춘다.
- 산업코드가 있는 프로젝트에서 후보 정렬 일관성을 높인다.
- 이후 골든셋 기반 Top3 무관 진입률 목표 관리(Phase 4/5 연계)에 필요한 규칙 기반을 확보한다.
