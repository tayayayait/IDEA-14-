# 국가 상세 의사결정 화면 외부 API 기능·연동 타당성 분석

- 작성일: 2026-07-19
- 대상 화면: Step 4 국가 상세 / 수출 의사결정 대시보드
- 목적: 후보 API의 인증 방식, 실제 요청값, 응답값, 화면 반영 가능 범위와 한계를 연동 전에 확정한다.

## 1. 결론

모든 소스에 활용신청을 할 필요는 없다. 먼저 무료·공개 소스로 1차 판단 화면을 완성하고, 실제 견적이나 정밀 판정이 필요한 기능만 상용 API를 붙이는 것이 적절하다.

### 지금 활용신청할 가치가 높은 것

1. 관세청 세관장확인대상물품 API
2. 한국수출입은행 환율 API
3. UN Comtrade 무료 계정/API 키
4. Trade.gov CSL 무료 구독 키
5. openFDA 무료 키 — 의료기기·의약품·화장품을 실제 지원할 때만

### 신청 없이 먼저 연동하거나 적재할 수 있는 것

- World Bank WITS
- USITC HTS REST API/JSON 데이터
- KOSTI 최신 HSK 연계표 CSV
- 관세청 해상수출 운송비용 CSV
- UNCTAD TRAINS 검색·벌크 데이터
- EU TARIC 원시 데이터
- UK Trade Tariff API
- OFAC/UN 제재목록 파일
- FCC 공개 데이터와 일부 조회 API

### 계약·비용 검토 후 연동할 것

- Freightos
- Easyship
- Shippo
- WCO Trade Tools API/라이선스
- OpenSanctions hosted API 또는 yente용 데이터

## 2. API 키 외에 반드시 필요한 사용자 입력

API 키만 제공되어도 최종 관세·비용·FTA 가능성을 계산할 수는 없다. 화면 또는 프로젝트 설정에서 다음 값을 받아야 한다.

| 입력 | 사용하는 기능 | 없을 때 처리 |
|---|---|---|
| 한국 HSK 10단위 | 국내 수출요건·전략물자 | 분석 중단 또는 HS 확인 요청 |
| 목적국 현지 세번 8~10단위 | 실제 관세·규제 | HS 6단위 추정치만 표시 |
| 제조 원산지 | 특혜관세·제재·관부가세 | FTA를 `미확정`으로 표시 |
| BOM·비원산지 재료·생산공정 | 원산지 기준 충족 | FTA 협정 존재만 표시하고 적용 가능 판정 금지 |
| 거래가격·통화 | 관세·부가세·비용 | 세율만 표시하고 금액 계산 생략 |
| 인코텀즈 | 비용 부담 주체 | DDP/DDU 비용 귀속 미확정 |
| 출발·도착 주소/항구 | 운임 | 국가·권역 평균만 표시 |
| 중량·부피·컨테이너 | 운임 | 실견적 대신 벤치마크 표시 |
| 제품 기술사양·용도 | 인증·전략물자 | 후보 인증/통제만 표시 |
| 바이어·최종사용자명과 국가 | 제재 스크리닝 | 국가 위험만 표시, 거래상대방 판정 금지 |

## 3. API별 기능 분석

### A. 관세·FTA

#### A-1. World Bank WITS / UNCTAD TRAINS Tariff API

- 접근: 공개 GET 조회. 별도 키가 문서에 요구되지 않는다.
- 주요 요청값:
  - `reporter`: 수입국
  - `partner`: 원산지/수출국 또는 협정 상대국
  - `product`: HS 6단위
  - `year`: 기준 연도
  - `datatype`: `reported` 또는 `aveestimated`
  - 응답 포맷: XML, SDMX JSON
- 주요 출력값:
  - `TARIFFTYPE`: MFN/특혜
  - `TOTALNOOFLINES`, `NBR_PREF_LINES`, `NBR_MFN_LINES`
  - `SUM_OF_RATES`, `MIN_RATE`, `MAX_RATE`
  - `NOMENCODE`, `EXCLUDEDFROM`
- 화면 반영:
  - `기본 관세율 범위`, `특혜관세 데이터 존재`, `자료 연도`, `근거 충족도`
- 판정: **부분 가능**
  - HS 6단위의 국가 간 비교와 예상 범위에는 적합하다.
  - 목적국 8~10단위의 실제 신고세율이나 한국산의 원산지 기준 충족을 확정할 수 없다.
  - 화면에는 `예상 MFN 0~x%`, `특혜세율 데이터 있음`처럼 표시해야 한다.

공식 문서: https://wits.worldbank.org/data/public/WITSAPI_UserGuide.pdf

#### A-2. USITC HTS REST API — 미국 전용

- 접근: 공개 REST. 문서상 별도 키가 없다.
- 엔드포인트/요청값:
  - `GET /reststop/search?keyword=...`
  - `GET /reststop/exportList?format=JSON&from=...&to=...&styles=false`
  - `keyword`: 품명 또는 HTS 코드
  - `from`, `to`: 4·6·8·10단위 HTS 범위
- 주요 출력값:
  - HTS 번호, 통계접미사, 품목설명, 수량단위
  - `General Rate of Duty`, `Special Rate of Duty`, `Column 2 Rate of Duty`
- 화면 반영:
  - 미국의 기본세율, 특별세율 후보, 미국 현지 HTS 후보
- 판정: **미국 화면에서 강하게 사용 가능하지만 단독 확정은 불가**
  - 한미 FTA 특별세율 표시는 가능하다.
  - REST export에는 장·부 주석과 분류 근거가 포함되지 않는다.
  - Chapter 99 추가관세, 쿼터, 특별세율 국가기호와 원산지 규칙을 별도 해석해야 한다.

공식 문서: https://www.usitc.gov/documents/hts_external_guide.pdf

#### A-3. EU TARIC — EU 전용

- 접근: 공개 조회 및 무료 원시 Excel 데이터. 안정적인 일반 공개 REST 계약으로 보기보다는 원시 데이터 동기화 방식이 안전하다.
- 주요 조회/필터값:
  - CN/TARIC 10단위, 원산국, 목적국, 적용일, 추가코드
- 주요 출력값:
  - 제3국 관세, 특혜세율, 쿼터, 반덤핑·상계·세이프가드
  - 금지·제한, 수입통제, 보조서류 코드, 국가/지역 코드
- 화면 반영:
  - EU 관세·규제·제출서류 카드의 대부분
- 판정: **EU 국가에 한해 매우 적합**
  - 국가별 VAT·소비세는 TARIC에 없으므로 별도 값이 필요하다.
  - 원시 데이터 관계 구조가 복잡해 전용 어댑터와 일일/주기 동기화가 필요하다.

공식 문서: https://taxation-customs.ec.europa.eu/customs/common-customs-tariff-cct/tariff-classification-goods/eu-customs-tariff-taric_en

#### A-4. GOV.UK Trade Tariff API — 영국 전용

- 접근: 공개 HTTPS JSON API. Open Government Licence.
- 주요 요청값:
  - commodity code, 적용일, 수입/수출 방향, 원산국/지리영역
- 주요 출력값:
  - 품목계층, 세율, VAT, 수입·수출 통제, 조치, 조건, 증빙서류 코드
- 화면 반영:
  - 영국의 관세, 규제, 통관서류 카드
- 판정: **영국 전용 커넥터로 적합**
  - 전 세계 공통 엔진이 아니라 국가별 정확도 보강용으로 사용한다.

공식 문서: https://www.api.gov.uk/hmrc/gov-uk-trade-tariff-api/

#### A-5. Access2Markets / ROSA

- 접근: 무료 웹 서비스. 공식적으로 공개·지원되는 범용 API 계약은 확인되지 않았다.
- 웹 입력값: 수출국, 수입국, HS 코드, 거래 방향
- 웹 출력값: 관세, 세금, 원산지 규칙, 절차, 제품 요구사항, ROSA 자가진단
- 화면 반영:
  - `EU 공식 사이트에서 원산지 확인` 딥링크
- 판정: **자동 API 연동 대상이 아니라 공식 확인 링크**
  - 내부 비공개 엔드포인트를 추측하거나 스크래핑하지 않는다.

공식 안내: https://trade.ec.europa.eu/access-to-markets

#### A-6. WCO Trade Tools API

- 접근: API/라이선스 계약형. 상세 스펙과 가격은 WCO 문의 후 제공되는 형태다.
- 예상 요청값: HS 코드 또는 키워드, HS 판, 원산지, 목적지, FTA
- 출력 범위:
  - HS 명명법·법적 주·해설서·분류의견
  - FTA 원문과 품목별 원산지 규칙
- 화면 반영:
  - HS 후보 설명, 공식 분류 근거, 품목별 원산지 규칙
- 판정: **정확도는 높지만 초기 MVP에는 과함**
  - 목적국 세관의 구속력 있는 품목분류나 실제 제조공정의 원산지 충족을 대신하지 않는다.

공식 안내: https://www.wcoomd.org/en/topics/nomenclature.aspx

### B. 국내 수출요건·전략물자·통관서류

#### B-1. 관세청 세관장확인대상물품 API

- 접근: 공공데이터포털 활용신청, 무료, 개발·운영 자동승인. 개발계정 일 10,000건.
- 포맷: REST/XML.
- 주요 요청값:
  - 품목코드(HSK)
  - 수출입구분코드
- 주요 출력값:
  - HS 부호
  - 신고인 확인법령 코드·명
  - 요건승인기관 코드·명
  - 적용시작일자 등
- 화면 반영:
  - `한국 수출 전 필수 확인`, `근거 법령`, `승인기관`, `요건확인서류 필요 가능성`
- 판정: **필수 연동 가치가 높음**
  - 한국 세관이 확인하는 수출요건이다. 미국 등 목적국 수입요건을 알려주는 API가 아니다.
  - 응답이 0건이어도 모든 수출요건이 없다고 단정하지 않는다.

공식 문서: https://www.data.go.kr/data/15101589/openapi.do

#### B-2. KOSTI 최신 HSK 연계표

- 접근:
  - CSV: 로그인·신청 없이 다운로드
  - 공공데이터포털 자동변환 JSON/XML API: 활용신청 필요
- 주요 요청/검색값: HSK 코드, 페이지/행 수
- 출력 컬럼:
  - `HSKCD` 품목번호
  - `HSKNM` 국문 품명
  - `HSENM` 영문 품명
  - `CNTRLNO` 전략물자 통제번호
- 화면 반영:
  - `전략물자 가능성`, 통제번호, `전문판정 필요` 체크리스트
- 판정: **사전 경보로 적합, 최종 판정 불가**
  - 현재 프로젝트의 2018 파일을 2026-05-22 최신 데이터로 교체해야 한다.
  - 미연계도 `비해당 확정`이 아니며 사양 기반 자가/전문 판정이 필요하다.

공식 문서: https://www.data.go.kr/data/15034135/fileData.do

### C. 시장통계

#### C-1. UN Comtrade API

- 접근:
  - Preview: 계정·키 없이 가능하지만 500건 등 제한
  - Free API: 무료 계정과 subscription key 권장
  - Premium: 대용량·벌크 다운로드
- 주요 요청값:
  - URL 경로: `type`(C/S), `frequency`(A/M), `classificationCode`(HS/H5 등)
  - `cmdCode`, `period`, `reporterCode`, `partnerCode`, `flowCode`
  - 필요 시 `partner2Code`, `customsCode`, `motCode`, `maxRecords`, `format`
- 주요 출력값:
  - reporter/partner/period/flow/commodity
  - 무역금액, 순중량, 수량, 단위, 추정 여부, 집계수준
- 화면 반영:
  - 목적국 수입액, 한국산 수입액, 최근 성장률, 한국 점유율, 경쟁국
- 판정: **시장성 근거에 매우 적합**
  - `시장 규모`가 아니라 신고된 무역통계라는 라벨이 필요하다.
  - 보고국 수정, 미러 통계 차이, 최신연도 지연을 표시해야 한다.

공식 문서: https://uncomtrade.org/docs/un-comtrade-api/

권장 오픈소스: https://github.com/uncomtrade/comtradeapicall

### D. 환율·비용

#### D-1. 한국수출입은행 환율 API

- 접근: 무료 인증키 발급 필요.
- 엔드포인트: `https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON`
- 주요 요청값:
  - `authkey`
  - `searchdate`: YYYYMMDD
  - `data`: 환율 조회는 `AP01`
- 주요 출력값:
  - 통화코드·통화명
  - 전신환 받으실 때/보내실 때
  - 매매기준율, 장부가격 등
- 화면 반영:
  - 외화 비용의 원화 환산, 적용 환율과 기준일
- 판정: **비용 환산에 적합**
  - 미래 환율이나 환변동 위험을 예측하지 않는다.
  - 휴일·미고시 날짜는 직전 영업일 재조회 로직이 필요하다.
  - 구 도메인은 종료되었으므로 반드시 `oapi.koreaexim.go.kr`을 사용한다.

공식 문서: https://www.data.go.kr/dataset/3068846/openapi.do?lang=ko

#### D-2. 관세청 해상수출 운송비용

- 접근:
  - CSV: 로그인 없이 다운로드
  - 자동변환 JSON/XML API: 공공데이터포털 활용신청
- 주요 요청/필터값: 기준연월 또는 페이지
- 출력 컬럼:
  - 기간, 미국서부, 미국동부, EU, 중국, 일본, 베트남
  - 단위: 천원/2TEU
- 자료 조건:
  - CIF/CFR 신고, FCL, 40피트 일반 컨테이너, 국가·권역 평균
- 화면 반영:
  - `최근 신고 기반 해상운임 벤치마크`
- 판정: **무료 MVP 운임 기준으로 적합**
  - 개별 항구·품목·선사·성수기 견적이 아니므로 `실견적`으로 표시하면 안 된다.

공식 문서: https://www.data.go.kr/data/15116850/fileData.do

#### D-3. Freightos Price Stats

- 접근: 구독형 API key + secret key. 경로/노선 쿼터가 있다.
- 주요 요청값:
  - `origin`, `destination`, `mode`(FCL/Air), `load`
  - `from_date`, `to_date`, `version`, `route_matching`, `rate_type`
- 주요 출력값:
  - 기간별 USD 운임 통계, 분위값/가격범위, 데이터 신뢰도, 변동률
- 화면 반영:
  - `예상 국제운임 범위`, `변동성`, `데이터 신뢰도`
- 판정: **산업재 해상·항공 운임 범위에 적합**
  - 실제 예약 견적이 아니라 통계다.
  - 무료 MVP에서는 관세청 평균 데이터를 먼저 쓰고 이후 도입한다.

공식 문서: https://apidocs.freightos.com/reference/postpricestats-1

#### D-4. Easyship Rates / Taxes and Duties

- 접근: 계정·Bearer token·권한 scope 필요. 일부 기능은 상위 요금제.
- 관부가세 주요 입력값:
  - 출발/도착 국가 ID, 보험료, 운임, 통화
  - 원산국, 8단위 HS, 과세가격
- 운임 주요 입력값:
  - 출발/도착 주소, DDP/DDU, 중량, 박스 크기, 품목
- 주요 출력값:
  - tax, duty
  - 택배사별 운임, 배송기간, 추가요금, 일부 관부가세 분해
- 화면 반영:
  - 소화물의 `예상 관부가세`, `배송비`, `DDP/DDU 부담액`
- 판정: **전자상거래·소화물에 적합**
  - 비종가세가 지원되지 않는 경우가 있고 규정 반영 시차가 있다.
  - 산업재 컨테이너 운송의 대표값으로 사용하면 안 된다.

공식 문서: https://developers.easyship.com/reference/taxes_and_duties_calculate

#### D-5. Shippo

- 접근: 계정과 `ShippoToken` 필요.
- 주요 입력값:
  - 출발/도착 주소, 소포 크기·중량, 운송사 계정
  - 품명, 수량, 순중량, 원산국, 가격·통화, HS/관세번호
  - 인코텀즈, 송장·허가·인증 참조
- 주요 출력값:
  - 운송사별 rate, 통화, 서비스
  - customs declaration object, commercial invoice 관련 값, 라벨/서류
- 화면 반영:
  - 체크리스트 완료 후 `배송 견적 받기`, `통관신고 데이터 생성`
- 판정: **실행 단계용이며 사전 요건 발견용이 아님**
  - 어떤 인증·허가가 필요한지 찾아주기보다 이미 알고 있는 내용을 신고 객체로 만든다.

공식 문서: https://docs.goshippo.com/api-reference/customs-declarations/create-a-new-customs-declaration

### E. 인증·수입규제

#### E-1. UNCTAD TRAINS NTM

- 접근: 무료 검색·CSV/Excel·벌크 다운로드. 공개 검색 데이터는 별도 키 없이 사용할 수 있다.
- 주요 필터값:
  - 규제 시행국, 영향받는 국가, HS 코드, NTM 코드
  - 수입/수출, 양자/다자, 적용일
- 주요 출력값:
  - NTM 코드·설명, 조치 설명, 제품/HS
  - 발행기관, 규정명·기호, 시행일·폐지일, 원문 링크
  - 데이터 수집연도
- 화면 반영:
  - SPS/TBT/검사/라벨/허가 등 `수입규제 후보`와 공식 원문
- 판정: **글로벌 규제 후보 탐색에 적합**
  - NTM은 장벽 여부를 판정하는 데이터가 아니다.
  - 국가별 수집연도 차이가 있으므로 `최종 확인일`을 반드시 보여준다.
  - 비용·소요일과 실제 제출문서명을 항상 제공하지는 않는다.

공식 문서: https://trainsonline.unctad.org/detailedSearch

#### E-2. openFDA — 미국 품목별

- 접근: 키 없이 시험 가능. 정기 사용은 무료 API 키 권장.
- 공통 요청값:
  - endpoint별 `search=field:term`, `sort`, `count`, `limit`, `skip`
  - 예: Device Classification의 `product_code`
- 주요 출력값:
  - 의료기기 분류, 제품코드, regulation number, class
  - 510(k), PMA, 등록·리스팅, UDI, 리콜 등의 개별 기록
- 화면 반영:
  - 의료기기·의약품에 한해 FDA 제품코드 후보, 분류, 기존 승인·등록 기록
- 판정: **지원 산업이 맞을 때만 보조적으로 적합**
  - HS 코드 하나로 `FDA 인증 필수`를 확정하는 범용 인증 API가 아니다.
  - 제품 용도·기술사양을 먼저 FDA product code로 매핑해야 한다.

공식 문서: https://open.fda.gov/apis/

#### E-3. FCC 공개 데이터/API — 미국 RF 기기

- 접근: 공개 데이터/OData. `getFCCIDList` 등 일부 공식 조회 서비스 제공.
- 주요 요청값:
  - FCC ID 또는 부분 FCC ID, 일부 서비스는 승인 날짜 범위
- 주요 출력값:
  - 승인 FCC ID 목록, grantee code/name, 주소·국가·연락처, 등록일
- 화면 반영:
  - 무선기기인 경우 기존 FCC 승인 조회, 신청 주체 확인
- 판정: **승인 존재 확인에는 유용하나 필요성 판정에는 부족**
  - 제품의 무선 기능과 적용 규칙을 먼저 판단해야 한다.
  - 공개 Grantee 데이터의 갱신일도 확인해야 한다.

공식 문서: https://apps.fcc.gov/oetcf/kdb/forms/FTSSearchResultPage.cfm?id=50070&switch=P

### F. 제재·거래상대방

#### F-1. Trade.gov Consolidated Screening List API

- 접근: 무료 계정 생성 후 Data Services 구독키 발급. CSV/JSON 파일 다운로드 방식도 가능.
- 주요 요청값:
  - 거래상대방 이름, fuzzy 검색 여부, 국가, 원천목록, 유형, 페이지
- 주요 출력값:
  - 이름·별칭·주소·국가·유형
  - 출처 목록, 제한 설명/비고, 원문 URL, fuzzy match score
- 화면 반영:
  - `거래상대방 제재 일치 가능성`, 일치 근거, 사람 검토 체크리스트
- 판정: **바이어 스크리닝에 적합**
  - 국가명만으로 `제재 없음`을 판단하는 API가 아니다.
  - fuzzy score는 위험점수가 아니라 동일 인물/법인일 가능성이다.
  - 일치 후보가 나오면 원 출처를 다시 확인해야 한다.

공식 문서: https://www.trade.gov/consolidated-screening-list

#### F-2. OFAC SLS / UN Security Council Consolidated List

- 접근: 최신 XML/CSV/JSON/PDF 파일 공개. 기본 파일 이용에는 별도 키가 필요하지 않다.
- 입력 방식:
  - 파일을 주기적으로 적재한 뒤 이름·별칭·국가·주소·식별번호로 로컬 매칭
- 주요 출력값:
  - 개인/법인/선박 등 이름과 별칭, 주소, 국적, 프로그램, 등재일, 식별번호
- 화면 반영:
  - 미국·UN 공식 원천별 일치 후보와 적용 제재 프로그램
- 판정: **공식 원천으로 필수 가치가 있음**
  - 단순 문자열 일치만으로는 오탐·누락이 많다.
  - 최종 거래 판단에는 담당자 확인 절차가 필요하다.

공식 문서:

- https://ofac.treasury.gov/sanctions-list-service
- https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list

#### F-3. OpenSanctions yente

- 접근:
  - yente 코드는 오픈소스이며 자체 배포 가능
  - hosted OpenSanctions API는 API key/계약 필요
  - 코드 라이선스와 실제 데이터 라이선스는 별도
- 주요 요청값:
  - schema(Person/Company/Vessel), 이름·별칭, 국가, 생년월일, 식별번호
  - dataset/topics, threshold, limit, algorithm
- 주요 출력값:
  - 후보 entity, source datasets, properties, `score`, `match`, 점수 설명
- 화면 반영:
  - 여러 공식 제재목록의 fuzzy 통합 매칭과 검토 큐
- 판정: **제재 검색 정확도 향상에 유용하지만 2단계 도입**
  - score는 위험도 점수가 아니라 동일 객체 매칭 신뢰도다.
  - 자체 배포에는 검색엔진·데이터 갱신·모니터링 운영비가 든다.

오픈소스: https://github.com/opensanctions/yente

## 4. 설계 카드별 최종 조합

| 화면 카드 | 1차 데이터 | 추가 데이터 | 표시 가능한 최종 상태 |
|---|---|---|---|
| 수출 적합도 | KOTRA, K-SURE, Comtrade | 사용자 입력과 차단요인 | `추천/조건부/보류` + 근거 충족도 |
| 예상 관세·FTA | WITS | USITC/TARIC/UK, WCO, BOM | `추정` 또는 `조건 충족 시` |
| 인증·규제·서류 | KOTRA, 관세청 | TRAINS, 국가별 공식 API | `필수 후보/조건부/확인 필요` |
| 결제 위험 | K-SURE | 거래처 신용정보는 별도 상용 계약 | 국가·업종 수준 위험만 확정 |
| 예상 비용 | Exim 환율, 관세청 운임 | Freightos/Easyship/Shippo | 평균·범위·실견적을 구분 |
| 제재 | KOSTI | CSL, OFAC, UN, yente | 품목통제 가능성과 상대방 매칭을 분리 |

## 5. 실제 키를 받은 뒤 API별 검증 절차

각 API는 단순히 `200 응답`만 확인하지 않고 다음 순서로 검증한다.

1. 공식 Swagger/기술문서에서 엔드포인트·인증·쿼터를 다시 확인한다.
2. 미국/독일/일본 등 대표 국가와 실제 프로젝트 HS 코드로 최소 호출한다.
3. 성공, 0건, 잘못된 HS, 오래된 기준일, 타임아웃, 429, 공급자 장애 응답을 저장한다.
4. 원 응답을 공통 `DecisionFact` 형식으로 변환한다.
5. 공식 웹 조회 화면과 관세율·규정명·기준일을 표본 대조한다.
6. `확정/추정/미확정/사용 불가` 상태가 올바르게 출력되는지 테스트한다.
7. 출처 URL·조회시각·입력 HS·목적국·원산지를 결과와 함께 저장한다.
8. 0건을 `요건 없음`으로 오인하지 않는 회귀 테스트를 추가한다.

## 6. 키 전달과 보안

- API 키 원문을 채팅, 화면, Git 저장소, 로그에 붙이지 않는다.
- 서비스명, 활용신청 화면 캡처, Swagger/기술문서, 승인된 트래픽만 공유하면 된다.
- 실제 키는 Supabase Edge Function secret 또는 배포 환경변수에 등록한다.
- 브라우저 프런트엔드에서 외부 API를 직접 호출하지 않고 Edge Function을 통해 프록시한다.
- 제공기관별로 별도 secret 이름을 쓰고, 응답 로그에서 인증값을 제거한다.

권장 secret 예시:

```text
KCS_REQUIREMENT_API_KEY
KOREA_EXIM_API_KEY
UN_COMTRADE_API_KEY
TRADE_GOV_SUBSCRIPTION_KEY
OPENFDA_API_KEY
FREIGHTOS_API_KEY
FREIGHTOS_SECRET_KEY
EASYSHIP_API_TOKEN
SHIPPO_API_TOKEN
```

## 7. 실제 신청 순서

1. 관세청 세관장확인대상물품
2. 한국수출입은행 환율
3. UN Comtrade 무료 키
4. Trade.gov CSL 구독키
5. KOSTI CSV·관세청 운송비용 CSV 무신청 적재
6. WITS·USITC 공개 API 프로토타입
7. 제품군 확정 후 openFDA/FCC
8. 실제 운임 견적이 필요해질 때 Freightos/Easyship/Shippo 중 하나만 선정
9. 정확한 HS 해설·원산지 규칙의 상업적 가치가 확인될 때 WCO 계약 검토
