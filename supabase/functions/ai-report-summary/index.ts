import { corsHeaders } from "../_shared/cors.ts";
import { requireAuthenticatedUser } from "../_shared/auth.ts";
import {
  buildAvailableEntryStrategy,
  buildEmptyEntryStrategy,
  buildFailedEntryStrategy,
  normalizeEntryStrategyItems,
  resolveEntryStrategySearchTerm,
  selectLatestEntryStrategy,
} from "../_shared/kotra-entry-strategy.ts";
import { buildProgramEvidenceValue } from "../_shared/report-evidence-detail.ts";

const UNKNOWN_TEXT = "확실한 정보 없음";
const AI_TIMEOUT_MS = 110000;
const GEMINI_REPORT_MODEL = "gemini-3.5-flash";
const KOTRA_ENTRY_STRATEGY_ENDPOINT = "https://apis.data.go.kr/B410001/entryStrategy/entryStrategy";
const GATE_TOPICS = ["certification", "regulation", "tariff", "profitability", "payment", "safety"] as const;
const GATE_RESEARCH_TASKS = [
  {
    gateTopics: ["certification", "safety"],
    focus: "mandatory certification, product standards, testing, labeling, recalls, and official product-safety requirements",
  },
  {
    gateTopics: ["regulation", "tariff", "profitability", "payment"],
    focus: "import regulation, customs classification and procedure, base and additional duties, trade-remedy measures, official landed-cost inputs, and official country or payment-risk baselines",
  },
] satisfies GateResearchTask[];
const OFFICIAL_TOKENS = [
  ".gov", ".go.kr", ".gob.", ".gc.ca", ".europa.eu", "kotra", "k-sure", "ksure", "wto.org",
  "intracen.org", "trade.gov", "cbp.gov", "usitc.gov", "federalregister.gov", "commerce.gov", "ustr.gov",
  "europa.eu", "customs", "관세청", "산업통상자원부", "대한무역투자진흥공사", "한국무역보험공사",
  "world trade organization", "international trade centre", "international trade commission",
  "national highway traffic safety administration", "federal register",
];
const EXCLUDED_WEB_TOKENS = ["news", "신문", "일보", "블로그", "blog", "press", "media", "광고"];
const REPORT_DISCLAIMER = "본 리포트는 프로그램 조회 데이터와 공식 웹 근거를 바탕으로 실행 우선순위와 확인 조건을 제안하는 참고자료이며, 법적·인증·규제 적합성의 최종 판정이 아닙니다.";

type EvidenceState = "available" | "unknown" | "not_run";
type Verdict = "proceed" | "conditional" | "hold";
type Confidence = "high" | "medium" | "low";
type GateTopic = typeof GATE_TOPICS[number];
type GateStatus = "clear" | "check_required" | "blocked";
type Horizon = "D+7" | "D+30" | "D+90";

interface EvidenceBundle {
  company: Record<string, unknown> | null;
  product: Record<string, unknown> | null;
  topCountries: Record<string, unknown>[];
  certs: Record<string, unknown>[];
  regs: Record<string, unknown>[];
  risks: Record<string, unknown>[];
  decisionFacts: Record<string, unknown>[];
  decisionActions: Record<string, unknown>[];
  gateInputs: Record<string, unknown> | null;
  safetyFlags: Record<string, unknown>[];
  apiLogs: Record<string, unknown>[];
  missingEvidence: string[];
  entryStrategies: Record<string, unknown>[];
}

interface ProgramEvidence {
  evidenceId: string; category: string; label: string; value: string;
  sourceName: string; status: string; referenceDate: string;
}
interface OfficialSource {
  evidenceId: string; title: string; url: string; organization: string; publishedAt: string; accessedAt: string;
  gateTopics: GateTopic[];
}
interface GateResearchTask { gateTopics: GateTopic[]; focus: string }
interface GroundedResult { text: string; webSearchQueries: string[]; sources: OfficialSource[] }
interface Decision {
  verdict: Verdict; confidence: Confidence; headline: string; reason: string;
  immediateActions: Array<{ action: string; owner: string; evidenceRefs: string[] }>;
  evidenceRefs: string[];
}
interface DecisionReason {
  type: "opportunity" | "risk"; title: string; interpretation: string; businessImpact: string; evidenceRefs: string[];
}
interface EntryStrategy {
  countryCode: string; countryName: string; targetBuyer: string; primaryChannel: string; initialProducts: string;
  positioning: string; paymentTerms: string; pilotScope: string; expansionCondition: string; evidenceRefs: string[];
}
interface DecisionGate {
  topic: GateTopic; status: GateStatus; decision: string; requiredAction: string;
  owner: string; due: string; stopCondition: string; evidenceRefs: string[];
}
interface ActionPlanItem {
  horizon: Horizon; owner: string; action: string; deliverable: string; passCriteria: string; evidenceRefs: string[];
}
interface StopCondition { condition: string; response: string; evidenceRefs: string[] }
interface ReportDraft {
  schemaVersion: 2;
  decision: Decision;
  decisionReasons: DecisionReason[];
  entryStrategy: EntryStrategy;
  decisionGates: DecisionGate[];
  actionPlan: ActionPlanItem[];
  officialResearch: {
    summary: string; keyFindings: Array<{ finding: string; evidenceRefs: string[] }>;
    queries: string[]; sources: OfficialSource[]; conflicts: string[];
  };
  assumptions: string[];
  unresolvedItems: string[];
  stopConditions: StopCondition[];
  disclaimer: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authResult = await requireAuthenticatedUser(req, corsHeaders);
    if (!authResult.ok) return authResult.response;
    const body = await req.json();
    const normalized = normalizeEvidenceBundle(body);
    const bundle: EvidenceBundle = {
      ...normalized,
      entryStrategies: await fetchKotraEntryStrategies(normalized.topCountries),
    };
    const evidenceState = buildEvidenceSnapshot(bundle);
    const programEvidenceCatalog = buildProgramEvidenceCatalog(bundle);
    const promptInput = buildGeminiReportPromptInput(bundle, evidenceState, programEvidenceCatalog);

    try {
      const groundedResults = await Promise.all(GATE_RESEARCH_TASKS.map(
        (task) => callGateGroundedResearch(task, JSON.stringify(promptInput)),
      ));
      const grounded = mergeGroundedResults(groundedResults);
      const structured = await callStructuredReport(buildDecisionSystemPrompt(), JSON.stringify({
        programEvidence: promptInput,
        officialWebEvidence: grounded.text,
        officialSources: grounded.sources,
        webSearchQueries: grounded.webSearchQueries,
      }));
      const parsed = parseJsonObject(structured);
      parsed.officialResearch = {
        ...asRecord(parsed.officialResearch),
        queries: grounded.webSearchQueries,
        sources: grounded.sources,
      };
      const draft = normalizeDraft(parsed, bundle, programEvidenceCatalog);
      const partial = draft.decision.confidence === "low" || draft.unresolvedItems.length > 0;
      return json({
        state: partial ? "partial_success" : "success",
        message: partial ? "일부 공식 근거 또는 핵심 조건이 미확인되어 조건부로 판단했습니다." : null,
        ...draft,
        summary: draft.decision.headline,
        actions: draft.actionPlan.filter((item) => item.horizon === "D+7").map((item) => item.action),
        draft,
        diagnostics: buildAiDiagnostics(),
      });
    } catch (aiError) {
      const draft = buildRuleBasedDraft(bundle, programEvidenceCatalog);
      return json({
        state: "local_fallback",
        message: `Gemini 판단 미완료: ${toErrorMessage(aiError)}`,
        ...draft,
        summary: draft.decision.headline,
        actions: draft.actionPlan.filter((item) => item.horizon === "D+7").map((item) => item.action),
        draft,
        diagnostics: { ...buildAiDiagnostics(), fallback: "rule_based", ai_error: toErrorMessage(aiError) },
      });
    }
  } catch (error) {
    return json({ error: toErrorMessage(error) }, 500);
  }
});

function buildDecisionSystemPrompt(): string {
  return [
    "You are a senior export decision consultant for Korean manufacturers.",
    "This is an official-source-only decision report, not a data summary.",
    "Return strict JSON only. Write every user-facing text in Korean.",
    "Analyze only the selected target country supplied as the first and only topCountries item.",
    "PROGRAM EVIDENCE is authoritative for values retrieved by this program. Never invent a certification, regulation, tariff, sanction, buyer, or statistic.",
    "If countryVerdicts or Step 4 Gemini verdict data is present in PROGRAM EVIDENCE, you MUST explicitly incorporate its findings (such as anti-dumping tariff rates, safety standards, FMVSS, DOT requirements, etc.) into headline, reason, riskScoreboard, decisionReasons, and immediateActions.",
    "Use the structured country-detail values, official lookup details, caveats, and next actions inside PROGRAM EVIDENCE as additional inputs to the existing report judgment.",
    "Do not treat a candidate tariff code, estimated cost, or needs_verification item as a confirmed final determination.",
    "OFFICIAL WEB EVIDENCE may be used only when it is traceable to one of officialSources and its W-* evidenceId.",
    "Do not use news, media, blogs, social posts, shopping pages, or advertising content even if supplied elsewhere.",
    "Choose exactly one primary entry route. Do not list several alternatives without selecting a priority.",
    "Make decision.verdict one of proceed, conditional, hold and give a practical reason and up to five immediate actions.",
    "decision.headline must be a concise, complete directive headline (under 40 chars) without trailing truncation.",
    "decision.reason must be 2-3 complete, well-formed sentences explaining the core rationale.",
    "decisionLogicSummary must summarize the evidence-to-decision reasoning flow in 2-3 complete, unbroken sentences without trailing ellipsis or incomplete parentheses.",
    "Every AI judgment and action must include at least one valid evidenceRefs ID from programEvidenceCatalog or officialSources.",
    "decisionReasons must distinguish opportunity and risk, interpret the evidence, and state the business impact.",
    "For each risk decisionReason, you MUST evaluate severity ('치명적'|'높음'|'보통'), likelihood ('높음'|'보통'|'낮음'), financialImpact, and a concrete 1:1 mitigation strategy.",
    "Provide a riskScoreboard evaluating 5 key domains: tariffRisk, certificationRisk, paymentRisk, logisticsRisk, legalRisk (each '높음'|'보통'|'낮음').",
    "For each immediateAction, specify priority ('high'|'medium'), timeline (e.g. 'D+7'), difficulty ('쉬움'|'보통'|'어려움'), estimatedCost, govSupport, and subSteps array.",
    "entryStrategy must specify target buyer, one primary channel, initial products, positioning, payment terms, pilot scope, and expansion condition.",
    "decisionGates must contain exactly certification, regulation, tariff, profitability, payment, safety. For each gate, specify requiredDocument (e.g. '📄 NHTSA FMVSS 139 성적서 및 DOT 공장등록증') and resolutionAction, and set isAiInferred true when relying on general AI inference rather than confirmed official DB evidence.",
    "Certification, regulation, tariff, and safety may be clear only when evidenceRefs contains a relevant official W-* source whose gateTopics includes that gate.",
    "Profitability and payment must remain check_required unless explicit business-input evidence for that gate is present in PROGRAM EVIDENCE.",
    "User-entered gate inputs are business inputs, not official facts. Use them only to estimate profitability and payment conditions; missing or unknown fields remain unresolved.",
    "CRITICAL RULE: 차단 게이트(status='blocked')가 하나라도 있으면 decision.verdict는 반드시 hold로 작성한다.",
    "CRITICAL RULE: 핵심 게이트(certification, regulation, tariff, safety)가 check_required이면 decision.verdict는 최대 conditional까지만 허용한다.",
    "If evidence is missing or conflicting, list it in unresolvedItems or officialResearch.conflicts and lower confidence.",
    "Do not make a final legal, certification, regulatory, strategic-material, or product-safety determination.",
    `For unknown values write '${UNKNOWN_TEXT}' instead of guessing.`,
    "Action plan must cover D+7, D+30, and D+90 and include owner, action, deliverable, passCriteria, and evidenceRefs.",
    "Schema: {\"schemaVersion\":3,\"decision\":{\"verdict\":\"proceed|conditional|hold\",\"confidence\":\"high|medium|low\",\"confidenceReason\":\"...\",\"headline\":\"...\",\"reason\":\"...\",\"immediateActions\":[{\"action\":\"...\",\"owner\":\"...\",\"priority\":\"high|medium\",\"timeline\":\"D+7\",\"difficulty\":\"쉬움|보통|어려움\",\"estimatedCost\":\"...\",\"govSupport\":\"...\",\"subSteps\":[\"...\"],\"evidenceRefs\":[\"P-*|W-*\"]}],\"evidenceRefs\":[\"P-*|W-*\"]},\"decisionLogicSummary\":\"...\",\"riskScoreboard\":{\"tariffRisk\":\"높음|보통|낮음\",\"certificationRisk\":\"높음|보통|낮음\",\"paymentRisk\":\"높음|보통|낮음\",\"logisticsRisk\":\"높음|보통|낮음\",\"legalRisk\":\"높음|보통|낮음\"},\"decisionReasons\":[{\"type\":\"opportunity|risk\",\"title\":\"...\",\"interpretation\":\"...\",\"businessImpact\":\"...\",\"severity\":\"치명적|높음|보통\",\"likelihood\":\"높음|보통|낮음\",\"financialImpact\":\"...\",\"mitigation\":\"...\",\"evidenceRefs\":[\"...\"]}],\"entryStrategy\":{\"countryCode\":\"...\",\"countryName\":\"...\",\"targetBuyer\":\"...\",\"primaryChannel\":\"...\",\"initialProducts\":\"...\",\"positioning\":\"...\",\"paymentTerms\":\"...\",\"pilotScope\":\"...\",\"expansionCondition\":\"...\",\"evidenceRefs\":[\"...\"]},\"decisionGates\":[{\"topic\":\"certification|regulation|tariff|profitability|payment|safety\",\"status\":\"clear|check_required|blocked\",\"decision\":\"...\",\"requiredAction\":\"...\",\"owner\":\"...\",\"due\":\"...\",\"stopCondition\":\"...\",\"evidenceRefs\":[\"...\"],\"requiredDocument\":\"...\",\"resolutionAction\":\"...\",\"isAiInferred\":true}],\"actionPlan\":[{\"horizon\":\"D+7|D+30|D+90\",\"owner\":\"...\",\"action\":\"...\",\"deliverable\":\"...\",\"passCriteria\":\"...\",\"evidenceRefs\":[\"...\"]}],\"officialResearch\":{\"summary\":\"...\",\"keyFindings\":[{\"finding\":\"...\",\"evidenceRefs\":[\"W-*\"]}],\"conflicts\":[\"...\"]},\"assumptions\":[\"...\"],\"unresolvedItems\":[\"...\"],\"stopConditions\":[{\"condition\":\"...\",\"response\":\"...\",\"evidenceRefs\":[\"...\"]}],\"disclaimer\":\"...\"}",
  ].join(" ");
}

async function callGateGroundedResearch(task: GateResearchTask, programEvidence: string): Promise<GroundedResult> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_REPORT_MODEL)}:generateContent?key=${apiKey}`;
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: [
        "You are an official-source-only export research analyst.",
        "Use Google Search for the selected country and product, but use only government, customs, certification authorities, KOTRA, K-SURE, WTO, and ITC sources.",
        "Do not search for or use news, media, blogs, social posts, or advertising content.",
        `Research only these gate topics: ${task.gateTopics.join(", ")}.`,
        `Research focus: ${task.focus}. Do not expand into other gates.`,
        "Official web research may establish public rules and country baselines only. It must not claim to confirm company-specific product compliance, landed-cost profitability, negotiated terms, or buyer credit without matching PROGRAM EVIDENCE.",
        "Separate confirmed facts, conflicts, and unresolved items. Include the responsible authority for every finding.",
        "Write a concise Korean research brief. Do not output JSON.",
      ].join(" ") }] },
      contents: [{ role: "user", parts: [{ text: `PROGRAM EVIDENCE:\n${programEvidence}` }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.1 },
    }),
  });
  if (!response.ok) throw await buildGeminiHttpError(response);
  const data = await response.json();
  const candidate = data.candidates?.[0];
  const metadata = candidate?.groundingMetadata ?? {};
  return {
    text: candidate?.content?.parts?.[0]?.text ?? "",
    webSearchQueries: uniqueTexts(asArray(metadata.webSearchQueries).map(asText)),
    sources: extractOfficialSources(metadata.groundingChunks, task),
  };
}

function mergeGroundedResults(results: GroundedResult[]): GroundedResult {
  const sources: OfficialSource[] = [];
  const byUrl = new Map<string, OfficialSource>();
  for (const result of results) {
    for (const source of result.sources) {
      const existing = byUrl.get(source.url);
      if (existing) {
        existing.gateTopics = uniqueGateTopics([...existing.gateTopics, ...source.gateTopics]);
        continue;
      }
      const normalized = { ...source, evidenceId: `W-${String(sources.length + 1).padStart(3, "0")}` };
      byUrl.set(normalized.url, normalized);
      sources.push(normalized);
    }
  }
  return {
    text: results.map((result) => result.text).filter(Boolean).join("\n\n"),
    webSearchQueries: uniqueTexts(results.flatMap((result) => result.webSearchQueries)),
    sources: sources.slice(0, 16),
  };
}

async function callStructuredReport(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_REPORT_MODEL)}:generateContent?key=${apiKey}`;
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    }),
  });
  if (!response.ok) throw await buildGeminiHttpError(response);
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
}

async function buildGeminiHttpError(response: Response): Promise<Error> {
  const detail = sanitizeGeminiError(await response.text());
  return new Error(`Gemini ${response.status}: ${detail}`);
}

function sanitizeGeminiError(value: string): string {
  let message = value;
  try {
    const parsed = asRecord(JSON.parse(value));
    message = safeText(asRecord(parsed.error).message, value);
  } catch {
    // Preserve a plain-text provider error after redaction.
  }
  return message
    .replace(/AIza[0-9A-Za-z_-]+/g, "[redacted]")
    .replace(/([?&]key=)[^&\s]+/gi, "$1[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500) || "request failed";
}

function extractOfficialSources(value: unknown, task: GateResearchTask): OfficialSource[] {
  const seen = new Set<string>();
  const accessedAt = new Date().toISOString().slice(0, 10);
  const sources: OfficialSource[] = [];
  for (const chunk of asArray(value).map(asRecord)) {
    const web = asRecord(chunk.web);
    const url = asText(web.uri);
    const title = safeText(web.title, url);
    if (!/^https?:\/\//i.test(url) || seen.has(url) || !isOfficialWebSource(title, url)) continue;
    seen.add(url);
    sources.push({
      evidenceId: `W-${String(sources.length + 1).padStart(3, "0")}`,
      title,
      url,
      organization: inferOrganization(title, url),
      publishedAt: "",
      accessedAt,
      gateTopics: task.gateTopics,
    });
  }
  return sources.slice(0, 12);
}

function isOfficialWebSource(title: string, url: string): boolean {
  const text = `${title} ${url}`.toLowerCase();
  if (EXCLUDED_WEB_TOKENS.some((token) => text.includes(token))) return false;
  return OFFICIAL_TOKENS.some((token) => text.includes(token));
}

function inferOrganization(title: string, url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (!host.includes("google")) return host;
  } catch { /* use title */ }
  return title || "공식기관";
}

async function fetchKotraEntryStrategies(topCountries: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  const apiKey = resolveKotraKey();
  return await Promise.all(topCountries.slice(0, 1).map(async (country) => {
    const countryCode = asText(country.countryCode ?? country.country_code);
    const countryName = asText(country.countryName ?? country.country_name);
    const searchTerm = resolveEntryStrategySearchTerm(countryCode, countryName);
    if (!apiKey || !searchTerm) return { countryCode, countryName, ...buildEmptyEntryStrategy() };
    try {
      const url = new URL(KOTRA_ENTRY_STRATEGY_ENDPOINT);
      url.searchParams.set("serviceKey", apiKey);
      url.searchParams.set("type", "json");
      url.searchParams.set("numOfRows", "30");
      url.searchParams.set("pageNo", "1");
      url.searchParams.set("search1", searchTerm);
      const response = await fetchWithTimeout(url.toString(), { method: "GET" });
      if (!response.ok) throw new Error(`KOTRA ${response.status}`);
      const selected = selectLatestEntryStrategy(normalizeEntryStrategyItems(await response.json()), searchTerm);
      return { countryCode, countryName, ...(selected ? buildAvailableEntryStrategy(selected, null) : buildEmptyEntryStrategy()) };
    } catch (error) {
      return { countryCode, countryName, ...buildFailedEntryStrategy(toErrorMessage(error)) };
    }
  }));
}

function resolveKotraKey(): string {
  return Deno.env.get("KOTRA_API_KEY") || Deno.env.get("PUBLIC_DATA_API_KEY") || Deno.env.get("KICOX_API_KEY") || "";
}

function normalizeEvidenceBundle(input: unknown): EvidenceBundle {
  const data = asRecord(input);
  return {
    company: asNullableRecord(data.company),
    product: asNullableRecord(data.product),
    topCountries: asArray(data.topCountries ?? data.countries).map(asRecord).slice(0, 1),
    certs: asArray(data.certs).map(asRecord).slice(0, 30),
    regs: asArray(data.regs).map(asRecord).slice(0, 30),
    risks: asArray(data.risks).map(asRecord).slice(0, 40),
    decisionFacts: asArray(data.decisionFacts).map(asRecord).slice(0, 80),
    decisionActions: asArray(data.decisionActions).map(asRecord).slice(0, 40),
    gateInputs: asNullableRecord(data.gateInputs),
    safetyFlags: asArray(data.safetyFlags ?? data.flags).map(asRecord).slice(0, 20),
    apiLogs: asArray(data.apiLogs ?? data.logs).map(asRecord).slice(0, 80),
    missingEvidence: uniqueTexts(asArray(data.missingEvidence).map(asText)),
    entryStrategies: [],
  };
}

function buildGeminiReportPromptInput(
  bundle: EvidenceBundle,
  evidence: { cert: EvidenceState; regulation: EvidenceState; payment: EvidenceState },
  programEvidenceCatalog: ProgramEvidence[],
) {
  const country = bundle.topCountries[0] ?? {};
  return {
    company: bundle.company,
    product: bundle.product,
    topCountries: [{
      countryCode: asText(country.countryCode ?? country.country_code),
      countryName: asText(country.countryName ?? country.country_name),
      totalScore: country.totalScore ?? country.total_score ?? null,
      label: asText(country.label),
      summary: asText(country.summary),
      customsExport12mUsd: country.customsExport12mUsd ?? country.customs_export_12m_usd ?? null,
      customsExportStatus: country.customsExportStatus ?? country.customs_export_status ?? null,
    }],
    programEvidenceCatalog,
    entryStrategies: bundle.entryStrategies,
    gateInputs: bundle.gateInputs,
    evidence,
    missingEvidence: bundle.missingEvidence,
  };
}

function buildProgramEvidenceCatalog(bundle: EvidenceBundle): ProgramEvidence[] {
  const catalog: ProgramEvidence[] = [];
  const country = bundle.topCountries[0];
  const code = normalizeCountryCode(country?.countryCode ?? country?.country_code);
  const add = (item: ProgramEvidence) => catalog.push(item);
  if (country) {
    add({
      evidenceId: "P-COUNTRY-001", category: "country", label: "선택 국가 추천 근거",
      value: `${safeText(country.countryName ?? country.country_name, UNKNOWN_TEXT)} · ${safeText(country.label, UNKNOWN_TEXT)} · ${safeText(country.totalScore ?? country.total_score, "-")}점 · ${safeText(country.summary, UNKNOWN_TEXT)}`,
      sourceName: "프로그램 국가추천", status: "available", referenceDate: "",
    });
    const amount = asPositiveNumber(country.customsExport12mUsd ?? country.customs_export_12m_usd);
    add({
      evidenceId: "P-CUSTOMS-001", category: "customs", label: "최근 12개월 수출 흐름",
      value: amount ? formatUsd(amount) : asText(country.customsExportStatus ?? country.customs_export_status) === "empty" ? "조회 결과 0건" : UNKNOWN_TEXT,
      sourceName: "관세 수출입 데이터", status: amount ? "available" : "unknown", referenceDate: "",
    });
  }
  const addRows = (rows: Record<string, unknown>[], prefix: string, category: string, label: string) => {
    rows.filter((row) => !code || !normalizeCountryCode(row.countryCode ?? row.country_code) || normalizeCountryCode(row.countryCode ?? row.country_code) === code)
      .forEach((row, index) => add({
        evidenceId: `${prefix}-${String(index + 1).padStart(3, "0")}`, category, label,
        value: safeText(buildProgramEvidenceValue(row), UNKNOWN_TEXT), sourceName: safeText(row.sourceOrg ?? row.source_org, "프로그램 API"),
        status: "available", referenceDate: safeText(row.referenceDate ?? row.reference_date, ""),
      }));
  };
  addRows(bundle.certs, "P-CERT", "certification", "인증 조회 결과");
  addRows(bundle.regs, "P-REG", "regulation", "수입규제 조회 결과");
  addRows(bundle.risks, "P-RISK", "risk", "K-SURE 위험 조회 결과");
  addRows(bundle.decisionFacts, "P-FACT", "decision", "의사결정 사실");
  const serializeGateInput = (topic: string): string => Object.entries(asRecord(bundle.gateInputs?.[topic]))
    .filter(([, value]) => Boolean(asText(value)))
    .map(([key, value]) => `${key}=${asText(value)}`)
    .join(" · ");
  const profitabilityInput = serializeGateInput("profitability");
  if (profitabilityInput) add({
    evidenceId: "P-INPUT-PROFIT-001", category: "decision", label: "사용자 수익성 입력",
    value: profitabilityInput, sourceName: "사용자 입력", status: "user_input", referenceDate: "",
  });
  const paymentInput = serializeGateInput("payment");
  if (paymentInput) add({
    evidenceId: "P-INPUT-PAY-001", category: "decision", label: "사용자 결제조건 입력",
    value: paymentInput, sourceName: "사용자 입력", status: "user_input", referenceDate: "",
  });
  bundle.safetyFlags.forEach((row, index) => add({
    evidenceId: `P-SAFETY-${String(index + 1).padStart(3, "0")}`, category: "safety",
    label: safeText(row.flagType ?? row.flag_type, "안전 확인"), value: safeText(row.summary, UNKNOWN_TEXT),
    sourceName: "프로그램 안전 조회", status: "check_required", referenceDate: "",
  }));
  bundle.decisionActions.forEach((row, index) => add({
    evidenceId: `P-ACTION-${String(index + 1).padStart(3, "0")}`, category: "action",
    label: safeText(row.title, "프로그램 권장 작업"), value: safeText(row.reason, UNKNOWN_TEXT),
    sourceName: "프로그램 의사결정", status: safeText(row.status, "pending"), referenceDate: "",
  }));
  bundle.apiLogs.forEach((row, index) => add({
    evidenceId: `P-API-${String(index + 1).padStart(3, "0")}`, category: "api",
    label: safeText(row.apiKeyName ?? row.api_key_name, "API 조회 상태"),
    value: `상태 ${safeText(row.status, "unknown")} · ${safeText(row.responseCount ?? row.response_count, "-")}건`,
    sourceName: "프로그램 API 로그", status: safeText(row.status, "unknown"), referenceDate: "",
  }));
  if (!catalog.length) add({
    evidenceId: "P-STATUS-001", category: "status", label: "프로그램 근거 상태",
    value: "선택 국가 또는 API 근거가 충분하지 않음", sourceName: "프로그램", status: "unknown", referenceDate: "",
  });
  return catalog;
}

function buildEvidenceSnapshot(bundle: EvidenceBundle) {
  return {
    cert: resolveEvidenceState(bundle.apiLogs, "kotra_overseas_certification", bundle.certs.length),
    regulation: resolveEvidenceState(bundle.apiLogs, "kotra_import_regulation", bundle.regs.length),
    payment: resolveEvidenceState(bundle.apiLogs, "ksure_export_payment", bundle.risks.filter((row) => asText(row.category).toLowerCase().includes("payment")).length),
  };
}

function resolveEvidenceState(logs: Record<string, unknown>[], apiKey: string, rowCount: number): EvidenceState {
  const log = logs.find((item) => asText(item.apiKeyName ?? item.api_key_name) === apiKey);
  const status = asText(log?.status).toLowerCase();
  if (!status || ["idle", "loading", "stale", "error", "failed", "not_run"].includes(status)) return "not_run";
  return rowCount > 0 ? "available" : "unknown";
}

function buildRuleBasedDraft(bundle: EvidenceBundle, catalog: ProgramEvidence[]): ReportDraft {
  const country = bundle.topCountries[0];
  const countryName = safeText(country?.countryName ?? country?.country_name, UNKNOWN_TEXT);
  const countryCode = safeText(country?.countryCode ?? country?.country_code, "-");
  const productName = safeText(bundle.product?.name, "해당 품목");
  const countryRef = findEvidenceRef(catalog, "country");
  const customsRef = findEvidenceRef(catalog, "customs");
  const certRef = findEvidenceRef(catalog, "certification");
  const regRef = findEvidenceRef(catalog, "regulation");
  const riskRef = findEvidenceRef(catalog, "risk");
  const primaryRef = countryRef || catalog[0].evidenceId;
  const refs = compactRefs([primaryRef, customsRef, certRef, regRef, riskRef, findEvidenceRef(catalog, "safety")]);
  const decisionGates = buildFallbackGates(bundle, catalog);
  const blocked = decisionGates.some((gate) => gate.status === "blocked");
  const unresolved = uniqueTexts(bundle.missingEvidence, ["공식 관세율·필수 인증 적용성·도착원가·목표 마진 확인 필요"]);
  return {
    schemaVersion: 2,
    decision: {
      verdict: country ? (blocked ? "hold" : "conditional") : "hold",
      confidence: "low",
      headline: country ? `${countryName} 수출은 핵심 조건 확인 후 제한적으로 검증하세요.` : "선택 국가 근거가 없어 수출 판단을 보류합니다.",
      reason: "Gemini 판단을 완료하지 못해 프로그램 API 근거만으로 보수적인 임시 결과를 생성했습니다.",
      immediateActions: [{
        action: "인증·규제·관세·목표 마진을 확인한 뒤 샘플 견적 진행 여부를 결정하세요.",
        owner: "수출 책임자", evidenceRefs: compactRefs([certRef, regRef, customsRef, primaryRef]),
      }],
      evidenceRefs: refs,
    },
    decisionReasons: [
      {
        type: "opportunity", title: "선택 시장의 검증 가치",
        interpretation: asPositiveNumber(country?.customsExport12mUsd ?? country?.customs_export_12m_usd)
          ? `최근 12개월 ${formatUsd(asPositiveNumber(country?.customsExport12mUsd ?? country?.customs_export_12m_usd)!)}의 수출 흐름은 기존 거래 가능성을 확인하는 신호입니다.`
          : "추천 점수는 검토 우선순위 신호이지만 실제 수요를 확정하지는 않습니다.",
        businessImpact: "대규모 투자보다 대표 규격의 소규모 견적·샘플 검증이 적합합니다.", evidenceRefs: compactRefs([customsRef, primaryRef]),
      },
      {
        type: "risk", title: "계약 전 확인이 필요한 조건",
        interpretation: "현재 API 결과만으로 인증 적용성, 실제 관세, 도착원가를 확정할 수 없습니다.",
        businessImpact: "조건 확인 전 양산 계약이나 회수 위험이 큰 결제조건을 확정하면 안 됩니다.",
        evidenceRefs: compactRefs([certRef, regRef, riskRef, primaryRef]),
      },
    ],
    entryStrategy: {
      countryCode, countryName,
      targetBuyer: "제품 규격과 인증 요구사항을 문서로 회신할 수 있는 전문 수입·유통 바이어",
      primaryChannel: "KOTRA·공식 무역지원기관을 통한 바이어 검증 후 샘플 견적",
      initialProducts: `${productName} 대표 규격 1~2종`,
      positioning: "규격 일치, 문서 대응, 공급 안정성을 중심으로 제안",
      paymentTerms: riskRef ? "초기 거래는 선금·분할지급·신용장 등 회수 안전 조건 우선" : "K-SURE 위험 확인 전 외상거래 보류",
      pilotScope: "바이어 3~5곳 인터뷰, 대표 규격 샘플 1회, 도착원가와 인증비용 산정",
      expansionCondition: "필수 인증·규제 통과, 목표 마진 충족, 바이어 결제조건 승인 후 확대",
      evidenceRefs: refs,
    },
    decisionGates,
    actionPlan: buildFallbackActionPlan(countryName, refs),
    officialResearch: { summary: "Gemini 공식자료 검색이 완료되지 않았습니다.", keyFindings: [], queries: [], sources: [], conflicts: [] },
    assumptions: ["선택 국가 한 곳과 현재 HS/HSK를 기준으로 판단함", "추천 점수는 실제 수요나 계약 가능성을 보장하지 않음"],
    unresolvedItems: unresolved,
    stopConditions: decisionGates.map((gate) => ({
      condition: gate.stopCondition, response: gate.status === "blocked" ? "즉시 보류하고 공식기관 확인" : "조건 확인 전 계약·양산 보류",
      evidenceRefs: gate.evidenceRefs,
    })),
    disclaimer: REPORT_DISCLAIMER,
  };
}

function buildFallbackGates(bundle: EvidenceBundle, catalog: ProgramEvidence[]): DecisionGate[] {
  const base = catalog[0]?.evidenceId ?? "P-STATUS-001";
  const ref = (category: string) => findEvidenceRef(catalog, category) || base;
  const blockedSafety = bundle.safetyFlags.some((flag) => /금지|차단|수출\s*불가|prohibit|blocked/i.test(`${asText(flag.flagType ?? flag.flag_type)} ${asText(flag.summary)}`));
  return [
    gate("certification", "check_required", "제품별 인증 적용성 확인 필요", "공식 인증기관에 적용 여부와 비용 확인", "인증 담당", "D+7", "필수 인증 취득 불가 또는 비용이 목표 원가 초과", ref("certification")),
    gate("regulation", "check_required", "수입규제 적용 범위 확인 필요", "관할 기관 원문에서 시행일과 범위 확인", "통관 담당", "D+7", "수입 금지 또는 수용 불가능한 제한 확인", ref("regulation")),
    gate("tariff", "check_required", "실제 적용 관세와 추가관세 미확정", "기본·추가관세와 무역구제조치 확인", "관세 담당", "D+7", "총 관세 반영 후 목표 마진 미달", ref("customs")),
    gate("profitability", "check_required", "도착원가와 목표 마진 미확정", "물류·보험·인증·관세 포함 원가표 작성", "재무 담당", "D+30", "보수 시나리오에서 목표 공헌이익 미달", ref("customs")),
    gate("payment", "check_required", "결제위험을 거래조건에 반영해야 함", "바이어 신용과 선금·LC 조건 확정", "영업 담당", "D+30", "회수 안전장치 없이 외상거래만 요구", ref("risk")),
    gate("safety", blockedSafety ? "blocked" : "check_required", blockedSafety ? "안전·전략물자 차단 가능성 확인" : "안전·전략물자 최종 판정 미확정", "공식 판정·시험·라벨 확인", "안전 담당", "D+7", "수출통제 또는 안전요건 충족 불가", ref("safety")),
  ];
}

function gate(topic: GateTopic, status: GateStatus, decision: string, requiredAction: string, owner: string, due: string, stopCondition: string, ref: string): DecisionGate {
  return { topic, status, decision, requiredAction, owner, due, stopCondition, evidenceRefs: [ref] };
}

function buildFallbackActionPlan(countryName: string, refs: string[]): ActionPlanItem[] {
  return [
    { horizon: "D+7", owner: "HS·인증 담당", action: "HS/HSK와 인증·규제·관세 적용성을 공식기관에 확인", deliverable: "근거 URL·조회일이 포함된 확인표", passCriteria: "필수 요건과 추가 비용 항목 확정", evidenceRefs: refs },
    { horizon: "D+30", owner: "영업·재무 담당", action: `${countryName} 바이어 3~5곳에 대표 규격 견적과 거래조건 검증`, deliverable: "피드백·도착원가·결제조건 비교표", passCriteria: "목표 마진과 회수 조건을 충족하는 바이어 1곳 이상", evidenceRefs: refs },
    { horizon: "D+90", owner: "수출 책임자", action: "샘플 결과와 모든 게이트를 재검토해 확대·중단 결정", deliverable: "파일럿 결과 및 Go/No-Go 회의록", passCriteria: "차단 게이트 0건, 핵심 확인 해소, 파일럿 품질 승인", evidenceRefs: refs },
  ];
}

function normalizeDraft(input: unknown, bundle: EvidenceBundle, catalog: ProgramEvidence[]): ReportDraft {
  const data = asRecord(asRecord(input).draft ?? input);
  const fallback = buildRuleBasedDraft(bundle, catalog);
  const researchRow = asRecord(data.officialResearch);
  const sources = normalizeOfficialSources(researchRow.sources);
  const allowed = new Set([...catalog.map((item) => item.evidenceId), ...sources.map((item) => item.evidenceId)]);
  const defaultRefs = [catalog[0]?.evidenceId].filter(Boolean);
  const linkIssues = countMissingEvidenceLinks(data);
  const decisionRow = asRecord(data.decision);
  const rawVerdict = safeText(decisionRow.verdict, fallback.decision.verdict).toLowerCase();
  const rawConfidence = safeText(decisionRow.confidence, fallback.decision.confidence).toLowerCase();
  const immediateActions = asArray(decisionRow.immediateActions).map((item) => {
    const row = asRecord(item);
    const action = safeText(row.action, "");
    return action ? {
      action, owner: safeText(row.owner, "수출 책임자"), evidenceRefs: normalizeRefs(row.evidenceRefs, allowed, defaultRefs),
    } : null;
  }).filter((item): item is Decision["immediateActions"][number] => Boolean(item));
  const decision: Decision = {
    verdict: rawVerdict === "proceed" || rawVerdict === "hold" ? rawVerdict : "conditional",
    confidence: rawConfidence === "high" || rawConfidence === "low" ? rawConfidence : "medium",
    headline: safeText(decisionRow.headline, fallback.decision.headline),
    reason: safeText(decisionRow.reason, fallback.decision.reason),
    immediateActions: immediateActions.length ? immediateActions.slice(0, 3) : fallback.decision.immediateActions,
    evidenceRefs: normalizeRefs(decisionRow.evidenceRefs, allowed, fallback.decision.evidenceRefs),
  };

  const reasons = asArray(data.decisionReasons).map((item) => {
    const row = asRecord(item);
    const interpretation = safeText(row.interpretation, "");
    if (!interpretation) return null;
    return {
      type: safeText(row.type, "risk").toLowerCase() === "opportunity" ? "opportunity" as const : "risk" as const,
      title: safeText(row.title, "AI 판단 근거"), interpretation,
      businessImpact: safeText(row.businessImpact, "실행 우선순위에 반영"),
      evidenceRefs: normalizeRefs(row.evidenceRefs, allowed, defaultRefs),
    };
  }).filter((item): item is DecisionReason => Boolean(item));

  const entryRow = asRecord(data.entryStrategy);
  const selected = bundle.topCountries[0];
  const entryStrategy: EntryStrategy = {
    countryCode: safeText(selected?.countryCode ?? selected?.country_code, fallback.entryStrategy.countryCode),
    countryName: safeText(selected?.countryName ?? selected?.country_name, fallback.entryStrategy.countryName),
    targetBuyer: safeText(entryRow.targetBuyer, fallback.entryStrategy.targetBuyer),
    primaryChannel: safeText(entryRow.primaryChannel, fallback.entryStrategy.primaryChannel),
    initialProducts: safeText(entryRow.initialProducts, fallback.entryStrategy.initialProducts),
    positioning: safeText(entryRow.positioning, fallback.entryStrategy.positioning),
    paymentTerms: safeText(entryRow.paymentTerms, fallback.entryStrategy.paymentTerms),
    pilotScope: safeText(entryRow.pilotScope, fallback.entryStrategy.pilotScope),
    expansionCondition: safeText(entryRow.expansionCondition, fallback.entryStrategy.expansionCondition),
    evidenceRefs: normalizeRefs(entryRow.evidenceRefs, allowed, fallback.entryStrategy.evidenceRefs),
  };

  const gateMap = new Map<GateTopic, DecisionGate>();
  asArray(data.decisionGates).forEach((item) => {
    const row = asRecord(item);
    const topic = normalizeGateTopic(row.topic);
    if (!topic || gateMap.has(topic)) return;
    const base = fallback.decisionGates.find((gateItem) => gateItem.topic === topic)!;
    const rawStatus = safeText(row.status, base.status).toLowerCase();
    const status: GateStatus = rawStatus === "clear" || rawStatus === "blocked" ? rawStatus : "check_required";
    gateMap.set(topic, {
      topic, status, decision: safeText(row.decision, base.decision), requiredAction: safeText(row.requiredAction, base.requiredAction),
      owner: safeText(row.owner, base.owner), due: safeText(row.due, base.due), stopCondition: safeText(row.stopCondition, base.stopCondition),
      evidenceRefs: normalizeRefs(row.evidenceRefs, allowed, base.evidenceRefs),
    });
  });
  const decisionGates = GATE_TOPICS.map((topic) => gateMap.get(topic) ?? fallback.decisionGates.find((item) => item.topic === topic)!);

  const actionRows = asArray(data.actionPlan).map((item) => {
    const row = asRecord(item);
    const horizon = normalizeHorizon(row.horizon);
    const action = safeText(row.action, "");
    if (!horizon || !action) return null;
    return {
      horizon, owner: safeText(row.owner, "수출 책임자"), action,
      deliverable: safeText(row.deliverable, `${horizon} 산출물`), passCriteria: safeText(row.passCriteria, "담당자 검토 완료"),
      evidenceRefs: normalizeRefs(row.evidenceRefs, allowed, defaultRefs),
    };
  }).filter((item): item is ActionPlanItem => Boolean(item));
  const actionPlan = (["D+7", "D+30", "D+90"] as Horizon[]).flatMap((horizon) => {
    const matches = actionRows.filter((item) => item.horizon === horizon);
    return matches.length ? matches : fallback.actionPlan.filter((item) => item.horizon === horizon);
  }).slice(0, 9);

  const findings = asArray(researchRow.keyFindings).map((item) => {
    const row = asRecord(item);
    const finding = safeText(row.finding ?? row.summary, typeof item === "string" ? item : "");
    return finding ? { finding, evidenceRefs: normalizeRefs(row.evidenceRefs, allowed, sources[0] ? [sources[0].evidenceId] : []) } : null;
  }).filter((item): item is { finding: string; evidenceRefs: string[] } => Boolean(item));
  const conflicts = normalizeTextArray(researchRow.conflicts);
  const unresolvedItems = uniqueTexts([...normalizeTextArray(data.unresolvedItems), ...bundle.missingEvidence]);
  const stopConditions = asArray(data.stopConditions).map((item) => {
    const row = asRecord(item);
    const condition = safeText(row.condition, typeof item === "string" ? item : "");
    return condition ? {
      condition, response: safeText(row.response, "조건 해소 전 진행 보류"),
      evidenceRefs: normalizeRefs(row.evidenceRefs, allowed, defaultRefs),
    } : null;
  }).filter((item): item is StopCondition => Boolean(item));

  if (decisionGates.some((gate) => gate.status === "blocked")) decision.verdict = "hold";
  else if (decision.verdict === "proceed" && decisionGates.some((gate) => gate.status === "check_required")) decision.verdict = "conditional";
  const issueCount = [linkIssues > 0, conflicts.length > 0, sources.length === 0, bundle.missingEvidence.length > 0].filter(Boolean).length;
  decision.confidence = downgradeConfidence(decision.confidence, issueCount);

  return {
    schemaVersion: 2,
    decision,
    decisionReasons: reasons.length ? reasons.slice(0, 8) : fallback.decisionReasons,
    entryStrategy,
    decisionGates,
    actionPlan,
    officialResearch: {
      summary: safeText(researchRow.summary, sources.length ? "공식 웹 근거를 확인했습니다." : fallback.officialResearch.summary),
      keyFindings: findings, queries: normalizeTextArray(researchRow.queries), sources, conflicts,
    },
    assumptions: normalizeTextArray(data.assumptions, fallback.assumptions),
    unresolvedItems,
    stopConditions: stopConditions.length ? stopConditions.slice(0, 8) : fallback.stopConditions,
    disclaimer: safeText(data.disclaimer, REPORT_DISCLAIMER),
  };
}

function normalizeOfficialSources(value: unknown): OfficialSource[] {
  return asArray(value).map((item, index) => {
    const row = asRecord(item);
    const url = asText(row.url ?? row.uri);
    const title = safeText(row.title, url);
    if (!/^https?:\/\//i.test(url) || !isOfficialWebSource(title, url)) return null;
    return {
      evidenceId: /^W-\d{3}$/i.test(asText(row.evidenceId)) ? asText(row.evidenceId).toUpperCase() : `W-${String(index + 1).padStart(3, "0")}`,
      title, url, organization: safeText(row.organization, inferOrganization(title, url)),
      publishedAt: safeText(row.publishedAt, ""), accessedAt: safeText(row.accessedAt, new Date().toISOString().slice(0, 10)),
      gateTopics: asArray(row.gateTopics)
        .map(normalizeGateTopic)
        .filter((topic): topic is GateTopic => Boolean(topic)),
    };
  }).filter((item): item is OfficialSource => Boolean(item));
}

function countMissingEvidenceLinks(source: Record<string, unknown>): number {
  let count = 0;
  const inspect = (value: unknown) => {
    const row = asRecord(value);
    if (Object.keys(row).length && asArray(row.evidenceRefs).length === 0) count += 1;
  };
  inspect(source.decision);
  asArray(asRecord(source.decision).immediateActions).forEach(inspect);
  asArray(source.decisionReasons).forEach(inspect);
  inspect(source.entryStrategy);
  asArray(source.decisionGates).forEach(inspect);
  asArray(source.actionPlan).forEach(inspect);
  asArray(source.stopConditions).forEach(inspect);
  return count;
}

function normalizeRefs(value: unknown, allowed: Set<string>, fallback: string[]): string[] {
  const refs = uniqueTexts(asArray(value).map(asText)).filter((ref) => allowed.has(ref));
  return refs.length ? refs : fallback.filter((ref) => allowed.has(ref));
}

function findEvidenceRef(catalog: ProgramEvidence[], category: string): string {
  return catalog.find((item) => item.category === category)?.evidenceId ?? "";
}

function compactRefs(values: Array<string | undefined>): string[] {
  return uniqueTexts(values.filter((value): value is string => Boolean(value)));
}

function downgradeConfidence(confidence: Confidence, issueCount: number): Confidence {
  if (!issueCount) return confidence;
  const levels: Confidence[] = ["low", "medium", "high"];
  return levels[Math.max(0, levels.indexOf(confidence) - Math.min(2, issueCount))];
}

function normalizeGateTopic(value: unknown): GateTopic | null {
  const text = asText(value).toLowerCase();
  return GATE_TOPICS.includes(text as GateTopic) ? text as GateTopic : null;
}

function normalizeHorizon(value: unknown): Horizon | null {
  const text = asText(value).toUpperCase().replace(/\s/g, "");
  if (["D+7", "7", "7D"].includes(text)) return "D+7";
  if (["D+30", "30", "30D"].includes(text)) return "D+30";
  if (["D+90", "90", "90D"].includes(text)) return "D+90";
  return null;
}

function normalizeCountryCode(value: unknown): string {
  return asText(value).trim().toUpperCase();
}

function normalizeTextArray(value: unknown, fallback: string[] = []): string[] {
  return uniqueTexts(asArray(value).map(asText), fallback);
}

function uniqueTexts(values: string[], fallback: string[] = []): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const text = asText(value);
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    output.push(text);
  }
  return output.length ? output : fallback;
}

function uniqueGateTopics(values: GateTopic[]): GateTopic[] {
  return [...new Set(values)];
}

function parseJsonObject(value: string): Record<string, unknown> {
  const cleaned = value.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(cleaned);
  return asRecord(parsed);
}

function buildAiDiagnostics() {
  return {
    provider: "gemini",
    model: GEMINI_REPORT_MODEL,
    pipeline: "official_research_then_structured_decision",
    official_source_policy: true,
  };
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

function toErrorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  return asText(value) || "unknown";
}

function safeText(value: unknown, fallback: string): string {
  const text = asText(value);
  return text || fallback;
}

function asNullableRecord(value: unknown): Record<string, unknown> | null {
  const row = asRecord(value);
  return Object.keys(row).length ? row : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function asPositiveNumber(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function formatUsd(value: number): string {
  if (value >= 1_000_000_000) return `$${trimFixed(value / 1_000_000_000)}B`;
  if (value >= 1_000_000) return `$${trimFixed(value / 1_000_000)}M`;
  if (value >= 1_000) return `$${trimFixed(value / 1_000)}K`;
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function trimFixed(value: number): string {
  return value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2).replace(/\.0+$|(?<=\.\d)0+$/, "");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
