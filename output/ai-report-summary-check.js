// supabase/functions/_shared/cors.ts
var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS"
};

// supabase/functions/_shared/auth.ts
import { createClient } from "npm:@supabase/supabase-js@2";
async function requireAuthenticatedUser(req, corsHeaders2) {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return {
      ok: false,
      response: json({ error: "missing or invalid authorization header" }, 401, corsHeaders2)
    };
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      ok: false,
      response: json({ error: "supabase env missing" }, 500, corsHeaders2)
    };
  }
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return {
      ok: false,
      response: json({ error: "unauthorized" }, 401, corsHeaders2)
    };
  }
  return { ok: true, user: data.user };
}
function json(body, status, corsHeaders2) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders2, "Content-Type": "application/json" }
  });
}

// supabase/functions/_shared/kotra-entry-strategy.ts
var UNKNOWN_TEXT = "\uD655\uC2E4\uD55C \uC815\uBCF4 \uC5C6\uC74C";
var COUNTRY_SEARCH_TERMS = {
  US: "\uBBF8\uAD6D",
  USA: "\uBBF8\uAD6D",
  VN: "\uBCA0\uD2B8\uB0A8",
  VNM: "\uBCA0\uD2B8\uB0A8",
  CN: "\uC911\uAD6D",
  CHN: "\uC911\uAD6D",
  JP: "\uC77C\uBCF8",
  JPN: "\uC77C\uBCF8",
  DE: "\uB3C5\uC77C",
  DEU: "\uB3C5\uC77C",
  IN: "\uC778\uB3C4",
  IND: "\uC778\uB3C4",
  ID: "\uC778\uB3C4\uB124\uC2DC\uC544",
  IDN: "\uC778\uB3C4\uB124\uC2DC\uC544",
  TH: "\uD0DC\uAD6D",
  THA: "\uD0DC\uAD6D",
  MY: "\uB9D0\uB808\uC774\uC2DC\uC544",
  MYS: "\uB9D0\uB808\uC774\uC2DC\uC544",
  SG: "\uC2F1\uAC00\uD3EC\uB974",
  SGP: "\uC2F1\uAC00\uD3EC\uB974",
  MX: "\uBA55\uC2DC\uCF54",
  MEX: "\uBA55\uC2DC\uCF54",
  CA: "\uCE90\uB098\uB2E4",
  CAN: "\uCE90\uB098\uB2E4",
  TW: "\uB300\uB9CC",
  TWN: "\uB300\uB9CC"
};
var COUNTRY_NAME_TERMS = [
  "\uBBF8\uAD6D",
  "\uBCA0\uD2B8\uB0A8",
  "\uC911\uAD6D",
  "\uC77C\uBCF8",
  "\uB3C5\uC77C",
  "\uC778\uB3C4\uB124\uC2DC\uC544",
  "\uC778\uB3C4",
  "\uD0DC\uAD6D",
  "\uB9D0\uB808\uC774\uC2DC\uC544",
  "\uC2F1\uAC00\uD3EC\uB974",
  "\uBA55\uC2DC\uCF54",
  "\uCE90\uB098\uB2E4",
  "\uB300\uB9CC",
  "\uD504\uB791\uC2A4",
  "\uC601\uAD6D",
  "\uC774\uD0C8\uB9AC\uC544",
  "\uC2A4\uD398\uC778",
  "\uBE0C\uB77C\uC9C8",
  "\uD638\uC8FC"
];
function resolveEntryStrategySearchTerm(countryCode, countryName) {
  const code = String(countryCode ?? "").trim().toUpperCase();
  if (code && COUNTRY_SEARCH_TERMS[code]) return COUNTRY_SEARCH_TERMS[code];
  const name = stripParentheses(String(countryName ?? "").trim());
  const direct = COUNTRY_NAME_TERMS.find((term) => name.includes(term));
  if (direct) return direct;
  return name.replace(/사회주의\s*공화국/g, "").replace(/인민\s*공화국/g, "").replace(/연방\s*공화국/g, "").replace(/공화국/g, "").replace(/왕국/g, "").replace(/\s+/g, " ").trim() || String(countryName ?? "").trim();
}
function normalizeEntryStrategyItems(input) {
  const response = asRecord(asRecord(input).response);
  const body = asRecord(response.body);
  const itemList = asRecord(body.itemList);
  const rawItems = asArrayOrSingle(itemList.item);
  return rawItems.map(asRecord).map((item) => {
    const file = selectAttachment(item.realAtfileInfoList);
    return {
      title: textOrNull(item.newsTitl),
      publishedDate: textOrNull(item.othbcDt),
      tradeOffice: textOrNull(item.ovrofInfo),
      sourceUrl: textOrNull(item.kotraNewsUrl),
      attachmentName: file.name,
      attachmentUrl: file.url,
      basisSummary: "",
      limitations: []
    };
  }).filter((item) => Boolean(item.title || item.sourceUrl || item.attachmentUrl));
}
function selectLatestEntryStrategy(items, searchTerm) {
  const term = String(searchTerm ?? "").trim();
  const candidates = term ? items.filter((item) => titleMatchesSearchTerm(item.title, term)) : items;
  const sorted = [...candidates].sort((a, b) => dateRank(b.publishedDate) - dateRank(a.publishedDate));
  return sorted.find((item) => (item.title ?? "").includes("\uC9C4\uCD9C\uC804\uB7B5")) ?? sorted[0] ?? null;
}
function buildAvailableEntryStrategy(item, _pdfSummary) {
  return {
    status: "available",
    title: item.title ?? null,
    publishedDate: item.publishedDate ?? null,
    tradeOffice: item.tradeOffice ?? null,
    sourceUrl: item.sourceUrl ?? null,
    attachmentName: item.attachmentName ?? null,
    attachmentUrl: item.attachmentUrl ?? null,
    usedPdf: false,
    basisSummary: "",
    limitations: uniqueStrings(item.limitations ?? [])
  };
}
function buildEmptyEntryStrategy() {
  return {
    status: "empty",
    title: null,
    publishedDate: null,
    tradeOffice: null,
    sourceUrl: null,
    attachmentName: null,
    attachmentUrl: null,
    usedPdf: false,
    basisSummary: UNKNOWN_TEXT,
    limitations: ["\uD574\uB2F9 \uAD6D\uAC00 \uC9C4\uCD9C\uC804\uB7B5 \uACB0\uACFC \uC5C6\uC74C"]
  };
}
function buildFailedEntryStrategy(message) {
  return {
    status: "failed",
    title: null,
    publishedDate: null,
    tradeOffice: null,
    sourceUrl: null,
    attachmentName: null,
    attachmentUrl: null,
    usedPdf: false,
    basisSummary: UNKNOWN_TEXT,
    limitations: uniqueStrings(["\uC9C4\uCD9C\uC804\uB7B5 API \uC870\uD68C \uC2E4\uD328", message].filter(Boolean))
  };
}
function selectAttachment(value) {
  const list = asArrayOrSingle(asRecord(value).realAtfileInfo).map(asRecord);
  const selected = list.find((item) => textOrNull(item.realAtfileUrl) || textOrNull(item.realAtfileName)) ?? {};
  return {
    name: textOrNull(selected.realAtfileName),
    url: textOrNull(selected.realAtfileUrl)
  };
}
function stripParentheses(value) {
  return value.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}
function dateRank(value) {
  const text = String(value ?? "").trim();
  if (!text) return 0;
  const time = Date.parse(text.replace(/\./g, "-"));
  return Number.isFinite(time) ? time : 0;
}
function titleMatchesSearchTerm(title, searchTerm) {
  const text = String(title ?? "").trim();
  const term = searchTerm.trim();
  if (!text || !term) return false;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|[^0-9A-Za-z\uAC00-\uD7A3])${escaped}([^0-9A-Za-z\uAC00-\uD7A3]|$)`, "i");
  return pattern.test(text);
}
function uniqueStrings(values) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}
function textOrNull(value) {
  if (typeof value === "string") {
    const text = value.trim();
    return text || null;
  }
  if (typeof value === "number") return String(value);
  return null;
}
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function asArrayOrSingle(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

// supabase/functions/ai-report-summary/index.ts
var UNKNOWN_TEXT2 = "\uD655\uC2E4\uD55C \uC815\uBCF4 \uC5C6\uC74C";
var AI_TIMEOUT_MS = 11e4;
var GEMINI_REPORT_MODEL = "gemini-3.1-pro-preview";
var KOTRA_ENTRY_STRATEGY_ENDPOINT = "https://apis.data.go.kr/B410001/entryStrategy/entryStrategy";
var GATE_TOPICS = ["certification", "regulation", "tariff", "profitability", "payment", "safety"];
var OFFICIAL_TOKENS = [
  ".gov",
  ".go.kr",
  ".gob.",
  ".gc.ca",
  ".europa.eu",
  "kotra",
  "k-sure",
  "ksure",
  "wto.org",
  "intracen.org",
  "trade.gov",
  "cbp.gov",
  "usitc.gov",
  "federalregister.gov",
  "commerce.gov",
  "ustr.gov",
  "europa.eu",
  "customs",
  "\uAD00\uC138\uCCAD",
  "\uC0B0\uC5C5\uD1B5\uC0C1\uC790\uC6D0\uBD80",
  "\uB300\uD55C\uBB34\uC5ED\uD22C\uC790\uC9C4\uD765\uACF5\uC0AC",
  "\uD55C\uAD6D\uBB34\uC5ED\uBCF4\uD5D8\uACF5\uC0AC",
  "world trade organization",
  "international trade centre",
  "international trade commission",
  "national highway traffic safety administration",
  "federal register"
];
var EXCLUDED_WEB_TOKENS = ["news", "\uC2E0\uBB38", "\uC77C\uBCF4", "\uBE14\uB85C\uADF8", "blog", "press", "media", "\uAD11\uACE0"];
var REPORT_DISCLAIMER = "\uBCF8 \uB9AC\uD3EC\uD2B8\uB294 \uD504\uB85C\uADF8\uB7A8 \uC870\uD68C \uB370\uC774\uD130\uC640 \uACF5\uC2DD \uC6F9 \uADFC\uAC70\uB97C \uBC14\uD0D5\uC73C\uB85C \uC2E4\uD589 \uC6B0\uC120\uC21C\uC704\uC640 \uD655\uC778 \uC870\uAC74\uC744 \uC81C\uC548\uD558\uB294 \uCC38\uACE0\uC790\uB8CC\uC774\uBA70, \uBC95\uC801\xB7\uC778\uC99D\xB7\uADDC\uC81C \uC801\uD569\uC131\uC758 \uCD5C\uC885 \uD310\uC815\uC774 \uC544\uB2D9\uB2C8\uB2E4.";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authResult = await requireAuthenticatedUser(req, corsHeaders);
    if (!authResult.ok) return authResult.response;
    const body = await req.json();
    const normalized = normalizeEvidenceBundle(body);
    const bundle = {
      ...normalized,
      entryStrategies: await fetchKotraEntryStrategies(normalized.topCountries)
    };
    const evidenceState = buildEvidenceSnapshot(bundle);
    const programEvidenceCatalog = buildProgramEvidenceCatalog(bundle);
    const promptInput = buildGeminiReportPromptInput(bundle, evidenceState, programEvidenceCatalog);
    try {
      const grounded = await callGroundedResearch(JSON.stringify(promptInput));
      const structured = await callStructuredReport(buildDecisionSystemPrompt(), JSON.stringify({
        programEvidence: promptInput,
        officialWebEvidence: grounded.text,
        officialSources: grounded.sources,
        webSearchQueries: grounded.webSearchQueries
      }));
      const parsed = parseJsonObject(structured);
      parsed.officialResearch = {
        ...asRecord2(parsed.officialResearch),
        queries: grounded.webSearchQueries,
        sources: grounded.sources
      };
      const draft = normalizeDraft(parsed, bundle, programEvidenceCatalog);
      const partial = draft.decision.confidence === "low" || draft.unresolvedItems.length > 0;
      return json2({
        state: partial ? "partial_success" : "success",
        message: partial ? "\uC77C\uBD80 \uACF5\uC2DD \uADFC\uAC70 \uB610\uB294 \uD575\uC2EC \uC870\uAC74\uC774 \uBBF8\uD655\uC778\uB418\uC5B4 \uC870\uAC74\uBD80\uB85C \uD310\uB2E8\uD588\uC2B5\uB2C8\uB2E4." : null,
        ...draft,
        summary: draft.decision.headline,
        actions: draft.actionPlan.filter((item) => item.horizon === "D+7").map((item) => item.action),
        draft,
        diagnostics: buildAiDiagnostics()
      });
    } catch (aiError) {
      const draft = buildRuleBasedDraft(bundle, programEvidenceCatalog);
      return json2({
        state: "local_fallback",
        message: `Gemini \uD310\uB2E8 \uBBF8\uC644\uB8CC: ${toErrorMessage(aiError)}`,
        ...draft,
        summary: draft.decision.headline,
        actions: draft.actionPlan.filter((item) => item.horizon === "D+7").map((item) => item.action),
        draft,
        diagnostics: { ...buildAiDiagnostics(), fallback: "rule_based", ai_error: toErrorMessage(aiError) }
      });
    }
  } catch (error) {
    return json2({ error: toErrorMessage(error) }, 500);
  }
});
function buildDecisionSystemPrompt() {
  return [
    "You are a senior export decision consultant for Korean manufacturers.",
    "This is an official-source-only decision report, not a data summary.",
    "Return strict JSON only. Write every user-facing text in Korean.",
    "Analyze only the selected target country supplied as the first and only topCountries item.",
    "PROGRAM EVIDENCE is authoritative for values retrieved by this program. Never invent a certification, regulation, tariff, sanction, buyer, or statistic.",
    "OFFICIAL WEB EVIDENCE may be used only when it is traceable to one of officialSources and its W-* evidenceId.",
    "Do not use news, media, blogs, social posts, shopping pages, or advertising content even if supplied elsewhere.",
    "Choose exactly one primary entry route. Do not list several alternatives without selecting a priority.",
    "Make decision.verdict one of proceed, conditional, hold and give a practical reason and up to three immediate actions.",
    "Every AI judgment and action must include at least one valid evidenceRefs ID from programEvidenceCatalog or officialSources.",
    "decisionReasons must distinguish opportunity and risk, interpret the evidence, and state the business impact.",
    "entryStrategy must specify target buyer, one primary channel, initial products, positioning, payment terms, pilot scope, and expansion condition.",
    "decisionGates must contain exactly certification, regulation, tariff, profitability, payment, safety.",
    "\uCC28\uB2E8 \uAC8C\uC774\uD2B8\uAC00 \uD558\uB098\uB77C\uB3C4 \uC788\uC73C\uBA74 decision.verdict\uB294 \uBC18\uB4DC\uC2DC hold\uB85C \uC791\uC131\uD55C\uB2E4.",
    "\uD575\uC2EC \uAC8C\uC774\uD2B8\uAC00 check_required\uC774\uBA74 decision.verdict\uB294 \uCD5C\uB300 conditional\uAE4C\uC9C0\uB9CC \uD5C8\uC6A9\uD55C\uB2E4.",
    "If evidence is missing or conflicting, list it in unresolvedItems or officialResearch.conflicts and lower confidence.",
    "Do not make a final legal, certification, regulatory, strategic-material, or product-safety determination.",
    `For unknown values write '${UNKNOWN_TEXT2}' instead of guessing.`,
    "Action plan must cover D+7, D+30, and D+90 and include owner, action, deliverable, passCriteria, and evidenceRefs.",
    'Schema: {"schemaVersion":2,"decision":{"verdict":"proceed|conditional|hold","confidence":"high|medium|low","headline":"...","reason":"...","immediateActions":[{"action":"...","owner":"...","evidenceRefs":["P-*|W-*"]}],"evidenceRefs":["P-*|W-*"]},"decisionReasons":[{"type":"opportunity|risk","title":"...","interpretation":"...","businessImpact":"...","evidenceRefs":["..."]}],"entryStrategy":{"countryCode":"...","countryName":"...","targetBuyer":"...","primaryChannel":"...","initialProducts":"...","positioning":"...","paymentTerms":"...","pilotScope":"...","expansionCondition":"...","evidenceRefs":["..."]},"decisionGates":[{"topic":"certification|regulation|tariff|profitability|payment|safety","status":"clear|check_required|blocked","decision":"...","requiredAction":"...","owner":"...","due":"...","stopCondition":"...","evidenceRefs":["..."]}],"actionPlan":[{"horizon":"D+7|D+30|D+90","owner":"...","action":"...","deliverable":"...","passCriteria":"...","evidenceRefs":["..."]}],"officialResearch":{"summary":"...","keyFindings":[{"finding":"...","evidenceRefs":["W-*"]}],"conflicts":["..."]},"assumptions":["..."],"unresolvedItems":["..."],"stopConditions":[{"condition":"...","response":"...","evidenceRefs":["..."]}],"disclaimer":"..."}'
  ].join(" ");
}
async function callGroundedResearch(programEvidence) {
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
        "Research current tariff and additional-duty rules, trade remedies, mandatory product requirements, customs procedures, and official market-entry support.",
        "Separate confirmed facts, conflicts, and unresolved items. Include the responsible authority for every finding.",
        "Write a concise Korean research brief. Do not output JSON."
      ].join(" ") }] },
      contents: [{ role: "user", parts: [{ text: `PROGRAM EVIDENCE:
${programEvidence}` }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.1 }
    })
  });
  if (!response.ok) throw await buildGeminiHttpError(response);
  const data = await response.json();
  const candidate = data.candidates?.[0];
  const metadata = candidate?.groundingMetadata ?? {};
  return {
    text: candidate?.content?.parts?.[0]?.text ?? "",
    webSearchQueries: uniqueTexts(asArray(metadata.webSearchQueries).map(asText)),
    sources: extractOfficialSources(metadata.groundingChunks)
  };
}
async function callStructuredReport(systemPrompt, userPrompt) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_REPORT_MODEL)}:generateContent?key=${apiKey}`;
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
    })
  });
  if (!response.ok) throw await buildGeminiHttpError(response);
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
}
async function buildGeminiHttpError(response) {
  const detail = sanitizeGeminiError(await response.text());
  return new Error(`Gemini ${response.status}: ${detail}`);
}
function sanitizeGeminiError(value) {
  let message = value;
  try {
    const parsed = asRecord2(JSON.parse(value));
    message = safeText(asRecord2(parsed.error).message, value);
  } catch {
  }
  return message.replace(/AIza[0-9A-Za-z_-]+/g, "[redacted]").replace(/([?&]key=)[^&\s]+/gi, "$1[redacted]").replace(/\s+/g, " ").trim().slice(0, 500) || "request failed";
}
function extractOfficialSources(value) {
  const seen = /* @__PURE__ */ new Set();
  const accessedAt = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const sources = [];
  for (const chunk of asArray(value).map(asRecord2)) {
    const web = asRecord2(chunk.web);
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
      accessedAt
    });
  }
  return sources.slice(0, 12);
}
function isOfficialWebSource(title, url) {
  const text = `${title} ${url}`.toLowerCase();
  if (EXCLUDED_WEB_TOKENS.some((token) => text.includes(token))) return false;
  return OFFICIAL_TOKENS.some((token) => text.includes(token));
}
function inferOrganization(title, url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (!host.includes("google")) return host;
  } catch {
  }
  return title || "\uACF5\uC2DD\uAE30\uAD00";
}
async function fetchKotraEntryStrategies(topCountries) {
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
      return { countryCode, countryName, ...selected ? buildAvailableEntryStrategy(selected, null) : buildEmptyEntryStrategy() };
    } catch (error) {
      return { countryCode, countryName, ...buildFailedEntryStrategy(toErrorMessage(error)) };
    }
  }));
}
function resolveKotraKey() {
  return Deno.env.get("KOTRA_API_KEY") || Deno.env.get("PUBLIC_DATA_API_KEY") || Deno.env.get("KICOX_API_KEY") || "";
}
function normalizeEvidenceBundle(input) {
  const data = asRecord2(input);
  return {
    company: asNullableRecord(data.company),
    product: asNullableRecord(data.product),
    topCountries: asArray(data.topCountries ?? data.countries).map(asRecord2).slice(0, 1),
    certs: asArray(data.certs).map(asRecord2).slice(0, 30),
    regs: asArray(data.regs).map(asRecord2).slice(0, 30),
    risks: asArray(data.risks).map(asRecord2).slice(0, 40),
    decisionFacts: asArray(data.decisionFacts).map(asRecord2).slice(0, 80),
    decisionActions: asArray(data.decisionActions).map(asRecord2).slice(0, 40),
    safetyFlags: asArray(data.safetyFlags ?? data.flags).map(asRecord2).slice(0, 20),
    apiLogs: asArray(data.apiLogs ?? data.logs).map(asRecord2).slice(0, 80),
    missingEvidence: uniqueTexts(asArray(data.missingEvidence).map(asText)),
    entryStrategies: []
  };
}
function buildGeminiReportPromptInput(bundle, evidence, programEvidenceCatalog) {
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
      customsExportStatus: country.customsExportStatus ?? country.customs_export_status ?? null
    }],
    programEvidenceCatalog,
    entryStrategies: bundle.entryStrategies,
    evidence,
    missingEvidence: bundle.missingEvidence
  };
}
function buildProgramEvidenceCatalog(bundle) {
  const catalog = [];
  const country = bundle.topCountries[0];
  const code = normalizeCountryCode(country?.countryCode ?? country?.country_code);
  const add = (item) => catalog.push(item);
  if (country) {
    add({
      evidenceId: "P-COUNTRY-001",
      category: "country",
      label: "\uC120\uD0DD \uAD6D\uAC00 \uCD94\uCC9C \uADFC\uAC70",
      value: `${safeText(country.countryName ?? country.country_name, UNKNOWN_TEXT2)} \xB7 ${safeText(country.label, UNKNOWN_TEXT2)} \xB7 ${safeText(country.totalScore ?? country.total_score, "-")}\uC810 \xB7 ${safeText(country.summary, UNKNOWN_TEXT2)}`,
      sourceName: "\uD504\uB85C\uADF8\uB7A8 \uAD6D\uAC00\uCD94\uCC9C",
      status: "available",
      referenceDate: ""
    });
    const amount = asPositiveNumber(country.customsExport12mUsd ?? country.customs_export_12m_usd);
    add({
      evidenceId: "P-CUSTOMS-001",
      category: "customs",
      label: "\uCD5C\uADFC 12\uAC1C\uC6D4 \uC218\uCD9C \uD750\uB984",
      value: amount ? formatUsd(amount) : asText(country.customsExportStatus ?? country.customs_export_status) === "empty" ? "\uC870\uD68C \uACB0\uACFC 0\uAC74" : UNKNOWN_TEXT2,
      sourceName: "\uAD00\uC138 \uC218\uCD9C\uC785 \uB370\uC774\uD130",
      status: amount ? "available" : "unknown",
      referenceDate: ""
    });
  }
  const addRows = (rows, prefix, category, label) => {
    rows.filter((row) => !code || !normalizeCountryCode(row.countryCode ?? row.country_code) || normalizeCountryCode(row.countryCode ?? row.country_code) === code).forEach((row, index) => add({
      evidenceId: `${prefix}-${String(index + 1).padStart(3, "0")}`,
      category,
      label,
      value: safeText(row.summary, UNKNOWN_TEXT2),
      sourceName: safeText(row.sourceOrg ?? row.source_org, "\uD504\uB85C\uADF8\uB7A8 API"),
      status: "available",
      referenceDate: safeText(row.referenceDate ?? row.reference_date, "")
    }));
  };
  addRows(bundle.certs, "P-CERT", "certification", "\uC778\uC99D \uC870\uD68C \uACB0\uACFC");
  addRows(bundle.regs, "P-REG", "regulation", "\uC218\uC785\uADDC\uC81C \uC870\uD68C \uACB0\uACFC");
  addRows(bundle.risks, "P-RISK", "risk", "K-SURE \uC704\uD5D8 \uC870\uD68C \uACB0\uACFC");
  addRows(bundle.decisionFacts, "P-FACT", "decision", "\uC758\uC0AC\uACB0\uC815 \uC0AC\uC2E4");
  bundle.safetyFlags.forEach((row, index) => add({
    evidenceId: `P-SAFETY-${String(index + 1).padStart(3, "0")}`,
    category: "safety",
    label: safeText(row.flagType ?? row.flag_type, "\uC548\uC804 \uD655\uC778"),
    value: safeText(row.summary, UNKNOWN_TEXT2),
    sourceName: "\uD504\uB85C\uADF8\uB7A8 \uC548\uC804 \uC870\uD68C",
    status: "check_required",
    referenceDate: ""
  }));
  bundle.decisionActions.forEach((row, index) => add({
    evidenceId: `P-ACTION-${String(index + 1).padStart(3, "0")}`,
    category: "action",
    label: safeText(row.title, "\uD504\uB85C\uADF8\uB7A8 \uAD8C\uC7A5 \uC791\uC5C5"),
    value: safeText(row.reason, UNKNOWN_TEXT2),
    sourceName: "\uD504\uB85C\uADF8\uB7A8 \uC758\uC0AC\uACB0\uC815",
    status: safeText(row.status, "pending"),
    referenceDate: ""
  }));
  bundle.apiLogs.forEach((row, index) => add({
    evidenceId: `P-API-${String(index + 1).padStart(3, "0")}`,
    category: "api",
    label: safeText(row.apiKeyName ?? row.api_key_name, "API \uC870\uD68C \uC0C1\uD0DC"),
    value: `\uC0C1\uD0DC ${safeText(row.status, "unknown")} \xB7 ${safeText(row.responseCount ?? row.response_count, "-")}\uAC74`,
    sourceName: "\uD504\uB85C\uADF8\uB7A8 API \uB85C\uADF8",
    status: safeText(row.status, "unknown"),
    referenceDate: ""
  }));
  if (!catalog.length) add({
    evidenceId: "P-STATUS-001",
    category: "status",
    label: "\uD504\uB85C\uADF8\uB7A8 \uADFC\uAC70 \uC0C1\uD0DC",
    value: "\uC120\uD0DD \uAD6D\uAC00 \uB610\uB294 API \uADFC\uAC70\uAC00 \uCDA9\uBD84\uD558\uC9C0 \uC54A\uC74C",
    sourceName: "\uD504\uB85C\uADF8\uB7A8",
    status: "unknown",
    referenceDate: ""
  });
  return catalog;
}
function buildEvidenceSnapshot(bundle) {
  return {
    cert: resolveEvidenceState(bundle.apiLogs, "kotra_overseas_certification", bundle.certs.length),
    regulation: resolveEvidenceState(bundle.apiLogs, "kotra_import_regulation", bundle.regs.length),
    payment: resolveEvidenceState(bundle.apiLogs, "ksure_export_payment", bundle.risks.filter((row) => asText(row.category).toLowerCase().includes("payment")).length)
  };
}
function resolveEvidenceState(logs, apiKey, rowCount) {
  const log = logs.find((item) => asText(item.apiKeyName ?? item.api_key_name) === apiKey);
  const status = asText(log?.status).toLowerCase();
  if (!status || ["idle", "loading", "stale", "error", "failed", "not_run"].includes(status)) return "not_run";
  return rowCount > 0 ? "available" : "unknown";
}
function buildRuleBasedDraft(bundle, catalog) {
  const country = bundle.topCountries[0];
  const countryName = safeText(country?.countryName ?? country?.country_name, UNKNOWN_TEXT2);
  const countryCode = safeText(country?.countryCode ?? country?.country_code, "-");
  const productName = safeText(bundle.product?.name, "\uD574\uB2F9 \uD488\uBAA9");
  const countryRef = findEvidenceRef(catalog, "country");
  const customsRef = findEvidenceRef(catalog, "customs");
  const certRef = findEvidenceRef(catalog, "certification");
  const regRef = findEvidenceRef(catalog, "regulation");
  const riskRef = findEvidenceRef(catalog, "risk");
  const primaryRef = countryRef || catalog[0].evidenceId;
  const refs = compactRefs([primaryRef, customsRef, certRef, regRef, riskRef, findEvidenceRef(catalog, "safety")]);
  const decisionGates = buildFallbackGates(bundle, catalog);
  const blocked = decisionGates.some((gate2) => gate2.status === "blocked");
  const unresolved = uniqueTexts(bundle.missingEvidence, ["\uACF5\uC2DD \uAD00\uC138\uC728\xB7\uD544\uC218 \uC778\uC99D \uC801\uC6A9\uC131\xB7\uB3C4\uCC29\uC6D0\uAC00\xB7\uBAA9\uD45C \uB9C8\uC9C4 \uD655\uC778 \uD544\uC694"]);
  return {
    schemaVersion: 2,
    decision: {
      verdict: country ? blocked ? "hold" : "conditional" : "hold",
      confidence: "low",
      headline: country ? `${countryName} \uC218\uCD9C\uC740 \uD575\uC2EC \uC870\uAC74 \uD655\uC778 \uD6C4 \uC81C\uD55C\uC801\uC73C\uB85C \uAC80\uC99D\uD558\uC138\uC694.` : "\uC120\uD0DD \uAD6D\uAC00 \uADFC\uAC70\uAC00 \uC5C6\uC5B4 \uC218\uCD9C \uD310\uB2E8\uC744 \uBCF4\uB958\uD569\uB2C8\uB2E4.",
      reason: "Gemini \uD310\uB2E8\uC744 \uC644\uB8CC\uD558\uC9C0 \uBABB\uD574 \uD504\uB85C\uADF8\uB7A8 API \uADFC\uAC70\uB9CC\uC73C\uB85C \uBCF4\uC218\uC801\uC778 \uC784\uC2DC \uACB0\uACFC\uB97C \uC0DD\uC131\uD588\uC2B5\uB2C8\uB2E4.",
      immediateActions: [{
        action: "\uC778\uC99D\xB7\uADDC\uC81C\xB7\uAD00\uC138\xB7\uBAA9\uD45C \uB9C8\uC9C4\uC744 \uD655\uC778\uD55C \uB4A4 \uC0D8\uD50C \uACAC\uC801 \uC9C4\uD589 \uC5EC\uBD80\uB97C \uACB0\uC815\uD558\uC138\uC694.",
        owner: "\uC218\uCD9C \uCC45\uC784\uC790",
        evidenceRefs: compactRefs([certRef, regRef, customsRef, primaryRef])
      }],
      evidenceRefs: refs
    },
    decisionReasons: [
      {
        type: "opportunity",
        title: "\uC120\uD0DD \uC2DC\uC7A5\uC758 \uAC80\uC99D \uAC00\uCE58",
        interpretation: asPositiveNumber(country?.customsExport12mUsd ?? country?.customs_export_12m_usd) ? `\uCD5C\uADFC 12\uAC1C\uC6D4 ${formatUsd(asPositiveNumber(country?.customsExport12mUsd ?? country?.customs_export_12m_usd))}\uC758 \uC218\uCD9C \uD750\uB984\uC740 \uAE30\uC874 \uAC70\uB798 \uAC00\uB2A5\uC131\uC744 \uD655\uC778\uD558\uB294 \uC2E0\uD638\uC785\uB2C8\uB2E4.` : "\uCD94\uCC9C \uC810\uC218\uB294 \uAC80\uD1A0 \uC6B0\uC120\uC21C\uC704 \uC2E0\uD638\uC774\uC9C0\uB9CC \uC2E4\uC81C \uC218\uC694\uB97C \uD655\uC815\uD558\uC9C0\uB294 \uC54A\uC2B5\uB2C8\uB2E4.",
        businessImpact: "\uB300\uADDC\uBAA8 \uD22C\uC790\uBCF4\uB2E4 \uB300\uD45C \uADDC\uACA9\uC758 \uC18C\uADDC\uBAA8 \uACAC\uC801\xB7\uC0D8\uD50C \uAC80\uC99D\uC774 \uC801\uD569\uD569\uB2C8\uB2E4.",
        evidenceRefs: compactRefs([customsRef, primaryRef])
      },
      {
        type: "risk",
        title: "\uACC4\uC57D \uC804 \uD655\uC778\uC774 \uD544\uC694\uD55C \uC870\uAC74",
        interpretation: "\uD604\uC7AC API \uACB0\uACFC\uB9CC\uC73C\uB85C \uC778\uC99D \uC801\uC6A9\uC131, \uC2E4\uC81C \uAD00\uC138, \uB3C4\uCC29\uC6D0\uAC00\uB97C \uD655\uC815\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.",
        businessImpact: "\uC870\uAC74 \uD655\uC778 \uC804 \uC591\uC0B0 \uACC4\uC57D\uC774\uB098 \uD68C\uC218 \uC704\uD5D8\uC774 \uD070 \uACB0\uC81C\uC870\uAC74\uC744 \uD655\uC815\uD558\uBA74 \uC548 \uB429\uB2C8\uB2E4.",
        evidenceRefs: compactRefs([certRef, regRef, riskRef, primaryRef])
      }
    ],
    entryStrategy: {
      countryCode,
      countryName,
      targetBuyer: "\uC81C\uD488 \uADDC\uACA9\uACFC \uC778\uC99D \uC694\uAD6C\uC0AC\uD56D\uC744 \uBB38\uC11C\uB85C \uD68C\uC2E0\uD560 \uC218 \uC788\uB294 \uC804\uBB38 \uC218\uC785\xB7\uC720\uD1B5 \uBC14\uC774\uC5B4",
      primaryChannel: "KOTRA\xB7\uACF5\uC2DD \uBB34\uC5ED\uC9C0\uC6D0\uAE30\uAD00\uC744 \uD1B5\uD55C \uBC14\uC774\uC5B4 \uAC80\uC99D \uD6C4 \uC0D8\uD50C \uACAC\uC801",
      initialProducts: `${productName} \uB300\uD45C \uADDC\uACA9 1~2\uC885`,
      positioning: "\uADDC\uACA9 \uC77C\uCE58, \uBB38\uC11C \uB300\uC751, \uACF5\uAE09 \uC548\uC815\uC131\uC744 \uC911\uC2EC\uC73C\uB85C \uC81C\uC548",
      paymentTerms: riskRef ? "\uCD08\uAE30 \uAC70\uB798\uB294 \uC120\uAE08\xB7\uBD84\uD560\uC9C0\uAE09\xB7\uC2E0\uC6A9\uC7A5 \uB4F1 \uD68C\uC218 \uC548\uC804 \uC870\uAC74 \uC6B0\uC120" : "K-SURE \uC704\uD5D8 \uD655\uC778 \uC804 \uC678\uC0C1\uAC70\uB798 \uBCF4\uB958",
      pilotScope: "\uBC14\uC774\uC5B4 3~5\uACF3 \uC778\uD130\uBDF0, \uB300\uD45C \uADDC\uACA9 \uC0D8\uD50C 1\uD68C, \uB3C4\uCC29\uC6D0\uAC00\uC640 \uC778\uC99D\uBE44\uC6A9 \uC0B0\uC815",
      expansionCondition: "\uD544\uC218 \uC778\uC99D\xB7\uADDC\uC81C \uD1B5\uACFC, \uBAA9\uD45C \uB9C8\uC9C4 \uCDA9\uC871, \uBC14\uC774\uC5B4 \uACB0\uC81C\uC870\uAC74 \uC2B9\uC778 \uD6C4 \uD655\uB300",
      evidenceRefs: refs
    },
    decisionGates,
    actionPlan: buildFallbackActionPlan(countryName, refs),
    officialResearch: { summary: "Gemini \uACF5\uC2DD\uC790\uB8CC \uAC80\uC0C9\uC774 \uC644\uB8CC\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.", keyFindings: [], queries: [], sources: [], conflicts: [] },
    assumptions: ["\uC120\uD0DD \uAD6D\uAC00 \uD55C \uACF3\uACFC \uD604\uC7AC HS/HSK\uB97C \uAE30\uC900\uC73C\uB85C \uD310\uB2E8\uD568", "\uCD94\uCC9C \uC810\uC218\uB294 \uC2E4\uC81C \uC218\uC694\uB098 \uACC4\uC57D \uAC00\uB2A5\uC131\uC744 \uBCF4\uC7A5\uD558\uC9C0 \uC54A\uC74C"],
    unresolvedItems: unresolved,
    stopConditions: decisionGates.map((gate2) => ({
      condition: gate2.stopCondition,
      response: gate2.status === "blocked" ? "\uC989\uC2DC \uBCF4\uB958\uD558\uACE0 \uACF5\uC2DD\uAE30\uAD00 \uD655\uC778" : "\uC870\uAC74 \uD655\uC778 \uC804 \uACC4\uC57D\xB7\uC591\uC0B0 \uBCF4\uB958",
      evidenceRefs: gate2.evidenceRefs
    })),
    disclaimer: REPORT_DISCLAIMER
  };
}
function buildFallbackGates(bundle, catalog) {
  const base = catalog[0]?.evidenceId ?? "P-STATUS-001";
  const ref = (category) => findEvidenceRef(catalog, category) || base;
  const blockedSafety = bundle.safetyFlags.some((flag) => /금지|차단|수출\s*불가|prohibit|blocked/i.test(`${asText(flag.flagType ?? flag.flag_type)} ${asText(flag.summary)}`));
  return [
    gate("certification", "check_required", "\uC81C\uD488\uBCC4 \uC778\uC99D \uC801\uC6A9\uC131 \uD655\uC778 \uD544\uC694", "\uACF5\uC2DD \uC778\uC99D\uAE30\uAD00\uC5D0 \uC801\uC6A9 \uC5EC\uBD80\uC640 \uBE44\uC6A9 \uD655\uC778", "\uC778\uC99D \uB2F4\uB2F9", "D+7", "\uD544\uC218 \uC778\uC99D \uCDE8\uB4DD \uBD88\uAC00 \uB610\uB294 \uBE44\uC6A9\uC774 \uBAA9\uD45C \uC6D0\uAC00 \uCD08\uACFC", ref("certification")),
    gate("regulation", "check_required", "\uC218\uC785\uADDC\uC81C \uC801\uC6A9 \uBC94\uC704 \uD655\uC778 \uD544\uC694", "\uAD00\uD560 \uAE30\uAD00 \uC6D0\uBB38\uC5D0\uC11C \uC2DC\uD589\uC77C\uACFC \uBC94\uC704 \uD655\uC778", "\uD1B5\uAD00 \uB2F4\uB2F9", "D+7", "\uC218\uC785 \uAE08\uC9C0 \uB610\uB294 \uC218\uC6A9 \uBD88\uAC00\uB2A5\uD55C \uC81C\uD55C \uD655\uC778", ref("regulation")),
    gate("tariff", "check_required", "\uC2E4\uC81C \uC801\uC6A9 \uAD00\uC138\uC640 \uCD94\uAC00\uAD00\uC138 \uBBF8\uD655\uC815", "\uAE30\uBCF8\xB7\uCD94\uAC00\uAD00\uC138\uC640 \uBB34\uC5ED\uAD6C\uC81C\uC870\uCE58 \uD655\uC778", "\uAD00\uC138 \uB2F4\uB2F9", "D+7", "\uCD1D \uAD00\uC138 \uBC18\uC601 \uD6C4 \uBAA9\uD45C \uB9C8\uC9C4 \uBBF8\uB2EC", ref("customs")),
    gate("profitability", "check_required", "\uB3C4\uCC29\uC6D0\uAC00\uC640 \uBAA9\uD45C \uB9C8\uC9C4 \uBBF8\uD655\uC815", "\uBB3C\uB958\xB7\uBCF4\uD5D8\xB7\uC778\uC99D\xB7\uAD00\uC138 \uD3EC\uD568 \uC6D0\uAC00\uD45C \uC791\uC131", "\uC7AC\uBB34 \uB2F4\uB2F9", "D+30", "\uBCF4\uC218 \uC2DC\uB098\uB9AC\uC624\uC5D0\uC11C \uBAA9\uD45C \uACF5\uD5CC\uC774\uC775 \uBBF8\uB2EC", ref("customs")),
    gate("payment", "check_required", "\uACB0\uC81C\uC704\uD5D8\uC744 \uAC70\uB798\uC870\uAC74\uC5D0 \uBC18\uC601\uD574\uC57C \uD568", "\uBC14\uC774\uC5B4 \uC2E0\uC6A9\uACFC \uC120\uAE08\xB7LC \uC870\uAC74 \uD655\uC815", "\uC601\uC5C5 \uB2F4\uB2F9", "D+30", "\uD68C\uC218 \uC548\uC804\uC7A5\uCE58 \uC5C6\uC774 \uC678\uC0C1\uAC70\uB798\uB9CC \uC694\uAD6C", ref("risk")),
    gate("safety", blockedSafety ? "blocked" : "check_required", blockedSafety ? "\uC548\uC804\xB7\uC804\uB7B5\uBB3C\uC790 \uCC28\uB2E8 \uAC00\uB2A5\uC131 \uD655\uC778" : "\uC548\uC804\xB7\uC804\uB7B5\uBB3C\uC790 \uCD5C\uC885 \uD310\uC815 \uBBF8\uD655\uC815", "\uACF5\uC2DD \uD310\uC815\xB7\uC2DC\uD5D8\xB7\uB77C\uBCA8 \uD655\uC778", "\uC548\uC804 \uB2F4\uB2F9", "D+7", "\uC218\uCD9C\uD1B5\uC81C \uB610\uB294 \uC548\uC804\uC694\uAC74 \uCDA9\uC871 \uBD88\uAC00", ref("safety"))
  ];
}
function gate(topic, status, decision, requiredAction, owner, due, stopCondition, ref) {
  return { topic, status, decision, requiredAction, owner, due, stopCondition, evidenceRefs: [ref] };
}
function buildFallbackActionPlan(countryName, refs) {
  return [
    { horizon: "D+7", owner: "HS\xB7\uC778\uC99D \uB2F4\uB2F9", action: "HS/HSK\uC640 \uC778\uC99D\xB7\uADDC\uC81C\xB7\uAD00\uC138 \uC801\uC6A9\uC131\uC744 \uACF5\uC2DD\uAE30\uAD00\uC5D0 \uD655\uC778", deliverable: "\uADFC\uAC70 URL\xB7\uC870\uD68C\uC77C\uC774 \uD3EC\uD568\uB41C \uD655\uC778\uD45C", passCriteria: "\uD544\uC218 \uC694\uAC74\uACFC \uCD94\uAC00 \uBE44\uC6A9 \uD56D\uBAA9 \uD655\uC815", evidenceRefs: refs },
    { horizon: "D+30", owner: "\uC601\uC5C5\xB7\uC7AC\uBB34 \uB2F4\uB2F9", action: `${countryName} \uBC14\uC774\uC5B4 3~5\uACF3\uC5D0 \uB300\uD45C \uADDC\uACA9 \uACAC\uC801\uACFC \uAC70\uB798\uC870\uAC74 \uAC80\uC99D`, deliverable: "\uD53C\uB4DC\uBC31\xB7\uB3C4\uCC29\uC6D0\uAC00\xB7\uACB0\uC81C\uC870\uAC74 \uBE44\uAD50\uD45C", passCriteria: "\uBAA9\uD45C \uB9C8\uC9C4\uACFC \uD68C\uC218 \uC870\uAC74\uC744 \uCDA9\uC871\uD558\uB294 \uBC14\uC774\uC5B4 1\uACF3 \uC774\uC0C1", evidenceRefs: refs },
    { horizon: "D+90", owner: "\uC218\uCD9C \uCC45\uC784\uC790", action: "\uC0D8\uD50C \uACB0\uACFC\uC640 \uBAA8\uB4E0 \uAC8C\uC774\uD2B8\uB97C \uC7AC\uAC80\uD1A0\uD574 \uD655\uB300\xB7\uC911\uB2E8 \uACB0\uC815", deliverable: "\uD30C\uC77C\uB7FF \uACB0\uACFC \uBC0F Go/No-Go \uD68C\uC758\uB85D", passCriteria: "\uCC28\uB2E8 \uAC8C\uC774\uD2B8 0\uAC74, \uD575\uC2EC \uD655\uC778 \uD574\uC18C, \uD30C\uC77C\uB7FF \uD488\uC9C8 \uC2B9\uC778", evidenceRefs: refs }
  ];
}
function normalizeDraft(input, bundle, catalog) {
  const data = asRecord2(asRecord2(input).draft ?? input);
  const fallback = buildRuleBasedDraft(bundle, catalog);
  const researchRow = asRecord2(data.officialResearch);
  const sources = normalizeOfficialSources(researchRow.sources);
  const allowed = /* @__PURE__ */ new Set([...catalog.map((item) => item.evidenceId), ...sources.map((item) => item.evidenceId)]);
  const defaultRefs = [catalog[0]?.evidenceId].filter(Boolean);
  const linkIssues = countMissingEvidenceLinks(data);
  const decisionRow = asRecord2(data.decision);
  const rawVerdict = safeText(decisionRow.verdict, fallback.decision.verdict).toLowerCase();
  const rawConfidence = safeText(decisionRow.confidence, fallback.decision.confidence).toLowerCase();
  const immediateActions = asArray(decisionRow.immediateActions).map((item) => {
    const row = asRecord2(item);
    const action = safeText(row.action, "");
    return action ? {
      action,
      owner: safeText(row.owner, "\uC218\uCD9C \uCC45\uC784\uC790"),
      evidenceRefs: normalizeRefs(row.evidenceRefs, allowed, defaultRefs)
    } : null;
  }).filter((item) => Boolean(item));
  const decision = {
    verdict: rawVerdict === "proceed" || rawVerdict === "hold" ? rawVerdict : "conditional",
    confidence: rawConfidence === "high" || rawConfidence === "low" ? rawConfidence : "medium",
    headline: safeText(decisionRow.headline, fallback.decision.headline),
    reason: safeText(decisionRow.reason, fallback.decision.reason),
    immediateActions: immediateActions.length ? immediateActions.slice(0, 3) : fallback.decision.immediateActions,
    evidenceRefs: normalizeRefs(decisionRow.evidenceRefs, allowed, fallback.decision.evidenceRefs)
  };
  const reasons = asArray(data.decisionReasons).map((item) => {
    const row = asRecord2(item);
    const interpretation = safeText(row.interpretation, "");
    if (!interpretation) return null;
    return {
      type: safeText(row.type, "risk").toLowerCase() === "opportunity" ? "opportunity" : "risk",
      title: safeText(row.title, "AI \uD310\uB2E8 \uADFC\uAC70"),
      interpretation,
      businessImpact: safeText(row.businessImpact, "\uC2E4\uD589 \uC6B0\uC120\uC21C\uC704\uC5D0 \uBC18\uC601"),
      evidenceRefs: normalizeRefs(row.evidenceRefs, allowed, defaultRefs)
    };
  }).filter((item) => Boolean(item));
  const entryRow = asRecord2(data.entryStrategy);
  const selected = bundle.topCountries[0];
  const entryStrategy = {
    countryCode: safeText(selected?.countryCode ?? selected?.country_code, fallback.entryStrategy.countryCode),
    countryName: safeText(selected?.countryName ?? selected?.country_name, fallback.entryStrategy.countryName),
    targetBuyer: safeText(entryRow.targetBuyer, fallback.entryStrategy.targetBuyer),
    primaryChannel: safeText(entryRow.primaryChannel, fallback.entryStrategy.primaryChannel),
    initialProducts: safeText(entryRow.initialProducts, fallback.entryStrategy.initialProducts),
    positioning: safeText(entryRow.positioning, fallback.entryStrategy.positioning),
    paymentTerms: safeText(entryRow.paymentTerms, fallback.entryStrategy.paymentTerms),
    pilotScope: safeText(entryRow.pilotScope, fallback.entryStrategy.pilotScope),
    expansionCondition: safeText(entryRow.expansionCondition, fallback.entryStrategy.expansionCondition),
    evidenceRefs: normalizeRefs(entryRow.evidenceRefs, allowed, fallback.entryStrategy.evidenceRefs)
  };
  const gateMap = /* @__PURE__ */ new Map();
  asArray(data.decisionGates).forEach((item) => {
    const row = asRecord2(item);
    const topic = normalizeGateTopic(row.topic);
    if (!topic || gateMap.has(topic)) return;
    const base = fallback.decisionGates.find((gateItem) => gateItem.topic === topic);
    const rawStatus = safeText(row.status, base.status).toLowerCase();
    const status = rawStatus === "clear" || rawStatus === "blocked" ? rawStatus : "check_required";
    gateMap.set(topic, {
      topic,
      status,
      decision: safeText(row.decision, base.decision),
      requiredAction: safeText(row.requiredAction, base.requiredAction),
      owner: safeText(row.owner, base.owner),
      due: safeText(row.due, base.due),
      stopCondition: safeText(row.stopCondition, base.stopCondition),
      evidenceRefs: normalizeRefs(row.evidenceRefs, allowed, base.evidenceRefs)
    });
  });
  const decisionGates = GATE_TOPICS.map((topic) => gateMap.get(topic) ?? fallback.decisionGates.find((item) => item.topic === topic));
  const actionRows = asArray(data.actionPlan).map((item) => {
    const row = asRecord2(item);
    const horizon = normalizeHorizon(row.horizon);
    const action = safeText(row.action, "");
    if (!horizon || !action) return null;
    return {
      horizon,
      owner: safeText(row.owner, "\uC218\uCD9C \uCC45\uC784\uC790"),
      action,
      deliverable: safeText(row.deliverable, `${horizon} \uC0B0\uCD9C\uBB3C`),
      passCriteria: safeText(row.passCriteria, "\uB2F4\uB2F9\uC790 \uAC80\uD1A0 \uC644\uB8CC"),
      evidenceRefs: normalizeRefs(row.evidenceRefs, allowed, defaultRefs)
    };
  }).filter((item) => Boolean(item));
  const actionPlan = ["D+7", "D+30", "D+90"].flatMap((horizon) => {
    const matches = actionRows.filter((item) => item.horizon === horizon);
    return matches.length ? matches : fallback.actionPlan.filter((item) => item.horizon === horizon);
  }).slice(0, 9);
  const findings = asArray(researchRow.keyFindings).map((item) => {
    const row = asRecord2(item);
    const finding = safeText(row.finding ?? row.summary, typeof item === "string" ? item : "");
    return finding ? { finding, evidenceRefs: normalizeRefs(row.evidenceRefs, allowed, sources[0] ? [sources[0].evidenceId] : []) } : null;
  }).filter((item) => Boolean(item));
  const conflicts = normalizeTextArray(researchRow.conflicts);
  const unresolvedItems = uniqueTexts([...normalizeTextArray(data.unresolvedItems), ...bundle.missingEvidence]);
  const stopConditions = asArray(data.stopConditions).map((item) => {
    const row = asRecord2(item);
    const condition = safeText(row.condition, typeof item === "string" ? item : "");
    return condition ? {
      condition,
      response: safeText(row.response, "\uC870\uAC74 \uD574\uC18C \uC804 \uC9C4\uD589 \uBCF4\uB958"),
      evidenceRefs: normalizeRefs(row.evidenceRefs, allowed, defaultRefs)
    } : null;
  }).filter((item) => Boolean(item));
  if (decisionGates.some((gate2) => gate2.status === "blocked")) decision.verdict = "hold";
  else if (decision.verdict === "proceed" && decisionGates.some((gate2) => gate2.status === "check_required")) decision.verdict = "conditional";
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
      summary: safeText(researchRow.summary, sources.length ? "\uACF5\uC2DD \uC6F9 \uADFC\uAC70\uB97C \uD655\uC778\uD588\uC2B5\uB2C8\uB2E4." : fallback.officialResearch.summary),
      keyFindings: findings,
      queries: normalizeTextArray(researchRow.queries),
      sources,
      conflicts
    },
    assumptions: normalizeTextArray(data.assumptions, fallback.assumptions),
    unresolvedItems,
    stopConditions: stopConditions.length ? stopConditions.slice(0, 8) : fallback.stopConditions,
    disclaimer: safeText(data.disclaimer, REPORT_DISCLAIMER)
  };
}
function normalizeOfficialSources(value) {
  return asArray(value).map((item, index) => {
    const row = asRecord2(item);
    const url = asText(row.url ?? row.uri);
    const title = safeText(row.title, url);
    if (!/^https?:\/\//i.test(url) || !isOfficialWebSource(title, url)) return null;
    return {
      evidenceId: /^W-\d{3}$/i.test(asText(row.evidenceId)) ? asText(row.evidenceId).toUpperCase() : `W-${String(index + 1).padStart(3, "0")}`,
      title,
      url,
      organization: safeText(row.organization, inferOrganization(title, url)),
      publishedAt: safeText(row.publishedAt, ""),
      accessedAt: safeText(row.accessedAt, (/* @__PURE__ */ new Date()).toISOString().slice(0, 10))
    };
  }).filter((item) => Boolean(item));
}
function countMissingEvidenceLinks(source) {
  let count = 0;
  const inspect = (value) => {
    const row = asRecord2(value);
    if (Object.keys(row).length && asArray(row.evidenceRefs).length === 0) count += 1;
  };
  inspect(source.decision);
  asArray(asRecord2(source.decision).immediateActions).forEach(inspect);
  asArray(source.decisionReasons).forEach(inspect);
  inspect(source.entryStrategy);
  asArray(source.decisionGates).forEach(inspect);
  asArray(source.actionPlan).forEach(inspect);
  asArray(source.stopConditions).forEach(inspect);
  return count;
}
function normalizeRefs(value, allowed, fallback) {
  const refs = uniqueTexts(asArray(value).map(asText)).filter((ref) => allowed.has(ref));
  return refs.length ? refs : fallback.filter((ref) => allowed.has(ref));
}
function findEvidenceRef(catalog, category) {
  return catalog.find((item) => item.category === category)?.evidenceId ?? "";
}
function compactRefs(values) {
  return uniqueTexts(values.filter((value) => Boolean(value)));
}
function downgradeConfidence(confidence, issueCount) {
  if (!issueCount) return confidence;
  const levels = ["low", "medium", "high"];
  return levels[Math.max(0, levels.indexOf(confidence) - Math.min(2, issueCount))];
}
function normalizeGateTopic(value) {
  const text = asText(value).toLowerCase();
  return GATE_TOPICS.includes(text) ? text : null;
}
function normalizeHorizon(value) {
  const text = asText(value).toUpperCase().replace(/\s/g, "");
  if (["D+7", "7", "7D"].includes(text)) return "D+7";
  if (["D+30", "30", "30D"].includes(text)) return "D+30";
  if (["D+90", "90", "90D"].includes(text)) return "D+90";
  return null;
}
function normalizeCountryCode(value) {
  return asText(value).trim().toUpperCase();
}
function normalizeTextArray(value, fallback = []) {
  return uniqueTexts(asArray(value).map(asText), fallback);
}
function uniqueTexts(values, fallback = []) {
  const seen = /* @__PURE__ */ new Set();
  const output = [];
  for (const value of values) {
    const text = asText(value);
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    output.push(text);
  }
  return output.length ? output : fallback;
}
function parseJsonObject(value) {
  const cleaned = value.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(cleaned);
  return asRecord2(parsed);
}
function buildAiDiagnostics() {
  return {
    provider: "gemini",
    model: GEMINI_REPORT_MODEL,
    pipeline: "official_research_then_structured_decision",
    official_source_policy: true
  };
}
async function fetchWithTimeout(input, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
function toErrorMessage(value) {
  if (value instanceof Error) return value.message;
  return asText(value) || "unknown";
}
function safeText(value, fallback) {
  const text = asText(value);
  return text || fallback;
}
function asNullableRecord(value) {
  const row = asRecord2(value);
  return Object.keys(row).length ? row : null;
}
function asRecord2(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function asArray(value) {
  return Array.isArray(value) ? value : [];
}
function asText(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}
function asPositiveNumber(value) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}
function formatUsd(value) {
  if (value >= 1e9) return `$${trimFixed(value / 1e9)}B`;
  if (value >= 1e6) return `$${trimFixed(value / 1e6)}M`;
  if (value >= 1e3) return `$${trimFixed(value / 1e3)}K`;
  return `$${Math.round(value).toLocaleString("en-US")}`;
}
function trimFixed(value) {
  return value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2).replace(/\.0+$|(?<=\.\d)0+$/, "");
}
function json2(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
