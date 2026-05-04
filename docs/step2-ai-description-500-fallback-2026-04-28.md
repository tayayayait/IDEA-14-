# Step2 AI 설명 500 오류 방어 (2026-04-28)

## 원인
- `ai-product-description` Edge Function은 AI 공급자 호출 실패를 그대로 예외 처리해 HTTP 500을 반환했다.
- 실패 가능 원인은 `LOVABLE_API_KEY`/`GEMINI_API_KEY` 누락, AI 크레딧 부족, 429 제한, Gemini/Lovable 응답 오류, 외부 요청 지연이다.
- 기존 프로젝트 맥락 정리 정규식에 깨진 문자열이 포함되어 함수 안정성도 떨어져 있었다.

## 변경
- AI 호출 실패 시 HTTP 500 대신 규칙 기반 제품 설명을 `state: "partial_success"`로 반환한다.
- 응답에 `diagnostics`를 포함하되 키 값은 노출하지 않고 키 존재 여부, 공급자, 타임아웃, 오류 메시지만 남긴다.
- AI 호출 타임아웃을 12초로 제한했다.
- 잘못된 JSON 요청은 500이 아닌 400으로 반환한다.
- 깨진 정규식을 제거하고 추측성 프로젝트 맥락 문구 차단 패턴을 정상 정규식으로 교체했다.

## 기대 결과
- Step2 제품 설명 초안 생성에서 공급자 장애가 발생해도 화면은 빈 상태로 멈추지 않고 규칙 기반 초안을 표시한다.
- Supabase Invocations에서 AI 공급자 실패는 500이 아닌 200 `partial_success` 응답으로 관측된다.
- 실제 운영 반영에는 `ai-product-description` 함수 재배포가 필요하다.
