# Phase 2 Screen Alignment (2026-04-22)

## 목적

- 화면별 스펙 누락 항목 보완
- 사용자 입력/근거/검증 정보의 가시성 강화

## 변경 파일

- `src/pages/Step1Company.tsx`
- `src/pages/Step2Product.tsx`
- `src/pages/Step3Countries.tsx`
- `src/pages/Step4CountryDetail.tsx`
- `src/pages/Step5Safety.tsx`
- `src/pages/Step6Report.tsx`
- `src/pages/DataSources.tsx`
- `src/components/TagInput.tsx` (신규)

## 핵심 반영

1. Step1 기업·공장 검색
- 검색 조건 확장: 공장명, 지역, 생산품 키워드
- 검색 validation: 1개 이상 조건 + 텍스트 조건 2자 이상
- 결과 표 확장: 업종, 생산품 컬럼
- 선택 요약 zone, 조건 초기화 버튼, 사용자 입력/조회 출처 배지 반영

2. Step2 제품·품목 프로파일
- 모델명, 목표 시장 메모 필드 추가
- 기업 요약 바 표시
- 부품 입력을 `TagInput`으로 교체 (최대 20개, 태그당 30자)
- 제품 설명 20~1000자 검증
- HS/HSK 숫자 6~10자리 검증

3. Step3 후보국 추천 대시보드
- 뉴스·시장 근거 zone 신설 (제목/국가/게시일/링크)
- Top3 카드에 핵심 근거 3개 표시
- 비교표에 시장 선호 컬럼 추가

4. Step4 국가 상세 리스크
- 인증 패널: 적용 품목/필요서류/절차/유효기간 표시(값 없으면 "확실한 정보 없음")
- 규제 패널: HS 코드/규제유형/시행일 표시
- 결제 리스크: 평균 결제기간/연체율/권장 결제조건 표시
- "조회된 규제 없음", "확실한 정보 없음" 조건 표시 강화
- K-SURE 참고자료 문구 추가

5. Step5 전략물자·제품안전
- "자동 판정 아님, 기관 확인 필요" 경고 문구 추가
- 4개 `strategicItemStates`, 4개 `productSafetyStates` 렌더링
- 전략물자 상세(H S/H S K/통제번호) 영역 추가
- 조치 체크리스트 zone 추가

6. Step6 리포트
- 국가별 주의사항 섹션 추가
- 출처 섹션 추가(API명, 기관, 조회일, 링크 정보)

7. DataSources
- 실패 횟수 컬럼 추가
- 데이터 기준일 zone 추가
- 라이선스/활용 안내 문구 보강
