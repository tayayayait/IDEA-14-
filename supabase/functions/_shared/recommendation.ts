export type CandidateSignal =
  | "target_market_note"
  | "cert_data"
  | "regulation_data"
  | "news_match"
  | "hs6_exact"
  | "hs4_prefix"
  | "product_keyword"
  | "fallback_candidate"
  | "customs_export_data";

export type ScoreParts = {
  market: number;
  cert: number;
  regulation: number;
  payment: number;
  safety: number;
};

export type SeedCountry = {
  code: string;
  name: string;
};

export type TargetMarket = {
  code: string;
  name: string;
};

type CountryAliasEntry = {
  code: string;
  normalizedAlias: string;
  hasLatin: boolean;
  length: number;
};

type CountryAliasMatch = {
  code: string;
  start: number;
  end: number;
  length: number;
};

type AssessNewsRelevanceInput = {
  text: string;
  tokens: string[];
  hsCode?: string;
  productName?: string;
};

type AssessBackgroundNewsRelevanceInput = AssessNewsRelevanceInput & {
  countryCode: string;
  recencyTier?: NewsRecencyTier;
};

export type CountryNewsMatchType = "direct_country" | "background_country" | "mismatch";

type AssessCountryNewsMatchInput = {
  countryCode: string;
  title?: string | null;
  summary?: string | null;
  keywords?: string | null;
  body?: string | null;
  natn?: string | null;
  regn?: string | null;
};

export type CountryNewsMatchAssessment = {
  type: CountryNewsMatchType;
  reason: string;
  directCodes: string[];
  backgroundCodes: string[];
};

export type NewsRelevanceAssessment = {
  score: number;
  isDirectEvidence: boolean;
  hs6Matched: boolean;
  hs4Matched: boolean;
  strongMatchCount: number;
  matchedStrongTokens: string[];
  matchedWeakTokens: string[];
  anchorMatchCount: number;
  matchedAnchorTokens: string[];
};

export type BackgroundNewsRelevanceAssessment = {
  include: boolean;
  scoreRelevant: boolean;
  score: number;
  countryMatched: boolean;
};

export type NewsRecencyTier = "recent" | "supplementary" | "archive";

export type NewsCategory =
  | "product_direct"
  | "geopolitical_risk"
  | "industry_trend"
  | "archive_reference";

export type AiNewsCategory =
  | "direct_product"
  | "adjacent_value_chain"
  | "broad_macro_export_env"
  | "unrelated";

export type AiNewsRelevanceAssessment = {
  category: AiNewsCategory;
  productRelevanceScore: number;
  countryRelevanceScore: number;
  exportImpactScore: number;
  basis: string;
  rejectReason: string;
  reason: string;
};

export type NewsClassificationInput = {
  title?: string;
  summary?: string;
  keywords?: string;
  recencyTier: NewsRecencyTier;
  isProductDirect: boolean;
  relevance: Pick<NewsRelevanceAssessment, "hs6Matched" | "hs4Matched" | "strongMatchCount" | "anchorMatchCount">;
};

export type SelectNewsEvidenceInput<T extends {
  newsCategory: NewsCategory;
  recencyTier: NewsRecencyTier;
  publishedAt?: string | null;
}> = {
  items: T[];
  perCategoryLimit?: number;
};

export type SelectNewsEvidenceResult<T> = {
  productDirect: T[];
  geopoliticalRisk: T[];
  industryTrend: T[];
  archiveReference: T[];
};

type ProductContextNewsInput = {
  productName: string;
  hsCode?: string;
  title?: string;
  summary?: string;
  keywords?: string;
  body?: string;
  tokens?: string[];
};

type ParseProductMetaResult = {
  targetMarketNote: string;
  tags: string[];
};

type CollectCandidatePoolInput = {
  signalMap: Map<string, Set<CandidateSignal>>;
  targetMarketCodes: string[];
  minCount?: number;
  fallbackPool?: SeedCountry[];
};

type CollectCandidatePoolResult = {
  countries: SeedCountry[];
  signalByCountry: Map<string, CandidateSignal[]>;
  fallbackCodes: string[];
};

type FallbackScoreInput = {
  apiMarketScore: number;
  hasCountryInfo: boolean;
  hasCountryNews: boolean;
  certSignalCount: number;
  regulationSignalCount: number;
  hasHs6: boolean;
  hasHs4: boolean;
  targetMatched: boolean;
  paymentEvidenceScore?: number | null;
  safetyEvidenceScore?: number | null;
};

type RiskEvidenceLevel = "info" | "caution" | "high" | "unavailable";

type KsurePaymentEvidenceInput = {
  countryGradeLevel?: RiskEvidenceLevel | null;
  industryRiskLevel?: RiskEvidenceLevel | null;
  paymentRiskLevel?: RiskEvidenceLevel | null;
  paymentScope?: "country" | "global" | null;
};

type SafetyControlEvidenceInput = {
  strategicMatchType?: "exact_hsk" | "prefix6_candidate" | "none" | string | null;
  recallCount?: number | null;
  certCount?: number | null;
  safetyStatus?: "success" | "empty" | "error" | "key_missing" | string | null;
};

type ApiMarketInput = {
  hasCountryInfo: boolean;
  hasNews: boolean;
  newsCount: number;
  signalCount: number;
};

type ExportRegionRankMarketInput = {
  rank: number | null;
  exportShare: number | null;
  hsMatched: boolean;
};

type ResultStateInput = {
  apiPartial: boolean;
  fallbackUsed: boolean;
};

const SCORE_LIMIT = {
  market: 30,
  cert: 20,
  regulation: 20,
  payment: 20,
  safety: 10,
} as const;

const COUNTRY_ROWS: SeedCountry[] = [
  { code: "AE", name: "United Arab Emirates" },
  { code: "BR", name: "Brazil" },
  { code: "CN", name: "China" },
  { code: "DE", name: "Germany" },
  { code: "ID", name: "Indonesia" },
  { code: "IN", name: "India" },
  { code: "JP", name: "Japan" },
  { code: "MX", name: "Mexico" },
  { code: "MY", name: "Malaysia" },
  { code: "PL", name: "Poland" },
  { code: "TH", name: "Thailand" },
  { code: "TR", name: "Turkey" },
  { code: "US", name: "United States" },
  { code: "VN", name: "Vietnam" },
];

export const COUNTRY_NAME_BY_CODE: Record<string, string> = Object.fromEntries(
  COUNTRY_ROWS.map((row) => [row.code, row.name]),
);

export const COUNTRY_ALIAS_MAP: Record<string, string[]> = {
  AE: ["United Arab Emirates", "UAE", "\uC544\uB78D\uC5D0\uBBF8\uB9AC\uD2B8"],
  BR: ["Brazil", "\uBE0C\uB77C\uC9C8"],
  CN: ["China", "PRC", "People's Republic of China", "Zhongguo", "\uC911\uAD6D", "\uC911\uD654\uC778\uBBFC\uACF5\uD654\uAD6D"],
  DE: ["Germany", "Deutschland", "\uB3C5\uC77C"],
  ID: ["Indonesia", "\uC778\uB3C4\uB124\uC2DC\uC544"],
  IN: ["India", "\uC778\uB3C4"],
  JP: ["Japan", "Nippon", "\uC77C\uBCF8"],
  MX: ["Mexico", "\uBA55\uC2DC\uCF54"],
  MY: ["Malaysia", "\uB9D0\uB808\uC774\uC2DC\uC544"],
  PL: ["Poland", "\uD3F4\uB780\uB4DC"],
  TH: ["Thailand", "\uD0DC\uAD6D"],
  TR: ["Turkey", "Turkiye", "\uD280\uB974\uD0A4\uC608", "\uD130\uD0A4"],
  US: ["United States", "United States of America", "USA", "US", "\uBBF8\uAD6D", "\uBBF8\uD569\uC911\uAD6D"],
  VN: ["Vietnam", "Socialist Republic of Vietnam", "\uBCA0\uD2B8\uB0A8", "\uBCA0\uD2B8\uB0A8 \uC0AC\uD68C\uC8FC\uC758 \uACF5\uD654\uAD6D"],
};

const HANGUL_TRAILING_MARKET_SUFFIXES = ["시장", "수출", "진출", "대상", "향", "내"];

const COUNTRY_ALIAS_ENTRIES: CountryAliasEntry[] = buildCountryAliasEntries();

const REGION_TARGET_CODE_MAP: Array<{ aliases: string[]; codes: string[] }> = [
  {
    aliases: [
      "\uB3D9\uB0A8\uC544",
      "\uB3D9\uB0A8\uC544\uC2DC\uC544",
      "asean",
      "southeast asia",
      "south east asia",
    ],
    codes: ["VN", "TH", "MY", "ID"],
  },
  {
    aliases: [
      "\uBD81\uBBF8",
      "\uBD81\uBBF8\uC2DC\uC7A5",
      "north america",
      "na market",
      "us and mexico",
    ],
    codes: ["US", "MX"],
  },
];

export const FALLBACK_COUNTRY_POOL: SeedCountry[] = [
  { code: "US", name: COUNTRY_NAME_BY_CODE.US },
  { code: "DE", name: COUNTRY_NAME_BY_CODE.DE },
  { code: "JP", name: COUNTRY_NAME_BY_CODE.JP },
  { code: "CN", name: COUNTRY_NAME_BY_CODE.CN },
  { code: "VN", name: COUNTRY_NAME_BY_CODE.VN },
  { code: "IN", name: COUNTRY_NAME_BY_CODE.IN },
];

export function buildCountryAliases(countryCode: string, countryName = ""): string[] {
  const code = String(countryCode ?? "").toUpperCase().trim();
  const aliases: string[] = [];

  const addAlias = (value: string): void => {
    const normalized = normalizeSearchText(value);
    if (!normalized) return;
    if (/^[a-z]{2}$/i.test(normalized)) return;
    aliases.push(normalized);
  };

  for (const alias of COUNTRY_ALIAS_MAP[code] ?? []) addAlias(alias);
  addAlias(COUNTRY_NAME_BY_CODE[code] ?? "");

  const rawCountryName = String(countryName ?? "").trim();
  if (rawCountryName) {
    addAlias(rawCountryName);
    addAlias(rawCountryName.replace(/\([^)]*\)/g, " "));

    for (const match of rawCountryName.matchAll(/\(([^)]*)\)/g)) {
      addAlias(match[1] ?? "");
    }
  }

  return dedupeStrings(aliases);
}

export function isCountryTextMatched(countryCode: string, countryName: string, text: string): boolean {
  const code = String(countryCode ?? "").toUpperCase().trim();
  if (!code || !(code in COUNTRY_NAME_BY_CODE)) return false;
  if (detectCountryCodesFromText(text).includes(code)) return true;

  const normalizedText = normalizeSearchText(text);
  if (!normalizedText) return false;

  return buildCountryAliases(code, countryName).some((alias) => hasAllowedCountryAliasMatch(normalizedText, alias));
}

const WEAK_PRODUCT_TOKENS = new Set(
  [
    "material",
    "materials",
    "component",
    "components",
    "part",
    "parts",
    "machine",
    "machinery",
    "industrial",
    "industry",
    "product",
    "products",
    "market",
    "markets",
    "background",
    "basis",
    "based",
    "feature",
    "features",
    "structure",
    "structures",
    "data",
    "access",
    "physical",
    "main",
    "major",
    "key",
    "relevant",
    "related",
    "distribution",
    "channel",
    "channels",
    "textile",
    "fabric",
    "\uC9C1\uBB3C",
    "\uC18C\uC7AC",
    "\uBD80\uD488",
    "\uAE30\uACC4",
    "\uC0B0\uC5C5",
    "\uC81C\uD488",
    "\uC2DC\uC7A5",
    "\uC5D0\uC11C",
    "\uC8FC\uC694",
    "\uC704\uD574",
    "\uAD00\uB828",
    "\uB370\uC774\uD130",
    "\uC811\uADFC",
    "\uBB3C\uB9AC\uC801",
    "구동",
    "구조",
    "주요",
    "특징",
    "기반",
    "기반의",
    "배경",
    "배경을",
    "유통",
    "지역",
    "정보",
  ].map((token) => normalizeToken(token)),
);

export const EXPORT_ENVIRONMENT_QUERY_TERMS = [
  "\ud658\uc728",
  "\uae08\ub9ac",
  "\ubb3c\uac00",
  "\uc218\uc785 \uc218\uc694",
  "\uacf5\uae09\ub9dd",
  "\ubb34\uc5ed\uc815\ucc45",
] as const;

const GEOPOLITICAL_NEWS_KEYWORDS = [
  "economic growth",
  "growth outlook",
  "business confidence",
  "consumer confidence",
  "consumer demand",
  "consumer spending",
  "pmi",
  "gdp",
  "e-commerce",
  "recession",
  "retail market",
  "retail channel",
  "retail digital",
  "slowdown",
  "currency",
  "foreign exchange",
  "fx",
  "tariff",
  "sanction",
  "trade war",
  "supply chain",
  "embargo",
  "quota",
  "trade dispute",
  "anti-dumping",
  "countervailing",
  "import ban",
  "shipping cost",
  "freight cost",
  "logistics",
  "online retail",
  "exchange rate",
  "interest rate",
  "policy rate",
  "monetary policy",
  "inflation",
  "consumer price",
  "producer price",
  "import demand",
  "domestic demand",
  "purchasing power",
  "industrial production",
  "industrial investment",
  "facility investment",
  "capital expenditure",
  "business investment",
  "trade policy",
  "commodity price",
  "customs policy",
  "customs clearance",
  "port congestion",
  "\uad00\uc138",
  "\uacbd\uae30",
  "\uacbd\uc81c\uc131\uc7a5",
  "\uc131\uc7a5\ub960",
  "\uacbd\uae30\ub454\ud654",
  "\uacbd\uae30\uce68\uccb4",
  "\uc18c\ube44\uc2ec\ub9ac",
  "\uc18c\ube44",
  "\uc18c\ube44\uc790",
  "\uc18c\ub9e4",
  "\uc989\uc2dc\uc18c\ub9e4",
  "\uc774\ucee4\uba38\uc2a4",
  "\uae30\uc5c5\uc2e0\ub8b0",
  "\uc81c\uc870\uc5c5 pmi",
  "\uc218\uc785\uaddc\uc81c",
  "\ubb34\uc5ed\ubd84\uc7c1",
  "\ubb34\uc5ed\uc815\ucc45",
  "\ubb34\uc5ed\uc7a5\ubcbd",
  "\uc81c\uc7ac",
  "\uc804\uc7c1",
  "\uacf5\uae09\ub9dd",
  "\ud658\uc728",
  "\uc678\ud658",
  "\ub2ec\ub7ec",
  "\uc720\ub85c",
  "\ud1b5\ud654",
  "\uae08\ub9ac",
  "\uae30\uc900\uae08\ub9ac",
  "\ud1b5\ud654\uc815\ucc45",
  "\ubb3c\uac00",
  "\uc778\ud50c\ub808\uc774\uc158",
  "\uc18c\ube44\uc790\ubb3c\uac00",
  "\uc0dd\uc0b0\uc790\ubb3c\uac00",
  "\uc218\uc785 \uc218\uc694",
  "\ub0b4\uc218",
  "\uad6c\ub9e4\ub825",
  "\uc0b0\uc5c5\uc0dd\uc0b0",
  "\uc124\ube44\ud22c\uc790",
  "\uc0b0\uc5c5 \ud22c\uc790",
  "\ud22c\uc790\uc2ec\ub9ac",
  "\uc6d0\uc790\uc7ac",
  "\uc6d0\uc790\uc7ac \uac00\uaca9",
  "\ubb3c\ub958",
  "\ubb3c\ub958\ube44",
  "\ud574\uc0c1\uc6b4\uc784",
  "\uc6b4\uc784",
  "\ud56d\ub9cc",
  "\ud1b5\uad00",
  "\ud604\uc9c0 \uc815\ucc45",
  "\uc218\ucd9c\uaddc\uc81c",
  "\ubc18\ub364\ud551",
  ...EXPORT_ENVIRONMENT_QUERY_TERMS,
].map((value) => normalizeSearchText(value));

const COMMON_STOPWORDS = new Set(
  [
    "and",
    "for",
    "with",
    "from",
    "into",
    "about",
    "the",
    "a",
    "an",
    "to",
    "of",
    "in",
    "on",
    "by",
    "is",
    "are",
    "this",
    "that",
    "as",
    "at",
    "or",
    "be",
    "new",
    "latest",
    "background",
    "basis",
    "based",
    "main",
    "major",
    "key",
    "relevant",
    "related",
    "feature",
    "features",
    "structure",
    "structures",
    "distribution",
    "channel",
    "channels",
    "\uBC0F",
    "\uAD00\uB828",
    "\uB4F1",
    "\uC218",
    "\uB300\uD55C",
    "\uC704\uD55C",
    "\uC5D0\uC11C",
    "\uC8FC\uC694",
    "\uC704\uD574",
    "\uAD00\uB828",
    "\uC811\uADFC",
    "\uBB3C\uB9AC\uC801",
    "\uC81C\uD488",
    "구동",
    "구조",
    "주요",
    "특징",
    "특징을",
    "기반",
    "기반의",
    "배경",
    "배경을",
    "유통",
    "위해",
    "등의",
    "지역",
    "정보",
  ].map((token) => normalizeToken(token)),
);

export function normalizeHsCode(value: string): string {
  return String(value ?? "")
    .replace(/\D+/g, "")
    .slice(0, 10);
}

export function isHs6ExactMatch(productHsCode: string, candidateHsText: string): boolean {
  const hs6 = normalizeHsCode(productHsCode).slice(0, 6);
  if (hs6.length < 6) return false;
  const candidate = normalizeHsCode(candidateHsText);
  return candidate.includes(hs6);
}

export function isHs4PrefixMatch(productHsCode: string, candidateHsText: string): boolean {
  const hs4 = normalizeHsCode(productHsCode).slice(0, 4);
  if (hs4.length < 4) return false;
  const candidate = normalizeHsCode(candidateHsText);
  return candidate.includes(hs4);
}

export function extractProductTokens(productName: string, productDescription = "", tags: string[] = []): string[] {
  const tokens = [
    ...tokenizeValue(productName),
    ...tags.flatMap((tag) => tokenizeValue(tag)),
    ...tokenizeValue(productDescription),
  ];

  return dedupeStrings(
    tokens
      .map(normalizeToken)
      .filter((token) => token.length >= 2)
      .filter((token) => !COMMON_STOPWORDS.has(token)),
  ).slice(0, 60);
}

export function buildRepresentativeProductSearchTerms(input: {
  productName: string;
  hsCode?: string;
  hsDescription?: string;
  tokens?: string[];
  tags?: string[];
}): string[] {
  const productName = cleanSearchTerm(input.productName);
  const hsCode = normalizeHsCode(input.hsCode ?? "");
  const hsDescription = cleanSearchTerm(input.hsDescription ?? "");
  const context = normalizeSearchText([
    productName,
    hsCode,
    hsDescription,
    ...(input.tokens ?? []),
    ...(input.tags ?? []),
  ].join(" "));
  const out: string[] = [];
  const push = (value: string) => {
    const cleaned = cleanSearchTerm(value);
    const key = cleaned.toLowerCase();
    if (!cleaned || cleaned.length < 2 || out.some((entry) => entry.toLowerCase() === key)) return;
    out.push(cleaned);
  };

  if (isPassengerVehicleSearchContext(hsCode, context)) {
    const hybrid = isHybridVehicleSearchContext(hsCode, context);
    const electric = isElectricVehicleSearchContext(hsCode, context);
    if (hybrid) push("하이브리드 승용자동차");
    if (electric) push("전기승용자동차");
    push("승용자동차");
    if (hybrid) push("하이브리드 자동차");
    if (electric) {
      push("전기차");
      push("electric vehicle");
    }
    if (hybrid) push("hybrid vehicle");
    push("passenger car");
  }

  for (const term of extractStandardProductNameTerms(hsDescription)) push(term);
  const collapsedName = collapseCompositeProductName(productName);
  if (collapsedName !== productName) push(collapsedName);
  if (!isCompositeProductSearchTerm(productName)) push(productName);

  return out.slice(0, 10);
}

export function buildProductRelevanceTokens(productName: string, hsCode: string, baseTokens: string[]): string[] {
  const productPhrases = buildProductPhraseTokens(productName);
  const hs6 = normalizeHsCode(hsCode).slice(0, 6);
  const hs4 = normalizeHsCode(hsCode).slice(0, 4);
  const tokens = dedupeStrings([
    ...productPhrases,
    ...baseTokens.map(normalizeToken),
    hs6,
    hs4,
  ]).filter(Boolean);

  return tokens.slice(0, 80);
}

export function isWeakProductRelevanceToken(token: string): boolean {
  const normalized = normalizeToken(token);
  if (!normalized) return true;
  if (/^\d{4,}$/.test(normalized)) return false;
  return WEAK_PRODUCT_TOKENS.has(normalized);
}

export function buildNewsRelevanceText(input: {
  title?: string;
  summary?: string;
  keywords?: string;
  body?: string;
}): string {
  const truncatedBody = stripHtml(input.body ?? "").slice(0, 1500);
  return [input.title, input.summary, input.keywords, truncatedBody]
    .map((chunk) => cleanText(chunk ?? ""))
    .filter(Boolean)
    .join(" ");
}

export function assessNewsRelevance(input: AssessNewsRelevanceInput): NewsRelevanceAssessment {
  const text = normalizeSearchText(input.text);
  const textTokens = new Set(splitWords(text));
  const hsCode = normalizeHsCode(input.hsCode ?? "");
  const hs6 = hsCode.slice(0, 6);
  const hs4 = hsCode.slice(0, 4);

  const allTokens = dedupeStrings([
    ...input.tokens.map(normalizeToken),
    ...buildProductPhraseTokens(input.productName ?? ""),
  ]).filter(Boolean);

  const strongTokens = allTokens.filter((token) => !isWeakProductRelevanceToken(token) && !/^\d{4,}$/.test(token));
  const weakTokens = allTokens.filter((token) => isWeakProductRelevanceToken(token));

  const matchedStrongTokens = strongTokens.filter((token) => tokenMatched(token, text, textTokens));
  const matchedWeakTokens = weakTokens.filter((token) => tokenMatched(token, text, textTokens));
  const anchorTokens = buildProductAnchorTokens(input.productName ?? "", strongTokens);
  const matchedAnchorTokens = anchorTokens.filter((token) => tokenMatched(token, text, textTokens));

  const hs6Matched = hs6.length === 6 && text.includes(hs6);
  const hs4Matched = !hs6Matched && hs4.length === 4 && text.includes(hs4);

  const productPhrase = normalizeSearchText(input.productName ?? "");
  const productPhraseMatched = productPhrase.length >= 6 && productPhrase.includes(" ") && text.includes(productPhrase);
  const strongMatchCount = matchedStrongTokens.length;
  const anchorMatchCount = matchedAnchorTokens.length;

  let score = 0;
  if (hs6Matched) score += 4;
  else if (hs4Matched) score += 2;
  score += Math.min(3, strongMatchCount);
  if (strongMatchCount >= 2) score += 1;
  if (productPhraseMatched) score += 2;
  if (strongMatchCount === 0 && matchedWeakTokens.length > 0 && !hs6Matched && !hs4Matched) score = 0;

  const directByHs = hs6Matched || (hs4Matched && strongMatchCount >= 1);
  const directByKeyword = strongMatchCount >= 2 && anchorMatchCount >= 1;
  const directByPhrase = productPhraseMatched && (strongMatchCount >= 1 || anchorMatchCount >= 1);
  const isDirectEvidence = directByHs || directByKeyword || directByPhrase;

  return {
    score,
    isDirectEvidence,
    hs6Matched,
    hs4Matched,
    strongMatchCount,
    matchedStrongTokens,
    matchedWeakTokens,
    anchorMatchCount,
    matchedAnchorTokens,
  };
}

export function assessBackgroundNewsRelevance(
  input: AssessBackgroundNewsRelevanceInput,
): BackgroundNewsRelevanceAssessment {
  const countryMatched = isCountryMentionedInText(input.countryCode, input.text);
  if (!countryMatched) {
    return {
      include: false,
      scoreRelevant: false,
      score: 0,
      countryMatched: false,
    };
  }

  const relevance = assessNewsRelevance(input);
  const hasProductSignal = hasProductSignalForNews(relevance);
  const recencyTier = input.recencyTier ?? "supplementary";
  const category = classifyNewsCategory({
    title: input.text,
    recencyTier,
    isProductDirect: false,
    relevance,
  });
  const isRecentExportEnvironmentNews = recencyTier === "recent" && category === "geopolitical_risk";
  if (!hasProductSignal && !isRecentExportEnvironmentNews) {
    return {
      include: false,
      scoreRelevant: false,
      score: relevance.score,
      countryMatched: true,
    };
  }

  return {
    include: true,
    scoreRelevant: relevance.isDirectEvidence,
    score: relevance.score,
    countryMatched: true,
  };
}

export function hasProductSignalForNews(
  relevance: Pick<NewsRelevanceAssessment, "hs6Matched" | "hs4Matched" | "strongMatchCount" | "anchorMatchCount">,
): boolean {
  return Boolean(
    relevance.hs6Matched ||
      (relevance.hs4Matched && relevance.strongMatchCount >= 1) ||
      relevance.anchorMatchCount >= 2 ||
      relevance.strongMatchCount >= 3,
  );
}

export function classifyNewsRecency(publishedDate: string | null | undefined): NewsRecencyTier {
  const normalized = normalizeDateOnly(publishedDate);
  if (!normalized) return "supplementary";

  const published = Date.parse(`${normalized}T00:00:00Z`);
  if (!Number.isFinite(published)) return "supplementary";

  const oneYearMs = 365.25 * 24 * 60 * 60 * 1000;
  const ageMs = Date.now() - published;
  if (ageMs <= oneYearMs) return "recent";
  if (ageMs <= oneYearMs * 5) return "supplementary";
  return "archive";
}

export function classifyNewsCategory(input: NewsClassificationInput): NewsCategory {
  if (input.recencyTier === "archive") return "archive_reference";

  if (input.isProductDirect && hasProductSignalForNews(input.relevance)) {
    return "product_direct";
  }

  const text = normalizeSearchText(
    [input.title ?? "", input.summary ?? "", input.keywords ?? ""].join(" "),
  );
  if (detectExportEnvironmentKeywords(text).length > 0) return "geopolitical_risk";
  return "industry_trend";
}

export function detectExportEnvironmentKeywords(text: string): string[] {
  const normalized = normalizeSearchText(text);
  if (!normalized) return [];
  return dedupeStrings(
    GEOPOLITICAL_NEWS_KEYWORDS.filter((keyword) => keyword && normalized.includes(keyword)),
  ).slice(0, 5);
}

export function buildNewsSelectionReason(
  recencyTier: NewsRecencyTier,
  category: NewsCategory,
  relevance: Pick<NewsRelevanceAssessment, "matchedStrongTokens" | "hs6Matched" | "hs4Matched">,
  sourceText = "",
): string {
  const parts: string[] = [];
  if (recencyTier === "recent") parts.push("recent<=1y");
  else if (recencyTier === "supplementary") parts.push("supplementary<=5y");
  else parts.push("archive>5y");

  if (relevance.hs6Matched) parts.push("hs6");
  else if (relevance.hs4Matched) parts.push("hs4");
  const displayTokens = relevance.matchedStrongTokens
    .map(normalizeToken)
    .filter((token) => token && !isWeakProductRelevanceToken(token))
    .filter((token) => !/^\d{4,}$/.test(token));
  if (displayTokens.length > 0) {
    parts.push(`token:${displayTokens.slice(0, 3).join(",")}`);
  }
  const exportEnvironmentKeywords = category === "geopolitical_risk"
    ? detectExportEnvironmentKeywords(sourceText).slice(0, 3)
    : [];
  if (exportEnvironmentKeywords.length > 0) {
    parts.push(`export_env:${exportEnvironmentKeywords.join(",")}`);
  }
  parts.push(`category:${category}`);
  return parts.join(" | ");
}

export function buildExportImpactSummary(
  input: { title?: string; summary?: string; productName?: string; category: NewsCategory },
): string {
  if (input.category !== "geopolitical_risk") return "";

  const matched = detectExportEnvironmentKeywords([input.title ?? "", input.summary ?? ""].join(" ")).slice(0, 3);
  if (matched.length === 0) return "";
  const product = cleanText(input.productName ?? "") || "target product";
  return `[Export impact] ${matched.join(", ")} can affect ${product} in cost, lead-time, or payment conditions.`;
}

export function hasDefensibleProductExportFit(input: {
  productName: string;
  hsCode?: string;
  text: string;
  relevance: Pick<NewsRelevanceAssessment, "hs6Matched" | "hs4Matched" | "strongMatchCount" | "anchorMatchCount">;
  aiAssessment: AiNewsRelevanceAssessment;
  recencyTier: NewsRecencyTier;
  newsCategory: NewsCategory;
}): boolean {
  const category = input.aiAssessment.category;
  if (category === "unrelated") return false;

  if (category === "direct_product") {
    return input.aiAssessment.productRelevanceScore >= 50;
  }

  if (category === "adjacent_value_chain") {
    const basis = normalizeSearchText(input.aiAssessment.basis || input.aiAssessment.reason);
    if (!basis || basis === "none" || basis.includes("generic")) return false;
    return input.aiAssessment.productRelevanceScore >= 55;
  }

  return category === "broad_macro_export_env" && input.aiAssessment.exportImpactScore >= 50;
}

export function classifyNewsForProductContext(input: ProductContextNewsInput): AiNewsRelevanceAssessment {
  const text = buildNewsRelevanceText({
    title: input.title,
    summary: input.summary,
    keywords: input.keywords,
    body: input.body,
  });
  const baseTokens = input.tokens ?? extractProductTokens(input.productName);
  const relevanceTokens = buildProductRelevanceTokens(input.productName, input.hsCode ?? "", baseTokens);
  const relevance = assessNewsRelevance({
    text,
    tokens: relevanceTokens,
    hsCode: input.hsCode,
    productName: input.productName,
  });
  const normalizedText = normalizeSearchText(text);
  const macroSignals = detectExportEnvironmentKeywords(normalizedText);
  const productProfile = buildProductNewsProfile(input.productName, input.hsCode ?? "", relevanceTokens);
  const valueChain = detectValueChainSignals(normalizedText, productProfile);
  const familySignals = detectProductFamilySignals(normalizedText, productProfile);
  const unrelatedSignals = detectUnrelatedIndustrySignals(normalizedText, productProfile);
  const incompatibleSignals = detectIncompatibleNarrowIndustrySignals(text, input.productName, input.hsCode ?? "");
  const hasProductSignal = hasProductSignalForNews(relevance);

  if (relevance.isDirectEvidence) {
    const basis = familySignals.basis.length > 0 ? familySignals.basis.join(",") : directProductBasisFromRelevance(relevance);
    return {
      category: "direct_product",
      productRelevanceScore: clamp(88 + Math.min(relevance.score, 8), 0, 100),
      countryRelevanceScore: 70,
      exportImpactScore: macroSignals.length > 0 ? 70 : 55,
      basis,
      rejectReason: "",
      reason: "제품/HS 직접 신호",
    };
  }

  if (incompatibleSignals.length > 0 && !hasProductSignal) {
    return {
      category: "unrelated",
      productRelevanceScore: 12,
      countryRelevanceScore: 55,
      exportImpactScore: macroSignals.length > 0 ? 25 : 5,
      basis: "none",
      rejectReason: `specific_other_industry:${incompatibleSignals.slice(0, 3).join(",")}`,
      reason: "무관 뉴스: 특정 타 산업 신호",
    };
  }

  if (unrelatedSignals.length > 0) {
    return {
      category: "unrelated",
      productRelevanceScore: 10,
      countryRelevanceScore: 50,
      exportImpactScore: macroSignals.length > 0 ? 25 : 5,
      basis: "none",
      rejectReason: `unrelated_industry:${unrelatedSignals.slice(0, 3).join(",")}`,
      reason: "무관 뉴스: 제품 가치사슬 연결 부족",
    };
  }

  if (familySignals.basis.length > 0) {
    const basis = familySignals.basis.join(",");
    return {
      category: "direct_product",
      productRelevanceScore: 78,
      countryRelevanceScore: 68,
      exportImpactScore: macroSignals.length > 0 ? 72 : 58,
      basis,
      rejectReason: "",
      reason: "제품군/HS 직접 신호",
    };
  }

  if (hasProductSignal || valueChain.basis.length > 0) {
    const basis = valueChain.basis.length > 0 ? valueChain.basis.join(",") : "product_anchor";
    return {
      category: "adjacent_value_chain",
      productRelevanceScore: valueChain.basis.length > 0 ? 70 : 62,
      countryRelevanceScore: 65,
      exportImpactScore: macroSignals.length > 0 ? 70 : 50,
      basis,
      rejectReason: "",
      reason: `제품 가치사슬 신호: ${formatValueChainBasisLabel(basis)}`,
    };
  }

  if (macroSignals.length > 0) {
    return {
      category: "broad_macro_export_env",
      productRelevanceScore: 25,
      countryRelevanceScore: 65,
      exportImpactScore: 75,
      basis: "macro",
      rejectReason: "",
      reason: "거시/수출환경 신호",
    };
  }

  return {
    category: "unrelated",
    productRelevanceScore: 0,
    countryRelevanceScore: 40,
    exportImpactScore: 0,
    basis: "none",
    rejectReason: "no_product_value_chain_or_macro_signal",
    reason: "무관 뉴스: 제품/가치사슬/거시 수출환경 신호 부족",
  };
}

export function newsCategoryFromAiAssessment(
  assessment: AiNewsRelevanceAssessment,
  fallback: NewsCategory,
): NewsCategory | null {
  if (assessment.category === "unrelated") return null;
  if (assessment.category === "direct_product") return "product_direct";
  if (assessment.category === "adjacent_value_chain") return "industry_trend";
  if (assessment.category === "broad_macro_export_env") return "geopolitical_risk";
  return fallback;
}

function directProductBasisFromRelevance(relevance: Pick<NewsRelevanceAssessment, "hs6Matched" | "hs4Matched">): string {
  return relevance.hs6Matched || relevance.hs4Matched ? "hs_family" : "exact_product";
}

export function selectNewsEvidence<T extends {
  newsCategory: NewsCategory;
  recencyTier: NewsRecencyTier;
  publishedAt?: string | null;
}>(
  input: SelectNewsEvidenceInput<T>,
): SelectNewsEvidenceResult<T> {
  const limit = clamp(input.perCategoryLimit ?? 3, 1, 20);
  const entries = [...input.items];

  const byCategory = (category: NewsCategory) => entries.filter((row) => row.newsCategory === category);
  const pickPrimary = (rows: T[]) => {
    const recent = rows.filter((row) => row.recencyTier === "recent").sort(compareNewsByPublishedAtDesc);
    const supplementary = rows.filter((row) => row.recencyTier === "supplementary").sort(compareNewsByPublishedAtDesc);
    return [...recent.slice(0, limit), ...supplementary.slice(0, Math.max(0, limit - recent.length))];
  };

  return {
    productDirect: pickPrimary(byCategory("product_direct")),
    geopoliticalRisk: pickPrimary(byCategory("geopolitical_risk")),
    industryTrend: pickPrimary(byCategory("industry_trend")),
    archiveReference: byCategory("archive_reference").sort(compareNewsByPublishedAtDesc),
  };
}

export function scoreNewsRelevance(text: string, relevanceTokens: string[], hsCode?: string): number {
  return assessNewsRelevance({
    text,
    tokens: relevanceTokens,
    hsCode,
  }).score;
}

export function marketNewsSearchParam(kind: "product" | "country"): "search2" | "search1" {
  return kind === "product" ? "search2" : "search1";
}

export function parseProductMeta(raw: string): ParseProductMetaResult {
  const fallback = { targetMarketNote: "", tags: [] as string[] };
  const source = String(raw ?? "").trim();
  if (!source) return fallback;

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return {
      targetMarketNote: source,
      tags: [],
    };
  }

  if (Array.isArray(parsed)) {
    const tags = parsed.map((entry) => String(entry ?? "")).flatMap((entry) => tokenizeValue(entry));
    return {
      targetMarketNote: "",
      tags: dedupeStrings(tags.map(normalizeToken).filter(Boolean)).slice(0, 30),
    };
  }

  if (!parsed || typeof parsed !== "object") return fallback;
  const row = parsed as Record<string, unknown>;

  const note = pickText(row, [
    "targetMarketNote",
    "target_market_note",
    "targetMarketMemo",
    "target_market_memo",
    "targetMarketsNote",
    "target_markets_note",
    "targetMarkets",
    "target_markets",
  ]);

  const tagsRaw = row.tags ?? row.keywords ?? row.keyword ?? row.productTags ?? row.product_tags;
  const tags = normalizeTagInput(tagsRaw);

  return {
    targetMarketNote: cleanText(note),
    tags,
  };
}

export function extractTargetMarketCodes(note: string): string[] {
  const detected = detectCountryCodesFromText(note);
  const regional = detectRegionalTargetCodes(note);
  return dedupeStrings([...detected, ...regional]);
}

export function normalizeTargetMarkets(codes: string[]): TargetMarket[] {
  return dedupeStrings(codes.map((code) => code.toUpperCase()))
    .filter((code) => code in COUNTRY_NAME_BY_CODE)
    .map((code) => ({
      code,
      name: COUNTRY_NAME_BY_CODE[code],
    }));
}

export function canonicalizeTargetMarkets(input: unknown): TargetMarket[] {
  if (!Array.isArray(input)) return [];

  const codes: string[] = [];
  for (const row of input) {
    if (typeof row === "string") {
      codes.push(...extractTargetMarketCodes(row));
      continue;
    }

    if (!row || typeof row !== "object") continue;
    const market = row as Record<string, unknown>;
    const code = String(
      market.code ??
        market.country_code ??
        market.countryCode ??
        market.iso2 ??
        "",
    ).toUpperCase().trim();
    if (code && code in COUNTRY_NAME_BY_CODE) {
      codes.push(code);
      continue;
    }

    const name = String(market.name ?? market.country_name ?? market.countryName ?? "").trim();
    if (!name) continue;
    const [matchedCode] = extractTargetMarketCodes(name);
    if (matchedCode) codes.push(matchedCode);
  }

  return normalizeTargetMarkets(codes);
}

export function detectCountryCodesFromText(text: string): string[] {
  const explicitCodes = extractExplicitCountryCodes(text);
  const aliasCodes = detectCountryAliasCodes(text);
  return dedupeStrings([...explicitCodes, ...aliasCodes]);
}

export function assessCountryNewsMatch(input: AssessCountryNewsMatchInput): CountryNewsMatchAssessment {
  const countryCode = input.countryCode.toUpperCase().trim();
  if (!countryCode || !(countryCode in COUNTRY_NAME_BY_CODE)) {
    return { type: "mismatch", reason: "invalid_country", directCodes: [], backgroundCodes: [] };
  }

  const metadataCodes = detectCountryCodesFromText([input.natn ?? "", input.regn ?? ""].join(" "));
  const titleCodes = detectCountryCodesFromText(input.title ?? "");
  const summaryCodes = detectCountryCodesFromText(input.summary ?? "");
  const keywordsCodes = detectCountryCodesFromText(input.keywords ?? "");
  const directCodes = dedupeStrings([...metadataCodes, ...titleCodes, ...summaryCodes, ...keywordsCodes]);
  const bodyCodes = detectCountryCodesFromText(input.body ?? "");
  const sourceCountryText = cleanText(input.natn ?? "");
  const sourceCountryConflicts = Boolean(sourceCountryText) &&
    !detectCountryCodesFromText(sourceCountryText).includes(countryCode);
  if (sourceCountryConflicts) {
    const backgroundCodes = dedupeStrings([...directCodes, ...bodyCodes]);
    if (backgroundCodes.includes(countryCode)) {
      return {
        type: "background_country",
        reason: "country:source_metadata_mismatch",
        directCodes,
        backgroundCodes,
      };
    }
    return { type: "mismatch", reason: "country:source_metadata_mismatch", directCodes, backgroundCodes };
  }

  if (metadataCodes.includes(countryCode)) {
    return { type: "direct_country", reason: "country:source_metadata", directCodes, backgroundCodes: [] };
  }

  if (titleCodes.includes(countryCode)) {
    return { type: "direct_country", reason: "country:title", directCodes, backgroundCodes: [] };
  }

  const titleHasOtherCountry = titleCodes.some((code) => code !== countryCode);
  if (!titleHasOtherCountry && (summaryCodes.includes(countryCode) || keywordsCodes.includes(countryCode))) {
    return { type: "direct_country", reason: "country:summary", directCodes, backgroundCodes: [] };
  }

  const bodyHasOtherCountry = bodyCodes.some((code) => code !== countryCode);
  const directTextHasOtherCountry = directCodes.some((code) => code !== countryCode);
  if (!directTextHasOtherCountry && !bodyHasOtherCountry && bodyCodes.includes(countryCode)) {
    return {
      type: "direct_country",
      reason: "country:body",
      directCodes: dedupeStrings([...directCodes, ...bodyCodes]),
      backgroundCodes: [],
    };
  }

  const backgroundCodes = dedupeStrings([...directCodes, ...bodyCodes]);
  if (backgroundCodes.includes(countryCode)) {
    return { type: "background_country", reason: "country:background_mention", directCodes, backgroundCodes };
  }

  return { type: "mismatch", reason: "country:mismatch", directCodes, backgroundCodes };
}

export function isCountryMentionedInText(countryCode: string, text: string): boolean {
  const code = countryCode.toUpperCase().trim();
  if (!code || !(code in COUNTRY_NAME_BY_CODE)) return false;
  return detectCountryCodesFromText(text).includes(code);
}

export function hasKeywordTokenMatch(text: string, tokens: string[]): boolean {
  const normalizedText = normalizeSearchText(text);
  if (!normalizedText) return false;

  const strongTokens = dedupeStrings(tokens.map(normalizeToken))
    .filter((token) => !isWeakProductRelevanceToken(token))
    .filter((token) => !/^\d{4,}$/.test(token));

  for (const token of strongTokens) {
    if (tokenMatchedRegex(token, normalizedText)) return true;
  }
  return false;
}

function tokenMatchedRegex(token: string, normalizedText: string): boolean {
  if (!token) return false;
  if (token.includes(" ")) return normalizedText.includes(token);
  const regex = new RegExp(`(?:^|\\s)${escapeRegExp(token)}(?:\\s|$)`);
  return regex.test(normalizedText);
}

export function addCountrySignal(
  map: Map<string, Set<CandidateSignal>>,
  countryCode: string,
  signal: CandidateSignal,
): void {
  const code = countryCode.toUpperCase();
  if (!code || !(code in COUNTRY_NAME_BY_CODE)) return;
  const bucket = map.get(code) ?? new Set<CandidateSignal>();
  bucket.add(signal);
  map.set(code, bucket);
}

export function collectCandidatePool(input: CollectCandidatePoolInput): CollectCandidatePoolResult {
  const minCount = Math.max(1, input.minCount ?? 3);
  const fallbackPool = input.fallbackPool ?? FALLBACK_COUNTRY_POOL;
  const signalByCountry = new Map<string, CandidateSignal[]>();

  for (const [code, set] of input.signalMap.entries()) {
    const normalized = code.toUpperCase();
    if (!(normalized in COUNTRY_NAME_BY_CODE)) continue;
    if (!set || set.size === 0) continue;
    signalByCountry.set(normalized, dedupeStrings([...set]).filter(isCandidateSignal) as CandidateSignal[]);
  }

  for (const code of input.targetMarketCodes.map((value) => value.toUpperCase())) {
    if (!(code in COUNTRY_NAME_BY_CODE)) continue;
    const signals = signalByCountry.get(code) ?? [];
    if (!signals.includes("target_market_note")) signals.push("target_market_note");
    signalByCountry.set(code, dedupeStrings(signals) as CandidateSignal[]);
  }

  const seededCodes = [...signalByCountry.keys()].sort((a, b) => {
    const scoreA = signalPriority(signalByCountry.get(a) ?? []);
    const scoreB = signalPriority(signalByCountry.get(b) ?? []);
    return scoreB - scoreA;
  });

  const fallbackCodes: string[] = [];
  for (const country of fallbackPool) {
    if (seededCodes.length >= minCount) break;
    if (seededCodes.includes(country.code)) continue;
    seededCodes.push(country.code);
    fallbackCodes.push(country.code);
    signalByCountry.set(country.code, ["fallback_candidate"]);
  }

  const countries = seededCodes.map((code) => ({
    code,
    name: COUNTRY_NAME_BY_CODE[code] ?? code,
  }));

  return { countries, signalByCountry, fallbackCodes };
}

export function limitCandidatePool(
  input: CollectCandidatePoolResult,
  targetMarketCodes: string[],
  maxCount: number,
): CollectCandidatePoolResult {
  const limit = Math.max(1, Math.floor(maxCount));
  if (input.countries.length <= limit) return input;

  const targetSet = new Set(
    targetMarketCodes
      .map((value) => value.toUpperCase())
      .filter((code) => code in COUNTRY_NAME_BY_CODE),
  );
  const selected: SeedCountry[] = [];
  const selectedCodes = new Set<string>();
  const add = (country: SeedCountry) => {
    if (selected.length >= limit) return;
    if (selectedCodes.has(country.code)) return;
    selected.push(country);
    selectedCodes.add(country.code);
  };

  for (const country of input.countries) {
    if (targetSet.has(country.code)) add(country);
  }
  for (const country of input.countries) add(country);

  const signalByCountry = new Map<string, CandidateSignal[]>();
  for (const [code, signals] of input.signalByCountry.entries()) {
    if (selectedCodes.has(code)) signalByCountry.set(code, signals);
  }

  return {
    countries: selected,
    signalByCountry,
    fallbackCodes: input.fallbackCodes.filter((code) => selectedCodes.has(code)),
  };
}

export function signalLabel(signal: CandidateSignal): string {
  const labels: Record<CandidateSignal, string> = {
    cert_data: "Certification data exists",
    regulation_data: "Import regulation data exists",
    target_market_note: "Included by target market memo",
    hs6_exact: "HS 6-digit exact match",
    hs4_prefix: "HS 4-digit prefix match",
    product_keyword: "Product keyword matched",
    news_match: "Market news matched",
    fallback_candidate: "Fallback candidate included",
    customs_export_data: "Customs export data exists",
  };
  return labels[signal];
}

export function buildInclusionReason(signals: CandidateSignal[]): string {
  const labels = dedupeStrings(signals.map(signalLabel));
  if (labels.length === 0) return "No reliable signal detected";
  return labels.join("; ");
}

export function deriveApiMarketScore(input: ApiMarketInput): number {
  let score = 0;
  if (input.hasCountryInfo) score += 10;
  if (input.hasNews) score += 8;
  score += clamp(Math.floor(input.newsCount / 2), 0, 6);
  score += clamp(input.signalCount * 2, 0, 6);
  return clamp(score, 0, SCORE_LIMIT.market);
}

export function deriveExportRegionRankMarketBoost(input: ExportRegionRankMarketInput): number {
  if (input.rank == null || input.rank <= 0) return 0;

  let score = 0;
  if (input.rank <= 3) score += 8;
  else if (input.rank <= 10) score += 6;
  else if (input.rank <= 20) score += 4;
  else if (input.rank <= 50) score += 2;
  else score += 1;

  const share = input.exportShare ?? 0;
  if (share >= 10) score += 3;
  else if (share >= 5) score += 2;
  else if (share >= 1) score += 1;

  if (input.hsMatched) score += 1;
  return clamp(score, 0, 12);
}

export function scoreKsurePaymentEvidence(input: KsurePaymentEvidenceInput): number | null {
  const levels = [input.countryGradeLevel, input.industryRiskLevel, input.paymentRiskLevel]
    .filter((level): level is RiskEvidenceLevel => level === "info" || level === "caution" || level === "high");
  if (levels.length === 0) return null;

  let score = SCORE_LIMIT.payment;
  score -= riskPenalty(input.countryGradeLevel, { caution: 3, high: 6 });
  score -= riskPenalty(input.industryRiskLevel, { caution: 3, high: 5 });
  score -= riskPenalty(input.paymentRiskLevel, { caution: 4, high: 7 });

  const bounded = clamp(score, 0, SCORE_LIMIT.payment);
  return input.paymentScope === "global" ? Math.min(bounded, 14) : bounded;
}

export function scoreSafetyControlEvidence(input: SafetyControlEvidenceInput): number | null {
  const recallCount = Math.max(0, Math.round(input.recallCount ?? 0));
  const certCount = Math.max(0, Math.round(input.certCount ?? 0));
  const hasStrategicEvidence = Boolean(input.strategicMatchType && input.strategicMatchType !== "none");
  const hasSafetyEvidence = input.safetyStatus === "success" || input.safetyStatus === "empty" || input.safetyStatus === "error";
  if (!hasStrategicEvidence && !hasSafetyEvidence) return null;

  let score = SCORE_LIMIT.safety;
  if (input.strategicMatchType === "exact_hsk") score -= 5;
  else if (input.strategicMatchType === "prefix6_candidate") score -= 3;
  if (recallCount > 0) score -= Math.min(5, 2 + recallCount);
  if (certCount > 0) score -= 1;
  if (input.safetyStatus === "error") score -= 2;

  return clamp(score, 0, SCORE_LIMIT.safety);
}

export function fallbackScoreParts(input: FallbackScoreInput): ScoreParts {
  const complianceSignals = input.certSignalCount + input.regulationSignalCount;
  const market = clamp(
    input.apiMarketScore + (input.hasCountryInfo ? 3 : 0) + (input.hasCountryNews ? 3 : 0) + (input.targetMatched ? 1 : 0),
    0,
    SCORE_LIMIT.market,
  );

  const cert = clamp(
    input.certSignalCount * 4 + (input.hasHs6 ? 6 : input.hasHs4 ? 3 : 0),
    0,
    SCORE_LIMIT.cert,
  );

  const regulation = clamp(
    input.regulationSignalCount * 4 + (input.hasHs6 ? 4 : input.hasHs4 ? 2 : 0),
    0,
    SCORE_LIMIT.regulation,
  );

  const heuristicPayment = clamp(
    4 + (input.hasCountryInfo ? 4 : 0) + (input.hasCountryNews ? 2 : 0) + (input.targetMatched ? 1 : 0) +
      Math.min(complianceSignals, 2),
    0,
    SCORE_LIMIT.payment,
  );
  const payment = input.paymentEvidenceScore == null
    ? heuristicPayment
    : clamp(input.paymentEvidenceScore, 0, SCORE_LIMIT.payment);

  const heuristicSafety = clamp(
    1 + Math.min(complianceSignals, 5) + (input.hasHs6 ? 1 : 0),
    0,
    SCORE_LIMIT.safety,
  );
  const safety = input.safetyEvidenceScore == null
    ? heuristicSafety
    : clamp(input.safetyEvidenceScore, 0, SCORE_LIMIT.safety);

  return { market, cert, regulation, payment, safety };
}

export function clampScoreParts(parts: ScoreParts): ScoreParts {
  return {
    market: clamp(parts.market, 0, SCORE_LIMIT.market),
    cert: clamp(parts.cert, 0, SCORE_LIMIT.cert),
    regulation: clamp(parts.regulation, 0, SCORE_LIMIT.regulation),
    payment: clamp(parts.payment, 0, SCORE_LIMIT.payment),
    safety: clamp(parts.safety, 0, SCORE_LIMIT.safety),
  };
}

export function combineMarketScore(apiMarketScore: number, aiMarketFit: number): number {
  const weighted = Math.round(apiMarketScore * 0.4 + aiMarketFit * 0.6);
  return clamp(weighted, 0, SCORE_LIMIT.market);
}

export function totalScore(parts: ScoreParts): number {
  return clamp(
    Math.round(parts.market + parts.cert + parts.regulation + parts.payment + parts.safety),
    0,
    100,
  );
}

export function computeResultState(input: ResultStateInput): "success" | "partial_success" {
  return input.apiPartial || input.fallbackUsed ? "partial_success" : "success";
}

export function labelFromScore(total: number, partial: boolean):
  | "priority"
  | "reviewable"
  | "caution"
  | "high_risk"
  | "unknown"
  | "critical" {
  if (!Number.isFinite(total)) return "critical";
  if (partial && total < 40) return "unknown";
  if (total >= 80) return "priority";
  if (total >= 60) return "reviewable";
  if (total >= 40) return "caution";
  if (total >= 0) return "high_risk";
  return "critical";
}

function buildProductPhraseTokens(value: string): string[] {
  const phrase = normalizeSearchText(value);
  if (!phrase) return [];

  const words = splitWords(phrase).filter((word) => !COMMON_STOPWORDS.has(word));
  const out: string[] = [];
  if (words.length >= 2) {
    out.push(words.slice(0, 2).join(" "));
    out.push(words.join(" "));
  }
  out.push(...words);
  return dedupeStrings(out).filter((token) => token.length >= 2);
}

function buildProductAnchorTokens(productName: string, strongTokens: string[]): string[] {
  const nameAnchors = splitWords(normalizeSearchText(productName))
    .map(normalizeToken)
    .filter((token) => token.length >= 3)
    .filter((token) => !COMMON_STOPWORDS.has(token))
    .filter((token) => !isWeakProductRelevanceToken(token))
    .filter((token) => !/^\d{4,}$/.test(token));
  if (nameAnchors.length > 0) return dedupeStrings(nameAnchors);

  const fallbackAnchors = strongTokens
    .flatMap((token) => (token.includes(" ") ? splitWords(token) : [token]))
    .map(normalizeToken)
    .filter((token) => token.length >= 4)
    .filter((token) => !COMMON_STOPWORDS.has(token))
    .filter((token) => !isWeakProductRelevanceToken(token))
    .filter((token) => !/^\d{4,}$/.test(token));
  return dedupeStrings(fallbackAnchors).slice(0, 6);
}

type ProductDomain =
  | "semiconductor"
  | "cosmetics"
  | "machinery"
  | "automotive"
  | "baby_child"
  | "food"
  | "textile"
  | "medical_pharma"
  | "chemical"
  | "electronics"
  | "consumer_goods";

type ProductSpecificity = "specific_item" | "finished_product" | "broad_product_family";

type ProductNewsProfile = {
  text: string;
  hsCode: string;
  domains: Set<ProductDomain>;
  specificity: ProductSpecificity;
};

type ValueChainSignalResult = {
  basis: string[];
  signals: string[];
};

function buildProductNewsProfile(productName: string, hsCode: string, tokens: string[]): ProductNewsProfile {
  const normalizedHs = normalizeHsCode(hsCode);
  const context = normalizeSearchText([productName, normalizedHs, ...tokens].join(" "));
  const domains = new Set<ProductDomain>();
  const starts = (prefixes: string[]) => prefixes.some((prefix) => normalizedHs.startsWith(prefix));
  const has = (patterns: RegExp[]) => patterns.some((pattern) => pattern.test(context));

  if (starts(["8541", "8542"]) || has([/semiconductor|memory|dram|sram|nand|chip|wafer|foundry|반도체|메모리|디램|낸드/])) {
    domains.add("semiconductor");
    domains.add("electronics");
  }
  if (starts(["33"]) || has([/cosmetic|cosmetics|beauty|skin care|skincare|makeup|화장품|뷰티|스킨케어/])) {
    domains.add("cosmetics");
    domains.add("consumer_goods");
  }
  if (starts(["84"]) || has([/machine|machinery|equipment|automation|controller|servo|motor|drive|robot|기계|장비|자동화|모터|컨트롤러/])) {
    domains.add("machinery");
  }
  if (
    (starts(["8701", "8702", "8703", "8704", "8705", "8706", "8707", "8708"]) || has([/automotive|vehicle|brake|car seat|electric vehicle|자동차|전기차|차량/])) &&
    !starts(["8715"])
  ) {
    domains.add("automotive");
  }
  if (starts(["8715"]) || has([/stroller|baby|infant|childcare|nursery|유모차|유아|영유아|아동/])) {
    domains.add("baby_child");
    domains.add("consumer_goods");
  }
  if (starts(["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24"]) || has([/food|beverage|drink|agri|식품|음료|농식품/])) {
    domains.add("food");
    domains.add("consumer_goods");
  }
  if (starts(["50", "51", "52", "53", "54", "55", "56", "57", "58", "59", "60", "61", "62", "63"]) || has([/textile|apparel|garment|fabric|fashion|섬유|의류|직물|패션/])) {
    domains.add("textile");
    domains.add("consumer_goods");
  }
  if (starts(["30"]) || has([/pharma|pharmaceutical|biotech|drug|medicine|medical|바이오|제약|의약|신약/])) {
    domains.add("medical_pharma");
  }
  if (starts(["28", "29", "32", "34", "38", "39", "40"]) || has([/chemical|plastic|polymer|rubber|petrochemical|화학|플라스틱|고무|석유화학/])) {
    domains.add("chemical");
  }
  if (starts(["85"])) {
    domains.add("electronics");
  }

  const specificity = inferProductSpecificity(context, normalizedHs, domains);
  return { text: context, hsCode: normalizedHs, domains, specificity };
}

function inferProductSpecificity(
  context: string,
  hsCode: string,
  domains: Set<ProductDomain>,
): ProductSpecificity {
  const starts = (prefixes: string[]) => prefixes.some((prefix) => hsCode.startsWith(prefix));
  const has = (keywords: string[]) => keywords.some((keyword) => context.includes(normalizeSearchText(keyword)));
  const hasDomain = (domain: ProductDomain) => domains.has(domain);

  if (
    starts(["8706", "8707", "8708", "8541", "8542", "8537", "8501", "8504", "8409", "8413", "8414", "8421"]) ||
    has([
      "part",
      "parts",
      "component",
      "module",
      "controller",
      "sensor",
      "pad",
      "filter",
      "motor",
      "drive",
      "bearing",
      "valve",
      "pump",
      "chip",
      "memory",
      "dram",
      "nand",
      "wafer",
      "substrate",
      "sheet",
      "film",
      "resin",
      "compound",
      "raw material",
      "material",
      "brake",
      "servo",
      "부품",
      "소재",
      "모듈",
      "컨트롤러",
      "센서",
      "패드",
      "필터",
      "모터",
      "원료",
    ])
  ) {
    return "specific_item";
  }

  if (
    starts(["8701", "8702", "8703", "8704", "8705", "8715"]) ||
    has([
      "passenger car",
      "passenger cars",
      "motor vehicle",
      "vehicle",
      "vehicles",
      "stroller",
      "baby stroller",
      "cosmetics",
      "cosmetic",
      "skin care",
      "skincare",
      "consumer goods",
      "finished product",
      "승용자동차",
      "자동차",
      "차량",
      "유모차",
      "화장품",
    ])
  ) {
    return "finished_product";
  }

  if (
    starts(["33", "61", "62", "63"]) ||
    hasDomain("consumer_goods") ||
    has(["baby products", "beauty", "food", "beverage", "apparel", "garment", "textile products"])
  ) {
    return "broad_product_family";
  }

  return "specific_item";
}

function detectValueChainSignals(text: string, profile: ProductNewsProfile): ValueChainSignalResult {
  const basis = new Set<string>();
  const signals: string[] = [];
  const add = (basisName: string, keywords: string[]) => {
    const matched = keywords.filter((keyword) => text.includes(normalizeSearchText(keyword)));
    if (matched.length === 0) return;
    basis.add(basisName);
    signals.push(...matched);
  };
  const hasDomain = (domain: ProductDomain) => profile.domains.has(domain);

  if (hasDomain("semiconductor")) {
    add("component", ["semiconductor", "chip", "memory", "wafer", "foundry", "fab", "반도체", "칩", "메모리"]);
    add("demand_channel", ["data center", "datacenter", "server", "ai accelerator", "ai infrastructure", "데이터센터", "서버"]);
  }
  if (hasDomain("cosmetics")) {
    add("regulation_certification", ["cosmetics regulation", "cosmetic regulation", "labeling", "ingredient", "certification", "화장품 규제", "표시", "성분", "인증"]);
    add("distribution_channel", ["beauty retailer", "beauty retail", "beauty", "skin care", "skincare", "online channel", "e-commerce", "뷰티", "스킨케어", "이커머스"]);
  }
  if (hasDomain("machinery")) {
    add("component", ["servo", "motor", "controller", "drive", "robot", "industrial equipment", "automation", "factory automation", "모터", "컨트롤러", "자동화", "장비"]);
    add("demand_channel", ["factory", "plant", "manufacturing line", "facility investment", "설비투자", "공장"]);
  }
  if (hasDomain("automotive")) {
    add("component", ["automotive", "vehicle", "brake", "battery", "ev", "electric vehicle", "mobility", "자동차", "차량", "전기차"]);
  }
  if (hasDomain("baby_child")) {
    add("demand_channel", ["baby products", "infant", "childcare", "nursery", "parents", "parenting", "유아용품", "영유아", "육아"]);
    add("distribution_channel", ["online baby", "baby retail", "retail channel", "e-commerce", "online retail", "소매", "이커머스"]);
    add("regulation_certification", ["child safety", "safety standard", "certification", "product safety", "어린이 안전", "제품안전", "인증"]);
  }
  if (hasDomain("food")) {
    add("regulation_certification", ["food safety", "labeling", "certification", "식품 안전", "표시", "인증"]);
    add("distribution_channel", ["grocery", "food retail", "cold chain", "식품 유통", "콜드체인"]);
  }
  if (hasDomain("textile")) {
    add("material", ["textile", "fabric", "yarn", "apparel", "garment", "섬유", "직물", "원단"]);
    add("regulation_certification", ["textile regulation", "eco label", "인증", "섬유 규제"]);
  }
  if (hasDomain("medical_pharma")) {
    add("regulation_certification", ["medical device", "pharmaceutical", "biotech", "drug", "clinical", "approval", "의료기기", "제약", "바이오", "신약", "허가"]);
  }
  if (hasDomain("chemical")) {
    add("material", ["chemical", "plastic", "polymer", "rubber", "petrochemical", "화학", "플라스틱", "고무", "석유화학"]);
    add("regulation_certification", ["chemical regulation", "reach", "환경규제", "화학 규제"]);
  }

  return {
    basis: dedupeStrings([...basis]),
    signals: dedupeStrings(signals).slice(0, 8),
  };
}

function detectProductFamilySignals(text: string, profile: ProductNewsProfile): ValueChainSignalResult {
  if (profile.specificity === "specific_item") {
    return { basis: [], signals: [] };
  }

  const familyKeywords: string[] = [];
  const hasDomain = (domain: ProductDomain) => profile.domains.has(domain);
  const addDomainKeywords = (domain: ProductDomain, keywords: string[]) => {
    if (hasDomain(domain)) familyKeywords.push(...keywords);
  };

  addDomainKeywords("automotive", [
    "automotive",
    "vehicle",
    "vehicles",
    "motor vehicle",
    "passenger car",
    "passenger cars",
    "electric vehicle",
    "mobility",
    "automotive market",
    "자동차",
    "차량",
    "승용자동차",
    "전기차",
  ]);
  addDomainKeywords("baby_child", [
    "baby products",
    "infant",
    "infant care",
    "childcare",
    "nursery",
    "stroller",
    "baby stroller",
    "parenting",
    "유아용품",
    "영유아",
    "육아",
    "유모차",
  ]);
  addDomainKeywords("cosmetics", [
    "cosmetic",
    "cosmetics",
    "beauty",
    "skin care",
    "skincare",
    "beauty market",
    "화장품",
    "뷰티",
  ]);
  addDomainKeywords("food", ["food", "beverage", "drink", "grocery", "snack", "식품", "음료"]);
  addDomainKeywords("textile", ["textile", "apparel", "garment", "fashion", "fabric products", "섬유", "의류", "패션"]);
  addDomainKeywords("medical_pharma", ["medical device", "medicine", "pharmaceutical", "healthcare", "의료기기", "의약품"]);
  addDomainKeywords("consumer_goods", ["consumer goods", "retail products", "household products", "consumer product"]);

  const matchedFamily = familyKeywords.filter((keyword) => text.includes(normalizeSearchText(keyword)));
  if (matchedFamily.length === 0) return { basis: [], signals: [] };

  const directContextKeywords = [
    "market",
    "market size",
    "market trend",
    "demand",
    "consumer demand",
    "import demand",
    "imports",
    "sales",
    "retail",
    "online retail",
    "e-commerce",
    "regulation",
    "certification",
    "labeling",
    "product safety",
    "safety standard",
    "product-use",
    "product use",
    "시장",
    "수요",
    "소비",
    "소비자",
    "수입",
    "판매",
    "소매",
    "이커머스",
    "규제",
    "인증",
    "표시",
    "제품안전",
    "안전기준",
  ];
  const matchedContext = directContextKeywords.filter((keyword) => text.includes(normalizeSearchText(keyword)));
  if (matchedContext.length === 0) return { basis: [], signals: [] };

  const basis = new Set<string>(["product_family"]);
  const hs4 = profile.hsCode.slice(0, 4);
  if (hs4.length === 4 && text.includes(hs4)) basis.add("hs_family");

  return {
    basis: dedupeStrings([...basis]),
    signals: dedupeStrings([...matchedFamily, ...matchedContext]).slice(0, 8),
  };
}

function detectUnrelatedIndustrySignals(text: string, profile?: ProductNewsProfile): string[] {
  const normalized = normalizeSearchText(text);
  if (!normalized) return [];
  const allowed = profile?.domains ?? new Set<ProductDomain>();
  const groups: Array<{ domain: ProductDomain; keywords: string[] }> = [
    {
      domain: "semiconductor",
      keywords: ["ai data center", "data center", "datacenter", "semiconductor", "satellite", "substrate", "server", "chip", "wafer", "데이터센터", "반도체", "위성"],
    },
    {
      domain: "medical_pharma",
      keywords: ["biotech", "biopharmaceutical", "drug", "pharmaceutical", "license-out", "license out", "바이오", "제약", "신약"],
    },
    {
      domain: "automotive",
      keywords: ["automotive", "vehicle", "electric vehicle", "autonomous", "wcx", "mobility", "자동차", "전기차", "자율주행"],
    },
    {
      domain: "food",
      keywords: ["food", "beverage", "drink", "snack", "snacks", "potato chip", "potato chips", "k food", "식품", "음료", "간식"],
    },
    {
      domain: "textile",
      keywords: ["textile", "apparel", "fashion", "garment", "fabric", "섬유", "의류", "패션"],
    },
    {
      domain: "cosmetics",
      keywords: ["cosmetic", "cosmetics", "beauty", "skin care", "skincare", "화장품", "뷰티", "스킨케어"],
    },
    {
      domain: "chemical",
      keywords: ["chemical", "plastic", "petrochemical", "polymer", "화학", "플라스틱", "석유화학"],
    },
  ];
  const matched = groups.flatMap((group) => {
    if (allowed.has(group.domain)) return [];
    return group.keywords.filter((keyword) => normalized.includes(normalizeSearchText(keyword)));
  });
  const alwaysUnrelated = [
    "tourism",
    "culture",
    "k drama",
    "pet",
    "residency",
    "immigration",
    "visa",
    "labor permit",
    "consulate",
    "관광",
    "문화",
    "반려동물",
    "체류",
    "이민",
    "비자",
    "총영사관",
  ].filter((keyword) => normalized.includes(normalizeSearchText(keyword)));

  return dedupeStrings([...matched, ...alwaysUnrelated]);
}

function detectIncompatibleNarrowIndustrySignals(text: string, productName: string, hsCode: string): string[] {
  const normalizedText = normalizeSearchText(text);
  const productContext = normalizeSearchText(`${productName} ${normalizeHsCode(hsCode)}`);
  const profile = buildProductNewsProfile(productName, hsCode, extractProductTokens(productName));
  const hasDomain = (domain: ProductDomain) => profile.domains.has(domain);
  const groups = [
    {
      allow: hasDomain("semiconductor") || /dram|sram|nand|memory|semiconductor|chip|electronics|server|data center|854232/.test(productContext),
      keywords: [
        "ai data center",
        "data center",
        "datacenter",
        "orbital",
        "satellite",
        "semiconductor",
        "power semiconductor",
        "chip",
        "wafer",
        "\ub370\uc774\ud130\uc13c\ud130",
        "\uc6b0\uc8fc",
        "\uc704\uc131",
        "\ubc18\ub3c4\uccb4",
      ],
    },
    {
      allow: hasDomain("automotive") || /automotive|vehicle|motor vehicle|car seat|brake|mobility|electric vehicle|autonomous/.test(productContext),
      keywords: [
        "automotive",
        "vehicle",
        "vehicles",
        "motor vehicle",
        "mobility",
        "electric vehicle",
        "autonomous",
        "wcx",
        "\uc790\ub3d9\ucc28",
        "\uc804\uae30\ucc28",
        "\uc790\uc728\uc8fc\ud589",
      ],
    },
    {
      allow: hasDomain("medical_pharma") || /pharma|pharmaceutical|biotech|drug|medicine|medical/.test(productContext),
      keywords: [
        "biopharmaceutical",
        "pharmaceutical",
        "biotech",
        "drug",
        "license out",
        "license-out",
        "\ubc14\uc774\uc624",
        "\uc81c\uc57d",
        "\uc2e0\uc57d",
      ],
    },
    {
      allow: hasDomain("machinery"),
      keywords: [
        "industrial automation",
        "factory automation",
        "automation",
        "servo",
        "robotics",
        "\uc0b0\uc5c5 \uc790\ub3d9\ud654",
        "\uc790\ub3d9\ud654",
      ],
    },
    {
      allow: hasDomain("chemical") || hasDomain("cosmetics"),
      keywords: [
        "chemical industry",
        "petrochemical",
        "plastic industry",
        "polymer",
        "\ud654\ud559 \uc0b0\uc5c5",
        "\uc11d\uc720\ud654\ud559",
        "\ud50c\ub77c\uc2a4\ud2f1",
      ],
    },
    {
      allow: false,
      keywords: [
        "bonded zone",
        "export hub",
        "tianjin port",
        "cross border e commerce",
        "cross-border e-commerce",
        "\ubcf4\uc138\uad6c",
        "\uc218\ucd9c \ud5c8\ube0c",
        "\ud1c8\uc9c4\ud56d",
      ],
    },
    {
      allow: false,
      keywords: [
        "residency",
        "immigration",
        "visa",
        "labor permit",
        "consulate",
        "\uccb4\ub958",
        "\uc774\ubbfc",
        "\ube44\uc790",
        "\ucd1d\uc601\uc0ac\uad00",
      ],
    },
  ];

  return groups.flatMap((group) => {
    if (group.allow) return [];
    return group.keywords.filter((keyword) => normalizedText.includes(normalizeSearchText(keyword)));
  });
}

function formatValueChainBasisLabel(value: string): string {
  const labels: Record<string, string> = {
    product_anchor: "제품 앵커",
    exact_product: "제품명 직접",
    product_family: "제품군",
    hs_family: "HS 품목군",
    material: "소재",
    component: "부품",
    demand_channel: "수요처",
    distribution_channel: "유통채널",
    regulation_certification: "규제/인증",
    logistics_customs: "물류/통관",
  };
  const parts = value.split(",").map((part) => labels[part.trim()] ?? part.trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "가치사슬";
}

function tokenizeValue(value: string): string[] {
  return splitWords(normalizeSearchText(value));
}

function cleanSearchTerm(value: string): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isPassengerVehicleSearchContext(hsCode: string, context: string): boolean {
  return hsCode.startsWith("8703") ||
    /승용자동차|승용차|passenger car|passenger motor car|아이오닉|소나타|그랜저|grand(e|u)r|sonata|ioniq/.test(context);
}

function isHybridVehicleSearchContext(hsCode: string, context: string): boolean {
  return hsCode.startsWith("870340") || /하이브리드|hybrid/.test(context);
}

function isElectricVehicleSearchContext(hsCode: string, context: string): boolean {
  return hsCode.startsWith("870380") || /전기승용자동차|전기차|electric vehicle|only electric|ev\b/.test(context);
}

function extractStandardProductNameTerms(value: string): string[] {
  const markerMatch = /표준품명\s*:\s*([^·\n\r]+)/.exec(value);
  const source = markerMatch?.[1] ?? value;
  const terms: string[] = [];
  const patterns = [
    /하이브리드\s*승용자동차/g,
    /전기\s*승용자동차/g,
    /전기승용자동차/g,
    /승용자동차/g,
    /하이브리드\s*자동차/g,
    /전기차/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      terms.push(cleanSearchTerm(match[0]));
    }
  }
  return dedupeStrings(terms);
}

function collapseCompositeProductName(value: string): string {
  const cleaned = cleanSearchTerm(value);
  if (hasVariantOrModelList(cleaned)) {
    const family = extractKnownProductFamilyTerm(cleaned);
    if (family) return family;
  }
  const match = /^(.+?)[(（]([^()（）]+)[)）]/.exec(cleaned);
  if (!match) return cleaned;
  const base = cleanSearchTerm(match[1]);
  const inner = match[2];
  if (!base) return cleaned;
  if (/[,\u00B7;/]/.test(inner) || splitWords(normalizeSearchText(inner)).length >= 3) return base;
  return cleaned;
}

function isCompositeProductSearchTerm(value: string): boolean {
  const cleaned = cleanSearchTerm(value);
  if (!cleaned) return false;
  const parenthetical = /[(（][^()（）]*[,\u00B7;/][^()（）]*[)）]/.test(cleaned);
  const bracketedLong = /[\[\]()[\]（）]/.test(cleaned) && cleaned.length > 40;
  const commaList = cleaned.split(/[,;]/g).length >= 3;
  return parenthetical || bracketedLong || commaList || hasVariantOrModelList(cleaned);
}

function hasVariantOrModelList(value: string): boolean {
  const words = splitWords(normalizeSearchText(value));
  const modelLikeCount = words.filter(isModelOrVariantToken).length;
  if (modelLikeCount >= 2) return true;
  const modelLabelCount = words.filter((word) => /^(?:[a-z0-9가-힣_-]+)?(?:model|모델)(?:[a-z0-9가-힣_-]+)?$/i.test(word)).length;
  return modelLabelCount >= 2;
}

function isModelOrVariantToken(token: string): boolean {
  const normalized = normalizeToken(token);
  if (!normalized || normalized.length > 24) return false;
  if (/^(?=.*[a-z])(?=.*\d)[a-z0-9가-힣]+$/i.test(normalized)) return true;
  if (/^[a-z]{1,5}\d+[a-z0-9-]*$/i.test(normalized)) return true;
  if (/^\d+[a-z]{1,5}[a-z0-9-]*$/i.test(normalized)) return true;
  if (/^(?:[a-z0-9가-힣_-]+)?(?:model|모델)(?:[a-z0-9가-힣_-]+)?$/i.test(normalized)) return true;
  return false;
}

function extractKnownProductFamilyTerm(value: string): string {
  const text = normalizeSearchText(value);
  const families = [
    { pattern: /하이브리드\s*승용자동차|하이브리드\s*승용차/, term: "하이브리드 승용자동차" },
    { pattern: /전기\s*승용자동차|전기\s*승용차/, term: "전기승용자동차" },
    { pattern: /승용자동차|승용차/, term: "승용자동차" },
    { pattern: /hybrid passenger car|hybrid vehicle/, term: "hybrid vehicle" },
    { pattern: /electric passenger car|electric vehicle|\bev\b/, term: "electric vehicle" },
    { pattern: /passenger car|passenger motor car/, term: "passenger car" },
  ];
  return families.find((family) => family.pattern.test(text))?.term ?? "";
}

function normalizeToken(value: string): string {
  return normalizeSearchText(value).trim();
}

function normalizeSearchText(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/<[^>]*>/g, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitWords(value: string): string[] {
  if (!value) return [];
  return value
    .split(/\s+/g)
    .map((word) => word.trim())
    .filter(Boolean);
}

function tokenMatched(token: string, normalizedText: string, textTokens: Set<string>): boolean {
  if (!token) return false;
  if (token.includes(" ")) return normalizedText.includes(token);
  return textTokens.has(token);
}

function detectRegionalTargetCodes(note: string): string[] {
  const text = normalizeSearchText(note);
  if (!text) return [];

  const codes: string[] = [];
  for (const region of REGION_TARGET_CODE_MAP) {
    const matched = region.aliases.some((alias) => text.includes(normalizeSearchText(alias)));
    if (!matched) continue;
    codes.push(...region.codes);
  }
  return dedupeStrings(codes);
}

function normalizeTagInput(input: unknown): string[] {
  if (Array.isArray(input)) {
    return dedupeStrings(
      input
        .flatMap((entry) => tokenizeValue(String(entry ?? "")))
        .map(normalizeToken)
        .filter(Boolean),
    ).slice(0, 30);
  }

  const text = String(input ?? "");
  if (!text) return [];
  return dedupeStrings(
    text
      .split(/[,\n/|]+/g)
      .flatMap((entry) => tokenizeValue(entry))
      .map(normalizeToken)
      .filter(Boolean),
  ).slice(0, 30);
}

function pickText(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function signalPriority(signals: CandidateSignal[]): number {
  const weights: Record<CandidateSignal, number> = {
    hs6_exact: 10,
    hs4_prefix: 7,
    product_keyword: 6,
    cert_data: 5,
    regulation_data: 5,
    news_match: 4,
    target_market_note: 3,
    fallback_candidate: 1,
    customs_export_data: 6,
  };
  return signals.reduce((sum, signal) => sum + (weights[signal] ?? 0), 0);
}

function isCandidateSignal(value: string): value is CandidateSignal {
  return [
    "target_market_note",
    "cert_data",
    "regulation_data",
    "news_match",
    "hs6_exact",
    "hs4_prefix",
    "product_keyword",
    "fallback_candidate",
    "customs_export_data",
  ].includes(value);
}

function stripHtml(value: string): string {
  return String(value ?? "").replace(/<[^>]*>/g, " ");
}

function cleanText(value: string): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function extractExplicitCountryCodes(text: string): string[] {
  const source = String(text ?? "");
  const matches = source.match(/\b[A-Z]{2}\b/g) ?? [];
  return dedupeStrings(matches.filter((code) => code in COUNTRY_NAME_BY_CODE));
}

let ALIAS_REGEX: RegExp | null = null;
let ALIAS_ENTRY_MAP: Map<string, CountryAliasEntry> | null = null;

function getAliasRegexAndMap() {
  if (!ALIAS_REGEX || !ALIAS_ENTRY_MAP) {
    const entries = COUNTRY_ALIAS_ENTRIES;
    const patterns = entries.map(e => escapeRegExp(e.normalizedAlias));
    // Sort descending by length for longest-match-first in regex alternation
    patterns.sort((a, b) => b.length - a.length);
    ALIAS_REGEX = new RegExp(patterns.join('|'), 'g');
    ALIAS_ENTRY_MAP = new Map(entries.map(e => [e.normalizedAlias, e]));
  }
  return { regex: ALIAS_REGEX, map: ALIAS_ENTRY_MAP };
}

function detectCountryAliasCodes(text: string): string[] {
  const normalizedText = normalizeSearchText(text);
  if (!normalizedText) return [];

  const { regex, map } = getAliasRegexAndMap();
  regex.lastIndex = 0;
  
  const codes: string[] = [];
  let match;
  while ((match = regex.exec(normalizedText)) !== null) {
    const matchedStr = match[0];
    const entry = map.get(matchedStr);
    if (entry) {
      const start = match.index;
      const end = start + entry.length;
      if (isAliasMatchAllowed(normalizedText, entry, start, end)) {
        codes.push(entry.code);
      }
    }
  }

  return dedupeStrings(codes);
}

function buildCountryAliasEntries(): CountryAliasEntry[] {
  const entries: CountryAliasEntry[] = [];
  for (const [code, aliases] of Object.entries(COUNTRY_ALIAS_MAP)) {
    const normalizedAliases = dedupeStrings(aliases.map((alias) => normalizeSearchText(alias)));
    for (const alias of normalizedAliases) {
      if (!alias) continue;
      if (/^[a-z]{2}$/i.test(alias)) continue;
      entries.push({
        code,
        normalizedAlias: alias,
        hasLatin: /[a-z]/i.test(alias),
        length: alias.length,
      });
    }
  }

  return entries.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    if (a.code !== b.code) return a.code.localeCompare(b.code);
    return a.normalizedAlias.localeCompare(b.normalizedAlias);
  });
}

function hasAllowedCountryAliasMatch(normalizedText: string, normalizedAlias: string): boolean {
  if (!normalizedText || !normalizedAlias) return false;
  const entry: CountryAliasEntry = {
    code: "",
    normalizedAlias,
    hasLatin: /[a-z]/i.test(normalizedAlias),
    length: normalizedAlias.length,
  };

  const regex = new RegExp(escapeRegExp(normalizedAlias), 'g');
  let match;
  while ((match = regex.exec(normalizedText)) !== null) {
    const start = match.index;
    const end = start + normalizedAlias.length;
    if (isAliasMatchAllowed(normalizedText, entry, start, end)) return true;
  }
  return false;
}

function isAliasMatchAllowed(normalizedText: string, entry: CountryAliasEntry, start: number, end: number): boolean {
  const hasBoundary = hasWordBoundary(normalizedText, start, end);
  if (entry.hasLatin) return hasBoundary;
  if (hasBoundary) return true;
  if (entry.length >= 4) return true;
  return hasHangulMarketSuffix(normalizedText.slice(end));
}

function hasWordBoundary(text: string, start: number, end: number): boolean {
  const prev = start > 0 ? text[start - 1] : "";
  const next = end < text.length ? text[end] : "";
  return !isWordChar(prev) && !isWordChar(next);
}

function isWordChar(char: string): boolean {
  return Boolean(char) && /[\p{L}\p{N}]/u.test(char);
}

function hasHangulMarketSuffix(rest: string): boolean {
  const candidate = rest.trimStart();
  if (!candidate) return false;
  return HANGUL_TRAILING_MARKET_SUFFIXES.some((suffix) => candidate.startsWith(suffix));
}

function spansOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function dedupeStrings(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const key = String(value ?? "").trim();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function riskPenalty(
  level: RiskEvidenceLevel | null | undefined,
  penalty: { caution: number; high: number },
): number {
  if (level === "high") return penalty.high;
  if (level === "caution") return penalty.caution;
  return 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeDateOnly(value: string | null | undefined): string | null {
  const text = cleanText(value ?? "");
  if (!text) return null;

  const matched = text.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (!matched) return null;
  const year = matched[1];
  const month = matched[2].padStart(2, "0");
  const day = matched[3].padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function compareNewsByPublishedAtDesc<T extends { publishedAt?: string | null }>(a: T, b: T): number {
  return toPublishedAtScore(b.publishedAt) - toPublishedAtScore(a.publishedAt);
}

function toPublishedAtScore(value: string | null | undefined): number {
  const normalized = normalizeDateOnly(value);
  if (!normalized) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(`${normalized}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

export function extractNewsSourceText(body: string | null | undefined): string {
  const text = String(body ?? "").trim();
  if (!text) return "";

  // 기사 하단 1500자 추출 후 태그 제거
  const tail = text.slice(-1500).replace(/<[^>]+>/g, " ");

  // '자료:' 또는 '출처:' 로 시작하는 마지막 문단(또는 줄) 추출
  const match = tail.match(/(?:자료|출처)\s*:\s*([^]+)$/i);
  if (match && match[1]) {
    // 너무 길면 자름
    return match[1].trim().slice(0, 300);
  }

  // 매치 안되면 그냥 무역관 이름이라도 있는지 확인
  const officeMatch = tail.match(/(KOTRA\s*[가-힣]+무역관|[가-힣]+무역관)/i);
  if (officeMatch && officeMatch[1]) return officeMatch[1].trim();

  return "";
}
