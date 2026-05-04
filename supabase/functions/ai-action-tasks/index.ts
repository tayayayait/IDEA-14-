import { corsHeaders } from "../_shared/cors.ts";
import { requireAuthenticatedUser } from "../_shared/auth.ts";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_TIMEOUT_MS = 12000;

type AiProvider = "lovable" | "gemini" | "none";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authResult = await requireAuthenticatedUser(req, corsHeaders);
    if (!authResult.ok) return authResult.response;

    const body = await req.json();
    const diagnosticsBase = buildAiDiagnostics();
    const systemPrompt = [
      "당신은 한국 제조기업 수출 준비 코파일럿입니다.",
      "입력된 국가·인증·규제·리스크 정보를 기반으로 7일 실행 과제를 제안하세요.",
      "문장은 짧고 실행 가능한 업무 지시 형태로 작성하세요.",
      "출력은 JSON 객체 한 개만 허용합니다.",
      '스키마: {"tasks":["..."]}',
      "tasks는 4~6개로 제한하세요.",
      "법적 최종판단 문구는 금지합니다.",
    ].join(" ");

    const userPrompt = JSON.stringify(sanitizeBodyForAi(body));

    try {
      const text = await callAiJson(systemPrompt, userPrompt);
      let parsed: { tasks?: string[] } = {};
      try {
        parsed = JSON.parse(text);
      } catch {
        // no-op
      }

      return json({
        state: "success",
        message: null,
        tasks: normalizeTasks(parsed.tasks, body),
        diagnostics: diagnosticsBase,
      });
    } catch (error) {
      return json({
        state: "partial_success",
        message: `AI 과제 생성 실패로 규칙 기반 과제를 제공합니다: ${toErrorMessage(error)}`,
        tasks: buildRuleBasedTasks(body),
        diagnostics: {
          ...diagnosticsBase,
          fallback: "rule_based",
          ai_error: toErrorMessage(error),
        },
      });
    }
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "unknown" }, 500);
  }
});

async function callAiJson(systemPrompt: string, userPrompt: string): Promise<string> {
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  if (lovableApiKey) {
    const response = await fetchWithTimeout(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        response_format: { type: "json_object" },
      }),
    });
    if (!response.ok) throw new Error(`AI ${response.status}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? "{}";
  }

  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  const geminiModel = Deno.env.get("GEMINI_MODEL") ?? "gemini-3-flash-preview";
  if (!geminiApiKey) throw new Error("LOVABLE_API_KEY or GEMINI_API_KEY missing");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${geminiApiKey}`;
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });
  if (!response.ok) throw new Error(`Gemini ${response.status}`);
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
}

function sanitizeBodyForAi(body: unknown) {
  const data = asRecord(body);
  return {
    country_code: asText(data.country_code),
    country_name: asText(data.country_name),
    certs: asArray(data.certs).slice(0, 20),
    regs: asArray(data.regs).slice(0, 20),
    risks: asArray(data.risks).slice(0, 30),
  };
}

function normalizeTasks(value: unknown, body: unknown): string[] {
  const tasks = asArray(value)
    .map((entry) => asText(entry))
    .filter((entry) => entry.length > 0)
    .slice(0, 6);
  if (tasks.length >= 4) return uniqueTasks(tasks);
  return buildRuleBasedTasks(body);
}

function buildRuleBasedTasks(body: unknown): string[] {
  const data = asRecord(body);
  const countryName = asText(data.country_name) || asText(data.country_code) || "대상국";
  const certRows = asArray(data.certs);
  const regRows = asArray(data.regs);
  const riskRows = asArray(data.risks);

  const paymentRows = riskRows.filter((row) => normalizeText(asRecord(row).category) === "k_sure_payment");
  const industryRows = riskRows.filter((row) => normalizeText(asRecord(row).category) === "k_sure_industry");

  const tasks: string[] = [
    `1일차: ${countryName} 기준 HS/HSK 코드와 제품 영문명을 최종 확인하세요.`,
    certRows.length > 0
      ? `2일차: 인증 ${certRows.length}건의 필수서류·소요기간·비용을 체크리스트로 확정하세요.`
      : "2일차: 해외인증 상세 조회를 재실행하고 기관 원문 링크로 인증 요구사항을 확정하세요.",
    regRows.length > 0
      ? `3일차: 규제/NTM ${regRows.length}건의 시행일과 적용 범위를 정리해 통관 리스크를 점검하세요.`
      : "3일차: 수입규제·NTM 조회를 재실행하고 0건 사유와 대체 확인 링크를 기록하세요.",
    paymentRows.length > 0
      ? "4일차: K-SURE 수출결제 정보를 기반으로 거래조건(OA/TT/LC)과 대금회수 대응안을 확정하세요."
      : "4일차: K-SURE 수출결제 정보를 재조회하고 결제기간·연체율 근거를 확보하세요.",
    industryRows.length > 0
      ? "5일차: K-SURE 업종위험 결과를 입력 업종과 대조해 고위험 거래 조건을 조정하세요."
      : "5일차: 입력 업종 매핑 상태를 확인하고 업종위험 데이터 불일치 여부를 점검하세요.",
    "6~7일차: 출처·조회일·원문 링크를 갱신하고 최종 리포트를 재생성하세요.",
  ];

  return uniqueTasks(tasks).slice(0, 6);
}

function uniqueTasks(tasks: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const task of tasks) {
    const text = asText(task);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function normalizeText(value: unknown): string {
  return asText(value).toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function detectAiProvider(): AiProvider {
  if (Deno.env.get("LOVABLE_API_KEY")) return "lovable";
  if (Deno.env.get("GEMINI_API_KEY")) return "gemini";
  return "none";
}

function buildAiDiagnostics() {
  return {
    provider: detectAiProvider(),
    auth: "required",
    cors: "enabled",
    timeout_ms: AI_TIMEOUT_MS,
    lovable_key_present: Boolean(Deno.env.get("LOVABLE_API_KEY")),
    gemini_key_present: Boolean(Deno.env.get("GEMINI_API_KEY")),
  };
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
