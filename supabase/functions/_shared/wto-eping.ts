export type WtoEpingQueryType = "hs6" | "hs4" | "exact_product" | "product_family";
export type WtoEpingClassification = "direct_candidate" | "broad_reference" | "excluded_noise";

export type WtoEpingNotification = {
  documentSymbol: string;
  title: string;
  productsText: string;
  hsCodeText: string;
  notifyingMember: string;
  notificationType: string;
  area: string;
  distributionDate: string;
  commentDeadlineDate: string;
  sourceUrl: string;
  matchScope?: string;
  matchText?: string;
  queryType?: WtoEpingQueryType;
  epingClassification?: WtoEpingClassification;
  epingScore?: number;
  epingReason?: string;
  epingMatchedTerms?: string[];
};

export type WtoEpingTermPlan = {
  exactTerms: string[];
  familyTerms: string[];
};

export type WtoEpingClassificationResult = {
  classification: WtoEpingClassification;
  score: number;
  reason: string;
  matchedTerms: string[];
  hsMatchLevel: "hs6" | "hs4" | "hs2" | "none";
};

const WTO_EPING_MEMBER_IDS_BY_ISO2: Record<string, string> = {
  AE: "C784",
  BR: "C076",
  CN: "C156",
  DE: "C276",
  EU: "U918",
  ID: "C360",
  IN: "C356",
  JP: "C392",
  MX: "C484",
  MY: "C458",
  PL: "C616",
  TH: "C764",
  TR: "C792",
  US: "C840",
  VN: "C704",
};

const EU_MEMBER_ISO2 = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
]);

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: "\"",
  apos: "'",
  nbsp: " ",
  rsquo: "'",
  lsquo: "'",
  rdquo: "\"",
  ldquo: "\"",
};

export function resolveWtoEpingCountryIds(countryCodeIso2: string): string[] {
  const iso2 = cleanText(countryCodeIso2).toUpperCase();
  const primary = WTO_EPING_MEMBER_IDS_BY_ISO2[iso2];
  if (!primary) return [];

  const ids = [primary];
  if (EU_MEMBER_ISO2.has(iso2) && primary !== "U918") ids.push("U918");
  return ids;
}

export function buildWtoEpingSearchUrl(
  endpoint: string,
  params: {
    countryIds: string[];
    hsCode?: string;
    freeText?: string;
    page?: number;
    pageSize?: number;
  },
): string {
  const url = new URL(endpoint);
  const countryIds = params.countryIds.map((value) => cleanText(value)).filter(Boolean);
  const hsCode = normalizeHsCode(params.hsCode ?? "");
  const freeText = cleanText(params.freeText);

  url.searchParams.set("language", "1");
  url.searchParams.set("page", String(normalizePositiveInt(params.page, 1)));
  url.searchParams.set("pageSize", String(normalizePositiveInt(params.pageSize, 10)));
  if (countryIds.length > 0) url.searchParams.set("countryIds", countryIds.join(","));
  if (hsCode) url.searchParams.set("hs", hsCode);
  if (freeText) url.searchParams.set("freeText", freeText);

  return url.toString();
}

export function normalizeWtoEpingNotification(value: unknown): WtoEpingNotification {
  const record = asRecord(value);
  const notificationType = firstText(record, [
    "notificationType",
    "notificationTypeName",
    "type",
    "domain",
    "area",
    "committee",
  ]);
  const area = resolveArea(firstText(record, ["area", "domain", "committee"]) || notificationType);

  return {
    documentSymbol: firstText(record, [
      "documentSymbol",
      "notificationDocumentSymbol",
      "symbol",
      "notificationSymbol",
      "docSymbol",
    ]),
    title: firstText(record, ["titlePlain", "title", "measureTitle", "subject", "description"]),
    productsText: firstText(record, [
      "productsText",
      "products",
      "product",
      "productsCovered",
      "productDescription",
    ]),
    hsCodeText: firstText(record, ["hsCodeText", "hsCodes", "hsCode", "hs", "hsCodeList"]),
    notifyingMember: firstText(record, [
      "notifyingMember",
      "notifyingMemberName",
      "member",
      "country",
      "countryName",
      "notifyingCountry",
    ]),
    notificationType,
    area,
    distributionDate: normalizeDate(firstText(record, [
      "distributionDate",
      "circulationDate",
      "documentDate",
      "date",
    ])),
    commentDeadlineDate: normalizeDate(firstText(record, [
      "commentDeadlineDate",
      "commentDeadline",
      "finalDateForComments",
      "deadline",
    ])),
    sourceUrl: firstUrl(record, [
      "notifiedDocumentLink",
      "notificationUrl",
      "linkToNotification",
      "documentLink",
      "url",
      "sourceUrl",
    ]),
  };
}

export function buildWtoEpingSummary(item: WtoEpingNotification): string {
  const parts = [
    item.area || item.notificationType,
    item.notifyingMember,
    item.documentSymbol,
    item.title,
    item.productsText ? `Products: ${item.productsText}` : "",
    item.hsCodeText ? `HS: ${item.hsCodeText}` : "",
    item.distributionDate ? `Distributed: ${item.distributionDate}` : "",
    item.commentDeadlineDate ? `Comments due: ${item.commentDeadlineDate}` : "",
  ].filter(Boolean);

  return truncate(parts.join(" | "), 500);
}

export function cleanWtoEpingText(value: unknown): string {
  return cleanText(value);
}

export function buildWtoEpingTermPlan(params: {
  productName: string;
  productDescription?: string;
  productTags?: string[];
  englishTerms?: string[];
  tagTerms?: string[];
  hsCode?: string;
  hskCode?: string;
}): WtoEpingTermPlan {
  const exactCandidates = [
    params.productName,
    params.productDescription ?? "",
    ...(params.productTags ?? []),
    ...(params.englishTerms ?? []),
    ...(params.tagTerms ?? []),
  ].flatMap(extractExactProductTerms);

  const hsDigits = normalizeHsCode(params.hsCode || params.hskCode || "");
  const hsFamilyTerms = buildHsFamilyTerms(hsDigits);
  const textFamilyTerms = [
    params.productDescription ?? "",
    ...(params.productTags ?? []),
    ...(params.tagTerms ?? []),
  ]
    .flatMap((value) => cleanText(value).split(/[,;/|]+/g))
    .map((value) => cleanText(value).toLowerCase())
    .filter((value) => value.length >= 4)
    .filter((value) => !/^[A-Z0-9-]+$/i.test(value))
    .filter((value) => !isWeakEpingTerm(value));

  const exactTerms = dedupeTerms(exactCandidates)
    .filter((term) => !isWeakEpingTerm(term))
    .slice(0, 4);
  const exactLower = new Set(exactTerms.map((term) => term.toLowerCase()));
  const familyTerms = dedupeTerms([...hsFamilyTerms, ...textFamilyTerms])
    .filter((term) => !exactLower.has(term.toLowerCase()))
    .filter((term) => !isWeakEpingTerm(term))
    .slice(0, 6);

  return { exactTerms, familyTerms };
}

export function classifyWtoEpingNotification(
  item: WtoEpingNotification,
  context: {
    hsCode: string;
    exactTerms: string[];
    familyTerms: string[];
  },
): WtoEpingClassificationResult {
  const targetHs = normalizeHsCode(context.hsCode);
  const targetHs6 = targetHs.length >= 6 ? targetHs.slice(0, 6) : "";
  const targetHs4 = targetHs.length >= 4 ? targetHs.slice(0, 4) : "";
  const targetHs2 = targetHs.length >= 2 ? targetHs.slice(0, 2) : "";
  const itemHsCodes = extractHsTokens(item.hsCodeText);
  const hsMatchLevel = resolveHsMatchLevel(itemHsCodes, { targetHs6, targetHs4, targetHs2 });
  const titleProductsText = `${item.title} ${item.productsText}`.toLowerCase();
  const fullText = `${titleProductsText} ${item.hsCodeText}`.toLowerCase();
  const exactMatches = context.exactTerms.filter((term) => term && titleProductsText.includes(term.toLowerCase()));
  const familyMatches = context.familyTerms.filter((term) => {
    const normalized = term.toLowerCase();
    return Boolean(normalized) &&
      (titleProductsText.includes(normalized) || cleanText(item.matchText).toLowerCase().includes(normalized));
  });
  const matchedTerms = dedupeTerms([...exactMatches, ...familyMatches]);
  const hasDifferentChapter = itemHsCodes.length > 0 &&
    targetHs2.length === 2 &&
    itemHsCodes.every((code) => code.length >= 2 && code.slice(0, 2) !== targetHs2);
  const noisy = isObviousEpingNoise(fullText, targetHs2);

  if (noisy) {
    return {
      classification: "excluded_noise",
      score: 0,
      reason: "noise_domain_mismatch",
      matchedTerms,
      hsMatchLevel,
    };
  }

  if (hsMatchLevel === "hs6") {
    return {
      classification: "direct_candidate",
      score: 90,
      reason: "hs6_match",
      matchedTerms: dedupeTerms([targetHs6, ...matchedTerms]),
      hsMatchLevel,
    };
  }

  if (exactMatches.length > 0) {
    return {
      classification: "direct_candidate",
      score: 85,
      reason: "exact_product_term_match",
      matchedTerms,
      hsMatchLevel,
    };
  }

  if (hsMatchLevel === "hs4" && matchedTerms.length > 0) {
    return {
      classification: "direct_candidate",
      score: 75,
      reason: "hs4_and_product_term_match",
      matchedTerms,
      hsMatchLevel,
    };
  }

  if (familyMatches.length > 0 || cleanText(item.matchText)) {
    if (hasDifferentChapter && familyMatches.length === 0) {
      return {
        classification: "excluded_noise",
        score: 5,
        reason: "different_hs_chapter_without_product_match",
        matchedTerms,
        hsMatchLevel,
      };
    }
    return {
      classification: "broad_reference",
      score: hsMatchLevel === "hs4" ? 50 : 35,
      reason: familyMatches.length > 0 ? "product_family_term_match" : "query_term_broad_match",
      matchedTerms: familyMatches.length > 0 ? matchedTerms : dedupeTerms([cleanText(item.matchText)]),
      hsMatchLevel,
    };
  }

  if (hsMatchLevel === "hs4") {
    return {
      classification: "broad_reference",
      score: 40,
      reason: "hs4_only_match",
      matchedTerms: [targetHs4],
      hsMatchLevel,
    };
  }

  if (hsMatchLevel === "hs2") {
    return {
      classification: "broad_reference",
      score: 25,
      reason: "hs_chapter_only_match",
      matchedTerms: [targetHs2],
      hsMatchLevel,
    };
  }

  return {
    classification: "excluded_noise",
    score: 0,
    reason: hasDifferentChapter ? "different_hs_chapter" : "no_hs_or_product_match",
    matchedTerms,
    hsMatchLevel,
  };
}

function normalizeHsCode(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return digits.slice(0, 6);
}

function extractExactProductTerms(value: unknown): string[] {
  const text = cleanText(value);
  if (!text) return [];
  const terms = new Set<string>();
  for (const match of text.matchAll(/\b[A-Z0-9][A-Z0-9-]{1,15}\b/g)) {
    const term = match[0].trim();
    if (term.length >= 2 && /[A-Z]/.test(term)) terms.add(term.toUpperCase());
  }
  for (const match of text.matchAll(/\(([A-Za-z0-9][A-Za-z0-9-]{1,15})\)/g)) {
    const term = match[1].trim();
    if (term.length >= 2) terms.add(term.toUpperCase());
  }
  return Array.from(terms);
}

function buildHsFamilyTerms(hsCode: string): string[] {
  const hs4 = hsCode.slice(0, 4);
  const hs2 = hsCode.slice(0, 2);
  const byHs4: Record<string, string[]> = {
    "8542": ["semiconductor memory", "integrated circuits", "memory"],
    "8517": ["telecommunication equipment", "mobile phone", "wireless communication"],
    "8703": ["passenger cars", "motor vehicles", "vehicle"],
    "8704": ["commercial vehicles", "motor vehicles", "vehicle"],
    "9401": ["seats", "furniture"],
    "8421": ["filtering machinery", "filters"],
  };
  const byHs2: Record<string, string[]> = {
    "85": ["electrical machinery", "electronic equipment"],
    "87": ["vehicles", "motor vehicles"],
    "84": ["machinery"],
  };
  return [...(byHs4[hs4] ?? []), ...(byHs2[hs2] ?? [])];
}

function extractHsTokens(value: string): string[] {
  return Array.from(new Set((value.match(/\d{2,10}/g) ?? []).map((entry) => entry.slice(0, 6))));
}

function resolveHsMatchLevel(
  itemHsCodes: string[],
  target: { targetHs6: string; targetHs4: string; targetHs2: string },
): "hs6" | "hs4" | "hs2" | "none" {
  if (target.targetHs6 && itemHsCodes.some((code) => code.length >= 6 && code.slice(0, 6) === target.targetHs6)) {
    return "hs6";
  }
  if (target.targetHs4 && itemHsCodes.some((code) => code.length >= 4 && code.slice(0, 4) === target.targetHs4)) {
    return "hs4";
  }
  if (target.targetHs2 && itemHsCodes.some((code) => code.length >= 2 && code.slice(0, 2) === target.targetHs2)) {
    return "hs2";
  }
  return "none";
}

function isObviousEpingNoise(text: string, targetHs2: string): boolean {
  const normalized = text.toLowerCase();
  const electronicsTarget = ["84", "85", "90"].includes(targetHs2);
  if (!electronicsTarget) return false;
  return [
    "cosmetic",
    "toiletr",
    "food",
    "fertilizer",
    "pesticide",
    "agricultur",
    "aquatic",
    "fishery",
    "meat",
    "dairy",
    "pharmaceutical",
    "medical device",
    "medicine",
    "crop",
    "seed",
  ].some((keyword) => normalized.includes(keyword));
}

function dedupeTerms(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = cleanText(value);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function isWeakEpingTerm(value: string): boolean {
  const normalized = cleanText(value).toLowerCase();
  return !normalized ||
    normalized.length < 2 ||
    [
      "hs",
      "hsk",
      "code",
      "product",
      "goods",
      "item",
      "export",
      "import",
      "etc",
      "and",
      "or",
      "the",
    ].includes(normalized);
}

function normalizePositiveInt(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  const normalized = Math.trunc(Number(value));
  return normalized > 0 ? normalized : fallback;
}

function firstText(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    const text = cleanText(value);
    if (text) return text;
  }
  return "";
}

function firstUrl(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const url = extractUrl(record[key]);
    if (url) return url;
  }
  return extractUrl(record);
}

function extractUrl(value: unknown): string {
  if (typeof value === "string") {
    const text = decodeHtmlEntities(value.trim());
    const match = text.match(/https?:\/\/[^\s"'<>]+/i);
    return match?.[0] ?? "";
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const url = extractUrl(entry);
      if (url) return url;
    }
    return "";
  }
  const record = asRecord(value);
  if (Object.keys(record).length === 0) return "";
  for (const key of ["url", "href", "link", "documentUrl", "fileUrl"]) {
    const url = extractUrl(record[key]);
    if (url) return url;
  }
  return "";
}

function cleanText(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value.map((entry) => cleanText(entry)).filter(Boolean).join(", ");
  }
  if (typeof value === "object") {
    const record = asRecord(value);
    for (const key of ["name", "title", "value", "text", "description", "label"]) {
      const text = cleanText(record[key]);
      if (text) return text;
    }
    return "";
  }
  return decodeHtmlEntities(String(value))
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDate(value: string): string {
  const raw = cleanText(value);
  if (!raw) return "";
  const isoDate = raw.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (isoDate) return isoDate;
  const compact = raw.match(/\b(\d{4})(\d{2})(\d{2})\b/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  return raw;
}

function resolveArea(value: string): string {
  const normalized = cleanText(value).toUpperCase();
  if (normalized.includes("SPS")) return "SPS";
  if (normalized.includes("TBT")) return "TBT";
  return normalized;
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entityRaw: string) => {
    const entity = entityRaw.toLowerCase();
    if (entity.startsWith("#x")) {
      const codePoint = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (entity.startsWith("#")) {
      const codePoint = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return HTML_ENTITY_MAP[entity] ?? match;
  });
}

function truncate(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  return `${value.slice(0, maxLen - 1)}...`;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
