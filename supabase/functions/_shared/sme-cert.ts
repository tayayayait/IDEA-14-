import { buildCountryAliases } from "./recommendation.ts";

export interface SmeCertItem {
  연번: number;
  국가: string;
  인증명: string;
  설명: string;
}

export interface SmeCertMatchResult {
  certName: string;
  rationale: string;
  confidence: "high" | "medium" | "low";
  source?: "ai" | "country_fallback";
}

export interface SmeCertFallbackOptions {
  productName?: string;
  productDescription?: string;
  hsCode?: string;
  limit?: number;
}

const SME_API_URL = "https://api.odcloud.kr/api/15071380/v1/uddi:3735adc6-dbd9-4809-9836-f91f93010e63";
const SME_CERT_FALLBACK_LIMIT = 8;

export async function fetchSmeCertifications(
  countryCode: string,
  countryName: string,
): Promise<SmeCertItem[]> {
  const apiKey = Deno.env.get("PUBLIC_DATA_API_KEY");
  if (!apiKey) {
    console.error("PUBLIC_DATA_API_KEY is missing");
    return [];
  }

  try {
    const url = new URL(SME_API_URL);
    url.searchParams.set("page", "1");
    url.searchParams.set("perPage", "1000"); // Fetch all 553 items
    url.searchParams.set("serviceKey", apiKey);

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error(`SME API error: ${res.status} ${res.statusText}`);
      return [];
    }

    const json = await res.json();
    if (!json.data || !Array.isArray(json.data)) {
      return [];
    }

    const items: SmeCertItem[] = json.data;
    return filterSmeCertificationsByCountry(items, countryCode, countryName);
  } catch (err) {
    console.error("fetchSmeCertifications failed:", err);
    return [];
  }
}

export function filterSmeCertificationsByCountry(
  items: SmeCertItem[],
  countryCode: string,
  countryName: string,
): SmeCertItem[] {
  const aliases = buildCountryAliases(countryCode, countryName).map(normalizeCountryText).filter(Boolean);
  const aliasSet = new Set(aliases);

  return items.filter((item) => {
    const nat = normalizeCountryText(item.국가);
    if (!nat) return false;
    return aliasSet.has(nat);
  });
}

export function buildSmeCertificationFallbackRecommendations(
  certList: SmeCertItem[],
  optionsOrLimit: SmeCertFallbackOptions | number = {},
): SmeCertMatchResult[] {
  const options = typeof optionsOrLimit === "number" ? { limit: optionsOrLimit } : optionsOrLimit;
  const limit = Math.max(0, options.limit ?? SME_CERT_FALLBACK_LIMIT);
  const relevance = buildFallbackRelevanceContext(options);
  if (!relevance.hasProductSignal || limit === 0) return [];

  const out: SmeCertMatchResult[] = [];
  const seen = new Set<string>();

  for (const cert of certList) {
    const certName = String(cert.인증명 || "").trim();
    if (!certName) continue;
    if (!isFallbackCertificationRelevant(cert, relevance)) continue;

    const key = normalizeCountryText(certName);
    if (seen.has(key)) continue;
    seen.add(key);

    const description = String(cert.설명 || "").trim();
    out.push({
      certName,
      rationale: description
        ? `${description} - 중소벤처기업부 해외규격인증정보의 국가별 등록 인증입니다. 제품 적용 여부는 기관 확인이 필요합니다.`
        : "중소벤처기업부 해외규격인증정보의 국가별 등록 인증입니다. 제품 적용 여부는 기관 확인이 필요합니다.",
      confidence: "medium",
      source: "country_fallback",
    });

    if (out.length >= limit) break;
  }

  return out;
}

export function filterSmeCertificationRecommendationsByProductRelevance(
  recommendations: SmeCertMatchResult[],
  certList: SmeCertItem[],
  options: SmeCertFallbackOptions,
): SmeCertMatchResult[] {
  const relevance = buildFallbackRelevanceContext(options);
  if (!relevance.hasProductSignal) return [];

  const out: SmeCertMatchResult[] = [];
  const seen = new Set<string>();

  for (const recommendation of recommendations) {
    const sourceCert = findSmeCertSourceItem(recommendation.certName, certList);
    if (!sourceCert) continue;
    if (!isFallbackCertificationRelevant(sourceCert, relevance)) continue;

    const key = normalizeCountryText(recommendation.certName);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(recommendation);
  }

  return out;
}

type FallbackRelevanceContext = {
  hasProductSignal: boolean;
  productTokens: string[];
  hsDigits: string;
  isAutomotive: boolean;
  isTelecom: boolean;
  isCosmetic: boolean;
  isMedical: boolean;
  isFood: boolean;
  isFertilizer: boolean;
  isEnergyEfficiency: boolean;
  isSemiconductor: boolean;
};

function buildFallbackRelevanceContext(options: SmeCertFallbackOptions): FallbackRelevanceContext {
  const productText = normalizeSearchText([
    options.productName,
    options.productDescription,
  ].filter(Boolean).join(" "));
  const hsDigits = String(options.hsCode ?? "").replace(/\D/g, "");
  const productCompact = productText.replace(/\s+/g, "");
  const productTokens = dedupeStrings([
    ...productText.split(/\s+/g),
    productCompact,
  ])
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !isWeakFallbackToken(token));

  return {
    hasProductSignal: productTokens.length > 0 || hsDigits.length > 0,
    productTokens,
    hsDigits,
    isAutomotive: /^87/.test(hsDigits) || /자동차|차량|승용차|상용차|automotive|vehicle|passenger\s*car|commercial\s*vehicle|truck|bus/.test(productText),
    isTelecom: /통신|무선|블루투스|gps|와이파이|wifi|wi fi|wireless|telecom|radio|rf|bluetooth/.test(productText),
    isCosmetic: /화장품|cosmetic|beauty|skin\s*care/.test(productText),
    isMedical: /의료|의약|의료기기|medical|drug|pharma|health/.test(productText),
    isFood: /식품|음료|농산|food|beverage/.test(productText),
    isFertilizer: /비료|fertilizer/.test(productText),
    isEnergyEfficiency: /에너지|효율|냉장고|세탁기|에어컨|조명|모터|전동기|energy|efficiency|refrigerator|washing\s*machine|air\s*conditioner|lamp|motor/.test(productText),
    isSemiconductor: /^8542/.test(hsDigits) || /반도체|디램|dram|sram|메모리|집적회로|semiconductor|integrated\s*circuit|memory|chip/.test(productText),
  };
}

function isFallbackCertificationRelevant(
  cert: SmeCertItem,
  context: FallbackRelevanceContext,
): boolean {
  const certText = normalizeSearchText(`${cert.인증명 || ""} ${cert.설명 || ""}`);
  const certCompact = certText.replace(/\s+/g, "");
  if (!certText) return false;

  if (
    context.productTokens.some((token) => {
      const compactToken = token.replace(/\s+/g, "");
      return compactToken.length >= 2 && certCompact.includes(compactToken);
    })
  ) {
    return true;
  }

  if (context.isAutomotive && /자동차|차량|automotive|vehicle|motor\s*vehicle/.test(certText)) return true;
  if (context.isTelecom && /통신|무선|전파|radio|telecom|wireless|bluetooth/.test(certText)) return true;
  if (context.isCosmetic && /화장품|cosmetic/.test(certText)) return true;
  if (context.isMedical && /의료|의약|medical|drug|pharma/.test(certText)) return true;
  if (context.isFood && /식품|food|beverage/.test(certText)) return true;
  if (context.isFertilizer && /비료|fertilizer/.test(certText)) return true;
  if (context.isEnergyEfficiency && /에너지|효율|energy|efficiency/.test(certText)) return true;
  if (context.isSemiconductor && /반도체|디램|dram|메모리|집적회로|semiconductor|integrated\s*circuit|memory|chip/.test(certText)) return true;

  return false;
}

function normalizeSearchText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeStrings(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function isWeakFallbackToken(value: string): boolean {
  return /^(등|및|기타|제품|상품|부품|장비|기기|the|and|for|with|product|item|device|equipment)$/.test(value);
}

export async function evaluateSmeCertificationsWithAI(
  productName: string,
  productDescription: string,
  hsCode: string,
  countryName: string,
  certList: SmeCertItem[]
): Promise<SmeCertMatchResult[]> {
  if (certList.length === 0) return [];
  if (!productName) return [];

  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiApiKey) {
    console.error("GEMINI_API_KEY is missing");
    return [];
  }

  const geminiModel = Deno.env.get("GEMINI_MODEL") || "gemini-3-flash-preview";
  
  const systemPrompt = `You are a Korean expert in international trade compliance and product certifications.
Your task is to evaluate a list of certifications for a specific country and determine which ones are likely required or applicable for the user's product.
Return ONLY a valid JSON array of objects. Do not use markdown blocks.
Schema: [ { "certName": "name", "rationale": "reasoning in Korean", "confidence": "high|medium|low" } ]
If no certifications match, return an empty array [].`;

  const certListText = certList.map(c => `- ${c.인증명}: ${c.설명}`).join("\\n");

  const userPrompt = `Product Details:
- Name: ${productName}
- Description: ${productDescription || "N/A"}
- HS Code: ${hsCode || "N/A"}
- Target Country: ${countryName}

Available Certifications for ${countryName}:
${certListText}

Analyze the product details and select the certifications from the list above that are highly likely or moderately likely to be required. Provide a clear reasoning in Korean for each matched certification.`;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${geminiApiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    });

    if (!res.ok) {
      console.error(`Gemini API error: ${res.status} ${res.statusText}`);
      return [];
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
    
    try {
      return filterSmeCertificationRecommendationsByProductRelevance(
        parseSmeCertificationAiResponse(text),
        certList,
        { productName, productDescription, hsCode },
      );
    } catch (parseErr) {
      console.error("Failed to parse Gemini response:", text, parseErr);
    }
    
    return [];
  } catch (err) {
    console.error("evaluateSmeCertificationsWithAI failed:", err);
    return [];
  }
}

export function parseSmeCertificationAiResponse(text: string): SmeCertMatchResult[] {
  const parsed = parseFirstJsonArray(text);
  if (!Array.isArray(parsed)) return [];

  return parsed.map(raw => {
    const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const confidence = String(item.confidence || "");
    return {
      certName: String(item.certName || ""),
      rationale: String(item.rationale || ""),
      confidence: ["high", "medium", "low"].includes(confidence) ? confidence as "high" | "medium" | "low" : "medium",
      source: "ai" as const,
    };
  }).filter(item => item.certName !== "");
}

function findSmeCertSourceItem(certName: string, certList: SmeCertItem[]): SmeCertItem | null {
  const target = normalizeCertComparable(certName);
  if (!target) return null;

  for (const cert of certList) {
    const name = normalizeCertComparable(cert.인증명);
    if (name && (name === target || name.includes(target) || target.includes(name))) return cert;
  }

  for (const cert of certList) {
    const certText = normalizeCertComparable(`${cert.인증명 || ""} ${cert.설명 || ""}`);
    if (certText && certText.includes(target)) return cert;
  }

  return null;
}

function normalizeCertComparable(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function parseFirstJsonArray(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Gemini can occasionally append extra tokens after an otherwise valid JSON array.
  }

  const start = text.indexOf("[");
  if (start < 0) throw new SyntaxError("JSON array not found");

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "[") {
      depth += 1;
      continue;
    }
    if (char === "]") {
      depth -= 1;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }

  throw new SyntaxError("Complete JSON array not found");
}

function normalizeCountryText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
