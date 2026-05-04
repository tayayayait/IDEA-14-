# WTO ePing Step4 연동 기록

## 목적

Step4 국가 상세 분석의 `규제·NTM` 영역에 WTO ePing SPS/TBT 통보 후보를 추가한다.

기존 KOTRA 수입규제 API/CSV는 반덤핑, 상계관세, 세이프가드 등 무역구제성 수입규제 중심이라 SPS/TBT 통보 후보를 충분히 커버하지 못한다. WTO ePing은 WTO 회원국이 통보한 SPS/TBT 규제안을 `국가+HS` 기준으로 보강 조회하는 용도다.

## 사용 API

- API: `https://api.wto.org/eping/notifications/search`
- 인증: `WTO_API_KEY` Supabase Edge Function secret
- 호출 위치: `supabase/functions/country-detail/index.ts`
- 저장 위치: 기존 `project_regulations`
- 표시 위치: `src/pages/Step4CountryDetail.tsx`의 `검토 필요 후보`

## 처리 방식

1. `country-detail` 실행 시 제품 HS 코드와 목표국 ISO2를 읽는다.
2. ISO2를 WTO ePing member id로 변환한다.
   - 예: `CN -> C156`, `DE -> C276,U918`, `PL -> C616,U918`
   - EU 회원국은 국가 통보와 EU 통보를 함께 확인하기 위해 `U918`을 추가한다.
3. WTO ePing 공식 API를 `countryIds + hs` 조건으로 조회한다.
4. 결과를 `project_regulations`에 저장한다.
   - `source_org`: `WTO ePing`
   - `raw.source_type`: `wto_eping`
   - `raw.match_confidence`: `review_required`
   - `raw.match_strategy`: `wto_eping_sps_tbt`
5. 화면에서는 확정 규제가 아니라 `WTO SPS/TBT 검토 필요` 후보로 표시한다.

## 한계

WTO ePing은 통보문 검색 API다. 통보문 후보를 제공하지만 최종 적용 여부, 실제 시행일, 제품 세부 스펙별 적용 여부를 자동 확정하지 않는다. 따라서 Step4에서는 확정 규제가 아니라 검토 필요 후보로만 취급한다.

## 운영 체크

Supabase에 아래 secret이 필요하다.

```bash
npx supabase secrets set WTO_API_KEY=<WTO developer portal subscription key> --project-ref gnwhjqaxndbkqxecxjkn
```

변경 후 배포 대상은 `country-detail` Edge Function이다.

```bash
npx supabase functions deploy country-detail --project-ref gnwhjqaxndbkqxecxjkn
```
