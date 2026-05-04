import { corsHeaders } from "../_shared/cors.ts";
import { requireAuthenticatedUser } from "../_shared/auth.ts";
import {
  buildFallbackRationale as buildRoleFallbackRationale,
  normalizeMatchScores,
  rankHsCandidates,
  sortCandidatesByMatchScore as sortRoleCandidatesByMatchScore,
  toHsCandidate,
} from "./candidate-ranking.ts";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const UNKNOWN_TEXT = "확실한 정보 없음";
const AI_TIMEOUT_MS = 8000;

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

type AiRerankResult = {
  orderedHsk: string[];
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

    const ranked = rankHsCandidates(input);
    if (ranked.length === 0) {
      const emptyResult: SuggestionResult = {
        state: "empty",
        message: "관세청 HS부호/표준품명 데이터에서 일치 후보를 찾지 못했습니다.",
        candidates: [],
        rationale: "공식 코드 매칭 결과가 없어 후보를 생성하지 않았습니다.",
      };
      return json(emptyResult);
    }

    const normalized = normalizeMatchScores(ranked.slice(0, 12));
    let candidates = normalized.map(toHsCandidate);
    let rationale = buildRoleFallbackRationale(candidates, input);

    const aiResult = await rerankWithAi(input, candidates);
    if (aiResult.orderedHsk.length > 0) {
      candidates = reorderCandidates(candidates, aiResult.orderedHsk);
    } else {
      candidates = sortRoleCandidatesByMatchScore(candidates);
    }
    if (aiResult.rationale) {
      rationale = aiResult.rationale;
    }

    const result: SuggestionResult = {
      state: "success",
      message: null,
      candidates: candidates.slice(0, 5),
      rationale,
    };
    return json(result);
  } catch (e) {
    if (parsedInput && parsedInput.name) {
      const ranked = rankHsCandidates(parsedInput);
      const fallbackCandidates = ranked.slice(0, 5).map(toHsCandidate);
      if (fallbackCandidates.length > 0) {
        return json({
          state: "partial_success",
          message: `HS 추천 처리 중 예외가 발생해 규칙 기반 후보를 제공합니다: ${toErrorMessage(e)}`,
          candidates: fallbackCandidates,
          rationale: buildRoleFallbackRationale(fallbackCandidates, parsedInput),
        });
      }
      return json({
        state: "empty",
        message: `HS 추천 처리 중 예외가 발생했습니다: ${toErrorMessage(e)}`,
        candidates: [],
        rationale: "공식 HS/HSK 데이터에서 유효 후보를 찾지 못했습니다.",
      });
    }
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

async function rerankWithAi(input: SearchInput, candidates: HsCandidate[]): Promise<AiRerankResult> {
  const hasAiCredential = Boolean(Deno.env.get("LOVABLE_API_KEY") || Deno.env.get("GEMINI_API_KEY"));
  if (!hasAiCredential || candidates.length < 2) {
    return { orderedHsk: [], rationale: null };
  }

  const systemPrompt = [
    "너는 관세청 공식 HS 데이터 기반 후보를 정렬하는 보조 분석기다.",
    "절대 새로운 hs/hsk 코드를 생성하지 마라.",
    "입력으로 받은 후보 hsk_code 중에서만 선택하라.",
    "JSON만 반환하라.",
    '스키마: {"ordered_hsk":["10자리코드"],"rationale":"한국어 근거"}',
    "ordered_hsk는 길이 1~5, 중복 금지.",
  ].join(" ");

  const payload = candidates.slice(0, 8).map((candidate) => ({
    hs_code: candidate.hs_code,
    hsk_code: candidate.hsk_code,
    official_name_ko: candidate.official_name_ko,
    official_name_en: candidate.official_name_en,
    standard_name: candidate.standard_name,
    required_specs: candidate.required_specs,
    match_reason: candidate.match_reason,
    match_score: candidate.match_score,
  }));

  const userPrompt = [
    `제품명: ${input.name}`,
    `산업코드: ${input.industryCode || UNKNOWN_TEXT}`,
    `제품 설명: ${input.description || UNKNOWN_TEXT}`,
    `구성/소재: ${input.components || UNKNOWN_TEXT}`,
    `모델명: ${input.modelName || UNKNOWN_TEXT}`,
    `목표시장 메모: ${input.targetMarketNote || UNKNOWN_TEXT}`,
    `후보 목록: ${JSON.stringify(payload)}`,
  ].join("\n");

  try {
    const text = await callAiJson(systemPrompt, userPrompt);
    const parsed = JSON.parse(text) as { ordered_hsk?: unknown; rationale?: unknown };
    const allow = new Set(candidates.map((candidate) => candidate.hsk_code));
    const ordered = Array.isArray(parsed.ordered_hsk)
      ? parsed.ordered_hsk
        .map((value) => normalizeCode(value))
        .filter((code) => allow.has(code))
      : [];

    return {
      orderedHsk: dedupe(ordered).slice(0, 5),
      rationale: normalizeText(parsed.rationale),
    };
  } catch {
    return { orderedHsk: [], rationale: null };
  }
}

function reorderCandidates(candidates: HsCandidate[], orderedHsk: string[]): HsCandidate[] {
  const byCode = new Map(candidates.map((candidate) => [candidate.hsk_code, candidate]));
  const ordered: HsCandidate[] = [];
  for (const hsk of orderedHsk) {
    const candidate = byCode.get(hsk);
    if (!candidate) continue;
    ordered.push(candidate);
    byCode.delete(hsk);
  }
  const rest = sortRoleCandidatesByMatchScore([...byCode.values()]);
  return [...ordered, ...rest];
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

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
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
