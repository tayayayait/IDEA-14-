# Step2 AI Description Output Guard (2026-04-23)

## Goal

- Keep Step2 description in two sections only:
- `개요`
- `프로젝트 맥락`
- Prevent speculative phrase output in `프로젝트 맥락`.

## Scope

- `supabase/functions/ai-product-description/index.ts`

## Guard Logic

1. Parse model output section values (`overview`, `project_context`).
2. Strip any `추가 확인 필요` / `missing_info` block.
3. Validate `project_context` with blocked-pattern detection:
- `확실한 정보 없음이나`
- `인프라를 활용`
- `수출하기 위한 맥락`
- `맥락을 포함`
4. If blocked pattern appears, replace with strict fact-only context sentence.

## Output Rule

- Final description is always rebuilt as:
- `개요: ...`
- `프로젝트 맥락: ...`

## Expected Result

- Requested sentence pattern does not reappear.
- Context text remains factual and deterministic.
