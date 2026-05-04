# Report certification/regulation evidence alignment (2026-05-02)

## 문제
- 국가 상세 단계는 현재 제품명, HS, HSK 기준으로 인증/규제 행을 필터링한다.
- 리포트 단계는 `project_certifications`, `project_regulations` 전체를 근거 번들에 넣어 과거 제품/HS 행이나 검토 후보가 AI 리포트에 섞일 수 있었다.
- AI 초안 또는 저장된 리포트 초안이 근거 없는 인증명을 포함해도 클라이언트 정규화 단계에서 차단하지 않았다.

## 변경
- Step6 로딩 시 Step4와 동일한 현재 제품/HS 컨텍스트 필터를 적용한다.
- 리포트 근거 번들에는 `detail_state=success`이고 검토 필요 후보가 아닌 확정 행만 포함한다.
- 확정 인증/규제 근거가 없는 국가의 AI 국가별 주의사항 섹션은 `0건`으로 강제 정규화하고 특정 인증명/규제명을 표시하지 않는다.
- Gemini 리포트 프롬프트에 certs/regs 동일 국가 행이 없으면 인증명/규제명을 생성하지 말라는 제약을 추가했다.

## 검증
- `npm test -- report-draft.test.ts`
- `npm test`
