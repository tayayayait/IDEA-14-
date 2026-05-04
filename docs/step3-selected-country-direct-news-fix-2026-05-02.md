# Step 3 선택 국가 직접 뉴스 표시 수정 (2026-05-02)

## 원인

- `recommend-country-news`가 직접 매칭 뉴스가 없을 때 `product_evidence` 타입의 "직접 근거 없음" 플레이스홀더를 저장했다.
- Step 3 UI는 `product_evidence`/`product_direct` 소스를 실제 직접 뉴스 목록으로 렌더링하므로, 플레이스홀더가 직접 뉴스 영역을 차지했다.
- KOTRA 기사에서 선택 국가명이 제목/요약/메타데이터가 아니라 본문에만 있는 경우 `background_country`로 분류되어 직접 뉴스 후보에서 제외됐다.

## 수정

- 본문에만 선택 국가가 있고 다른 국가 신호가 없으면 `direct_country`로 판정하도록 국가 매칭 로직을 보강했다.
- `recommend-country-news`는 더 이상 빈 직접 뉴스 플레이스홀더를 `product_evidence`로 저장하지 않는다.
- 기존 저장 데이터에 남아 있는 빈 직접 뉴스 플레이스홀더는 Step 3 `extractEvidence`에서 제외한다.

## 검증

- 직접 뉴스가 실제 KOTRA 기사일 때만 선택 국가 직접 뉴스 영역에 표시된다.
- 직접 뉴스가 없고 배경 뉴스만 있는 경우, 배경 뉴스만 표시되고 빈 플레이스홀더 카드는 표시되지 않는다.
