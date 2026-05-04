# Step3 뉴스 근거와 Step6 리포트 뉴스 영향 연결

## 변경 목적

Step3 `상위 3개국 뉴스 근거 생성`으로 저장한 뉴스 근거를 Step6 리포트의 `뉴스·이슈 수출전략 영향` 분석에 그대로 연결한다. 리포트는 뉴스 제목이나 짧은 요약을 나열하지 않고, Gemini가 뉴스 본문까지 읽은 뒤 국가별 수출전략 영향을 문단형 종합 판단문으로 작성한다.

## Step3 저장 필드

- `supabase/functions/recommend-country-news`는 KOTRA 뉴스 본문 `newsBdt`를 `stripHtml -> cleanText` 순서로 정제한다.
- 정제한 본문은 `project_countries.rationale.sources[].article_body`에 저장한다.
- KOTRA API의 `newsBdt`가 비어 있거나 300자 미만이면, `bbstxSn`/`kotraNewsUrl`로 공개 KOTRA 기사 페이지를 조회해 본문을 보강한다.
- 공개 기사 HTML은 `script/style/noscript/svg`를 제거한 뒤 기사 제목 이후의 본문 영역을 추출한다.
- 기사 1건당 본문 저장 상한은 12,000자다.
- 원문 길이와 절단 여부는 각각 `article_body_original_length`, `article_body_truncated`에 저장한다.
- 기존 240자 `summary`는 화면 표시와 보조 근거용으로 유지하되, Step6 AI 분석은 `article_body`를 우선 사용한다.

## Step6 리포트 연결

- Step6 근거 번들은 `rationale.sources`의 `article_body`, `article_body_truncated`, `article_body_original_length`를 각각 `articleBody`, `articleBodyTruncated`, `articleBodyOriginalLength`로 전달한다.
- 리포트 뉴스 영향 분석 대상은 실제 뉴스 근거만 포함한다.
- 허용 `sourceType`은 `product_evidence`, `country_background`, `news`다.
- `market_profile`, `detail_deferred`, `export_region_rank` 같은 추천 메타데이터는 뉴스 영향 분석에서 제외한다.
- 기존처럼 최대 3건으로 자르지 않고, Step3 버튼으로 저장된 실제 뉴스 근거 전체를 국가별 Gemini 입력에 포함한다.

## Gemini 전용 정책

- Step6 AI 리포트 요약 Edge Function은 Gemini 전용으로 동작한다.
- `GEMINI_API_KEY`가 없거나 Gemini 호출이 실패하면 Lovable fallback을 사용하지 않는다.
- Gemini 실패 시 `관련 뉴스·이슈 N건 확인: ...` 형식의 제목 나열 fallback을 생성하지 않는다.
- 실패 상태에서는 `Gemini 뉴스 본문 분석 미생성` 안내문만 반환한다.
- Gemini 프롬프트는 뉴스 영향 분석에서 목록 생성을 금지하고, 뉴스 본문 기반 종합 판단문을 요구한다.
- 국가별 `newsImpactAnalysis`는 자연스러운 한국어 2~4문단으로 작성하며 시장 기회, 예상 리스크, 소비·산업·정책 변화 영향, 진입 전략, 실무 대응 방향을 포함해야 한다.
- Gemini 요청에는 리포트 생성에 필요한 필드만 전달한다. `certs`, `regs`, `risks`의 전체 `raw` 객체는 그대로 보내지 않고, K-SURE 결제·위험 판단에 필요한 핵심 raw 필드만 보존한다.
- 뉴스 본문은 `articleBody`로 전달되며, Step3 저장 상한과 동일한 12,000자 상한을 Gemini 입력에도 적용한다.
- 본문 기반 분석 지연을 고려해 Edge Function Gemini 호출 timeout은 110초, Step6 클라이언트 호출 timeout은 120초로 설정한다.

## 기존 프로젝트 주의사항

기존에 이미 생성된 뉴스 근거에는 `article_body`가 저장되어 있지 않을 수 있다. 본문 기반 Gemini 분석을 받으려면 배포 후 Step3에서 `상위 3개국 뉴스 근거 생성`을 다시 실행한 다음 Step6에서 `AI 요약 생성`을 다시 실행해야 한다.

## 검증

- `npm test -- src/test/report-draft.test.ts`
- `npm test -- src/test/recommend-country-news-edge-bundle.test.ts`
- `npm test`
- Node 22.18.0 기준 Vite production build
