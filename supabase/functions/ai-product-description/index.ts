import { corsHeaders } from "../_shared/cors.ts";
import { requireAuthenticatedUser } from "../_shared/auth.ts";
import {
  UNKNOWN_TEXT,
  buildProductFeatures,
  buildProductInterpretationHint,
  buildProductOverview,
  deriveProductSubject,
  type ProductDescriptionInput as DraftInput,
} from "../_shared/product-description-rules.ts";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_TIMEOUT_MS = 12000;
const SECTION_OVERVIEW = "\uAC1C\uC694";
const SECTION_FEATURES = "\uD2B9\uC9D5";
const SECTION_CONTEXT = "\uD504\uB85C\uC81D\uD2B8 \uB9E5\uB77D";
const SECTION_MISSING = "\uCD94\uAC00 \uD655\uC778 \uD544\uC694";
const FALLBACK_RATIONALE =
  "AI \uC124\uBA85 \uCD08\uC548 \uC0DD\uC131 \uC2E4\uD328: \uADDC\uCE59 \uAE30\uBC18 \uCD08\uC548\uC73C\uB85C \uB300\uCCB4\uD588\uC2B5\uB2C8\uB2E4.";
const FALLBACK_MESSAGE =
  "AI \uC124\uBA85 \uCD08\uC548 \uC0DD\uC131 \uC2E4\uD328: \uADDC\uCE59 \uAE30\uBC18 \uCD08\uC548\uC744 \uC0AC\uC6A9\uD588\uC2B5\uB2C8\uB2E4.";
const PROJECT_CONTEXT_SPECULATION_PATTERNS = [
  "\\uD655\\uC2E4\\uD55C\\s*\\uC815\\uBCF4\\s*\\uC5C6\\uC74C\\s*\\uC774\\uB098",
  "\\uC778\\uD504\\uB77C",
  "\\uC218\\uCD9C\\uD558\\uAE30\\s*\\uC704\\uD55C\\s*\\uB9E5\\uB77D",
  "\\uB9E5\\uB77D(?:\\uC744|\\uC774)?\\s*\\uD3EC\\uD568",
];
const PROJECT_CONTEXT_SPECULATION_PATTERN = new RegExp(
  `(?:${PROJECT_CONTEXT_SPECULATION_PATTERNS.join("|")})`,
  "i",
);
const PROJECT_CONTEXT_CLEANUP_PATTERNS = PROJECT_CONTEXT_SPECULATION_PATTERNS.map(
  (pattern) => new RegExp(`${pattern}[^\\.\\n]*[\\.\\n]?`, "gi"),
);

type ParsedDraft = {
  description?: unknown;
  overview?: unknown;
  features?: unknown;
  project_context?: unknown;
  rationale?: unknown;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authResult = await requireAuthenticatedUser(req, corsHeaders);
    if (authResult.ok === false) return authResult.response;

    let body: Record<string, unknown>;
    try {
      body = asRecord(await req.json());
    } catch {
      return json({ error: "invalid JSON body" }, 400);
    }

    const name = normalizeText(readString(body.name));
    if (!name) return json({ error: "name required" }, 400);
    const productSubject = deriveProductSubject(name);

    const input: DraftInput = {
      companyName: normalizeText(readString(body.company_name)),
      industrialComplex: normalizeText(readString(body.industrial_complex)),
      industryCode: normalizeText(readString(body.industry_code)),
      region: normalizeText(readString(body.region)),
      mainProduct: normalizeText(readString(body.main_product)),
      productKeyword: normalizeText(readString(body.product_keyword)),
      components: normalizeText(readString(body.components)),
    };

    const systemPrompt = [
      "You are a Korean export product-description writer for HS pre-screening.",
      "Return valid JSON only.",
      "Write in Korean.",
      "Write the product description as one natural paragraph.",
      "Do not use section labels, markdown, bullets, or headings.",
      `Never output labels such as '${SECTION_OVERVIEW}:', '${SECTION_FEATURES}:', or '${SECTION_CONTEXT}:'.`,
      "Infer the product category from the product name before writing.",
      "Begin with a direct definition, not a question.",
      `Do not start with a question such as '${productSubject}\uB780 \uBB34\uC5C7\uC778\uAC00\uC694?'.`,
      "Do not include a missing-info section.",
      "Use product-name general knowledge only for overview.",
      "Describe product-name-based characteristics and operating principles after the definition.",
      "Use provided project inputs only for project context.",
      "Never invent numeric specs, process details, certifications, or composition ratios.",
      `If a required fact is missing, use '${UNKNOWN_TEXT}' naturally inside the relevant sentence.`,
      "Target total description length: 280-520 Korean characters.",
      `Schema: {"description":"...","overview":"...","features":"...","project_context":"...","rationale":"..."}`,
    ].join(" ");

    const userPrompt = [
      "Input data:",
      `- Product name: ${name}`,
      `- Product subject for description: ${productSubject}`,
      `- Product-name interpretation hint: ${buildProductInterpretationHint(name, input)}`,
      `- Company: ${input.companyName || UNKNOWN_TEXT}`,
      `- Industrial complex: ${input.industrialComplex || UNKNOWN_TEXT}`,
      `- Industry code: ${input.industryCode || UNKNOWN_TEXT}`,
      `- Region: ${input.region || UNKNOWN_TEXT}`,
      `- Main product from Step1: ${input.mainProduct || UNKNOWN_TEXT}`,
      `- Product keyword from Step1: ${input.productKeyword || UNKNOWN_TEXT}`,
      `- Components/material tags: ${input.components || UNKNOWN_TEXT}`,
      "Requirements:",
      "- Keep practical and concise.",
      "- Do not output markdown.",
      "- Description must be a natural paragraph, not a labeled template.",
      `- Do not output labels such as "${SECTION_OVERVIEW}:", "${SECTION_FEATURES}:", or "${SECTION_CONTEXT}:".`,
      `- Start with what ${productSubject} is, without writing a question.`,
      `- Never output '${SECTION_MISSING}:' label.`,
      "- Never use speculative phrasing like infrastructure-based export context.",
    ].join("\n");

    try {
      const txt = await callAiJson(systemPrompt, userPrompt);
      const parsed = parseDraftJson(txt);

      const sectionFromDescription = extractSections(readString(parsed.description));
      const overviewCandidate =
        normalizeNullableText(readString(parsed.overview)) ??
        normalizeNullableText(sectionFromDescription.overview ?? "");
      const featuresCandidate =
        normalizeNullableText(readString(parsed.features)) ??
        normalizeNullableText(sectionFromDescription.features ?? "");
      const contextCandidate =
        normalizeNullableText(readString(parsed.project_context)) ??
        normalizeNullableText(sectionFromDescription.projectContext ?? "");

      const overview = sanitizeOverview(overviewCandidate, productSubject);
      const features = sanitizeFeatures(featuresCandidate, productSubject, input);
      const projectContext = sanitizeProjectContext(contextCandidate, input);
      const description = composeDescription(overview, features, projectContext);
      const rationale = normalizeNullableText(readString(parsed.rationale));

      return json({
        description,
        overview,
        features,
        project_context: projectContext,
        rationale,
        state: description ? "success" : "empty",
      });
    } catch (aiError) {
      console.error("ai-product-description fallback", toErrorMessage(aiError));
      return json(buildFallbackDraft(name, input, aiError));
    }
  } catch (error) {
    console.error("ai-product-description failed", toErrorMessage(error));
    return json({ error: toErrorMessage(error) }, 500);
  }
});

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

    if (res.status === 429) throw new Error("AI rate limit exceeded");
    if (res.status === 402) throw new Error("AI credit insufficient");
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

function parseDraftJson(value: string): ParsedDraft {
  const parsed = JSON.parse(value);
  return asRecord(parsed) as ParsedDraft;
}

function extractSections(rawDescription: string): { overview: string | null; features: string | null; projectContext: string | null } {
  const text = stripMissingSection(normalizeText(rawDescription));
  if (!text) return { overview: null, features: null, projectContext: null };

  const escapedOverview = escapeRegex(SECTION_OVERVIEW);
  const escapedFeatures = escapeRegex(SECTION_FEATURES);
  const escapedContext = escapeRegex(SECTION_CONTEXT);
  const overviewMatch = text.match(new RegExp(`${escapedOverview}\\s*[:\uFF1A]\\s*([\\s\\S]*?)(?=${escapedFeatures}\\s*[:\uFF1A]|${escapedContext}\\s*[:\uFF1A]|$)`, "i"));
  const featuresMatch = text.match(new RegExp(`${escapedFeatures}\\s*[:\uFF1A]\\s*([\\s\\S]*?)(?=${escapedContext}\\s*[:\uFF1A]|$)`, "i"));
  const contextMatch = text.match(new RegExp(`${escapedContext}\\s*[:\uFF1A]\\s*([\\s\\S]*)$`, "i"));

  return {
    overview: normalizeNullableText(overviewMatch?.[1] ?? ""),
    features: normalizeNullableText(featuresMatch?.[1] ?? ""),
    projectContext: normalizeNullableText(contextMatch?.[1] ?? ""),
  };
}

function sanitizeOverview(candidate: string | null, productSubject: string): string {
  const base =
    normalizeNullableText(stripQuestionLead(stripOutputLabels(candidate ?? ""))) ||
    buildProductOverview(productSubject);
  return normalizeText(base);
}

function sanitizeFeatures(candidate: string | null, productSubject: string, input: DraftInput): string {
  const normalized = normalizeText(stripOutputLabels(candidate ?? ""));
  if (normalized && !PROJECT_CONTEXT_SPECULATION_PATTERN.test(normalized)) {
    return normalized;
  }
  return buildProductFeatures(productSubject, input);
}

function sanitizeProjectContext(candidate: string | null, input: DraftInput): string {
  const normalized = normalizeText(stripOutputLabels(candidate ?? ""));

  if (!normalized || PROJECT_CONTEXT_SPECULATION_PATTERN.test(normalized)) {
    return buildStrictProjectContext(input);
  }

  const cleaned = PROJECT_CONTEXT_CLEANUP_PATTERNS
    .reduce((text, pattern) => text.replace(pattern, ""), normalized)
    .trim();

  return cleaned || buildStrictProjectContext(input);
}

function buildStrictProjectContext(input: DraftInput): string {
  const company = input.companyName || UNKNOWN_TEXT;
  const region = input.region || UNKNOWN_TEXT;
  const complex = input.industrialComplex || UNKNOWN_TEXT;
  const industry = input.industryCode || UNKNOWN_TEXT;
  return `\uBCF8 \uD504\uB85C\uC81D\uD2B8\uB294 \uD68C\uC0AC ${company}, \uC9C0\uC5ED ${region}, \uC0B0\uB2E8 ${complex}, \uC0B0\uC5C5\uBD84\uB958\uCF54\uB4DC ${industry} \uC815\uBCF4\uB97C \uAE30\uBC18\uC73C\uB85C \uAC80\uD1A0\uD569\uB2C8\uB2E4.`;
}

function buildFallbackDraft(name: string, input: DraftInput, error: unknown) {
  const productSubject = deriveProductSubject(name);
  const overview = sanitizeOverview(null, productSubject);
  const features = buildProductFeatures(productSubject, input);
  const projectContext = buildStrictProjectContext(input);
  return {
    description: composeDescription(overview, features, projectContext),
    overview,
    features,
    project_context: projectContext,
    rationale: FALLBACK_RATIONALE,
    state: "partial_success",
    message: FALLBACK_MESSAGE,
    diagnostics: buildAiDiagnostics(error),
  };
}

function buildAiDiagnostics(error: unknown) {
  const hasLovableKey = Boolean(Deno.env.get("LOVABLE_API_KEY"));
  const hasGeminiKey = Boolean(Deno.env.get("GEMINI_API_KEY"));
  return {
    provider: hasLovableKey ? "lovable" : hasGeminiKey ? "gemini" : "none",
    has_lovable_key: hasLovableKey,
    has_gemini_key: hasGeminiKey,
    timeout_ms: AI_TIMEOUT_MS,
    error: toErrorMessage(error),
  };
}

function composeDescription(overview: string, features: string, projectContext: string): string {
  return normalizeText(`${stripOutputLabels(overview)} ${stripOutputLabels(features)} ${stripOutputLabels(projectContext)}`).slice(0, 1000);
}

function stripMissingSection(value: string): string {
  if (!value) return "";
  const koMissingPattern = new RegExp(`\\n?\\s*${SECTION_MISSING}\\s*[:\uFF1A].*$`, "s");
  const enMissingPattern = /\n?\s*missing[_\s-]*info\s*[:\uFF1A].*$/is;
  return value.replace(koMissingPattern, "").replace(enMissingPattern, "").trim();
}

function stripOutputLabels(value: string): string {
  if (!value) return "";
  const labelPattern = new RegExp(`(?:^|\\n)\\s*(?:${SECTION_OVERVIEW}|${SECTION_FEATURES}|${SECTION_CONTEXT})\\s*[:\uFF1A]\\s*`, "g");
  return value.replace(labelPattern, " ").trim();
}

function stripQuestionLead(value: string): string {
  if (!value) return "";
  return value
    .replace(/^\s*.{1,80}?(?:\uB780|\uC774\uB780)\s*\uBB34\uC5C7\uC778\uAC00\uC694[\?\uFF1F]?\s*/u, "")
    .trim();
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeNullableText(value: string): string | null {
  const normalized = normalizeText(value);
  return normalized || null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "unknown");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
