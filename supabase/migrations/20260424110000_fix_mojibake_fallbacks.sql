-- PHASE 2: 깨진 fallback/summary 문구 보수 정리
-- 원천 raw(payload) 전체 삭제 없이, 깨진 placeholder 문구만 제한적으로 치환한다.

DO $$
DECLARE
  mojibake_pattern TEXT := E'(\\?댁|\\?뺤|嫄|寃|洹쒖|\\?섏|\\?곕|\\?쒗|\\?꾨|\\?④|\\?꾩|\\?묎|\\?ㅺ)';
BEGIN
  UPDATE public.project_certifications
  SET scheme = '해외인증정보 기관 확인 필요'
  WHERE scheme ~ mojibake_pattern;

  UPDATE public.project_certifications
  SET raw = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          COALESCE(raw, '{}'::jsonb),
          '{required_docs}',
          to_jsonb('확실한 정보 없음'::text),
          true
        ),
        '{validity_period}',
        to_jsonb('확실한 정보 없음'::text),
        true
      ),
      '{hs_code}',
      to_jsonb('확실한 정보 없음'::text),
      true
    ),
    '{procedure}',
    to_jsonb('조회 결과 없음'::text),
    true
  )
  WHERE COALESCE(raw->>'required_docs', '') ~ mojibake_pattern
     OR COALESCE(raw->>'validity_period', '') ~ mojibake_pattern
     OR COALESCE(raw->>'hs_code', '') ~ mojibake_pattern
     OR COALESCE(raw->>'procedure', '') ~ mojibake_pattern;

  UPDATE public.project_regulations
  SET topic = '수입규제 항목(지역/본부별)'
  WHERE topic ~ mojibake_pattern;

  UPDATE public.project_regulations
  SET summary = '조회 결과 없음'
  WHERE summary ~ mojibake_pattern;

  UPDATE public.project_regulations
  SET raw = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          COALESCE(raw, '{}'::jsonb),
          '{regulation_type}',
          to_jsonb('확실한 정보 없음'::text),
          true
        ),
        '{effective_date}',
        to_jsonb('확실한 정보 없음'::text),
        true
      ),
      '{product_name}',
      to_jsonb('확실한 정보 없음'::text),
      true
    ),
    '{hs_code}',
    to_jsonb('확실한 정보 없음'::text),
    true
  )
  WHERE COALESCE(raw->>'regulation_type', '') ~ mojibake_pattern
     OR COALESCE(raw->>'effective_date', '') ~ mojibake_pattern
     OR COALESCE(raw->>'product_name', '') ~ mojibake_pattern
     OR COALESCE(raw->>'hs_code', '') ~ mojibake_pattern;

  UPDATE public.project_safety_flags
  SET summary = '기관 확인 필요'
  WHERE summary ~ mojibake_pattern;

  UPDATE public.project_safety_flags
  SET recommended_action = '기관 확인 필요'
  WHERE recommended_action ~ mojibake_pattern;

  UPDATE public.project_safety_flags
  SET raw = jsonb_set(
    COALESCE(raw, '{}'::jsonb),
    '{match_type}',
    to_jsonb('none'::text),
    true
  )
  WHERE COALESCE(raw->>'match_type', '') ~ mojibake_pattern;

  UPDATE public.project_countries
  SET rationale = jsonb_set(
    COALESCE(rationale, '{}'::jsonb),
    '{summary}',
    to_jsonb('확실한 정보 없음'::text),
    true
  )
  WHERE COALESCE(rationale->>'summary', '') ~ mojibake_pattern;
END $$;
