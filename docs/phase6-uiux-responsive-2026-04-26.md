# Phase 6 UI/UX·반응형 검증 (2026-04-26)

## 적용 범위
- Step 3 국가 카드 접근성/클릭 동작 정리
- 로딩 상태 문구 강화 (`검색 중`, `추천 분석 중`, `상세 데이터 조회 중`)
- 단계 이동 시 이전 실패 토스트 잔존 제거
- Step 3 표, Step 4 근거 패널, Report PDF 영역 반응형 확인

## 코드 변경

### 1) Step 3 접근성/클릭 영역 정리
- 파일: `src/pages/Step3Countries.tsx`
- Top 3 카드 버튼에 고유 접근성 이름 추가:
  - `aria-label="{순위} {국가명} 상세 보기"`
- 카드 하단 텍스트 `상세 보기`는 시각 힌트로만 유지:
  - `aria-hidden="true"` 적용
- 전체 후보국 표 동작 개선:
  - 행 전체 클릭(`tr onClick`) 제거
  - `상세` 컬럼 추가 및 행별 `상세 보기` 버튼으로 통일
  - 키보드/스크린리더 기준의 명확한 인터랙션 보장

### 2) 로딩 상태 문구 강화
- 파일: `src/pages/Step1Company.tsx`
  - 검색 버튼 문구: `검색 실행` ↔ `검색 중...`
- 파일: `src/pages/Step3Countries.tsx`
  - 추천 버튼 문구: `추천 분석 실행` ↔ `추천 분석 중...`
- 파일: `src/pages/Step4CountryDetail.tsx`
  - 초기 로딩 문구: `상세 데이터 조회 중...`
  - 상세 실행 중 문구: `상세 데이터 조회 중...`

### 3) 단계 이동 시 토스트 정리
- 파일: `src/components/AppShell.tsx`
- 경로 변경(`location.pathname`) 감지 시 `toast.dismiss()` 실행
- 목적: 이전 단계의 실패/경고 토스트가 다음 단계로 남아 보이지 않도록 정리

## 실행 검증

### 자동 테스트
- 명령: `npm test`
- 결과: **19 files, 76 tests passed**

### in-app 브라우저 실측
- 테스트 URL: `http://localhost:8080/projects`
- 프로젝트: `7d5ec186-cc50-4605-8e0f-e54038cfba5b`

#### 토스트 정리 검증
- Step 1에서 빈 검색으로 경고 토스트 발생 확인
- Step 2로 이동 후 기존 토스트가 사라지는 것 확인

#### 반응형 캡처 (파일)
- Step 3
  - `phase6-step3-desktop.png`
  - `phase6-step3-desktop-full.png`
  - `phase6-step3-tablet-full.png`
  - `phase6-step3-mobile-full.png`
- Step 4
  - `phase6-step4-desktop.png`
  - `phase6-step4-tablet.png`
  - `phase6-step4-mobile-full.png`
- Report(PDF 영역 포함)
  - `phase6-report-desktop.png`
  - `phase6-report-tablet.png`
  - `phase6-report-mobile-full.png`

## 참고
- SafetyKorea는 본 프로젝트 정책대로 “API 승인 대기” 상태를 결함으로 취급하지 않음.
