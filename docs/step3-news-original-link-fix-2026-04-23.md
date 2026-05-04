# Step3 뉴스 원문 링크 개선

Date: 2026-04-23

## 목적
- Step3 `뉴스·시장 근거` 카드가 API 이름/포털 링크 중심으로 보이던 문제를 제거하고, 사용자 기준의 실제 뉴스 제목과 원문 링크를 우선 노출한다.
- 원문 URL이 없는 경우 링크를 강제로 대체하지 않고 `원문 링크 없음`으로 표시한다.

## 확인된 원인
1. `country-detail`/`recommend-countries`에서 KOTRA 해외시장뉴스 검색어를 영문 국가명으로 사용해 빈 결과가 자주 발생했다.
2. 프론트 `normalizeEvidenceUrl()`이 `apis.data.go.kr/*` URL을 `https://www.data.go.kr/`로 치환해 원문 클릭 시 포털로 이동했다.
3. 뉴스 원문 URL이 없을 때도 목록 페이지로 대체하는 로직이 있어 사용자가 실제 기사로 이동하지 못했다.

## 수정 사항

### 1) 뉴스 API 검색 정확도 개선
- 파일: `supabase/functions/recommend-countries/index.ts`
- 파일: `supabase/functions/country-detail/index.ts`
- 국가코드 기준 한국어 우선 검색어(`인도`, `인도네시아`, `브라질` 등) + 영문 fallback 질의를 순차 시도하도록 변경.
- 응답 로그에 실제 사용 질의(`query`)를 남기도록 변경.

### 2) 원문 URL 정책 수정
- 파일: `supabase/functions/country-detail/index.ts`
- 파일: `supabase/functions/recommend-countries/index.ts`
- 원문 URL 생성 시:
  - 직접 기사 URL이 있으면 그대로 사용
  - 직접 URL이 없고 `bbstxSn`이 있으면 기사 상세 URL 조합
  - 둘 다 없으면 빈 문자열(`""`) 유지
- 더 이상 KOTRA 목록 페이지/공공데이터포털로 강제 대체하지 않음.

### 3) Step3 화면을 뉴스 중심으로 정리
- 파일: `src/pages/Step3Countries.tsx`
- `rationale.sources` 중 `type: "news"` 또는 뉴스로 판별되는 항목만 표시하도록 필터링.
- API/엔드포인트 성격 데이터는 노출 제외.
- 링크 문구를 `원문보기`로 통일.
- URL이 없을 때는 `원문 링크 없음`을 명시.

### 4) Step4 출처 표시 예외 처리
- 파일: `src/pages/Step4CountryDetail.tsx`
- 출처 URL이 비어 있으면 링크 대신 `원문 링크 없음` 텍스트 표시.

## 검증 방법
1. Step3에서 `분석 실행` 후 Top3 국가 드롭다운 전환.
2. `뉴스·시장 근거`에서 행별로:
   - 실제 뉴스 제목 표시 여부
   - `원문보기` 클릭 시 기사 상세 페이지 이동 여부
   - URL 없는 항목은 `원문 링크 없음` 표시 여부
3. Supabase `api_call_logs`에서 `kotra_market_news` 메시지의 `query`/`item_count` 확인.

