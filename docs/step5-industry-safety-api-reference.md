# Step5 Industry Safety API Reference

Step5의 `KC 인증 후보 / 국내 리콜 후보 / 국외 리콜 후보` 구조를 산업별 API로 확장할 때 사용할 후보 API 목록입니다.

Last verified: 2026-05-03

## 핵심 판단

SafetyKorea처럼 `인증 + 국내 리콜 + 국외 리콜`을 한 제공처에서 묶어 주는 API는 전기용품, 생활용품, 어린이제품 영역에 사실상 한정된다.

다른 산업은 보통 다음처럼 나뉜다.

| 구분 | 의미 | 일반적인 제공처 |
| --- | --- | --- |
| 인증/허가/적합성 후보 | 제품이 제도권에 등록, 허가, 인증, 적합성평가 되었는지 확인 | 산업별 주무부처 |
| 국내 리콜/회수 후보 | 국내 판매중지, 회수, 제작결함, 리콜 조치 확인 | 산업별 주무부처 |
| 국외 리콜 후보 | 해외 리콜, enforcement, alert 확인 | 해외 기관 API 또는 공개 포털 |

따라서 Step5는 범용 SafetyKorea 단계가 아니라 `제품군별 안전·인증·회수 라우팅 단계`로 보는 것이 정확하다.

## 산업별 후보 API

| 제품군 | 인증/허가/적합성 후보 | 국내 리콜/회수 후보 | 국외 리콜 후보 | Step5 적용 판단 |
| --- | --- | --- | --- | --- |
| 전기용품·생활용품·어린이제품 | [산업통상부 국가기술표준원_제품 안전인증 및 리콜 정보](https://www.data.go.kr/data/15116894/openapi.do) | 같은 API | 같은 API | 현재 구현 대상. `KC 인증 / 국내 리콜 / 국외 리콜` 3카드 유지 가능. |
| 자동차·자동차부품 | 국내 자동차 인증 OpenAPI는 확실한 정보 없음. 보조로 [국토교통부_자동차종합정보 API서비스](https://www.data.go.kr/data/15071233/openapi.do) 검토 | [국토교통부_자동차 리콜정보 API 서비스](https://www.data.go.kr/data/15089863/openapi.do) | [NHTSA Datasets and APIs](https://www.nhtsa.gov/nhtsa-datasets-and-apis) | SafetyKorea 제외. `자동차 리콜 후보 / 해외 자동차 리콜 후보` 중심. |
| 방송통신기자재·무선기기·전자파 대상 제품 | [국립전파연구원_적합성평가 DB정보](https://www.data.go.kr/data/3034183/openapi.do), [국립전파연구원_자기적합확인 DB정보](https://www.data.go.kr/data/15142276/openapi.do) | 전용 국내 리콜 API는 확실한 정보 없음 | EU Safety Gate는 비식품 위험제품 포털이나 공식 API 문서 확인 필요 | `KC 인증`이 아니라 `적합성평가 후보` 카드로 분리. |
| 의료기기 | [식품의약품안전처_의료기기 품목정보](https://www.data.go.kr/data/15073906/openapi.do), [식품의약품안전처_의료기기 GMP 신청품목 현황](https://www.data.go.kr/data/15073902/openapi.do) | [식품의약품안전처_의료기기 회수·판매중지정보](https://www.data.go.kr/data/15056785/openapi.do) | [FDA iRES API](https://www.accessdata.fda.gov/scripts/ires/apidocs/), [openFDA](https://www.fda.gov/science-research/health-informatics-fda/openfda) | `허가·품목 후보 / 회수·판매중지 후보 / 해외 회수 후보`. |
| 의약품 | [식품의약품안전처_의약품 제품 허가정보](https://www.data.go.kr/data/15095677/openapi.do) | [식품의약품안전처_의약품 회수·판매중지 정보](https://www.data.go.kr/data/15059114/openapi.do), [식품의약품안전처_의약품안전성서한 정보](https://www.data.go.kr/data/15059182/openapi.do) | [FDA iRES API](https://www.accessdata.fda.gov/scripts/ires/apidocs/), [openFDA](https://www.fda.gov/science-research/health-informatics-fda/openfda) | `제품 허가 / 회수·판매중지 / 안전성 서한`으로 구성. |
| 화장품 | [식품의약품안전처_기능성화장품 보고품목정보](https://www.data.go.kr/data/15095680/openapi.do), [식품의약품안전처_화장품 원료성분정보](https://www.data.go.kr/data/15111774/openapi.do), [식품의약품안전처_화장품 규제정보](https://www.data.go.kr/data/15111773/openapi.do) | [식품의약품안전처_화장품 회수·판매중지 정보](https://www.data.go.kr/data/15106958/openapi.do) | EU Safety Gate 포털 검토 가능. 공식 API 문서는 확실한 정보 없음 | `기능성 보고 / 회수·판매중지 / 해외 위험제품 알림` 후보. |
| 식품·건강기능식품 | [식품의약품안전처_HACCP 지정현황](https://www.data.go.kr/data/15058303/openapi.do), [식품의약품안전처_건강기능식품정보](https://www.data.go.kr/data/15056760/openapi.do), [식품의약품안전처_식품 이력 정보](https://www.data.go.kr/data/15058187/openapi.do) | [식품의약품안전처_식품의 회수 및 판매중지 정보](https://www.data.go.kr/data/15074318/openapi.do), [식품의약품안전처_검사 부적합 식품정보](https://www.data.go.kr/data/15056516/openapi.do) | [EU RASFF](https://food.ec.europa.eu/safety/rasff_en), [openFDA](https://www.fda.gov/science-research/health-informatics-fda/openfda) | `HACCP·품목 / 회수·판매중지 / 해외 식품 경보` 후보. |
| 법정계량기 | [산업통상부 국가기술표준원_법정계량기 품질 관리 현황](https://www.data.go.kr/data/15082011/openapi.do) | 전용 리콜 API는 확실한 정보 없음 | 확실한 정보 없음 | 형식승인·검정 카드만 가능. |
| 화학물질 | [화학물질안전원_화학물질안전관리정보](https://www.data.go.kr/data/15072442/openapi.do) | [화학물질안전원_화학사고정보](https://www.data.go.kr/data/15072446/openapi.do) | 확실한 정보 없음 | 리콜보다 `물질 위험성 / 사고 이력` 카드가 적합. |
| 농산물 | [국립농산물품질관리원_농산물이력관리정보조회서비스](https://www.data.go.kr/data/15000761/openapi.do), [농림축산검역본부_식물검역정보](https://www.data.go.kr/data/3055528/openapi.do) | 전용 회수 API는 제품군별 별도 확인 필요 | 확실한 정보 없음 | 인증·이력·검역 중심. |
| 수산물 | [국립수산물품질관리원_품질인증수산물 API](https://www.data.go.kr/data/15058693/openapi.do), [수산물이력제 위치기반 이력번호조회](https://www.data.go.kr/data/15142453/openapi.do) | 전용 회수 API는 확실한 정보 없음 | 확실한 정보 없음 | 품질인증·이력 중심. |
| 반도체·전자부품 | 범용 KC/리콜 API는 확실한 정보 없음. 무선 모듈이면 RRA 적합성평가 대상 가능 | 확실한 정보 없음 | 확실한 정보 없음 | SafetyKorea 호출 금지. HS/수출통제/해외인증 정보로 라우팅. |
| 반도체 장비·산업기계 | 산업안전보건공단 KCs 등은 검토 대상이나 공공 OpenAPI는 확실한 정보 없음 | 확실한 정보 없음 | 확실한 정보 없음 | `산업안전 인증 확인 필요` 상태로 표시. |
| 석유·가스·연료 | 인증·리콜형 API는 확실한 정보 없음 | 확실한 정보 없음 | 확실한 정보 없음 | [한국석유공사_전국 주유소 평균가격 오픈 API](https://www.data.go.kr/data/15150932/openapi.do)는 가격 데이터라 Step5 안전·리콜 카드에는 부적합. |

## Consumer24 Recall API

Source guide: `C:/Users/dbcdk/Downloads/OpenAPI 개발가이드(리콜정보)_V2.5 (4).pdf`

소비자24 리콜정보 OpenAPI는 별도 `serviceKey` 파라미터를 사용한다. PDF 개발가이드 기준으로 `serviceKey`는 활용신청 후 발급받는 `승인번호(서비스인증키)` 값이다.

Local env mapping:

| 용도 | 환경변수 | 메뉴 ID |
| --- | --- | --- |
| 소비자24 자동차 리콜 | `CONSUMER24_AUTO_RECALL_API_KEY` | `0301` |

Implementation status:

- `supabase/functions/safety-scan/consumer24-recall.ts` parses Consumer24 recall XML.
- `supabase/functions/safety-scan/index.ts` routes automobile-like inputs to Consumer24 `cntntsId=0301`.
- Consumer24 results are normalized into the existing `project_safety_flags.raw.domestic_recalls[]` shape.
- `api_call_logs.api_key_name` uses `consumer24_auto_recall` for this path.
- SafetyKorea remains the default path for non-automobile product safety checks.

Request URL:

```text
https://www.consumer.go.kr/openapi/recall/contents/index.do?serviceKey={서비스키}&pageNo=1&cntPerPage=10&cntntsId={메뉴ID}
```

Request parameters:

| 파라미터 | 필수 | 설명 |
| --- | --- | --- |
| `serviceKey` | 필수 | 승인번호(서비스인증키) |
| `pageNo` | 필수 | 페이지 번호 |
| `cntPerPage` | 필수 | 페이지당 출력 수. 최소 1, 최대 100 |
| `cntntsId` | 필수 | 서비스 대상 메뉴 ID |
| `productNm` | 선택 | 제품명. 특수문자 포함 시 UTF-8 인코딩 |
| `bsnmNm` | 선택 | 사업자명. 특수문자 포함 시 UTF-8 인코딩 |
| `modlNmInfo` | 선택 | 모델명 정보. 특수문자 포함 시 UTF-8 인코딩 |
| `recallProcssInfo` | 선택 | 리콜 절차 정보 또는 인증번호. 특수문자 포함 시 UTF-8 인코딩 |
| `recallPublictBgnde` | 선택 | 리콜 공표시작일. `yyyyMMdd` |
| `recallPublictEndde` | 선택 | 리콜 공표만료일. `yyyyMMdd` |

Recall menu IDs:

| 메뉴 ID | 메뉴명 |
| --- | --- |
| `0101` | 공산품 |
| `0405` | 생활방사선제품 |
| `0201` | 식품 |
| `0203` | 축산물 |
| `0204` | 의약품 |
| `0205` | 의약외품 |
| `0207` | 의료기기 |
| `0206` | 화장품 |
| `0401` | 생활화학제품 |
| `0301` | 자동차 |
| `0403` | 먹는물 |
| `0208` | 위생용품 |
| `0501` | 해외리콜 |

Relevant response fields:

| 필드 | 설명 |
| --- | --- |
| `allCnt` | 해당 메뉴 전체 정보 개수 |
| `code`, `codeMsg` | 결과 코드와 메시지 |
| `recallSn` | 리콜번호 |
| `cntntsId` | 메뉴 ID |
| `productNm` | 제품명 |
| `makr` | 제조사 |
| `bsnmNm` | 사업자명 |
| `modlNmInfo` | 모델명 정보 |
| `stdBrcd` | 표준 바코드 |
| `prmisnNo` | 허가번호 |
| `shrtcomCn` | 결함 내용 |
| `recallSe` | 리콜 구분 |
| `recallPublictBgnde`, `recallPublictEndde` | 리콜 공표 기간 |
| `injryCauseResult` | 위해 원인 결과 |
| `cnsmrGhvrTips` | 소비자 행동 요령 |
| `recallProcssInfo` | 리콜 절차 정보 |
| `infoOriginInstt`, `infoOriginUrl` | 정보 출처 기관과 URL |
| `recallImgUrls` | 리콜 이미지 URL |

Error codes:

| 코드 | 의미 |
| --- | --- |
| `00` | 정상 |
| `30` | 데이터 없음 |
| `40` | 잘못된 요청 파라미터 |
| `41` | 페이지당 정보요청 개수 초과 |
| `50` | 등록되지 않은 서비스키 |
| `51` | 등록되지 않은 사용자 |

## 공통 보조 API

아래 API는 인증·리콜 직접 조회는 아니지만, SafetyKorea 대상이 아닌 제품군의 수출 규제·시장 검토에 사용할 수 있다.

| 용도 | API |
| --- | --- |
| HS 기준 수출입 실적 | [관세청_품목별 국가별 수출입실적(GW)](https://www.data.go.kr/data/15100475/openapi.do) |
| 해외 인증 제도 설명 | [KOTRA_해외인증정보](https://www.data.go.kr/data/15134030/openapi.do) |
| 국가·품목별 수입 규제 | [KOTRA_수입규제품목(지역본부별) 정보](https://www.data.go.kr/data/15088467/openapi.do) |

## 구현 라우팅 권장안

Step5 입력값을 바로 SafetyKorea에 넣으면 자동차, 반도체, 석유 같은 제품군에서 무의미한 결과가 나온다. 먼저 제품군을 판정한 뒤 연결 API를 선택해야 한다.

```text
제품명/HS/HSK/태그
-> 제품군 판정
-> 산업별 API 어댑터 선택
-> 인증/허가 후보, 국내 회수 후보, 국외 리콜 후보 중 제공 가능한 카드만 표시
```

권장 카드명:

| 제품군 | 카드 구성 |
| --- | --- |
| 전기·생활·어린이제품 | `KC 인증 후보`, `국내 리콜 후보`, `국외 리콜 후보` |
| 자동차 | `자동차 리콜 후보`, `해외 자동차 리콜 후보` |
| 의료기기·의약품·화장품·식품 | `허가·품목 후보`, `회수·판매중지 후보`, `해외 회수·경보 후보` |
| 방송통신기자재 | `적합성평가 후보`, `자기적합확인 후보` |
| 반도체·석유·산업기계 | `SafetyKorea 대상 아님`, `해외인증·수입규제 후보`, `기관 확인 필요` |

## 제외 기준

- SafetyKorea는 전기용품·생활용품·어린이제품 중심이므로 자동차, 반도체, 석유 제품명으로 기본 호출하지 않는다.
- 인증·허가 API가 없는 산업은 빈 리콜 카드 대신 `확실한 정보 없음` 또는 `기관 확인 필요`로 표시한다.
- 해외 리콜은 국가별 제도와 API 인증 방식이 다르므로 국내 API와 같은 점수 체계로 단정하지 않는다.
