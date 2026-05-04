# Phase 1 Data Alignment (2026-04-22)

## 변경 목적

- 상세 스펙 기준으로 API 레지스트리와 점수 라벨 임계값을 정합화

## 적용 파일

- `src/lib/api-registry.ts`
- `src/lib/scoring.ts`
- `src/components/RiskBadge.tsx`
- `supabase/functions/recommend-countries/index.ts`

## 변경 내용

1. API 레지스트리 재구성
- 스펙 기준 P0 API 10종으로 재편
- KOTRA 4개 영역(국가정보/시장뉴스/해외인증/수입규제) 분리
- K-SURE 3개 영역(국가위험/업종위험/수출결제) 분리
- 무역안보관리원 HSK 연계 전략물자, SafetyKorea 리콜 명시

2. 스코어링 임계값 조정
- `priority`: 80 이상
- `reviewable`: 60 이상
- `caution`: 40 이상
- `high_risk`: 0 이상
- `partial && total < 40`: `unknown`

3. 라벨 타입 확장
- `RiskLabel`에 `critical` 추가
- 표시 문구: `기관 확인 필요`

4. 뱃지 렌더링 확장
- `RiskBadge`에 `critical` 스타일/도트 매핑 추가

5. 추천 함수 임계값 동기화
- `recommend-countries`의 `labelFor`를 프론트와 동일 기준(80/60/40)으로 통일
- API 로그 키를 `kotra_country_info`로 변경
