# country-detail 401 원인 및 수정 기록

## 현상

- `POST https://gnwhjqaxndbkqxecxjkn.supabase.co/functions/v1/country-detail` 요청이 401을 반환했다.
- Supabase 로그의 JWT payload는 `role=anon`, `auth_user=null`이었다.

## 원인

- `supabase/config.toml`의 `[functions.country-detail].verify_jwt=false`는 게이트웨이 JWT 검증만 비활성화한다.
- `country-detail` 함수 내부는 `supabase.auth.getUser()` 결과가 없으면 직접 `401 unauthorized`를 반환한다.
- 상세 데이터 테이블은 `auth.uid() = user_id` RLS 정책을 사용하고, 함수도 `userData.user.id`로 결과 행을 생성한다.
- 따라서 익명 호출로 처리할 수 없는 API인데, 프론트엔드에서 세션이 없거나 확인 중인 상태에서도 상세 분석 호출이 가능했다.

## 수정

- `useApiCall`에서 Supabase Edge Function 호출 전 `supabase.auth.getSession()`을 확인한다.
- 세션이 있으면 사용자 access token을 `Authorization: Bearer ...` 헤더로 명시 전달한다.
- 인증이 필요한 기본 호출에서 세션이 없으면 네트워크 요청을 보내지 않고 401 상태로 반환한다.
- `Step4CountryDetail`에서는 인증 확인 중이거나 세션이 없을 때 `상세 분석 실행` 버튼을 비활성화한다.

## 확인 방법

- 로그인 세션이 없는 상태에서는 `country-detail` 네트워크 요청이 발생하지 않아야 한다.
- 로그인 후 `상세 분석 실행`을 누르면 요청 헤더의 `Authorization`이 anon key가 아니라 사용자 access token이어야 한다.

## 검증 결과

- `npm test -- use-api-call-edge-cpu-limit`: 통과.
- `npm test`: 통과, 60개 테스트 파일 / 360개 테스트.
- `node .\node_modules\typescript\bin\tsc -p .\tsconfig.app.json --noEmit`: 이번 변경분 오류는 제거됨. 기존 테스트 타입 오류와 Supabase Edge Function의 Deno 전역 타입 오류는 남아 있음.
- `npm run build`: 기존 Windows 로컬 환경 이슈와 같은 `node.exe` 비정상 종료(`-1073740791`)로 실패. 명시적인 Vite/TypeScript 오류는 출력되지 않음.

## 후속 원인: 인증 저장 실패

- 401 수정 후 `country-detail`은 실행됐지만, Supabase 로그에서 `project_certifications.required` 컬럼에 `"확률 높음"`, `"검토 요망"` 문자열을 넣어 `22P02 invalid input syntax for type boolean` 오류가 발생했다.
- `required` 컬럼은 boolean/null 컬럼이므로 문자열 삽입이 전체 인증 row insert를 실패시켰다.
- `required`는 `true/null`로 저장하고, 표시용 문구는 `raw.required_label`에 저장하도록 수정했다.
