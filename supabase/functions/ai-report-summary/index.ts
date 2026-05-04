import { corsHeaders } from "../_shared/cors.ts";
import { requireAuthenticatedUser } from "../_shared/auth.ts";
import {
  buildAvailableEntryStrategy,
  buildEmptyEntryStrategy,
  buildFailedEntryStrategy,
  normalizeEntryStrategyItems,
  resolveEntryStrategySearchTerm,
  selectLatestEntryStrategy,
  type KotraEntryStrategyEvidence,
} from "../_shared/kotra-entry-strategy.ts";

const UNKNOWN_TEXT = "확실한 정보 없음";
const AI_TIMEOUT_MS = 110000;
const GEMINI_REPORT_MODEL = "gemini-3.1-pro-preview";
const GEMINI_NEWS_ARTICLE_BODY_MAX_CHARS = 12000;
const KOTRA_ENTRY_STRATEGY_ENDPOINT = "https://apis.data.go.kr/B410001/entryStrategy/entryStrategy";
const NEWS_IMPACT_SOURCE_TYPES = new Set(["product_evidence", "country_background", "news"]);
const GEMINI_NEWS_BODY_ANALYSIS_PENDING_TEXT =
  "Gemini 뉴스 본문 분석 미생성 — Step3 뉴스 본문은 리포트 근거에 포함되었지만 Gemini 분석 결과가 아직 생성되지 않았습니다. Step6에서 AI 요약 생성을 다시 실행하세요.";
const COUNTRY_CAUTION_SECTION_ORDER: CountryCautionSectionKind[] = [
  "certification",
  "regulation",
  "ksure_country_risk",
  "ksure_industry_risk",
  "ksure_payment",
];
const COUNTRY_CAUTION_SECTION_TITLES: Record<CountryCautionSectionKind, string> = {
  certification: "인증",
  regulation: "규제",
  ksure_country_risk: "K-SURE 국가위험",
  ksure_industry_risk: "K-SURE 업종위험",
  ksure_payment: "K-SURE 수출결제",
};

type EvidenceState = "available" | "unknown" | "not_run";
type AiProvider = "gemini" | "none";

interface ReportDraft {
  executiveSummary: string;
  exportFeasibility: string;
  topCountryReason: string;
  countryStrategies: CountryStrategy[];
  countryCautionAnalysisStatus: CountryCautionAnalysisStatus;
  countryCautionAnalyses: CountryCautionAnalysis[];
  preExportChecklist: string[];
  actionPlan7Days: string[];
  actionPlan30Days: string[];
  actionPlan90Days: string[];
  unresolvedItems: string[];
  finalCautions: string[];
}

type CountryCautionAnalysisStatus = "generated" | "not_generated";
type CountryCautionSectionKind =
  | "certification"
  | "regulation"
  | "ksure_country_risk"
  | "ksure_industry_risk"
  | "ksure_payment";

interface CountryCautionFact {
  label: string;
  value: string;
  meaning: string;
}

interface CountryCautionSection {
  kind: CountryCautionSectionKind;
  title: string;
  facts: CountryCautionFact[];
  interpretation: string;
}

interface CountryCautionAnalysis {
  countryCode: string;
  countryName: string;
  coreSummary: string;
  sections: CountryCautionSection[];
}

interface CountryStrategy {
  countryCode: string;
  countryName: string;
  feasibilityGrade: "go" | "conditional" | "hold";
  position: string;
  entryMode: string;
  entryStrategy: string;
  requiredChecks: string[];
  certRegChecklist: string[];
  paymentRiskAssessment: string;
  riskResponse: string;
  evidenceLimits: string[];
  evidenceRefs: string[];
  newsImpactAnalysis: string;
  marketOpportunity: string;
  kotraEntryStrategy?: KotraEntryStrategyEvidence;
}

interface EvidenceBundle {
  company: Record<string, unknown> | null;
  product: Record<string, unknown> | null;
  topCountries: Record<string, unknown>[];
  certs: Record<string, unknown>[];
  regs: Record<string, unknown>[];
  risks: Record<string, unknown>[];
  safetyFlags: Record<string, unknown>[];
  apiLogs: Record<string, unknown>[];
  missingEvidence: string[];
  entryStrategies: Record<string, unknown>[];
}

type CustomsExportStatus = "available" | "empty";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authResult = await requireAuthenticatedUser(req, corsHeaders);
    if (!authResult.ok) return authResult.response;

    const body = await req.json();
    const baseEvidenceBundle = normalizeEvidenceBundle(body);
    const evidenceBundle: EvidenceBundle = {
      ...baseEvidenceBundle,
      entryStrategies: await fetchKotraEntryStrategies(baseEvidenceBundle.topCountries, baseEvidenceBundle.product),
    };
    const evidence = buildEvidenceSnapshot(evidenceBundle);
    const diagnosticsBase = buildAiDiagnostics();

    const systemPrompt = [
      // 역할 정의
      "You are a senior export strategy consultant for Korean manufacturers.",
      "Your task is NOT to summarize data — it is to ANALYZE the collected evidence and produce actionable strategic insights.",
      "For every country, answer three core questions: (1) '이 국가에 수출해도 되는가?', (2) '어떤 리스크를 조심해야 하는가?', (3) '다음에 무엇을 해야 하는가?'",
      "",
      // 출력 규칙
      "Return strict JSON only. All text must be in Korean.",
      "Use only facts present in the input JSON. Do not invent certification names, regulations, sanctions, tariffs, buyer facts, or market statistics.",
      "For certification and regulation sections, use only rows present in certs/regs for the same countryCode. If that array has no row for the country, report 0건 or UNKNOWN_TEXT and do not name any certification or regulation.",
      `If evidence is missing, use the exact phrase '${UNKNOWN_TEXT}'.`,
      "Do not make final legal, strategic-material, certification, product-safety, or regulatory suitability judgments.",
      "Expose failed, missing, or zero-result API items in unresolvedItems.",
      "",
      // 깊이 있는 분석 지시
      "CRITICAL: executiveSummary must be at least 150 characters — provide a strategic overview covering product characteristics, top candidate rationale, key risks, and recommended next steps. Do NOT write a single generic sentence.",
      "CRITICAL: entryStrategy for each country must be at least 100 characters — include concrete entry methods (sample export, distributor search, trade fair, trade office consultation), timeline considerations, and competitive positioning.",
      "CRITICAL: exportFeasibility must synthesize ALL collected data (scores, certs, regs, risks, safety flags, news) into a coherent feasibility narrative for ALL candidate countries.",
      "CUSTOMS EXPORT SIGNAL: If a country has customsExport12mUsd, interpret it as recent 12-month HS/HSK export-flow evidence. Use it as a market validation signal, not as a guarantee of demand.",
      "",
      // 뉴스 영향 분석 지시
      "NEWS IMPACT ANALYSIS: For each country in topCountries, examine the 'evidenceSources' array. Only use actual news sources: sourceType must be 'product_evidence', 'country_background', or 'news', or the source must have Step3 news metadata such as newsCategory/newsScope/impactSummary/articleBody/article_body. Ignore recommendation metadata such as market_profile, detail_deferred, and export_region_rank.",
      "뉴스 영향 분석은 목록 금지. Do not write '관련 뉴스 N건 확인', do not list titles, and do not concatenate summaries. Read articleBody/article_body first, then write a 종합 판단문 in exactly three labeled blocks.",
      "Each country's newsImpactAnalysis must use this exact label order and punctuation: '핵심 판단: ... 영향 근거: ... 실행 대응: ...'. Do not add bullet markers before labels.",
      "핵심 판단은 2문장으로 작성한다: 첫 문장은 진입 강도, 우선 채널, 포지셔닝 결론을 제시하고, 둘째 문장은 초기 투자 수준과 검증 순서를 제시한다.",
      "영향 근거는 3~5문장으로 작성한다: articleBody/article_body에서 확인 가능한 시장 수요, 소비 변화, 정책·규제, 산업 구조, 공급망·물류, 경기·환율·결제 리스크 신호를 구분해 설명한다.",
      "실행 대응은 4~6개 구체 조치로 작성한다: 제품 라인업, 가격대, 채널, 마케팅 메시지, 물류, CS, 바이어 신용, 결제조건 중 해당 국가와 제품에 실제로 필요한 조치를 우선순위대로 제시한다.",
      "For each country's newsImpactAnalysis, explicitly cover 시장 기회, 예상 리스크, 소비·산업·정책 변화가 수출에 미치는 영향, 진입 전략 및 주의할 점, and 해당 제품을 수출할 때 고려해야 할 실질적인 대응 방향. Make the analysis specific enough that a user can convert it into an action checklist without rereading the source article.",
      "If eligible news exists but articleBody/article_body is missing, use summary/impactSummary only as secondary evidence and state that Step3 news generation should be rerun for full-body analysis. If neither direct nor background news exists, write '대상국 일치 직접 뉴스 근거 없음 — 관련 뉴스 모니터링 필요'.",
      "Do not use news evidence for a country if the source country does not match. Put that limitation in evidenceLimits.",
      "",
      // 시장 기회 분석 지시
      "MARKET OPPORTUNITY: For each country, write a 'marketOpportunity' field summarizing why this market is attractive for the specific product, based on the recommendation score, available evidence, and any relevant news. If insufficient data, state what additional information is needed.",
      "If customsExportStatus is 'empty' or missing, explicitly state that recent 12-month customs export evidence is unavailable instead of inventing export volume.",
      "",
      // 국가별 유의사항 AI 분석 카드
      "COUNTRY CAUTION ANALYSIS: Always generate countryCautionAnalysisStatus='generated' and countryCautionAnalyses for every topCountries item when the Gemini call succeeds.",
      "countryCautionAnalyses must not be a raw data dump. Transform the evidence into export-decision guidance with term explanations, numeric interpretation, and practical response direction.",
      "Each countryCautionAnalysis must include coreSummary and exactly five sections in this order: certification, regulation, ksure_country_risk, ksure_industry_risk, ksure_payment.",
      "Each section must include facts with label, value, and meaning. Put easy Korean explanations in meaning parentheses-ready text. Explain these labels when present: Grade, Risk Index, Late rate, Avg payment period, Avg late period, Top term, O/A(T/T 포함).",
      "Use K-SURE raw fields when available: eval_grade/evalGrd, eval_date/evalDd, risk_index/riskIdx, late_payment_rate, average_payment_period, average_late_payment_period, top_payment_term_name, top_payment_term_share, and summary.",
      "위험 없음 금지: If a certification, regulation, country risk, industry risk, or payment field is missing, do not interpret it as no risk. Write '확인 가능한 데이터가 부족하므로 추가 검증 필요'.",
      "Different countries must have different interpretations based on actual values. A higher Late rate or longer Avg payment period must lead to stricter payment-condition guidance than a lower value.",
      "Do not set countryCautionAnalysisStatus='not_generated' merely because evidence is missing. Missing evidence still requires a generated section that says '확인 가능한 데이터가 부족하므로 추가 검증 필요'. The server uses not_generated only when the provider call fails or the JSON is invalid.",
      "",
      // Feasibility 판정
      "For each country, assign feasibilityGrade: 'go' (all key data available + low risk), 'conditional' (partial data or medium risk), or 'hold' (critical data missing or high risk).",
      // JSON 스키마
      `Schema: {"executiveSummary":"...","exportFeasibility":"...","topCountryReason":"...","countryStrategies":[{"countryCode":"...","countryName":"...","feasibilityGrade":"go|conditional|hold","position":"...","entryMode":"...","entryStrategy":"...","requiredChecks":["..."],"certRegChecklist":["..."],"paymentRiskAssessment":"...","riskResponse":"...","evidenceLimits":["..."],"evidenceRefs":["..."],"newsImpactAnalysis":"...","marketOpportunity":"..."}],"countryCautionAnalysisStatus":"generated|not_generated","countryCautionAnalyses":[{"countryCode":"...","countryName":"...","coreSummary":"...","sections":[{"kind":"certification","title":"인증","facts":[{"label":"...","value":"...","meaning":"..."}],"interpretation":"..."},{"kind":"regulation","title":"규제","facts":[{"label":"...","value":"...","meaning":"..."}],"interpretation":"..."},{"kind":"ksure_country_risk","title":"K-SURE 국가위험","facts":[{"label":"Grade","value":"...","meaning":"국가의 정치·경제·대외 지급 위험 수준을 나타내며 숫자가 낮을수록 상대적으로 안정적이라는 의미"}],"interpretation":"..."},{"kind":"ksure_industry_risk","title":"K-SURE 업종위험","facts":[{"label":"Risk Index","value":"...","meaning":"해당 업종에서 결제 지연, 부실 가능성, 업황 변동 등이 발생할 수 있는 정도"}],"interpretation":"..."},{"kind":"ksure_payment","title":"K-SURE 수출결제","facts":[{"label":"Late rate","value":"...","meaning":"전체 거래 중 결제가 지연된 비율"},{"label":"Avg payment period","value":"...","meaning":"평균적으로 결제까지 걸리는 기간"},{"label":"Avg late period","value":"...","meaning":"결제가 늦어졌을 때 평균적으로 지연되는 기간"},{"label":"Top term","value":"...","meaning":"가장 많이 사용된 결제 방식"}],"interpretation":"..."}]}],"preExportChecklist":["..."],"actionPlan7Days":["..."],"actionPlan30Days":["..."],"actionPlan90Days":["..."],"unresolvedItems":["..."],"finalCautions":["..."]}.`,
      "",
      // 필드별 상세 지시
      "certRegChecklist: List specific certification and regulation items the manufacturer must verify before export, referencing actual cert/reg data from input. If the input only says there are candidate records, do not invent a final certification requirement.",
      "paymentRiskAssessment: Summarize K-SURE country risk grade, payment risk level, and recommend specific transaction terms (LC, TT advance, OA).",
      "preExportChecklist: List 5-8 essential items tailored to this specific product and target countries.",
      "countryStrategies must cover up to the Top 3 countries.",
      "Each action plan (7/30/90 days) must contain 3-5 concrete Korean tasks with responsible party hints like [HS코드 담당], [인증 담당], [무역관 연락].",
      "finalCautions must explicitly say the report is not a final judgment.",
    ].join(" ");

    try {
      const promptInput = buildGeminiReportPromptInput(evidenceBundle, evidence);
      const txt = await callAiJson(systemPrompt, JSON.stringify(promptInput));
      const parsed = parseJsonObject(txt);
      const draft = normalizeDraft(parsed, evidenceBundle);
      return json({
        state: "success",
        message: null,
        ...draft,
        summary: draft.executiveSummary,
        actions: draft.actionPlan7Days,
        draft,
        diagnostics: diagnosticsBase,
      });
    } catch (aiError) {
      const draft = buildRuleBasedDraft(evidenceBundle, evidence);
      return json({
        state: "partial_success",
        message: `Gemini 뉴스 본문 분석 미생성: ${toErrorMessage(aiError)}`,
        ...draft,
        summary: draft.executiveSummary,
        actions: draft.actionPlan7Days,
        draft,
        diagnostics: {
          ...diagnosticsBase,
          fallback: "rule_based",
          ai_error: toErrorMessage(aiError),
        },
      });
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

async function callAiJson(systemPrompt: string, userPrompt: string): Promise<string> {
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  const GEMINI_MODEL = Deno.env.get("GEMINI_REPORT_MODEL") ?? GEMINI_REPORT_MODEL;
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${GEMINI_API_KEY}`;
  const r = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    }),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}`);
  const data = await r.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
}

async function fetchKotraEntryStrategies(
  topCountries: Record<string, unknown>[],
  _product: Record<string, unknown> | null,
): Promise<Record<string, unknown>[]> {
  return await Promise.all(topCountries.slice(0, 3).map(async (country) => {
    const countryCode = asText(country.countryCode ?? country.country_code);
    const countryName = asText(country.countryName ?? country.country_name);
    try {
      const key = resolveKotraKey();
      if (!key) throw new Error("KOTRA API key is missing");

      const searchTerm = resolveEntryStrategySearchTerm(countryCode, countryName);
      const url = new URL(KOTRA_ENTRY_STRATEGY_ENDPOINT);
      url.searchParams.set("serviceKey", key);
      url.searchParams.set("type", "json");
      url.searchParams.set("pageNo", "1");
      url.searchParams.set("numOfRows", "3");
      url.searchParams.set("search1", searchTerm);

      const response = await fetchWithTimeout(url.toString(), { method: "GET" });
      if (!response.ok) throw new Error(`KOTRA entry strategy ${response.status}`);
      const data = await response.json();
      const selected = selectLatestEntryStrategy(normalizeEntryStrategyItems(data), searchTerm);
      if (!selected) return { countryCode, countryName, ...buildEmptyEntryStrategy() };

      // TODO: PDF parsing is intentionally out of scope for the link-only KOTRA entry strategy integration.
      return { countryCode, countryName, ...buildAvailableEntryStrategy(selected, null) };
    } catch (error) {
      return { countryCode, countryName, ...buildFailedEntryStrategy(toErrorMessage(error)) };
    }
  }));
}

function resolveKotraKey(): string {
  return Deno.env.get("KOTRA_API_KEY")
    || Deno.env.get("PUBLIC_DATA_API_KEY")
    || Deno.env.get("KICOX_API_KEY")
    || "";
}

function normalizeEvidenceBundle(input: unknown): EvidenceBundle {
  const data = asRecord(input);
  return {
    company: asNullableRecord(data.company),
    product: asNullableRecord(data.product),
    topCountries: asArray(data.topCountries ?? data.countries).map(asRecord).slice(0, 3),
    certs: asArray(data.certs).map(asRecord).slice(0, 30),
    regs: asArray(data.regs).map(asRecord).slice(0, 30),
    risks: asArray(data.risks).map(asRecord).slice(0, 40),
    safetyFlags: asArray(data.safetyFlags ?? data.flags).map(asRecord).slice(0, 20),
    apiLogs: asArray(data.apiLogs ?? data.logs).map(asRecord).slice(0, 80),
    missingEvidence: uniqueTexts(asArray(data.missingEvidence).map(asText)),
    entryStrategies: asArray(data.entryStrategies).map(asRecord).slice(0, 3),
  };
}

function buildGeminiReportPromptInput(
  evidenceBundle: EvidenceBundle,
  evidence: { cert: EvidenceState; regulation: EvidenceState; payment: EvidenceState },
) {
  return {
    company: evidenceBundle.company,
    product: evidenceBundle.product,
    topCountries: evidenceBundle.topCountries.map(compactCountryEvidence),
    certs: evidenceBundle.certs.map(compactEvidenceRow),
    regs: evidenceBundle.regs.map(compactEvidenceRow),
    risks: evidenceBundle.risks.map(compactRiskEvidenceRow),
    safetyFlags: evidenceBundle.safetyFlags.map(compactSafetyFlag),
    apiLogs: evidenceBundle.apiLogs.map(compactApiLog),
    missingEvidence: evidenceBundle.missingEvidence,
    evidence,
  };
}

function compactCountryEvidence(country: Record<string, unknown>) {
  const sources = asArray(country.evidenceSources)
    .map(asRecord)
    .filter(isGeminiNewsEvidenceSource)
    .map((source) => compactNewsEvidenceSource(source));

  return {
    countryCode: asText(country.countryCode ?? country.country_code),
    countryName: asText(country.countryName ?? country.country_name),
    totalScore: country.totalScore ?? country.total_score ?? null,
    label: asText(country.label),
    summary: asText(country.summary),
    customsExport12mUsd: country.customsExport12mUsd ?? country.customs_export_12m_usd ?? null,
    customsExportStatus: country.customsExportStatus ?? country.customs_export_status ?? null,
    evidenceSources: sources,
  };
}

function isGeminiNewsEvidenceSource(source: Record<string, unknown>): boolean {
  if (!hasNewsImpactSourceIdentity(source)) return false;
  const evidenceType = asText(source.evidenceType ?? source.evidence_type).toLowerCase();
  return !evidenceType || evidenceType === "direct" || evidenceType === "background";
}

function compactNewsEvidenceSource(source: Record<string, unknown>) {
  return {
    sourceType: asText(source.sourceType ?? source.type),
    title: asText(source.title),
    country: asText(source.country),
    summary: limitText(asText(source.summary), 1200),
    articleBody: limitText(asText(source.articleBody ?? source.article_body), GEMINI_NEWS_ARTICLE_BODY_MAX_CHARS),
    articleBodyTruncated: source.articleBodyTruncated ?? source.article_body_truncated ?? null,
    articleBodyOriginalLength: source.articleBodyOriginalLength ?? source.article_body_original_length ?? null,
    evidenceType: asText(source.evidenceType ?? source.evidence_type),
    newsCategory: asText(source.newsCategory ?? source.news_category),
    newsScope: asText(source.newsScope ?? source.news_scope),
    impactSummary: limitText(asText(source.impactSummary ?? source.impact_summary), 1200),
  };
}

function compactEvidenceRow(row: Record<string, unknown>) {
  return pickKnownFields(row, [
    "countryCode",
    "country_code",
    "category",
    "level",
    "summary",
    "sourceOrg",
    "source_org",
    "scheme",
    "topic",
  ]);
}

function compactRiskEvidenceRow(row: Record<string, unknown>) {
  const compact = compactEvidenceRow(row);
  const raw = pickKnownFields(asRecord(row.raw), [
    "eval_grade",
    "evalGrd",
    "eval_date",
    "evalDd",
    "risk_index",
    "riskIdx",
    "late_payment_rate",
    "average_payment_period",
    "average_late_payment_period",
    "top_payment_term_name",
    "top_payment_term_share",
    "summary",
  ]);
  return Object.keys(raw).length > 0 ? { ...compact, raw } : compact;
}

function compactSafetyFlag(flag: Record<string, unknown>) {
  return pickKnownFields(flag, ["flagType", "flag_type", "summary"]);
}

function compactApiLog(log: Record<string, unknown>) {
  return pickKnownFields(log, ["apiKeyName", "api_key_name", "status", "responseCount", "response_count"]);
}

function pickKnownFields(record: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = record[key];
    if (value == null || value === "") continue;
    out[key] = typeof value === "string" ? limitText(value, 2000) : value;
  }
  return out;
}

function limitText(value: string, maxChars: number): string {
  if (!value || value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n[Gemini 입력 길이 제한: ${value.length}자 중 ${maxChars}자 포함]`;
}

function buildEvidenceSnapshot(bundle: EvidenceBundle) {
  return {
    cert: resolveEvidenceState(bundle.apiLogs, "kotra_overseas_certification", bundle.certs.length),
    regulation: resolveEvidenceState(bundle.apiLogs, "kotra_import_regulation", bundle.regs.length),
    payment: resolveEvidenceState(bundle.apiLogs, "ksure_export_payment", countPaymentRows(bundle.risks)),
  };
}

function resolveEvidenceState(logs: Record<string, unknown>[], apiKey: string, rowCount: number): EvidenceState {
  const log = logs.find((item) => asText(item.apiKeyName ?? item.api_key_name) === apiKey);
  const status = asText(log?.status).toLowerCase();
  if (!status || ["idle", "loading", "stale", "error", "failed", "not_run"].includes(status)) return "not_run";
  if (rowCount > 0) return "available";
  return "unknown";
}

function normalizeDraft(input: unknown, bundle: EvidenceBundle): ReportDraft {
  const data = asRecord(asRecord(input).draft ?? input);
  const fallback = buildRuleBasedDraft(bundle, buildEvidenceSnapshot(bundle));
  const countryCautionAnalyses = normalizeCountryCautionAnalyses(data.countryCautionAnalyses);
  const countryCautionAnalysisStatus: CountryCautionAnalysisStatus =
    countryCautionAnalyses.length > 0 ? "generated" : "not_generated";
  return {
    executiveSummary: safeText(data.executiveSummary ?? data.summary, fallback.executiveSummary),
    exportFeasibility: safeText(data.exportFeasibility, fallback.exportFeasibility),
    topCountryReason: safeText(data.topCountryReason, fallback.topCountryReason),
    countryStrategies: normalizeStrategies(data.countryStrategies, fallback.countryStrategies),
    countryCautionAnalysisStatus,
    countryCautionAnalyses: countryCautionAnalysisStatus === "generated" ? countryCautionAnalyses : [],
    preExportChecklist: normalizeTextArray(data.preExportChecklist, fallback.preExportChecklist),
    actionPlan7Days: normalizeTextArray(data.actionPlan7Days ?? data.actions, fallback.actionPlan7Days),
    actionPlan30Days: normalizeTextArray(data.actionPlan30Days, fallback.actionPlan30Days),
    actionPlan90Days: normalizeTextArray(data.actionPlan90Days, fallback.actionPlan90Days),
    unresolvedItems: uniqueTexts([
      ...normalizeTextArray(data.unresolvedItems),
      ...bundle.missingEvidence,
    ], fallback.unresolvedItems),
    finalCautions: uniqueTexts(normalizeTextArray(data.finalCautions), fallback.finalCautions),
  };
}

function buildRuleBasedDraft(bundle: EvidenceBundle, evidence: { cert: EvidenceState; regulation: EvidenceState; payment: EvidenceState }): ReportDraft {
  const productName = safeText(bundle.product?.name, "해당 품목");
  const topCountry = bundle.topCountries[0];
  const topCountryName = safeText(topCountry?.countryName ?? topCountry?.country_name, UNKNOWN_TEXT);
  const missing = uniqueTexts([
    ...bundle.missingEvidence,
    ...evidenceShortages(evidence),
  ], [UNKNOWN_TEXT]);
  return {
    executiveSummary: `${productName} 기준 우선 검토 국가는 ${topCountryName}입니다. 인증·규제·결제위험·전략물자·제품안전 근거를 함께 확인한 뒤 실행 여부를 판단해야 합니다.`,
    exportFeasibility: `${productName} 수출 후보국 종합 판정: 인증·규제·결제위험 데이터 확보 상태에 따라 국가별 진출 가능성을 검토하세요.`,
    topCountryReason: topCountry
      ? `${topCountryName}은 추천 점수 ${safeText(topCountry.totalScore ?? topCountry.total_score, "-")}점으로 1순위입니다. ${safeText(topCountry.summary, UNKNOWN_TEXT)}`
      : UNKNOWN_TEXT,
    countryStrategies: buildFallbackStrategies(bundle),
    countryCautionAnalysisStatus: "not_generated",
    countryCautionAnalyses: [],
    preExportChecklist: [
      "HS/HSK 코드가 제품과 정확히 일치하는지 관세사에게 확인",
      "제품 영문명·성분·규격 정보를 수출 서류 기준으로 정리",
      "Top 1 후보국의 수입 인증 요건을 원문 기관에서 재확인",
      "K-SURE 국가위험등급·결제위험 기준 거래조건 검토",
      "무역관 또는 유관기관 상담 일정 확보",
    ],
    actionPlan7Days: [
      "[HS코드 담당] HS/HSK 코드와 제품 영문명을 기관 원문 기준으로 재확인하세요.",
      "[리서치 담당] Top 3 국가의 인증·수입규제·결제위험 출처와 조회일을 정리하세요.",
      "[안전 담당] 전략물자·제품안전 플래그의 원문 결과를 확인하고 미확인 항목을 분리하세요.",
    ],
    actionPlan30Days: [
      "[인증 담당] Top 1 후보국 기준 인증 서류, 시험 필요 여부, 예상 리드타임을 체크리스트로 확정하세요.",
      "[통관 담당] 수입규제·통관 요구사항의 적용 범위와 시행일을 확인하세요.",
      "[재무 담당] K-SURE 결제위험 기준으로 거래조건과 회수 리스크 대응안을 정리하세요.",
    ],
    actionPlan90Days: [
      "[수출 담당] 샘플·견적·라벨·통관서류 준비 상태를 점검하세요.",
      "[무역관 연락] 무역관 또는 유관기관 상담 결과를 리포트 근거에 추가하세요.",
      "[의사결정] 인증·규제·안전 확인 결과를 반영해 수출 착수 여부를 재검토하세요.",
    ],
    unresolvedItems: missing,
    finalCautions: [
      "본 리포트는 공공데이터 조회 결과와 AI 요약을 결합한 참고자료이며, 전략물자·인증·규제 적합성의 최종 판정이 아닙니다.",
      "미조회·실패 API 항목은 원문 기관에서 재확인한 뒤 제출용 리포트를 확정해야 합니다.",
    ],
  };
}

function buildFallbackStrategies(bundle: EvidenceBundle): CountryStrategy[] {
  if (bundle.topCountries.length === 0) {
    return [{
      countryCode: "-",
      countryName: UNKNOWN_TEXT,
      feasibilityGrade: "hold" as const,
      position: UNKNOWN_TEXT,
      entryMode: "후보국 추천 데이터를 확보한 뒤 진입전략을 작성해야 합니다.",
      entryStrategy: "후보국 추천 데이터 확보 후 진입 전략을 수립하세요.",
      requiredChecks: ["후보국 추천 재실행", "실패 API 확인"],
      certRegChecklist: ["인증·규제 데이터 없음"],
      paymentRiskAssessment: "결제 리스크 데이터 없음",
      riskResponse: "근거 확보 전에는 진출 우선순위를 확정하지 마세요.",
      evidenceLimits: ["후보국 추천 근거 없음"],
      evidenceRefs: [],
      newsImpactAnalysis: "대상국 일치 직접 뉴스 근거 없음 — 관련 뉴스 모니터링 필요",
      marketOpportunity: "후보국 추천 데이터가 없어 시장 기회를 평가할 수 없습니다.",
    }];
  }

  return bundle.topCountries.map((country, index) => {
    const countryCode = safeText(country.countryCode ?? country.country_code, "-");
    const countryName = safeText(country.countryName ?? country.country_name, UNKNOWN_TEXT);
    const kotraEntryStrategy = findEntryStrategyForCountry(bundle, countryCode, countryName);
    const evidenceRefs = extractDirectEvidenceRefs(country);
    const newsImpactSources = extractNewsImpactSources(country);
    const evidenceLimits = buildStrategyEvidenceLimits(bundle, country, countryCode, evidenceRefs);
    const hasCerts = countRowsByCountry(bundle.certs, countryCode) > 0;
    const hasRegs = countRowsByCountry(bundle.regs, countryCode) > 0;
    const hasRisks = countRowsByCountry(bundle.risks, countryCode) > 0;
    const grade = (!hasCerts && !hasRegs) ? "hold" : (hasCerts && hasRegs && hasRisks) ? "go" : "conditional";
    return {
      countryCode,
      countryName,
      feasibilityGrade: grade as "go" | "conditional" | "hold",
      position: `${countryName}은 Top ${index + 1} 검토 후보국입니다. 추천 점수 ${safeText(country.totalScore ?? country.total_score, "-")}점 기준으로 원문 검증이 필요합니다. ${buildCustomsExportSentence(country)}`,
      entryMode: `${countryName}은 HS/HSK, 인증, 수입규제, 결제위험을 원문 기준으로 확인한 뒤 무역관 상담 또는 샘플 수출을 검토하세요.`,
      entryStrategy: `${countryName} 진입 시 ${buildCustomsExportStrategyPrefix(country)}${evidenceRefs.length > 0 ? "대상국 일치 근거를 우선 검토하고 " : ""}무역관 상담 또는 샘플 수출을 검토하세요.`,
      requiredChecks: [
        "HS/HSK 품목 분류 재확인",
        hasCerts ? "인증 근거 원문 적합성 확인" : `인증 ${UNKNOWN_TEXT}`,
        hasRegs ? "수입규제 적용 범위 확인" : `수입규제 ${UNKNOWN_TEXT}`,
        hasRisks ? "K-SURE 위험 거래조건 반영" : `K-SURE 위험 ${UNKNOWN_TEXT}`,
      ],
      certRegChecklist: [
        hasCerts ? `인증 ${countRowsByCountry(bundle.certs, countryCode)}건 원문 확인 필요` : "인증 요구사항 정보 없음",
        hasRegs ? `수입규제 ${countRowsByCountry(bundle.regs, countryCode)}건 적용 범위 확인` : "수입규제 정보 없음",
      ],
      paymentRiskAssessment: hasRisks
        ? "K-SURE 결제위험 근거를 거래조건에 반영하고 초기 거래는 보수적 조건을 검토하세요."
        : "결제위험 데이터 미확보 — 원문 확인 전까지 보수적 거래조건 권고",
      riskResponse: hasRisks
        ? "K-SURE 위험 근거를 거래조건에 반영하고 초기 거래조건은 보수적으로 검토하세요."
        : "결제위험 근거가 부족하므로 원문 확인 전까지 거래조건을 보수적으로 설정하세요.",
      evidenceLimits,
      evidenceRefs,
      newsImpactAnalysis: buildNewsImpactAnalysis(newsImpactSources, countryName),
      marketOpportunity: `${countryName}은 추천 점수 ${safeText(country.totalScore ?? country.total_score, "-")}점으로 Top ${index + 1} 후보국입니다. ${buildCustomsMarketOpportunity(country)} ${hasCerts && hasRegs ? "인증·규제 데이터가 확보되어 있어 구체적 진입 준비가 가능합니다." : "추가 데이터 확보 후 시장 기회를 재평가하세요."}`,
      kotraEntryStrategy,
    };
  });
}

function findEntryStrategyForCountry(
  bundle: EvidenceBundle,
  countryCode: string,
  countryName: string,
): KotraEntryStrategyEvidence | undefined {
  const matched = bundle.entryStrategies.find((entry) => {
    const entryCountryCode = asText(entry.countryCode ?? entry.country_code);
    const entryCountryName = asText(entry.countryName ?? entry.country_name);
    return entryCountryCode === countryCode || (!!entryCountryName && entryCountryName === countryName);
  });
  return normalizeKotraEntryStrategy(matched);
}

function normalizeKotraEntryStrategy(value: unknown): KotraEntryStrategyEvidence | undefined {
  const row = asRecord(value);
  const status = asText(row.status).toLowerCase();
  if (
    status !== "available" &&
    status !== "empty" &&
    status !== "failed" &&
    status !== "pdf_failed"
  ) {
    return undefined;
  }
  return {
    status,
    title: asText(row.title) || null,
    publishedDate: asText(row.publishedDate ?? row.published_date) || null,
    tradeOffice: asText(row.tradeOffice ?? row.trade_office) || null,
    sourceUrl: asText(row.sourceUrl ?? row.source_url) || null,
    attachmentName: asText(row.attachmentName ?? row.attachment_name) || null,
    attachmentUrl: asText(row.attachmentUrl ?? row.attachment_url) || null,
    usedPdf: false,
    basisSummary: "",
    limitations: normalizeTextArray(row.limitations),
  };
}

function buildCustomsExportSentence(country: Record<string, unknown>): string {
  const amount = asPositiveNumber(country.customsExport12mUsd ?? country.customs_export_12m_usd);
  if (amount != null) return `최근 12개월 HS/HSK 수출액은 ${formatUsd(amount)}입니다.`;
  if (asCustomsStatus(country.customsExportStatus ?? country.customs_export_status) === "empty") {
    return "최근 12개월 HS/HSK 수출액 조회 결과가 없습니다.";
  }
  return "최근 12개월 HS/HSK 수출액은 확실한 정보 없음입니다.";
}

function buildCustomsExportStrategyPrefix(country: Record<string, unknown>): string {
  const amount = asPositiveNumber(country.customsExport12mUsd ?? country.customs_export_12m_usd);
  if (amount == null) return "최근 수출 실적 근거가 부족하므로 ";
  return `최근 수출 실적(${formatUsd(amount)})을 초기 수요 검증 신호로 참고하고 `;
}

function buildCustomsMarketOpportunity(country: Record<string, unknown>): string {
  const amount = asPositiveNumber(country.customsExport12mUsd ?? country.customs_export_12m_usd);
  if (amount == null) return "최근 12개월 수출액 근거는 확실한 정보 없음입니다.";
  return `최근 12개월 HS/HSK 수출액 ${formatUsd(amount)}가 확인되어 기존 거래 흐름이 있는 시장으로 해석할 수 있습니다.`;
}

function extractDirectEvidenceRefs(country: Record<string, unknown>): string[] {
  return asArray(country.evidenceSources)
    .map(asRecord)
    .filter((source) => asText(source.evidenceType).toLowerCase() === "direct")
    .map((source) => asText(source.title))
    .filter(Boolean)
    .slice(0, 3);
}

function extractNewsImpactSources(country: Record<string, unknown>): Record<string, unknown>[] {
  const seen = new Set<string>();
  const sources: Record<string, unknown>[] = [];

  for (const source of asArray(country.evidenceSources).map(asRecord)) {
    if (!hasNewsImpactSourceIdentity(source)) continue;
    const evidenceType = asText(source.evidenceType).toLowerCase();
    if (evidenceType !== "direct" && evidenceType !== "background") continue;
    if (isNoEvidencePlaceholder(asText(source.title))) continue;
    const title = asText(source.title);
    const summary = asText(source.summary);
    const impactSummary = asText(source.impactSummary ?? source.impact_summary);
    if (!title && !summary && !impactSummary) continue;
    const key = [evidenceType, title.toLowerCase(), summary.toLowerCase(), impactSummary.toLowerCase()].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push(source);
  }

  return sources;
}

function hasNewsImpactSourceIdentity(source: Record<string, unknown>): boolean {
  const sourceType = asText(source.sourceType ?? source.source_type ?? source.type).toLowerCase();
  if (sourceType) return NEWS_IMPACT_SOURCE_TYPES.has(sourceType);
  return Boolean(
    asText(source.newsCategory ?? source.news_category) ||
    asText(source.newsScope ?? source.news_scope) ||
    asText(source.articleBody ?? source.article_body) ||
    asText(source.impactSummary ?? source.impact_summary)
  );
}

function buildNewsImpactAnalysis(sources: Record<string, unknown>[], countryName: string): string {
  if (sources.length === 0) return "대상국 일치 직접 뉴스 근거 없음 — 관련 뉴스 모니터링 필요";
  return `${countryName}: ${GEMINI_NEWS_BODY_ANALYSIS_PENDING_TEXT}`;
}

function buildStrategyEvidenceLimits(
  bundle: EvidenceBundle,
  country: Record<string, unknown>,
  countryCode: string,
  evidenceRefs: string[],
): string[] {
  const limits: string[] = [];
  const hasIndirect = asArray(country.evidenceSources)
    .map(asRecord)
    .some((source) => {
      const evidenceType = asText(source.evidenceType).toLowerCase();
      return evidenceType === "indirect" || evidenceType === "excluded";
    });

  if (evidenceRefs.length === 0) limits.push("대상국 일치 직접 뉴스 근거 없음");
  if (hasIndirect) limits.push("대상국 불일치 뉴스는 전략 본문에서 제외");
  if (countRowsByCountry(bundle.certs, countryCode) === 0) limits.push(`인증 ${UNKNOWN_TEXT}`);
  if (countRowsByCountry(bundle.regs, countryCode) === 0) limits.push(`수입규제 ${UNKNOWN_TEXT}`);
  if (countRowsByCountry(bundle.risks, countryCode) === 0) limits.push(`K-SURE 위험 ${UNKNOWN_TEXT}`);
  limits.push("인증·규제·전략물자·제품안전 최종 판정 아님");
  return uniqueTexts(limits);
}

function isNoEvidencePlaceholder(value: string): boolean {
  const normalized = value.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
  return (
    normalized.includes("직접근거없음") ||
    normalized.includes("확실한정보없음") ||
    normalized.includes("nomatched") ||
    normalized.includes("noevidence")
  );
}

function evidenceShortages(evidence: { cert: EvidenceState; regulation: EvidenceState; payment: EvidenceState }): string[] {
  const out: string[] = [];
  if (evidence.cert !== "available") out.push(`인증(${toStateLabel(evidence.cert)})`);
  if (evidence.regulation !== "available") out.push(`규제(${toStateLabel(evidence.regulation)})`);
  if (evidence.payment !== "available") out.push(`결제위험(${toStateLabel(evidence.payment)})`);
  return out;
}

function normalizeStrategies(value: unknown, fallback: CountryStrategy[]): CountryStrategy[] {
  const strategies = asArray(value).map((entry, index) => {
    const row = asRecord(entry);
    const countryCode = safeText(row.countryCode, "-");
    const countryName = safeText(row.countryName, UNKNOWN_TEXT);
    const fallbackRow = fallback.find((item) => (
      item.countryCode === countryCode ||
      (countryName !== UNKNOWN_TEXT && item.countryName === countryName)
    )) ?? fallback[index];
    const rawGrade = asText(row.feasibilityGrade).toLowerCase();
    const grade = rawGrade === "go" ? "go" : rawGrade === "hold" ? "hold" : "conditional";
    return {
      countryCode,
      countryName,
      feasibilityGrade: grade as "go" | "conditional" | "hold",
      position: safeText(row.position ?? row.opportunity, UNKNOWN_TEXT),
      entryMode: safeText(row.entryMode ?? row.entryStrategy, UNKNOWN_TEXT),
      entryStrategy: safeText(row.entryStrategy ?? row.entryMode, UNKNOWN_TEXT),
      requiredChecks: normalizeTextArray(row.requiredChecks, [UNKNOWN_TEXT]),
      certRegChecklist: normalizeTextArray(row.certRegChecklist, [UNKNOWN_TEXT]),
      paymentRiskAssessment: safeText(row.paymentRiskAssessment, UNKNOWN_TEXT),
      riskResponse: safeText(row.riskResponse, UNKNOWN_TEXT),
      evidenceLimits: normalizeTextArray(row.evidenceLimits, [UNKNOWN_TEXT]),
      evidenceRefs: normalizeTextArray(row.evidenceRefs),
      newsImpactAnalysis: safeText(row.newsImpactAnalysis, "대상국 일치 직접 뉴스 근거 없음 — 관련 뉴스 모니터링 필요"),
      marketOpportunity: safeText(row.marketOpportunity, UNKNOWN_TEXT),
      kotraEntryStrategy: normalizeKotraEntryStrategy(row.kotraEntryStrategy ?? row.kotra_entry_strategy) ?? fallbackRow?.kotraEntryStrategy,
    };
  }).filter((row) => row.countryCode !== "-" || row.countryName !== UNKNOWN_TEXT);
  return strategies.length > 0 ? strategies : fallback;
}

function normalizeCountryCautionAnalyses(value: unknown): CountryCautionAnalysis[] {
  return asArray(value)
    .map((entry) => {
      const row = asRecord(entry);
      const countryCode = safeText(row.countryCode, "-");
      const countryName = safeText(row.countryName, UNKNOWN_TEXT);
      const coreSummary = safeText(row.coreSummary ?? row.summary, "");
      const sections = normalizeCountryCautionSections(row.sections ?? row.items);

      if (countryCode === "-" && countryName === UNKNOWN_TEXT) return null;
      if (!coreSummary || sections.length !== COUNTRY_CAUTION_SECTION_ORDER.length) return null;

      return { countryCode, countryName, coreSummary, sections };
    })
    .filter((entry): entry is CountryCautionAnalysis => Boolean(entry));
}

function normalizeCountryCautionSections(value: unknown): CountryCautionSection[] {
  const byKind = new Map<CountryCautionSectionKind, CountryCautionSection>();

  for (const item of asArray(value)) {
    const row = asRecord(item);
    const kind = normalizeCountryCautionSectionKind(row.kind ?? row.title);
    if (!kind || byKind.has(kind)) continue;

    const interpretation = safeText(row.interpretation, "");
    const facts = normalizeCountryCautionFacts(row.facts);
    if (!interpretation && facts.length === 0) continue;

    byKind.set(kind, {
      kind,
      title: safeText(row.title, COUNTRY_CAUTION_SECTION_TITLES[kind]),
      facts,
      interpretation,
    });
  }

  return COUNTRY_CAUTION_SECTION_ORDER
    .map((kind) => byKind.get(kind))
    .filter((entry): entry is CountryCautionSection => Boolean(entry));
}

function normalizeCountryCautionFacts(value: unknown): CountryCautionFact[] {
  return asArray(value)
    .map((entry) => {
      const row = asRecord(entry);
      const label = safeText(row.label, "");
      const valueText = safeText(row.value, "");
      const meaning = safeText(row.meaning, "");
      if (!label || !valueText || !meaning) return null;
      return { label, value: valueText, meaning };
    })
    .filter((entry): entry is CountryCautionFact => Boolean(entry));
}

function normalizeCountryCautionSectionKind(value: unknown): CountryCautionSectionKind | null {
  const normalized = asText(value).toLowerCase().replace(/[\s_·/-]+/g, "");
  if (COUNTRY_CAUTION_SECTION_ORDER.includes(normalized as CountryCautionSectionKind)) {
    return normalized as CountryCautionSectionKind;
  }
  if (normalized === "cert" || normalized.includes("certification") || normalized.includes("인증")) {
    return "certification";
  }
  if (normalized === "reg" || normalized.includes("regulation") || normalized.includes("규제")) {
    return "regulation";
  }
  if (
    normalized.includes("countryrisk") ||
    normalized.includes("ksurecountry") ||
    normalized.includes("국가위험")
  ) {
    return "ksure_country_risk";
  }
  if (
    normalized.includes("industryrisk") ||
    normalized.includes("ksureindustry") ||
    normalized.includes("업종위험")
  ) {
    return "ksure_industry_risk";
  }
  if (
    normalized.includes("payment") ||
    normalized.includes("exportpayment") ||
    normalized.includes("수출결제") ||
    normalized.includes("결제위험")
  ) {
    return "ksure_payment";
  }
  return null;
}

function countPaymentRows(rows: Record<string, unknown>[]): number {
  return rows.filter((row) => asText(row.category).toLowerCase() === "k_sure_payment").length;
}

function countRowsByCountry(rows: Record<string, unknown>[], countryCode: string): number {
  return rows.filter((row) => asText(row.countryCode ?? row.country_code) === countryCode).length;
}

function toStateLabel(state: EvidenceState): string {
  return state === "not_run" ? "상세 분석 미실행" : UNKNOWN_TEXT;
}

function normalizeTextArray(value: unknown, fallback: string[] = []): string[] {
  return uniqueTexts(asArray(value).map(asText), fallback);
}

function uniqueTexts(values: string[], fallback: string[] = []): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = asText(value);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out.length > 0 ? out : fallback;
}

function safeText(value: unknown, fallback: string): string {
  const text = asText(value);
  return text || fallback;
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return {};
  }
}

function detectAiProvider(): AiProvider {
  if (Deno.env.get("GEMINI_API_KEY")) return "gemini";
  return "none";
}

function buildAiDiagnostics() {
  return {
    provider: detectAiProvider(),
    model: Deno.env.get("GEMINI_REPORT_MODEL") ?? GEMINI_REPORT_MODEL,
    auth: "required",
    cors: "enabled",
    timeout_ms: AI_TIMEOUT_MS,
    gemini_key_present: Boolean(Deno.env.get("GEMINI_API_KEY")),
  };
}

async function fetchWithTimeout(input: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("AI request timeout");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function toErrorMessage(value: unknown): string {
  if (value instanceof Error && value.message.trim().length > 0) return value.message.trim();
  return "unknown";
}

function asNullableRecord(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value);
  return Object.keys(record).length > 0 ? record : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return null;
  return numberValue;
}

function asCustomsStatus(value: unknown): CustomsExportStatus | null {
  return value === "available" || value === "empty" ? value : null;
}

function formatUsd(amount: number): string {
  if (amount >= 1_000_000_000) return `$${trimFixed(amount / 1_000_000_000)}B`;
  if (amount >= 1_000_000) return `$${trimFixed(amount / 1_000_000)}M`;
  if (amount >= 1_000) return `$${trimFixed(amount / 1_000)}K`;
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

function trimFixed(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
