# Step4 SME Certification Product Fallback Filter

## 문제

베트남 + 반도체(DRAM) 상세 분석에서 중소벤처기업부 해외규격인증정보의 베트남 국가별 인증 7개가 제품 적합성 검토 없이 모두 `검토 필요 후보`로 표시됐다.

CSV 원문 기준 베트남 행은 다음 7개다.

- CR Mark: 베트남안전규격인증
- DAV: 베트남보건부의약청 화장품등록
- DMEC: 베트남의료기기 수입허가
- PPD: 베트남 비료허가
- VFA: 베트남 식품 인허가
- VNEEP: 베트남에너지효율인증
- VNTA: 베트남유무선통신인증

DRAM에는 화장품, 의료기기, 비료, 식품 인증이 적용 후보로 볼 근거가 없다. 원인은 Gemini 추천이 빈 배열일 때 `buildSmeCertificationFallbackRecommendations`가 국가별 인증 목록을 제품 필터 없이 반환한 것이다.

## 수정

- SME fallback 생성 시 `productName`, `productDescription`, `hsCode`를 받도록 변경했다.
- 인증명/설명에 제품 토큰이 직접 포함되거나, 자동차/통신/화장품/의료/식품/비료/에너지효율/반도체 제품군이 인증 설명과 명확히 맞는 경우만 fallback 후보로 남긴다.
- 제품 신호가 없거나 직접 관련성이 없으면 국가별 인증 목록을 표시하지 않는다.
- `country-detail`에서 SME fallback 호출 시 현재 제품 컨텍스트를 전달한다.

## 기대 결과

- 베트남 + 반도체(DRAM), HS 854232 계열: SME fallback 후보 0건.
- 베트남 + 무선 통신 모듈: VNTA 같은 통신 인증만 후보로 표시 가능.
- 인도 + 자동차 계열: 자동차 관련 인증명/설명이 있는 경우에만 fallback 후보로 표시 가능.
