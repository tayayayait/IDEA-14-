# Step4 KOTRA 상세 보기 및 K-SURE 구성 정리

Date: 2026-04-26

## 배경
- Step4의 `규제·NTM` 카드에서 KOTRA 링크를 눌러도 상세 문서로 직접 진입하지 못하고 `MENU_ID=3700`의 국가 선택 화면만 노출되었다.
- K-SURE는 `국가등급`, `업종위험`, `수출결제`가 단일 카드 그리드로 섞여 표시되어 우선순위와 의미가 불명확했다.

## 확인 사실
- KOTRA 수입규제(`MENU_ID=3700`)는 외부 GET 파라미터만으로 품목별 상세 화면에 직접 진입하는 공개 경로가 확인되지 않았다.
- 실제 상세 데이터는 KOTRA 내부 AJAX 응답(`getNationInnerDataNew.do`)으로 렌더링된다.

## 적용 변경
- Step4 규제 카드 액션 분리:
  - `상세 보기`: 앱 내부 다이얼로그에서 저장된 `project_regulations.raw`를 직접 표시
  - `KOTRA 출처`: KOTRA 공식 페이지 이동 링크 유지
- KOTRA 출처 URL 개선:
  - ISO2 기준 `pRegnCd/pNatCd` 매핑을 적용해 국가 사전선택 URL 생성
  - 매핑 불가 시 기본 `MENU_ID=3700`으로 fallback
- K-SURE 표시 구조 재구성:
  - 국가위험 1건(최신 평가일)
  - 업종위험 상위 3건(`risk_index` 내림차순)
  - 수출결제 1건
  - `raw.scope === "global"`이면 `전세계 집계 참고자료` 라벨 노출
  - 내부 level(`info/caution/high/unavailable`)은 사용자용 한국어 라벨로 변환

## 코드 영향 범위
- `src/lib/source-url.ts`
  - 수입규제 국가 사전선택 URL 빌더 추가
- `src/lib/step4-risk-presenter.ts` (신규)
  - K-SURE 그룹화/정렬/level 라벨 변환
- `src/pages/Step4CountryDetail.tsx`
  - 규제 상세 다이얼로그 및 K-SURE 요약 렌더링 반영
- `src/test/source-url.test.ts`
  - KOTRA 국가 사전선택 URL 케이스 추가
- `src/test/step4-risk-presenter.test.ts` (신규)
  - 그룹화/정렬/scope/라벨 테스트 추가

## 비범위
- Supabase 함수(`country-detail`, `recommend-countries`)의 수집/저장 로직 변경 없음
- DB 스키마 및 마이그레이션 변경 없음
