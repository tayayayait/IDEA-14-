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
const VERDICT_MODEL = "gemini-3.5-flash";

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

    const forceRefresh = Boolean(body.force_refresh);

    // 캐시 확인 (forceRefresh가 true가 아닐 때만 적용)
    const supabase = createServiceClient();
    if (evidenceHash && !forceRefresh) {
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
    "You are a senior Korean export decision consultant and trade risk management expert.",
    "Produce an EXHAUSTIVE, highly detailed, professional AI EXPORT JUDGMENT report for the target product and country.",
    "CRITICAL RULES FOR EXHAUSTIVE RISK PREDICTION & ACCESSIBILITY:",
    "1. INTEGRATE STEP 4 EVIDENCE: Deeply analyze all provided facts (Opportunity score, inclusion/recommendation rationale, customs tariffs, KOTRA market reports, K-SURE credit/delay data, KICOX data).",
    "2. PREDICT 5 CORE TRADE RISKS EXHAUSTIVELY: (1) Customs & Tariff verification, (2) Mandatory safety/environmental certifications, (3) Payment & deferred credit risk, (4) Documentation & clearance, (5) Legal/contractual risks.",
    "3. MANDATORY GLOSSARY IN PARENTHESES RULE: Whenever trade terms, abbreviations, or legal concepts are mentioned (e.g. O/A, L/C, CBP, FMVSS, UTQG, DOT, BOM, Anti-dumping, MFN, FTA, HTSUS, etc.), ALWAYS explain them in Korean inside parentheses right after the term. Format: '약어/전문용어 (쉬운 설명)'. Example: 'O/A (무서류 외상 거래 방식: 수출 대금 미회수 리스크가 큼)', 'CBP (미국 세관국경보호국: 관세 및 원산지 검증 기관)', 'UTQG (통일타이어품질등급: 미국 타이어 필수 겉면 표시 기준)'.",
    "4. ACCESSIBLE & DETAILED ACTIONABLE ADVICE: Write in formal Korean (~입니다, ~합니다). Provide 1:1 concrete AI mitigation steps for every identified risk so that even first-time exporters can fully understand and prepare.",
    "5. 정부지원사업명은 생성하지 마십시오. 정부지원사업은 별도의 기업마당 공식 API 결과로만 제공합니다.",
    "6. recommendedActions에는 우선순위, 예상 일정, 난이도, 예상 비용을 만들지 말고 행동·이유·실행 단계만 작성하십시오.",
    "",
    "Return strict JSON matching this schema:",
    JSON.stringify({
      opinion: "적극 검토 권장 | 조건부 진출 가능 | 진출 보류 권장 | 추가 데이터 필요",
      executiveSummary: "한줄 핵심 요약 (예: KORUS FTA 관세 혜택은 크지만 DOT 인증 장벽과 반덤핑 관세 리스크가 공존하는 조건부 시장)",
      opinionDetail: "3~4문장의 상세한 종합 진출 전략 결론. 제품 및 국가 특성을 반영한 통찰",
      riskScoreboard: {
        tariffRisk: "높음 | 보통 | 낮음",
        certificationRisk: "높음 | 보통 | 낮음",
        paymentRisk: "높음 | 보통 | 낮음",
        logisticsRisk: "높음 | 보통 | 낮음",
        legalRisk: "높음 | 보통 | 낮음",
      },
      keyBasis: [
        { point: "판단 근거 (관세 혜택, 시장 기회 등 구체적 문장)", source: "출처명 (예: 관세청 API / KOTRA)" },
      ],
      majorRisks: [
        {
          risk: "주요 위험 요소 및 전문용어 (쉬운 괄호 설명 포함)",
          mitigation: "AI의 실질적 1:1 대응 방안 (구체적 해결책 및 전문용어 괄호 설명)",
          source: "출처명 (예: K-SURE / NHTSA)",
          severity: "치명적 | 높음 | 보통",
          likelihood: "높음 | 보통 | 낮음",
          financialImpact: "예상 손실/비용 영향 (예: 통관 거부 시 컨테이너당 약 $5,000~$15,000 손실)"
        },
      ],
      recommendedActions: [
        {
          action: "권장 행동 제목",
          reason: "실행 이유 및 목적",
          subSteps: ["구체적 실행 단계 1", "구체적 실행 단계 2", "구체적 실행 단계 3"]
        },
      ],
      confidence: "높음 | 보통 | 낮음",
      confidenceReason: "신뢰도 판단 이유",
      officialSources: [
        { name: "관련 공공기관/규제기관명", url: "", relevance: "관련성 요약" },
      ],
    }),
  ].join("\n");

  const sourcesList = grounded.sources.length > 0
    ? grounded.sources.map((s) => `- ${s.name}: ${s.url}`).join("\n")
    : "발견된 출처 URL 없음";

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
    "## 발견된 실제 인터넷 공식자료 URL 목록",
    sourcesList,
    "",
    "위 두 가지 데이터와 발견된 URL 목록을 종합하여 AI 최종 판단 JSON을 생성하십시오.",
    "officialSources 배열에는 '발견된 실제 인터넷 공식자료 URL 목록'에 존재하는 구체적인 name과 url을 반드시 포함시키십시오.",
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
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  const parsed = safeParseJson(rawText);

  // officialSources 후처리 보완
  const officialSources = asArray(parsed.officialSources);
  if (officialSources.length === 0 && grounded.sources.length > 0) {
    parsed.officialSources = grounded.sources.slice(0, 6).map((s) => ({
      name: s.name,
      url: s.url,
      relevance: `${countryName} ${productName} 공식자료`,
    }));
  }

  // keyBasis 및 majorRisks 출처 URL 스마트 후처리 매핑 (Official Web Research 문맥 및 grounded.sources 탐색)
  if (grounded.sources.length > 0) {
    const findSmartUrl = (text: string, currentUrl?: string): string => {
      // 이미 올바른 external HTTP/HTTPS URL이 들어가 있다면 그대로 사용
      if (currentUrl && currentUrl.startsWith("http") && !currentUrl.includes("n/a")) {
        return currentUrl;
      }
      
      const lowerText = text.toLowerCase();
      
      // 1. grounded.sources 중 텍스트에 언급된 키워드가 포함된 도메인/이름 탐색
      for (const s of grounded.sources) {
        const sNameLower = s.name.toLowerCase();
        const sUrlLower = s.url.toLowerCase();
        
        // 주요 도메인/기관 키워드 매칭
        const keywords = ["ustr", "nhtsa", "dot", "fmvss", "usitc", "epa", "fda", "customs", "kotra", "ksure", "kicox", "반덤핑", "관세", "안전표준"];
        for (const kw of keywords) {
          if (lowerText.includes(kw) && (sNameLower.includes(kw) || sUrlLower.includes(kw))) {
            return s.url;
          }
        }
      }
      
      // 2. 키워드 매칭 실패 시 첫번째 수집된 원문 URL 반환
      return grounded.sources[0].url;
    };

    const supplementUrl = (item: any) => {
      if (item && typeof item === "object") {
        const textToSearch = `${item.point || item.risk || ""} ${item.source || ""}`;
        item.sourceUrl = findSmartUrl(textToSearch, item.sourceUrl);
      }
    };

    asArray(parsed.keyBasis).forEach(supplementUrl);
    asArray(parsed.majorRisks).forEach(supplementUrl);
  }

  return JSON.stringify(parsed);
}

/* ──────────── 프로그램 증거 요약 ──────────── */

function buildProgramEvidence(body: Record<string, unknown>): string {
  const parts: string[] = [];

  const score = body.opportunity_score;
  if (score != null) parts.push(`### [Step 4] 종합 기회 점수: ${score}/100점`);

  const rationale = asRecord(body.rationale);
  if (asText(rationale.inclusion_reason)) {
    parts.push(`### [Step 4] 국가 포함 사유:\n${asText(rationale.inclusion_reason)}`);
  }
  if (asText(rationale.recommendation_reason)) {
    parts.push(`### [Step 4] 핵심 추천 이유:\n${asText(rationale.recommendation_reason)}`);
  }
  if (asText(rationale.low_recommendation_reason)) {
    parts.push(`### [Step 4] 주의 및 위험 지표:\n${asText(rationale.low_recommendation_reason)}`);
  }

  const facts = asArray(body.decision_facts);
  if (facts.length > 0) {
    parts.push("\n### [Step 4] 수집된 세부 공공데이터 팩트 목록");
    for (const fact of facts.slice(0, 35)) {
      const f = asRecord(fact);
      parts.push(`- [${asText(f.category)}] ${asText(f.summary)} (상태: ${asText(f.status)}, 심각도: ${asText(f.severity)})`);
      if (asText(f.caveat)) parts.push(`  * 주의사항: ${asText(f.caveat)}`);
      if (asText(f.nextAction)) parts.push(`  * 조치사항: ${asText(f.nextAction)}`);
      if (asText(f.sourceName)) parts.push(`  * 출처: ${asText(f.sourceName)}`);
    }
  }

  return parts.join("\n") || "Step 4 수집 데이터 없음";
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
