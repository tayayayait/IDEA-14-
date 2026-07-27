/**
 * ai-country-verdict — AI 최종 판단 생성 Edge Function
 *
 * 2단계 Gemini 호출:
 * 1) Google Search 그라운딩으로 공식자료 검색
 * 2) 프로그램 데이터 + 검색 결과를 종합하여 구조화 JSON 판단 생성
 */
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildVerifiedEvidenceCatalog,
  finalizeAiVerdict,
  isOfficialAuthorityUrl,
  type VerifiedEvidenceCatalog,
} from "../_shared/ai-verdict-evidence.ts";

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
        claims: [],
      };
    }

    const evidenceCatalog = buildVerifiedEvidenceCatalog({
      countryCode,
      hs6,
      retrievedAt: new Date().toISOString(),
      decisionFacts: asArray(body.decision_facts),
      groundedSources: grounded.sources,
      groundedClaims: grounded.claims,
    });

    // 2단계: 구조화 판단 생성
    const verdictJson = await callStructuredVerdict(
      programEvidence,
      grounded,
      evidenceCatalog,
      countryName,
      productName,
      hs6,
    );

    // DB 저장 (UPSERT)
    const verdict = finalizeAiVerdict({
      rawVerdict: safeParseJson(verdictJson),
      catalog: evidenceCatalog,
      requiredCategories: [
        "tariff_fta",
        "certification",
        "import_regulation",
        "payment_risk",
        "strategic_goods",
      ],
      now: new Date().toISOString(),
    });
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
        accepted_claims: evidenceCatalog.evidence.filter((item) => item.origin === "official_web").length,
        rejected_claims: evidenceCatalog.rejectedClaims.length,
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
  sources: Array<{ name: string; url: string; resolvedUrl?: string }>;
  queries: string[];
  claims: unknown[];
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
    "AI internal knowledge may be used to design searches and explain implications, but never as evidence for a current rate, legal requirement, threshold, fee, fine, or market statistic.",
    "Every confirmed claim must quote a narrowly relevant official source, match the target country and HS/product scope, and carry its own source URL and effective/published date when available.",
    "If applicability is unclear, set verificationStatus to needs_verification and scopeMatch to false. Never infer that zero search results means no regulation.",
    "Return strict JSON only using this schema:",
    'Root JSON keys must be exactly "researchSummary" and "claims". Claim keys must include "verificationStatus" and "scopeMatch".',
    JSON.stringify({
      researchSummary: "공식자료 조사 결과 요약",
      claims: [{
        claimId: "web:unique-id",
        claim: "하나의 검증 가능한 구체적 주장",
        category: "tariff_fta | certification | import_regulation | payment_risk | strategic_goods | customs_requirement | market | logistics | legal",
        value: "공식자료에 있는 값과 단위 또는 null",
        countryCode,
        hsCode: hs6,
        scopeMatch: true,
        verificationStatus: "confirmed | needs_verification | conflict",
        sourceName: "공식기관명",
        sourceTitle: "문서 또는 페이지 제목",
        sourceUrl: "실제 공식 원문 URL",
        effectiveDate: "YYYY-MM-DD 또는 null",
        evidenceExcerpt: "주장을 직접 뒷받침하는 짧은 근거",
      }],
    }),
  ].join("\n");

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
  const rawText = candidate?.content?.parts?.[0]?.text ?? "";
  const research = safeParseJson(rawText);
  const sources = await resolveGroundedSources(extractSources(metadata.groundingChunks));
  const claims = alignGroundedClaims(asArray(research.claims), sources);

  return {
    text: rawText,
    queries: uniqueTexts(asArray(metadata.webSearchQueries).map(asText)),
    sources,
    claims,
  };
}

/* ──────────── 2단계: 구조화 판단 생성 ──────────── */

async function callStructuredVerdict(
  programEvidence: string,
  grounded: GroundedResult,
  evidenceCatalog: VerifiedEvidenceCatalog,
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
    "5. EVIDENCE-ID RULE: Every factual keyBasis and majorRisks item MUST cite one or more evidenceIds copied exactly from ALLOWED VERIFIED EVIDENCE CATALOG. Never invent an evidence ID.",
    "6. CURRENT-FACT RULE: Tariff rates, legal thresholds, mandatory certification, fines, fees, costs, dates, statistics, and named government programs may be stated as facts only when the exact value is present in a cited evidence item.",
    "7. AI-KNOWLEDGE RULE: Use internal knowledge for search ideas, interpretation, explanations, and checklists. If a useful risk has no verified evidence, write it as a question or additional-check item, use evidenceIds=[], and never state an exact number or legal conclusion.",
    "8. ESTIMATE RULE: Do not invent cost or damage ranges. Set estimatedCost to '견적 필요' and financialImpact to a qualitative description unless a cited evidence item contains the number.",
    "9. ABSENCE RULE: A zero-result or needs_verification item never proves that a regulation, certification, or strategic-goods control does not exist.",
    "10. Do not output confidence or officialSources. The server computes them from evidence coverage after generation.",
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
        {
          point: "판단 근거 (관세 혜택, 시장 기회 등 구체적 문장)",
          evidenceIds: ["ALLOWED VERIFIED EVIDENCE CATALOG의 실제 ID"],
        },
      ],
      majorRisks: [
        {
          risk: "주요 위험 요소 및 전문용어 (쉬운 괄호 설명 포함)",
          mitigation: "AI의 실질적 1:1 대응 방안 (구체적 해결책 및 전문용어 괄호 설명)",
          evidenceIds: ["ALLOWED VERIFIED EVIDENCE CATALOG의 실제 ID, 없으면 빈 배열"],
          severity: "치명적 | 높음 | 보통",
          likelihood: "높음 | 보통 | 낮음",
          financialImpact: "근거에 금액이 있으면 해당 금액, 없으면 정성적 영향과 견적 필요 안내"
        },
      ],
      recommendedActions: [
        {
          action: "권장 행동 제목",
          reason: "실행 이유 및 목적",
          priority: "high | medium",
          timeline: "즉시 | 수출 전 6개월 | 수출 전 3개월 | 수출 전 1개월 | 수출 후",
          difficulty: "쉬움 | 보통 | 어려움",
          estimatedCost: "공식 근거가 있으면 해당 값, 없으면 견적 필요",
          govSupport: "근거 ID로 확인된 정부 지원 또는 관계기관 문의 안내",
          evidenceIds: ["비용·지원사업을 뒷받침하는 실제 근거 ID, 없으면 빈 배열"],
          subSteps: ["구체적 실행 단계 1", "구체적 실행 단계 2", "구체적 실행 단계 3"]
        },
      ],
    }),
  ].join("\n");

  const verifiedEvidenceJson = JSON.stringify(
    evidenceCatalog.evidence.map((item) => ({
      id: item.id,
      category: item.category,
      claim: item.claim,
      value: item.value,
      evidenceLevel: item.level,
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
      referenceDate: item.referenceDate,
      retrievedAt: item.retrievedAt,
      origin: item.origin,
    })),
  );

  const userPrompt = [
    `## 대상 국가: ${countryName}`,
    `## 제품: ${productName} (HS ${hs6})`,
    "",
    "## 프로그램 수집 데이터 (Program Evidence)",
    programEvidence,
    "",
    "## ALLOWED VERIFIED EVIDENCE CATALOG",
    verifiedEvidenceJson,
    "",
    `공식 웹 검색에서 검증 수락 ${evidenceCatalog.evidence.filter((item) => item.origin === "official_web").length}건, 제외 ${evidenceCatalog.rejectedClaims.length}건, 상충 ${evidenceCatalog.conflicts.length}건입니다.`,
    "위 카탈로그에 존재하는 evidenceIds만 사용하여 AI 최종 판단 JSON을 생성하십시오.",
    "카탈로그 밖의 내부지식은 설명·질문·실행 체크리스트에만 사용하고, 현재 사실이나 정확한 수치로 단정하지 마십시오.",
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
  return JSON.stringify(safeParseJson(rawText));
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
      const factKey = asText(f.factKey) || asText(f.fact_key) || asText(f.id);
      if (factKey) parts.push(`  * 근거 ID: program:${factKey}`);
      if (f.value != null) parts.push(`  * 원천 값: ${safeEvidenceJson(f.value, 6_000)}`);
      if (asText(f.caveat)) parts.push(`  * 주의사항: ${asText(f.caveat)}`);
      if (asText(f.nextAction)) parts.push(`  * 조치사항: ${asText(f.nextAction)}`);
      if (asText(f.sourceName)) parts.push(`  * 출처: ${asText(f.sourceName)}`);
      if (asText(f.sourceUrl)) parts.push(`  * 원문 URL: ${asText(f.sourceUrl)}`);
      if (asText(f.referenceDate)) parts.push(`  * 기준일: ${asText(f.referenceDate)}`);
      if (asText(f.fetchedAt)) parts.push(`  * 조회일: ${asText(f.fetchedAt)}`);
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

async function resolveGroundedSources(
  sources: Array<{ name: string; url: string }>,
): Promise<Array<{ name: string; url: string; resolvedUrl?: string }>> {
  return await Promise.all(sources.slice(0, 12).map(async (source) => {
    if (isOfficialAuthorityUrl(source.url)) return { ...source, resolvedUrl: source.url };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    try {
      const response = await fetch(source.url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: { Range: "bytes=0-0" },
      });
      const resolvedUrl = response.url;
      return isOfficialAuthorityUrl(resolvedUrl)
        ? { ...source, url: resolvedUrl, resolvedUrl }
        : source;
    } catch {
      return source;
    } finally {
      clearTimeout(timeout);
    }
  }));
}

function alignGroundedClaims(
  claims: unknown[],
  sources: Array<{ name: string; url: string; resolvedUrl?: string }>,
): unknown[] {
  return claims.map((rawClaim) => {
    const claim = asRecord(rawClaim);
    const rawUrl = asText(claim.sourceUrl) || asText(claim.source_url);
    const claimSourceName = `${asText(claim.sourceName)} ${asText(claim.sourceTitle)}`.toLowerCase();
    const exact = sources.find((source) => rawUrl && (source.url === rawUrl || source.resolvedUrl === rawUrl));
    const byOfficialHost = sources.find((source) => (
      rawUrl && isOfficialAuthorityUrl(rawUrl) && sameHostname(source.resolvedUrl || source.url, rawUrl)
    ));
    const byName = sources.find((source) => sourceNameMatches(claimSourceName, source.name));
    const matched = exact ?? byOfficialHost ?? byName;
    return matched
      ? { ...claim, resolvedUrl: matched.resolvedUrl || matched.url }
      : claim;
  });
}

function sameHostname(left: string, right: string): boolean {
  try {
    return new URL(left).hostname.toLowerCase() === new URL(right).hostname.toLowerCase();
  } catch {
    return false;
  }
}

function sourceNameMatches(claimSourceName: string, groundedName: string): boolean {
  const grounded = groundedName.toLowerCase();
  const tokens = claimSourceName
    .split(/[^a-z0-9가-힣]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4);
  return tokens.some((token) => grounded.includes(token));
}

function safeEvidenceJson(value: unknown, maxLength: number): string {
  try {
    const serialized = JSON.stringify(value);
    if (!serialized) return "null";
    return serialized.length <= maxLength
      ? serialized
      : `${serialized.slice(0, maxLength)}…(원천 값 일부 생략)`;
  } catch {
    return "직렬화할 수 없는 원천 값";
  }
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
