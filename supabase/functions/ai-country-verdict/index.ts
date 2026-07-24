/**
 * ai-country-verdict — AI 최종 판단 생성 Edge Function
 *
 * 2단계 Gemini 호출:
 * 1) Google Search 그라운딩으로 공식자료 검색
 * 2) 프로그램 데이터 + 검색 결과를 종합하여 구조화 JSON 판단 생성
 */
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const AI_TIMEOUT_MS = 110_000;
const VERDICT_MODEL = "gemini-2.5-flash";

/* ──────────── HTTP ──────────── */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json("ok", 204);
  try {
    const authResult = await authenticateRequest(req);
    if (!authResult.ok) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const projectId = asText(body.project_id);
    const countryCode = asText(body.country_code);
    const countryName = asText(body.country_name);
    const productName = asText(body.product_name);
    const hs6 = asText(body.hs6);
    const evidenceHash = asText(body.evidence_hash);

    if (!projectId || !countryCode) {
      return json({ error: "project_id and country_code required" }, 400);
    }

    // 캐시 확인
    const supabase = createServiceClient();
    if (evidenceHash) {
      const { data: cached } = await supabase
        .from("country_verdicts")
        .select("verdict, evidence_hash, created_at")
        .eq("project_id", projectId)
        .eq("country_code", countryCode)
        .maybeSingle();

      if (cached && cached.evidence_hash === evidenceHash) {
        return json({
          state: "cached",
          verdict: cached.verdict,
          created_at: cached.created_at,
        });
      }
    }

    // 프로그램 수집 데이터 요약
    const programEvidence = buildProgramEvidence(body);

    // 1단계: Google Search 그라운딩
    let grounded: GroundedResult;
    try {
      grounded = await callGroundedResearch(programEvidence, countryName, productName, hs6);
    } catch (groundingError) {
      // 그라운딩 실패 시 프로그램 데이터만으로 판단
      grounded = {
        text: "인터넷 검색에 실패하여 프로그램 수집 데이터만으로 판단합니다.",
        sources: [],
        queries: [],
      };
    }

    // 2단계: 구조화 판단 생성
    const verdictJson = await callStructuredVerdict(
      programEvidence,
      grounded,
      countryName,
      productName,
      hs6,
    );

    // DB 저장 (UPSERT)
    const verdict = safeParseJson(verdictJson);
    if (evidenceHash) {
      await supabase
        .from("country_verdicts")
        .upsert(
          {
            project_id: projectId,
            country_code: countryCode,
            verdict,
            evidence_hash: evidenceHash,
            model: VERDICT_MODEL,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "project_id,country_code" },
        );
    }

    return json({
      state: "success",
      verdict,
      model: VERDICT_MODEL,
      grounding: {
        queries: grounded.queries,
        sources: grounded.sources,
      },
    });
  } catch (error) {
    console.error("ai-country-verdict error:", error);
    return json({ error: toErrorMessage(error) }, 500);
  }
});

/* ──────────── 1단계: Google Search 그라운딩 ──────────── */

interface GroundedResult {
  text: string;
  sources: Array<{ name: string; url: string }>;
  queries: string[];
}

async function callGroundedResearch(
  programEvidence: string,
  countryName: string,
  productName: string,
  hs6: string,
): Promise<GroundedResult> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(VERDICT_MODEL)}:generateContent?key=${apiKey}`;

  const systemPrompt = [
    "You are an official-source-only export research analyst specializing in Korean exports.",
    `Target country: ${countryName}. Product: ${productName}. HS code: ${hs6}.`,
    "Use Google Search to find the following from ONLY government, customs, certification authorities, KOTRA, K-SURE, WTO, ITC, NHTSA, USITC, and official regulatory sources:",
    "1. Current antidumping/countervailing duty orders affecting this product from Korea",
    "2. Mandatory product certifications, safety standards, and labeling requirements",
    "3. Detailed HTS/tariff classification structure for this HS code in the target country",
    "4. Recent trade policy changes affecting this product (tariff changes, FTA updates)",
    "5. Any import restrictions, quotas, or special requirements",
    "Do NOT use news, media, blogs, social posts, or advertising content.",
    "Separate confirmed facts from unresolved items. Include the responsible authority for every finding.",
    "Write a concise Korean research brief. Do not output JSON.",
  ].join(" ");

  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: `PROGRAM EVIDENCE:\n${programEvidence}` }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.1 },
    }),
  });

  if (!response.ok) throw new Error(`Gemini grounding ${response.status}`);
  const data = await response.json();
  const candidate = data.candidates?.[0];
  const metadata = candidate?.groundingMetadata ?? {};

  return {
    text: candidate?.content?.parts?.[0]?.text ?? "",
    queries: uniqueTexts(asArray(metadata.webSearchQueries).map(asText)),
    sources: extractSources(metadata.groundingChunks),
  };
}

/* ──────────── 2단계: 구조화 판단 생성 ──────────── */

async function callStructuredVerdict(
  programEvidence: string,
  grounded: GroundedResult,
  countryName: string,
  productName: string,
  hs6: string,
): Promise<string> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(VERDICT_MODEL)}:generateContent?key=${apiKey}`;

  const systemPrompt = [
    "You are a senior Korean export decision consultant.",
    "You must produce an AI JUDGMENT, not a data summary.",
    "CRITICAL RULES:",
    "- Do NOT write sentences like '~를 확인했습니다', '~건을 확인했습니다', 'N건이 감지되었습니다'.",
    "- Do NOT list raw data or search result counts.",
    "- Instead, INTERPRET the data and provide your professional ANALYSIS and JUDGMENT.",
    "- Each point must include: what the finding means for the exporter, what specific risk or opportunity it creates, and what action to take.",
    "- Write every text in Korean using formal style (~입니다, ~합니다).",
    "",
    "Return strict JSON matching this schema:",
    JSON.stringify({
      opinion: "적극 검토 권장 | 조건부 진출 가능 | 진출 보류 권장 | 추가 데이터 필요",
      opinionDetail: "2~3문장의 종합 판단. 데이터 나열이 아닌 AI의 분석적 결론",
      keyBasis: [
        { point: "판단 근거 (분석적 문장)", source: "출처명", sourceUrl: "URL" },
      ],
      majorRisks: [
        { risk: "위험 요소 (분석적 문장)", mitigation: "구체적 대응 방안", source: "출처명", sourceUrl: "URL" },
      ],
      recommendedActions: [
        { action: "권장 행동", reason: "이유", priority: "high | medium" },
      ],
      confidence: "높음 | 보통 | 낮음",
      confidenceReason: "신뢰도 판단 이유",
      officialSources: [
        { name: "출처명", url: "URL", relevance: "관련성 설명" },
      ],
    }),
  ].join("\n");

  const userPrompt = [
    `## 대상 국가: ${countryName}`,
    `## 제품: ${productName} (HS ${hs6})`,
    "",
    "## 프로그램 수집 데이터 (Program Evidence)",
    programEvidence,
    "",
    "## 인터넷 공식자료 검색 결과 (Official Web Research)",
    grounded.text,
    "",
    "위 두 가지 데이터를 종합하여 AI 최종 판단 JSON을 생성하십시오.",
    "프로그램 수집 데이터는 사실 근거로 사용하고, 인터넷 검색 결과는 보완·검증 근거로 활용하십시오.",
    "단순한 데이터 나열이 아닌, 수출자 관점에서의 실질적 판단과 구체적 행동 지침을 제공하십시오.",
  ].join("\n");

  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    }),
  });

  if (!response.ok) throw new Error(`Gemini verdict ${response.status}`);
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
}

/* ──────────── 프로그램 증거 요약 ──────────── */

function buildProgramEvidence(body: Record<string, unknown>): string {
  const parts: string[] = [];
  const facts = asArray(body.decision_facts);
  if (facts.length > 0) {
    parts.push("### Decision Facts");
    for (const fact of facts.slice(0, 30)) {
      const f = asRecord(fact);
      parts.push(`- [${asText(f.category)}] ${asText(f.summary)} (status: ${asText(f.status)}, severity: ${asText(f.severity)})`);
      if (asText(f.caveat)) parts.push(`  caveat: ${asText(f.caveat)}`);
      if (asText(f.nextAction)) parts.push(`  next: ${asText(f.nextAction)}`);
    }
  }

  const rationale = asRecord(body.rationale);
  if (asText(rationale.recommendation_reason)) {
    parts.push(`\n### 추천 이유\n${asText(rationale.recommendation_reason)}`);
  }
  if (asText(rationale.low_recommendation_reason)) {
    parts.push(`\n### 주의 요인\n${asText(rationale.low_recommendation_reason)}`);
  }

  const score = body.opportunity_score;
  if (score != null) parts.push(`\n### 기회 점수: ${score}/100`);

  return parts.join("\n") || "수집된 데이터 없음";
}

/* ──────────── 유틸 ──────────── */

function json(body: unknown, status = 200) {
  const headers = {
    ...corsHeaders,
    "Content-Type": "application/json",
  };

  // HTTP forbids a response body for these status codes. In particular, the
  // OPTIONS preflight uses 204, so passing JSON here throws in the Edge runtime
  // before the request can reach the browser.
  if (status === 204 || status === 205 || status === 304) {
    return new Response(null, { status, headers });
  }

  return new Response(JSON.stringify(body), { status, headers });
}

async function fetchWithTimeout(input: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function authenticateRequest(req: Request): Promise<{ ok: boolean }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { ok: false };

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user } } = await supabase.auth.getUser();
  return { ok: Boolean(user) };
}

function createServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function extractSources(chunks: unknown): Array<{ name: string; url: string }> {
  const sources: Array<{ name: string; url: string }> = [];
  for (const chunk of asArray(chunks)) {
    const web = asRecord(asRecord(chunk).web);
    const uri = asText(web.uri);
    const title = asText(web.title) || uri;
    if (uri) sources.push({ name: title, url: uri });
  }
  // 중복 제거
  const seen = new Set<string>();
  return sources.filter((s) => {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
}

function safeParseJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text, parseError: true };
  }
}

function uniqueTexts(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
