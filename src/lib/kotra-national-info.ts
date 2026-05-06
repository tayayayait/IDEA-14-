export type NationalInfoRelevance = "direct" | "conditional" | "common" | "unrelated";

export type NationalInfoKind = "regulated" | "common";

export type NationalInfoContext = {
  productName?: string | null;
  hsCode?: string | null;
  hskCode?: string | null;
};

export type ProductFamilyKey =
  | "machinery_electronics"
  | "vehicle"
  | "food_agriculture"
  | "pharmaceutical"
  | "cosmetics"
  | "plastic"
  | "steel_metal"
  | "precision_medical_optical";

export type ProductFamily = {
  key: ProductFamilyKey;
  label: string;
  keywords: string[];
};

export type ClassifiedNationalInfoParagraph = {
  text: string;
  relevance: NationalInfoRelevance;
  reasons: string[];
};

export type NationalInfoPresentation = {
  label: string;
  rawText: string;
  direct: string[];
  conditional: string[];
  common: string[];
  defaultBullets: string[];
  unrelatedCount: number;
};

const NO_DIRECT_MATCH_TEXT = "현재 원문에서 해당 HS코드 또는 제품명과 직접 일치하는 규제는 확인되지 않았습니다.";
const NO_SUMMARY_TEXT = "기본 화면에 표시할 완성된 요약 문장이 없습니다. 원문을 확인해 주세요.";

const PRODUCT_TOKEN_EXCLUSIONS = new Set(
  [
    "제품",
    "상품",
    "품목",
    "부품",
    "제조",
    "장비",
    "기기",
    "기계",
    "수출",
    "수입",
    "관련",
    "대상",
    "product",
    "products",
    "goods",
    "item",
    "items",
    "part",
    "parts",
    "component",
    "components",
    "machine",
    "machinery",
    "equipment",
    "device",
    "devices",
  ].map(normalizeComparableText),
);

const PRODUCT_FAMILIES: ProductFamily[] = [
  {
    key: "machinery_electronics",
    label: "기계/전기전자/산업장비",
    keywords: [
      "기계",
      "기계류",
      "장비",
      "설비",
      "산업장비",
      "전기",
      "전자",
      "전기전자",
      "전자제품",
      "반도체",
      "집적회로",
      "레이저",
      "가공기",
      "machinery",
      "machine",
      "equipment",
      "electrical",
      "electronics",
      "semiconductor",
      "integrated circuit",
      "laser",
    ],
  },
  {
    key: "vehicle",
    label: "자동차/차량",
    keywords: ["자동차", "차량", "승용차", "상용차", "트럭", "버스", "오토바이", "vehicle", "automobile", "car", "truck"],
  },
  {
    key: "food_agriculture",
    label: "농식품/식품",
    keywords: ["농산물", "축산물", "수산물", "식품", "음료", "사료", "검역", "위생검사", "food", "agriculture", "livestock"],
  },
  {
    key: "pharmaceutical",
    label: "의약품",
    keywords: ["의약품", "약품", "제약", "백신", "pharmaceutical", "medicine", "drug", "vaccine"],
  },
  {
    key: "cosmetics",
    label: "화장품",
    keywords: ["화장품", "향수", "cosmetic", "cosmetics", "perfume"],
  },
  {
    key: "plastic",
    label: "플라스틱",
    keywords: ["플라스틱", "고무", "수지", "폴리에틸렌", "plastic", "polyethylene", "resin", "rubber"],
  },
  {
    key: "steel_metal",
    label: "철강/금속",
    keywords: ["철강", "금속", "강판", "알루미늄", "구리", "steel", "metal", "aluminum", "aluminium", "copper"],
  },
  {
    key: "precision_medical_optical",
    label: "의료기기/정밀기기/광학기기",
    keywords: ["의료기기", "정밀기기", "광학", "측정기기", "렌즈", "medical device", "precision", "optical", "measuring"],
  },
];

const CONDITIONAL_KEYWORDS = [
  "경우",
  "해당하는 경우",
  "분류되는 경우",
  "중고",
  "사용된",
  "재사용",
  "전기전자제품",
  "rohs",
  "환경규제",
  "의료기기일 경우",
  "식품일 경우",
  "화장품일 경우",
  "used",
  "second hand",
  "if ",
  "when ",
];

const COMMON_KEYWORDS = [
  "모든 수입품",
  "전체 수입품",
  "수입통관",
  "통관 절차",
  "통관 지연",
  "hs 코드 확인",
  "hs코드 확인",
  "hs code",
  "관세율 확인",
  "관세율",
  "fta",
  "원산지증명서",
  "원산지 증명서",
  "특혜세율",
  "수입신고",
  "세관",
  "customs",
  "tariff",
  "certificate of origin",
];

const INCOMPLETE_NUMERIC_ENDING_PATTERN = /\d+\.$/;
const DEFAULT_MAX_SENTENCE_LENGTH = 180;

export const inferHsProductFamilies = (hsCode?: string | null, hskCode?: string | null): ProductFamily[] => {
  const digits = normalizeHsOrHsk(hsCode) || normalizeHsOrHsk(hskCode);
  const chapter = Number(digits.slice(0, 2));
  if (!Number.isFinite(chapter)) return [];

  if (chapter >= 1 && chapter <= 24) return familiesByKeys(["food_agriculture"]);
  if (chapter === 30) return familiesByKeys(["pharmaceutical"]);
  if (chapter === 33) return familiesByKeys(["cosmetics"]);
  if (chapter === 39) return familiesByKeys(["plastic"]);
  if (chapter >= 72 && chapter <= 83) return familiesByKeys(["steel_metal"]);
  if (chapter === 84 || chapter === 85) return familiesByKeys(["machinery_electronics"]);
  if (chapter === 87) return familiesByKeys(["vehicle"]);
  if (chapter === 90) return familiesByKeys(["precision_medical_optical"]);
  return [];
};

export const classifyNationalInfoParagraph = (
  paragraph: string,
  context: NationalInfoContext,
): ClassifiedNationalInfoParagraph => {
  const text = normalizeWhitespace(paragraph);
  if (!text) return { text, relevance: "unrelated", reasons: ["empty"] };

  const normalizedText = normalizeComparableText(text);
  const hsSignals = buildHsSignals(context);
  const productTokens = buildProductTokens(context.productName ?? "");
  const contextFamilies = inferHsProductFamilies(context.hsCode, context.hskCode);
  const contextFamilyKeys = new Set(contextFamilies.map((family) => family.key));
  const paragraphFamilies = PRODUCT_FAMILIES.filter((family) => hasAnyKeyword(normalizedText, family.keywords));
  const paragraphFamilyKeys = new Set(paragraphFamilies.map((family) => family.key));

  const exactHsMatched = hsSignals.exact.some((signal) => signal && normalizedText.includes(signal));
  const headingMatched = hsSignals.heading.some((signal) => signal && normalizedText.includes(signal));
  const chapterMatched = Boolean(hsSignals.chapter && normalizedText.includes(hsSignals.chapter));
  const productMatched = productTokens.some((token) => normalizedText.includes(token));
  const familyMatched = paragraphFamilies.some((family) => contextFamilyKeys.has(family.key));
  const unrelatedFamilyMatched = paragraphFamilies.some((family) => !contextFamilyKeys.has(family.key));
  const conditionalMatched = hasAnyKeyword(normalizedText, CONDITIONAL_KEYWORDS);
  const commonMatched = hasAnyKeyword(normalizedText, COMMON_KEYWORDS);

  if (exactHsMatched || productMatched || (headingMatched && familyMatched) || (chapterMatched && familyMatched)) {
    return {
      text,
      relevance: conditionalMatched ? "conditional" : "direct",
      reasons: compactReasons([
        exactHsMatched ? "hs-exact" : "",
        headingMatched ? "hs-heading" : "",
        chapterMatched ? "hs-chapter" : "",
        productMatched ? "product-token" : "",
        familyMatched ? "product-family" : "",
        conditionalMatched ? "conditional" : "",
      ]),
    };
  }

  if (conditionalMatched && familyMatched) {
    return { text, relevance: "conditional", reasons: ["conditional", "product-family"] };
  }

  if (commonMatched) {
    return { text, relevance: "common", reasons: ["common-import-reference"] };
  }

  if (unrelatedFamilyMatched) {
    return { text, relevance: "unrelated", reasons: [...paragraphFamilyKeys].filter((key) => !contextFamilyKeys.has(key)) };
  }

  if (familyMatched) {
    return { text, relevance: "direct", reasons: ["product-family"] };
  }

  return { text, relevance: "unrelated", reasons: ["no-product-signal"] };
};

export const buildNationalInfoPresentation = (params: {
  label: string;
  text: string;
  context: NationalInfoContext;
  kind: NationalInfoKind;
}): NationalInfoPresentation => {
  const rawText = cleanNationalInfoText(params.text);
  if (!rawText) {
    return {
      label: params.label,
      rawText,
      direct: [],
      conditional: [],
      common: [],
      defaultBullets: [NO_SUMMARY_TEXT],
      unrelatedCount: 0,
    };
  }

  if (params.kind === "common") {
    const bullets = extractCompleteSummaryBullets(rawText);
    return {
      label: params.label,
      rawText,
      direct: [],
      conditional: [],
      common: bullets,
      defaultBullets: bullets.length > 0 ? bullets : [NO_SUMMARY_TEXT],
      unrelatedCount: 0,
    };
  }

  const classified = splitNationalInfoParagraphs(rawText).map((paragraph) =>
    classifyNationalInfoParagraph(paragraph, params.context),
  );
  const direct = summarizeParagraphGroup(classified, "direct");
  const conditional = summarizeParagraphGroup(classified, "conditional");
  const common = summarizeParagraphGroup(classified, "common");
  const normalizedDirect = direct.length > 0 ? direct : [NO_DIRECT_MATCH_TEXT];
  const defaultBullets = dedupeStrings([...normalizedDirect, ...common, ...conditional]).slice(0, 8);

  return {
    label: params.label,
    rawText,
    direct: normalizedDirect,
    conditional,
    common,
    defaultBullets: defaultBullets.length > 0 ? defaultBullets : [NO_SUMMARY_TEXT],
    unrelatedCount: classified.filter((item) => item.relevance === "unrelated").length,
  };
};

export const extractCompleteSummaryBullets = (
  text: string,
  options?: { maxBullets?: number; maxSentenceLength?: number },
): string[] => {
  const maxBullets = options?.maxBullets ?? 3;
  const maxSentenceLength = options?.maxSentenceLength ?? DEFAULT_MAX_SENTENCE_LENGTH;
  const sentences = splitCompleteSentences(cleanNationalInfoText(text));
  const out: string[] = [];

  for (const sentence of sentences) {
    const compact = compactLongSentence(sentence, maxSentenceLength);
    if (!compact) continue;
    if (out.includes(compact)) continue;
    out.push(compact);
    if (out.length >= maxBullets) break;
  }

  return out;
};

export const cleanNationalInfoText = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const decoded = decodeHtmlEntities(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ");

  return decoded.trim();
};

export const splitNationalInfoParagraphs = (text: string): string[] => {
  const cleaned = cleanNationalInfoText(text);
  if (!cleaned) return [];

  const byBlankLine = cleaned
    .split(/\n\s*\n/g)
    .map((entry) => normalizeWhitespace(entry))
    .filter(Boolean);

  if (byBlankLine.length > 1) return byBlankLine;

  return cleaned
    .split(/\n|(?=^\s*(?:[-*]|[0-9]+[.)])\s+)/gm)
    .map((entry) => normalizeWhitespace(entry.replace(/^\s*(?:[-*]|[0-9]+[.)])\s+/, "")))
    .filter(Boolean);
};

const summarizeParagraphGroup = (
  items: ClassifiedNationalInfoParagraph[],
  relevance: Exclude<NationalInfoRelevance, "unrelated">,
): string[] => {
  const bullets: string[] = [];
  for (const item of items) {
    if (item.relevance !== relevance) continue;
    const summary = extractCompleteSummaryBullets(item.text, { maxBullets: 1 })[0];
    if (!summary || bullets.includes(summary)) continue;
    bullets.push(summary);
    if (bullets.length >= 3) break;
  }
  return bullets;
};

const splitCompleteSentences = (text: string): string[] => {
  const cleaned = normalizeWhitespace(text);
  const out: string[] = [];
  let start = 0;

  for (let index = 0; index < cleaned.length; index += 1) {
    const char = cleaned[index];
    if (!isSentenceTerminal(char)) continue;
    if (isDecimalPoint(cleaned, index)) continue;

    const sentence = cleaned.slice(start, index + 1).trim();
    if (isCompleteSentence(sentence)) out.push(sentence);
    start = index + 1;
  }

  return out;
};

const compactLongSentence = (sentence: string, maxLength: number): string | null => {
  const cleaned = normalizeWhitespace(sentence);
  if (!isCompleteSentence(cleaned)) return null;
  if (cleaned.length <= maxLength) return cleaned;

  const withoutParentheses = normalizeWhitespace(cleaned.replace(/\([^)]{1,80}\)/g, ""));
  if (withoutParentheses.length <= maxLength && isCompleteSentence(withoutParentheses)) return withoutParentheses;

  const sourceReduced = withoutParentheses.replace(/^.{2,80}(?:에 따르면|에 의하면|에 따르면,)\s*/u, "");
  const normalized = normalizeWhitespace(sourceReduced);
  if (normalized.length <= maxLength && isCompleteSentence(normalized)) return normalized;

  return null;
};

const isCompleteSentence = (sentence: string): boolean => {
  if (sentence.length < 8) return false;
  if (!/[.!?。]$/.test(sentence)) return false;
  if (INCOMPLETE_NUMERIC_ENDING_PATTERN.test(sentence)) return false;
  return true;
};

const isSentenceTerminal = (char: string): boolean => char === "." || char === "!" || char === "?" || char === "。";

const isDecimalPoint = (text: string, index: number): boolean => {
  if (text[index] !== ".") return false;
  const previous = text[index - 1] ?? "";
  const next = text[index + 1] ?? "";
  return /\d/.test(previous) && /\d/.test(next);
};

const buildHsSignals = (context: NationalInfoContext): { exact: string[]; heading: string[]; chapter: string } => {
  const hs = normalizeHsOrHsk(context.hsCode);
  const hsk = normalizeHsOrHsk(context.hskCode);
  const hs6 = hs.length >= 6 ? hs.slice(0, 6) : hsk.slice(0, 6);
  const heading = hs6.slice(0, 4);
  const chapter = hs6.slice(0, 2);
  return {
    exact: dedupeStrings([hsk, hs, hs6].filter(Boolean)),
    heading: heading ? [heading] : [],
    chapter,
  };
};

const buildProductTokens = (productName: string): string[] => {
  const normalized = normalizeComparableText(productName);
  const words = productName
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/gu)
    .map(normalizeComparableText)
    .filter((token) => token.length >= 2)
    .filter((token) => !PRODUCT_TOKEN_EXCLUSIONS.has(token));

  return dedupeStrings([normalized, ...words])
    .filter((token) => token.length >= 2)
    .filter((token) => !PRODUCT_TOKEN_EXCLUSIONS.has(token));
};

const hasAnyKeyword = (normalizedText: string, keywords: string[]): boolean =>
  keywords.some((keyword) => {
    const normalizedKeyword = normalizeComparableText(keyword);
    return Boolean(normalizedKeyword && normalizedText.includes(normalizedKeyword));
  });

const familiesByKeys = (keys: ProductFamilyKey[]): ProductFamily[] => {
  const keySet = new Set(keys);
  return PRODUCT_FAMILIES.filter((family) => keySet.has(family.key));
};

const compactReasons = (values: string[]): string[] => values.filter(Boolean);

function normalizeHsOrHsk(value?: string | null): string {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeComparableText(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, " ").trim();

const dedupeStrings = (values: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
};

const decodeHtmlEntities = (value: string): string => {
  const entityMap: Record<string, string> = {
    "&nbsp;": " ",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": "\"",
    "&apos;": "'",
    "&#39;": "'",
    "&lsquo;": "'",
    "&rsquo;": "'",
    "&ldquo;": "\"",
    "&rdquo;": "\"",
    "&middot;": "·",
    "&hellip;": "...",
  };

  let out = value.replace(
    /&(nbsp|amp|lt|gt|quot|apos|#39|lsquo|rsquo|ldquo|rdquo|middot|hellip);/gi,
    (matched) => entityMap[matched.toLowerCase()] ?? matched,
  );
  out = out.replace(/&#(\d+);/g, (matched, dec) => {
    const codePoint = Number(dec);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : matched;
  });
  out = out.replace(/&#x([0-9a-f]+);/gi, (matched, hex) => {
    const codePoint = Number.parseInt(hex, 16);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : matched;
  });
  return out;
};
