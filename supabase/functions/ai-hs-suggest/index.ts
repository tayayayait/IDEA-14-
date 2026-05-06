import { corsHeaders } from "../_shared/cors.ts";
import { requireAuthenticatedUser } from "../_shared/auth.ts";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const UNKNOWN_TEXT = "확실한 정보 없음";
const AI_TIMEOUT_MS = 15000;

type SearchInput = {
  name: string;
  description: string;
  components: string;
  modelName: string;
  targetMarketNote: string;
  industryCode: string;
};

type HsCandidate = {
  hs_code: string;
  hsk_code: string;
  description: string;
  confidence: number;
  source: "CUSTOMS_HS";
  official_name_ko: string;
  official_name_en: string;
  standard_name: string | null;
  required_specs: string | null;
  match_reason: string;
  match_score: number;
};

type SuggestionResult = {
  state: "success" | "partial_success" | "empty";
  message: string | null;
  candidates: HsCandidate[];
  rationale: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let parsedInput: SearchInput | null = null;
  try {
    const authResult = await requireAuthenticatedUser(req, corsHeaders);
    if (!authResult.ok) return authResult.response;

    const body = asRecord(await req.json());
    const input: SearchInput = {
      name: normalizeText(body.name),
      description: normalizeText(body.description),
      components: normalizeText(body.components),
      modelName: normalizeText(body.model_name),
      targetMarketNote: normalizeText(body.target_market_note),
      industryCode: normalizeCode(body.industry_code),
    };
    parsedInput = input;

    if (!input.name) return json({ error: "name required" }, 400);

    const aiCandidates = await suggestHsCodeWithAi(input);

    if (!aiCandidates || aiCandidates.length === 0) {
      return json({
        state: "empty",
        message: "AI가 대한민국 관세청 HSK 코드 정보를 기반으로 적절한 후보를 찾지 못했습니다.",
        candidates: [],
        rationale: "공식 코드 매칭 결과가 없어 후보를 생성하지 않았습니다.",
      });
    }

    const result: SuggestionResult = {
      state: "success",
      message: null,
      candidates: aiCandidates,
      rationale: "AI가 입력된 제품 정보를 바탕으로 대한민국 관세청 HSK 체계를 분석하여 상위 후보를 직접 추천했습니다.",
    };
    return json(result);
  } catch (e) {
    return json({
      state: "empty",
      message: `HS 추천 처리 중 예외가 발생했습니다: ${toErrorMessage(e)}`,
      candidates: [],
      rationale: "시스템 오류로 인해 HS 추천을 완료하지 못했습니다.",
    });
  }
});

async function suggestHsCodeWithAi(input: SearchInput): Promise<HsCandidate[]> {
  const hasAiCredential = Boolean(Deno.env.get("LOVABLE_API_KEY") || Deno.env.get("GEMINI_API_KEY"));
  if (!hasAiCredential) return [];

  const systemPrompt = [
    "너는 대한민국 관세청 HS 부호 및 HSK 연계표 데이터 전문가다.",
    "사용자가 입력한 제품 정보를 분석하여, 대한민국 관세청 2026년 체계에 가장 정확히 일치하는 10자리 HSK 코드 상위 3~5개를 추천하라.",
    "절대 임의의 가짜 코드를 지어내지 말고, 실제 관세청에 존재하는 유효한 10자리 HSK 코드만을 사용하라.",
    "반환 형식은 반드시 지정된 JSON 규격에 맞춰라.",
    'JSON 스키마: {"candidates": [{"hsk_code": "10자리 숫자", "hs_code": "6자리 숫자", "official_name_ko": "국문 공식 품목명", "official_name_en": "영문 공식 품목명", "match_score": 0~100 숫자, "match_reason": "왜 이 코드를 추천했는지 구체적인 한글 설명", "standard_name": "해당할 경우 표준품명", "required_specs": "해당할 경우 필수규격"}]}'
  ].join(" ");

  const userPrompt = [
    `제품명: ${input.name}`,
    `산업코드: ${input.industryCode || UNKNOWN_TEXT}`,
    `제품 설명: ${input.description || UNKNOWN_TEXT}`,
    `구성/소재: ${input.components || UNKNOWN_TEXT}`,
    `모델명: ${input.modelName || UNKNOWN_TEXT}`,
    `목표시장 메모: ${input.targetMarketNote || UNKNOWN_TEXT}`,
  ].join("\n");

  try {
    const text = await callAiJson(systemPrompt, userPrompt);
    const parsed = JSON.parse(text) as { candidates?: any[] };
    if (!parsed.candidates || !Array.isArray(parsed.candidates)) return [];

    return parsed.candidates.map((c, index) => {
      const score = typeof c.match_score === 'number' ? c.match_score : (100 - index * 10);
      const confidence = Math.max(0.1, Math.min(1, Number((score / 100).toFixed(2))));
      
      const officialKoName = normalizeText(c.official_name_ko) || UNKNOWN_TEXT;
      const officialEnName = normalizeText(c.official_name_en) || UNKNOWN_TEXT;
      const standardName = normalizeText(c.standard_name);
      
      let description = officialKoName;
      if (officialEnName !== UNKNOWN_TEXT) description += ` (${officialEnName})`;
      if (standardName) description += ` · 표준품명: ${standardName}`;

      return {
        hs_code: normalizeCode(c.hs_code).substring(0, 6) || normalizeCode(c.hsk_code).substring(0, 6),
        hsk_code: normalizeCode(c.hsk_code),
        description: description,
        confidence: confidence,
        source: "CUSTOMS_HS",
        official_name_ko: officialKoName,
        official_name_en: officialEnName,
        standard_name: standardName || null,
        required_specs: normalizeText(c.required_specs) || null,
        match_reason: normalizeText(c.match_reason) || "AI 의미 기반 매칭",
        match_score: score,
      };
    }).filter(c => c.hsk_code.length >= 6); 
  } catch {
    return [];
  }
}

async function callAiJson(systemPrompt: string, userPrompt: string): Promise<string> {
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  if (lovableApiKey) {
    const res = await fetchWithTimeout(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) throw new Error(`AI ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "{}";
  }

  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  const geminiModel = Deno.env.get("GEMINI_MODEL") ?? "gemini-3-flash-preview";
  if (!geminiApiKey) throw new Error("LOVABLE_API_KEY or GEMINI_API_KEY missing");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${geminiApiKey}`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });

  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
}

async function fetchWithTimeout(input: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("AI request timeout");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function toErrorMessage(value: unknown): string {
  if (value instanceof Error && value.message.trim().length > 0) return value.message.trim();
  return "unknown";
}

function normalizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function normalizeCode(value: unknown): string {
  return normalizeText(String(value ?? "")).replace(/\D/g, "");
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
