# Step4 India HS 870350 Certification and NTM Review

## 검증 대상

- 국가: 인도(IN)
- 제품명: 승용차, 상용차 등
- HS: 870350
- HSK: 8703501000

## 원천 데이터 확인

- KOTRA 수입규제 DS00000128 공공데이터를 2026-05-04에 전체 조회했다.
- 전체 17,895건 중 수입국 인도(IN)는 491건이었다.
- 그중 조사대상국이 한국 또는 전세계로 해석되는 항목은 83건이었다.
- 한국/전세계 대상 인도 항목 중 HS 870350, HS 8703 계열, 자동차 관련 키워드 매칭은 0건이었다.
- Supabase 배포 환경에는 `WTO_API_KEY` secret이 존재한다. WTO ePing은 국가+HS6 또는 제품 토큰이 일치한 통보문만 `project_regulations`에 저장한다.

## 판정

- 현재 `규제·NTM`의 0건 표시는 KOTRA 수입규제 데이터 기준으로는 맞다.
- 이 0건은 "인도에 자동차 기술규정이 없다"는 뜻이 아니다. 현재 섹션은 한국산 해당 HS 기준의 수입규제/NTM 후보만 보여준다.
- ARAI, CMVR Type Approval, BIS, MTCTE, CRS는 인증 또는 기술요건 성격이므로 `필요 인증` 쪽 후보로 다룬다.

## 수정

- 중소벤처기업부 해외규격인증정보는 국가 단위 인증 목록이다.
- AI 추천이 `high`여도 HS/품목 법령 매칭 확정 근거가 아니므로 `확정 필요 인증`으로 분류하지 않는다.
- SME AI 추천 row는 모두 `raw.match_confidence = "review_required"`로 저장한다.
- `project_certifications.required`는 boolean/null 컬럼이므로 SME AI 추천에는 `null`만 저장한다.
- 높은 AI 추천은 `raw.required_label = "필수 가능성 높음"`으로 남기되, 화면 분류는 `검토 필요 후보`가 되도록 했다.

## 관련 원천

- 중소벤처기업부 해외규격인증정보: `https://www.data.go.kr/data/15071380/openapi.do`
- KOTRA 수입규제 DS00000128: `https://apis.data.go.kr/B410001/DS00000128/getDS00000128`
- WTO ePing: `https://eping.wto.org/en/Search/Index`
