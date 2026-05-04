# Phase 7 (P2) 문구·검증

## 목표
- AI/규칙 기반 산출 문구에서 확정적 표현(금지 문구) 제거
- 화면 렌더링 경로 전반에 동일한 문구 정제 규칙 적용
- 정제 로직 단위 테스트 추가

## 적용 파일
- `src/lib/scoring.ts`
- `src/pages/Step2Product.tsx`
- `src/pages/Step3Countries.tsx`
- `src/pages/Step4CountryDetail.tsx`
- `src/pages/Step5Safety.tsx`
- `src/pages/Step6Report.tsx`
- `src/test/scoring-sanitize.test.ts` (신규)

## 변경 사항
1. 금지 문구 사전 확장
- `수출 가능/불가`
- `전략물자 아님`
- `인증 완료 가능`
- `안전함/안전합니다`
- `문제 없음`
- `법적으로 적합`

2. 정제 로직 강화
- 공백 변형(`수출   불가` 등)까지 치환하도록 정규식 패턴 적용
- 치환 문구: `검토 필요`
- `sanitizeNullable` 유틸 추가

3. 화면 적용 범위
- Step2: AI HS 추천 근거/설명
- Step3: 국가 추천 요약·근거 타이틀
- Step4: 국가 상세 요약·과제 문구·규제/리스크 텍스트
- Step5: 플래그 요약/권고 조치/원시 상세 값
- Step6: AI 리포트 요약/실행과제/국가별 주의사항

4. 검증 테스트
- `sanitize` 금지 문구 치환 테스트
- 공백 변형 치환 테스트
- 중립 문구 비변경 테스트

## 검증
- `pnpm build` 통과
- `npm test` 통과
