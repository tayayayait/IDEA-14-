export type DetailSearchAttempt = {
  label: string;
  filters: Record<string, string>;
};

export type CertificationSearchContext = {
  hsCode: string;
  hskCode: string;
  productName: string;
  englishTerms: string[];
  tagTerms: string[];
  countryTerms: string[];
  maxAttempts?: number;
};

export type DetailRelevanceContext = {
  countryCode: string;
  countryAliases: string[];
  hsCode: string;
  hskCode: string;
  productName?: string;
  productTokens: string[];
};

export type CertificationMatchBasisContext = {
  countryName: string;
  countryCode: string;
  hsCode: string;
  hskCode: string;
  productName: string;
};

export type KotraCertDetailItem = {
  systName: string;
  systCn: string;
  basisRegltnCn: string;
  applyTgtCmdltCn: string;
  expansApplyCmdltCn: string;
  cmdltDfnCn: string;
  crtfcProsCn?: string;
  needPapersCn?: string;
  testStdrCn?: string;
  etcCn?: string;
  arcvCn: string;
  crtfcTyVal: string;
  hscd: string;
  nat: string;
  regn: string;
  nttSj: string;
  ovrofInfo: string;
  othbcDt: string;
  regDt: string;
  __match_decision?: KotraCertificationMatchDecision;
  __match_strategy?: "country_hs_product" | "country_product_fallback";
  __hs_match_level?: KotraCertificationHsMatchLevel;
  __hs_score?: number;
  __text_score?: number;
  __category_score?: number;
  __country_score?: number;
  __final_score?: number;
  __product_category?: KotraCertificationCategory;
  __item_category?: KotraCertificationCategory;
  __exclude_reason?: string;
  __matched_keywords?: string[];
};

export type KotraCertificationMatchDecision = "confirmed" | "review" | "excluded";

export type KotraCertificationHsMatchLevel =
  | "hsk_exact"
  | "hs_exact"
  | "hs6_prefix"
  | "hs4_prefix"
  | "hs2_prefix"
  | "missing"
  | "mismatch";

export type KotraCertificationCategory =
  | "electronics_semiconductor"
  | "automotive_transport"
  | "food_agriculture_fishery"
  | "cosmetics"
  | "medical_pharma"
  | "machinery_industrial"
  | "chemical_material"
  | "home_appliance"
  | "telecom_it"
  | "textile_apparel"
  | "construction_material"
  | "other";

export type KotraCertificationClassifiedRow<T extends KotraCertDetailItem> = {
  item: T;
  decision: KotraCertificationMatchDecision;
  countryScore: number;
  hsScore: number;
  textScore: number;
  categoryScore: number;
  finalScore: number;
  hsMatchLevel: KotraCertificationHsMatchLevel;
  productCategory: KotraCertificationCategory;
  itemCategory: KotraCertificationCategory;
  matchedKeywords: string[];
  excludeReason: string;
};

export type KotraCertificationClassification<T extends KotraCertDetailItem> = {
  confirmed: KotraCertificationClassifiedRow<T>[];
  review: KotraCertificationClassifiedRow<T>[];
  excluded: KotraCertificationClassifiedRow<T>[];
  all: KotraCertificationClassifiedRow<T>[];
};

export type KotraImportRegulationDetailItem = {
  HQURT_NAME: string;
  CMDLT_NAME: string;
  HSCD: string;
  HSCD_CN: string;
  REG_DT: string;
  REGL_CN: string;
  ISO_WD2_NAT_CD: string;
  REGL_STR_DE: string;
  REGL_END_DE: string;
  PROBE_TGT_NAT_NAME: string;
  __match_priority?: 1 | 2 | 3 | 4;
  __matched_tokens?: string[];
  __hs_match_level?: "hsk_exact" | "hs_exact" | "hs6_prefix" | "hs4_prefix" | "none";
};

const CERTIFICATION_GENERIC_PRODUCT_TOKENS = new Set(
  [
    "certification",
    "certificate",
    "approval",
    "registration",
    "permit",
    "license",
    "standard",
    "standards",
    "testing",
    "test",
    "inspection",
    "safety",
    "regulation",
    "regulatory",
    "product",
    "products",
    "item",
    "items",
    "goods",
    "commodity",
    "commodities",
    "import",
    "export",
    "china",
    "chinese",
    "인증",
    "승인",
    "허가",
    "등록",
    "시험",
    "검사",
    "표준",
    "규제",
    "안전",
    "제품",
    "상품",
    "품목",
    "수입",
    "수출",
    "중국",
    "중화인민공화국",
  ].map((token) => token.toLowerCase()),
);

const IMPORT_REGULATION_GENERIC_REVIEW_TOKENS = new Set(
  [
    "aluminum",
    "aluminium",
    "sheet",
    "sheets",
    "foil",
    "plastic",
    "polyethylene",
    "terephthalate",
    "metal",
    "steel",
    "material",
    "materials",
  ].map((token) => token.toLowerCase()),
);

const IMPORT_REGULATION_GENERIC_PRODUCT_TOKENS = new Set(
  [
    "material",
    "materials",
    "component",
    "components",
    "part",
    "parts",
    "product",
    "products",
    "goods",
    "good",
    "item",
    "items",
    "commodity",
    "commodities",
    "equipment",
    "device",
    "devices",
    "article",
    "articles",
    "frame",
    "frames",
    "body",
    "structure",
    "structures",
    "aluminum",
    "aluminium",
    "steel",
    "metal",
    "plastic",
    "sheet",
    "sheets",
    "plate",
    "plates",
    "film",
    "baby",
    "infant",
    "child",
    "children",
    "kids",
    "\uC18C\uC7AC",
    "\uBD80\uD488",
    "\uC81C\uD488",
    "\uC0C1\uD488",
    "\uD488\uBAA9",
    "\uC7A5\uBE44",
    "\uAE30\uAE30",
    "\uAE30\uACC4",
    "\uAD6C\uC870",
    "\uD504\uB808\uC784",
    "\uC54C\uB8E8\uBBF8\uB284",
    "\uD50C\uB77C\uC2A4\uD2F1",
    "\uC2DC\uD2B8",
    "\uD310",
    "\uD544\uB984",
    "\uC720\uC544",
    "\uC544\uB3D9",
    "\uC5B4\uB9B0\uC774",
    "\uC720\uC544\uC6A9\uD488",
  ].map((token) => normalizeImportRegulationText(token)),
);

const KOTRA_CERTIFICATION_GENERIC_TERMS = new Set(
  [
    "certification",
    "certificate",
    "approval",
    "registration",
    "permit",
    "license",
    "standard",
    "standards",
    "testing",
    "test",
    "inspection",
    "safety",
    "regulation",
    "regulatory",
    "product",
    "products",
    "item",
    "items",
    "goods",
    "commodity",
    "commodities",
    "import",
    "export",
    "manufacturing",
    "manufacture",
    "general",
    "other",
    "parts",
    "part",
    "component",
    "components",
    "device",
    "devices",
    "equipment",
    "machine",
    "machines",
    "\uC778\uC99D",
    "\uC2B9\uC778",
    "\uD5C8\uAC00",
    "\uB4F1\uB85D",
    "\uC2DC\uD5D8",
    "\uAC80\uC0AC",
    "\uADDC\uC81C",
    "\uC548\uC804",
    "\uC81C\uD488",
    "\uC0C1\uD488",
    "\uD488\uBAA9",
    "\uC218\uC785",
    "\uC218\uCD9C",
    "\uC81C\uC870",
    "\uAE30\uD0C0",
    "\uC77C\uBC18",
    "\uBD80\uD488",
    "\uC7A5\uCE58",
    "\uAE30\uAE30",
    "\uC7A5\uBE44",
  ].map((token) => normalizeKotraCertificationText(token)),
);

const KOTRA_CERTIFICATION_CATEGORY_TERMS: Array<{
  category: KotraCertificationCategory;
  terms: Array<{ term: string; weight: number }>;
}> = [
  {
    category: "medical_pharma",
    terms: weightedTerms([
      ["medical device", 4],
      ["dental implant", 4],
      ["contact lens", 4],
      ["medical", 3],
      ["pharma", 3],
      ["drug", 3],
      ["medicine", 3],
      ["dental", 3],
      ["implant", 3],
      ["lens", 2],
      ["\uC758\uB8CC\uAE30\uAE30", 4],
      ["\uC758\uC57D\uD488", 4],
      ["\uCE58\uACFC", 3],
      ["\uC784\uD50C\uB780\uD2B8", 3],
      ["\uCF58\uD0DD\uD2B8\uB80C\uC988", 4],
    ]),
  },
  {
    category: "cosmetics",
    terms: weightedTerms([
      ["cosmetic", 4],
      ["cosmetics", 4],
      ["cream", 1],
      ["lotion", 2],
      ["makeup", 3],
      ["skin care", 3],
      ["\uD654\uC7A5\uD488", 4],
      ["\uD06C\uB9BC", 1],
      ["\uB85C\uC158", 2],
    ]),
  },
  {
    category: "food_agriculture_fishery",
    terms: weightedTerms([
      ["food additive", 4],
      ["seafood", 4],
      ["fishery", 4],
      ["agricultural", 3],
      ["agriculture", 3],
      ["food", 3],
      ["fish", 3],
      ["frozen", 2],
      ["tuna", 3],
      ["additive", 2],
      ["\uC2DD\uD488", 4],
      ["\uC218\uC0B0\uBB3C", 4],
      ["\uB18D\uC0B0\uBB3C", 4],
      ["\uB0C9\uB3D9", 2],
      ["\uAC00\uB2E4\uB791\uC5B4", 4],
    ]),
  },
  {
    category: "telecom_it",
    terms: weightedTerms([
      ["wireless communication", 4],
      ["communication device", 4],
      ["telecommunication", 4],
      ["telecom", 4],
      ["wireless", 3],
      ["network", 3],
      ["router", 3],
      ["antenna", 3],
      ["radio", 2],
      ["bluetooth", 3],
      ["wifi", 3],
      ["5g", 3],
      ["\uBB34\uC120", 3],
      ["\uD1B5\uC2E0", 4],
      ["\uB124\uD2B8\uC6CC\uD06C", 3],
    ]),
  },
  {
    category: "electronics_semiconductor",
    terms: weightedTerms([
      ["semiconductor", 4],
      ["integrated circuit", 4],
      ["electronic component", 4],
      ["electronics", 3],
      ["electronic", 3],
      ["electrical", 2],
      ["dram", 4],
      ["memory", 3],
      ["chip", 3],
      ["module", 2],
      ["printer", 3],
      ["\uBC18\uB3C4\uCCB4", 4],
      ["\uC804\uC790", 3],
      ["\uC804\uAE30", 2],
      ["\uD504\uB9B0\uD130", 3],
    ]),
  },
  {
    category: "automotive_transport",
    terms: weightedTerms([
      ["automotive", 4],
      ["vehicle", 4],
      ["motor vehicle", 4],
      ["transport", 3],
      ["brake pad", 4],
      ["brake", 3],
      ["stroller", 3],
      ["\uC790\uB3D9\uCC28", 4],
      ["\uCC28\uB7C9", 4],
      ["\uBE0C\uB808\uC774\uD06C", 3],
    ]),
  },
  {
    category: "machinery_industrial",
    terms: weightedTerms([
      ["industrial equipment", 4],
      ["machinery", 4],
      ["machine", 3],
      ["equipment", 2],
      ["apparatus", 2],
      ["controller", 3],
      ["motor", 3],
      ["pump", 3],
      ["valve", 3],
      ["\uAE30\uACC4", 4],
      ["\uC0B0\uC5C5\uC7A5\uBE44", 4],
      ["\uC7A5\uBE44", 2],
      ["\uBAA8\uD130", 3],
    ]),
  },
  {
    category: "chemical_material",
    terms: weightedTerms([
      ["chemical", 4],
      ["material", 2],
      ["plastic", 3],
      ["resin", 3],
      ["polymer", 3],
      ["metal", 2],
      ["steel", 3],
      ["aluminum", 3],
      ["\uD654\uD559", 4],
      ["\uC18C\uC7AC", 2],
      ["\uD50C\uB77C\uC2A4\uD2F1", 3],
      ["\uCCA0\uAC15", 3],
    ]),
  },
  {
    category: "home_appliance",
    terms: weightedTerms([
      ["home appliance", 4],
      ["household appliance", 4],
      ["water purifier", 4],
      ["refrigerator", 3],
      ["washing machine", 3],
      ["\uC0DD\uD65C\uAC00\uC804", 4],
      ["\uC815\uC218\uAE30", 4],
      ["\uB0C9\uC7A5\uACE0", 3],
    ]),
  },
  {
    category: "textile_apparel",
    terms: weightedTerms([
      ["textile", 4],
      ["apparel", 4],
      ["clothing", 4],
      ["fabric", 3],
      ["garment", 3],
      ["\uC12C\uC720", 4],
      ["\uC758\uB958", 4],
      ["\uC9C1\uBB3C", 3],
    ]),
  },
  {
    category: "construction_material",
    terms: weightedTerms([
      ["construction material", 4],
      ["building material", 4],
      ["cement", 3],
      ["glass", 2],
      ["insulation", 3],
      ["\uAC74\uCD95", 4],
      ["\uAC74\uC124\uC790\uC7AC", 4],
      ["\uC2DC\uBA58\uD2B8", 3],
    ]),
  },
];

export function buildCertificationSearchAttempts(context: CertificationSearchContext): DetailSearchAttempt[] {
  const maxAttempts = Math.max(1, context.maxAttempts ?? 12);
  const maxSpecificAttempts = Math.max(0, maxAttempts - 1);
  const hsCandidates = dedupeStrings([
    context.hsCode,
    normalizeHsCode(context.hskCode),
  ]);
  const keywordCandidates = dedupeStrings([
    context.productName,
    ...context.englishTerms,
    ...context.tagTerms,
  ]).slice(0, 8);
  const attempts: DetailSearchAttempt[] = [];
  const seen = new Set<string>();

  const pushAttempt = (label: string, filters: Record<string, string>) => {
    if (attempts.length >= maxSpecificAttempts) return;

    const normalizedFilters: Record<string, string> = {};
    for (const [key, value] of Object.entries(filters)) {
      const cleaned = value.trim();
      if (cleaned) normalizedFilters[key] = cleaned;
    }

    const dedupeKey = `${normalizedFilters.search5 || ""}|${normalizedFilters.search1 || ""}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    attempts.push({ label, filters: normalizedFilters });
  };

  for (const hs of hsCandidates) {
    if (keywordCandidates[0]) {
      pushAttempt("hs+product_name", { search5: hs, search1: keywordCandidates[0] });
    }
  }

  for (const hs of hsCandidates) {
    for (const term of keywordCandidates) {
      pushAttempt("hs+keyword", { search5: hs, search1: term });
    }
  }

  for (const hs of hsCandidates) {
    pushAttempt("hs_only", { search5: hs });
  }

  return [...attempts, { label: "base_query", filters: {} }].slice(0, maxAttempts);
}

export function buildCertificationMatchBasis(context: CertificationMatchBasisContext): string {
  const country = context.countryName.trim() || context.countryCode.trim() || "정확한 정보 없음";
  const hs = normalizeHsOrHsk(context.hsCode);
  const hsk = normalizeHsOrHsk(context.hskCode);
  const product = context.productName.trim();
  const parts = [
    `국가=${country}`,
    hs ? `HS=${hs}` : "HS=정확한 정보 없음",
    hsk ? `HSK=${hsk}` : "",
    product ? `제품명=${product}` : "제품명=정확한 정보 없음",
  ].filter(Boolean);

  return parts.join(" / ");
}

export function classifyKotraCertificationMatches<T extends KotraCertDetailItem>(
  items: T[],
  context: DetailRelevanceContext,
): KotraCertificationClassification<T> {
  const all = items.map((item) => scoreKotraCertificationItem(item, context));
  const confirmed = sortKotraCertificationRows(all.filter((row) => row.decision === "confirmed"));
  const review = sortKotraCertificationRows(all.filter((row) => row.decision === "review"));
  const excluded = sortKotraCertificationRows(all.filter((row) => row.decision === "excluded"));
  return { confirmed, review, excluded, all };
}

export function rankCertificationsByDetailRelevance<T extends KotraCertDetailItem>(
  items: T[],
  context: DetailRelevanceContext,
): T[] {
  return dedupeKotraCertificationItems(
    classifyKotraCertificationMatches(items, context).confirmed.map((row) => row.item),
    10,
  );
}

export function rankCertificationsByProductFallback<T extends KotraCertDetailItem>(
  items: T[],
  context: DetailRelevanceContext,
): T[] {
  return dedupeKotraCertificationItems(
    classifyKotraCertificationMatches(items, context).review.map((row) => row.item),
    10,
  );
}

function scoreKotraCertificationItem<T extends KotraCertDetailItem>(
  item: T,
  context: DetailRelevanceContext,
): KotraCertificationClassifiedRow<T> {
  const countryAliases = normalizeCountryAliases(context.countryAliases);
  const countryMatch = scoreCertificationCountrySignal(
    item,
    countryAliases,
    context.countryCode.trim().toLowerCase(),
  );
  const hsContext = buildHsContext(context.hsCode, context.hskCode);
  const hsMatch = scoreKotraCertificationHsSignal(item.hscd, hsContext);
  const productKeywords = buildKotraCertificationProductKeywords(context);
  const matchText = buildKotraCertificationMatchText(item);
  const textMatch = scoreKotraCertificationText(matchText, context.productName ?? "", productKeywords);
  const productCategory = detectKotraCertificationCategory([
    context.productName ?? "",
    ...context.productTokens,
  ].join(" "));
  const itemCategory = detectKotraCertificationCategory(matchText);
  const categoryMatch = scoreKotraCertificationCategoryMatch(productCategory, itemCategory);
  const countryScore = countryMatch.score > 0 ? 10 : 0;
  const finalScore = countryScore + hsMatch.score + textMatch.score + categoryMatch.score;

  let decision: KotraCertificationMatchDecision = "excluded";
  let excludeReason = "";

  if (countryScore === 0) {
    excludeReason = "country_mismatch";
  } else if (categoryMatch.mismatch) {
    excludeReason = "category_mismatch";
  } else if (textMatch.genericOnly) {
    excludeReason = "generic_keyword_only";
  } else if (!textMatch.strong) {
    excludeReason = "weak_product_relevance";
  } else if (isStrongKotraCertificationHsLevel(hsMatch.level) && finalScore >= 90) {
    decision = "confirmed";
  } else if (hsMatch.level === "mismatch") {
    if (textMatch.veryStrong && !categoryMatch.mismatch) {
      decision = "review";
    } else {
      excludeReason = "hs_mismatch";
    }
  } else if (
    hsMatch.level === "missing" ||
    hsMatch.level === "hs4_prefix" ||
    hsMatch.level === "hs2_prefix"
  ) {
    decision = "review";
  } else {
    excludeReason = "score_below_confirmed_threshold";
  }

  if (decision !== "excluded") excludeReason = "";

  const itemWithMetadata = withKotraCertificationMatchMetadata(item, {
    decision,
    hsMatchLevel: hsMatch.level,
    hsScore: hsMatch.score,
    textScore: textMatch.score,
    categoryScore: categoryMatch.score,
    countryScore,
    finalScore,
    productCategory,
    itemCategory,
    excludeReason,
    matchedKeywords: textMatch.matchedKeywords,
  });

  return {
    item: itemWithMetadata,
    decision,
    countryScore,
    hsScore: hsMatch.score,
    textScore: textMatch.score,
    categoryScore: categoryMatch.score,
    finalScore,
    hsMatchLevel: hsMatch.level,
    productCategory,
    itemCategory,
    matchedKeywords: textMatch.matchedKeywords,
    excludeReason,
  };
}

function scoreKotraCertificationHsSignal(
  value: string,
  context: { hsCode: string; hskCode: string; hsk6: string; hs4: string },
): { score: number; level: KotraCertificationHsMatchLevel } {
  const selectedHs6 = context.hsCode.length >= 6 ? context.hsCode.slice(0, 6) : context.hsk6;
  const selectedHs4 = context.hs4 || selectedHs6.slice(0, 4);
  const selectedHs2 = selectedHs6.slice(0, 2);
  const candidates = extractHsCandidates(value);

  if (candidates.length === 0) return { score: 0, level: "missing" };

  for (const candidate of candidates) {
    if (context.hskCode && candidate === context.hskCode) return { score: 100, level: "hsk_exact" };
  }
  for (const candidate of candidates) {
    if (context.hsCode && candidate === context.hsCode) return { score: 80, level: "hs_exact" };
  }
  for (const candidate of candidates) {
    if (selectedHs6 && candidate.slice(0, 6) === selectedHs6) return { score: 70, level: "hs6_prefix" };
  }
  for (const candidate of candidates) {
    if (selectedHs4 && candidate.slice(0, 4) === selectedHs4) return { score: 40, level: "hs4_prefix" };
  }
  for (const candidate of candidates) {
    if (selectedHs2 && candidate.slice(0, 2) === selectedHs2) return { score: 15, level: "hs2_prefix" };
  }
  return { score: -60, level: "mismatch" };
}

function buildKotraCertificationMatchText(item: KotraCertDetailItem): string {
  return normalizeKotraCertificationText([
    item.nttSj,
    item.systName,
    item.systCn,
    item.applyTgtCmdltCn,
    item.cmdltDfnCn,
    item.expansApplyCmdltCn,
    item.etcCn ?? "",
  ].join(" "));
}

function buildKotraCertificationProductKeywords(context: DetailRelevanceContext): {
  fullPhrase: string;
  phrases: string[];
  singles: string[];
  generic: string[];
} {
  const normalizedProduct = normalizeKotraCertificationText(context.productName ?? "");
  const words = normalizedProduct.split(/\s+/g).filter(Boolean);
  const nongenericWords = words.filter((word) => !isGenericKotraCertificationTerm(word));
  const phraseCandidates: string[] = [];
  if (nongenericWords.length >= 2) {
    phraseCandidates.push(nongenericWords.join(" "));
    for (let index = 0; index < nongenericWords.length - 1; index += 1) {
      phraseCandidates.push(nongenericWords.slice(index, index + 2).join(" "));
    }
  }

  const normalizedTokens = normalizeTokens(context.productTokens)
    .map((token) => normalizeKotraCertificationText(token))
    .filter(Boolean);
  const singles = dedupeStrings([...nongenericWords, ...normalizedTokens])
    .filter((token) => !token.includes(" "))
    .filter((token) => !isGenericKotraCertificationTerm(token));
  const phrases = dedupeStrings([
    ...phraseCandidates,
    ...normalizedTokens.filter((token) => token.includes(" ") && !isGenericKotraCertificationTerm(token)),
  ]).filter((token) => token.length >= 2);
  const generic = dedupeStrings([...words, ...normalizedTokens]).filter(isGenericKotraCertificationTerm);

  return {
    fullPhrase: normalizedProduct && !isGenericKotraCertificationTerm(normalizedProduct) ? normalizedProduct : "",
    phrases,
    singles,
    generic,
  };
}

function scoreKotraCertificationText(
  matchText: string,
  productName: string,
  keywords: ReturnType<typeof buildKotraCertificationProductKeywords>,
): {
  score: number;
  strong: boolean;
  veryStrong: boolean;
  genericOnly: boolean;
  matchedKeywords: string[];
} {
  if (!matchText) {
    return { score: 0, strong: false, veryStrong: false, genericOnly: false, matchedKeywords: [] };
  }

  const normalizedProduct = normalizeKotraCertificationText(productName);
  const matchedKeywords: string[] = [];
  let score = 0;
  let fullPhraseMatched = false;
  let phraseMatched = false;

  if (normalizedProduct && matchText.includes(normalizedProduct)) {
    score += 60;
    fullPhraseMatched = true;
    matchedKeywords.push(normalizedProduct);
  } else if (keywords.fullPhrase && matchText.includes(keywords.fullPhrase)) {
    score += 60;
    fullPhraseMatched = true;
    matchedKeywords.push(keywords.fullPhrase);
  }

  const phraseMatches = keywords.phrases.filter((phrase) => phrase && matchText.includes(phrase));
  if (phraseMatches.length > 0) {
    score += Math.min(80, phraseMatches.length * 40);
    phraseMatched = true;
    matchedKeywords.push(...phraseMatches);
  }

  const textTokens = new Set(matchText.split(/\s+/g).filter(Boolean));
  const singleMatches = keywords.singles.filter((token) => isKotraCertificationKeywordMatched(token, matchText, textTokens));
  const strongSingleMatches = singleMatches.filter(isStrongSingleKotraCertificationKeyword);
  if (singleMatches.length > 0) {
    score += Math.min(60, singleMatches.length * 20);
    matchedKeywords.push(...singleMatches);
  }

  const genericMatches = keywords.generic.filter((token) => isKotraCertificationKeywordMatched(token, matchText, textTokens));
  if (score === 0 && genericMatches.length > 0) {
    score += Math.min(5, genericMatches.length);
    matchedKeywords.push(...genericMatches);
  }

  const genericOnly = score > 0 && singleMatches.length === 0 && phraseMatches.length === 0 && !fullPhraseMatched;
  const strong = fullPhraseMatched || phraseMatched || strongSingleMatches.length > 0 || singleMatches.length >= 2;
  const veryStrong = fullPhraseMatched || phraseMatches.length >= 1 || strongSingleMatches.length >= 2 || score >= 60;

  return {
    score,
    strong,
    veryStrong,
    genericOnly,
    matchedKeywords: dedupeStrings(matchedKeywords),
  };
}

function detectKotraCertificationCategory(text: string): KotraCertificationCategory {
  const normalizedText = normalizeKotraCertificationText(text);
  if (!normalizedText) return "other";

  let bestCategory: KotraCertificationCategory = "other";
  let bestScore = 0;
  for (const entry of KOTRA_CERTIFICATION_CATEGORY_TERMS) {
    let score = 0;
    for (const term of entry.terms) {
      if (isKotraCertificationKeywordMatched(term.term, normalizedText, new Set(normalizedText.split(/\s+/g)))) {
        score += term.weight;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = entry.category;
    }
  }

  return bestScore > 0 ? bestCategory : "other";
}

function scoreKotraCertificationCategoryMatch(
  productCategory: KotraCertificationCategory,
  itemCategory: KotraCertificationCategory,
): { score: number; mismatch: boolean } {
  if (productCategory === "other" || itemCategory === "other") return { score: 0, mismatch: false };
  if (productCategory === itemCategory) return { score: 10, mismatch: false };
  if (areKotraCertificationCategoriesCompatible(productCategory, itemCategory)) {
    return { score: 5, mismatch: false };
  }
  return { score: -80, mismatch: true };
}

function areKotraCertificationCategoriesCompatible(
  productCategory: KotraCertificationCategory,
  itemCategory: KotraCertificationCategory,
): boolean {
  const pair = `${productCategory}:${itemCategory}`;
  return new Set([
    "electronics_semiconductor:machinery_industrial",
    "machinery_industrial:electronics_semiconductor",
    "electronics_semiconductor:telecom_it",
    "telecom_it:electronics_semiconductor",
    "food_agriculture_fishery:chemical_material",
    "chemical_material:food_agriculture_fishery",
    "medical_pharma:machinery_industrial",
    "machinery_industrial:medical_pharma",
  ]).has(pair);
}

function isStrongKotraCertificationHsLevel(level: KotraCertificationHsMatchLevel): boolean {
  return level === "hsk_exact" || level === "hs_exact" || level === "hs6_prefix";
}

function isGenericKotraCertificationTerm(token: string): boolean {
  return KOTRA_CERTIFICATION_GENERIC_TERMS.has(normalizeKotraCertificationText(token));
}

function isStrongSingleKotraCertificationKeyword(token: string): boolean {
  if (!token || token.includes(" ") || /^\d+$/.test(token)) return false;
  if (isGenericKotraCertificationTerm(token)) return false;
  if (/[\uAC00-\uD7AF]/.test(token)) return token.length >= 2;
  return token.length >= 4;
}

function isKotraCertificationKeywordMatched(
  token: string,
  normalizedText: string,
  textTokens: Set<string>,
): boolean {
  if (!token) return false;
  const normalizedToken = normalizeKotraCertificationText(token);
  if (!normalizedToken) return false;
  if (normalizedToken.includes(" ")) return normalizedText.includes(normalizedToken);
  if (textTokens.has(normalizedToken)) return true;
  if (/^[a-z0-9]+$/.test(normalizedToken)) {
    const escaped = escapeRegExp(normalizedToken);
    return new RegExp(`(^|\\s)${escaped}(?:s|es)?($|\\s)`).test(normalizedText);
  }
  if (/[\uAC00-\uD7AF]/.test(normalizedToken) && normalizedToken.length >= 2) {
    return normalizedText.includes(normalizedToken);
  }
  return false;
}

function normalizeKotraCertificationText(value: string): string {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, " ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function withKotraCertificationMatchMetadata<T extends KotraCertDetailItem>(
  item: T,
  metadata: {
    decision: KotraCertificationMatchDecision;
    hsMatchLevel: KotraCertificationHsMatchLevel;
    hsScore: number;
    textScore: number;
    categoryScore: number;
    countryScore: number;
    finalScore: number;
    productCategory: KotraCertificationCategory;
    itemCategory: KotraCertificationCategory;
    excludeReason: string;
    matchedKeywords: string[];
  },
): T {
  return {
    ...item,
    __match_decision: metadata.decision,
    __match_strategy: metadata.decision === "confirmed" ? "country_hs_product" : "country_product_fallback",
    __hs_match_level: metadata.hsMatchLevel,
    __hs_score: metadata.hsScore,
    __text_score: metadata.textScore,
    __category_score: metadata.categoryScore,
    __country_score: metadata.countryScore,
    __final_score: metadata.finalScore,
    __product_category: metadata.productCategory,
    __item_category: metadata.itemCategory,
    __exclude_reason: metadata.excludeReason,
    __matched_keywords: metadata.matchedKeywords,
  };
}

function sortKotraCertificationRows<T extends KotraCertDetailItem>(
  rows: KotraCertificationClassifiedRow<T>[],
): KotraCertificationClassifiedRow<T>[] {
  return [...rows].sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    return parseDateScore(b.item.othbcDt || b.item.regDt) - parseDateScore(a.item.othbcDt || a.item.regDt);
  });
}

function dedupeKotraCertificationItems<T extends KotraCertDetailItem>(items: T[], limit: number): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = `${item.hscd}|${item.systName}|${item.nttSj}|${item.nat}|${item.regn}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

function weightedTerms(values: Array<[string, number]>): Array<{ term: string; weight: number }> {
  return values.map(([term, weight]) => ({ term: normalizeKotraCertificationText(term), weight }));
}

export function rankImportRegulationsByDetailRelevance<T extends KotraImportRegulationDetailItem>(
  items: T[],
  context: DetailRelevanceContext,
): T[] {
  if (items.length === 0) return [];

  const productTokens = normalizeImportRegulationProductTokens(context);
  const hsContext = buildHsContext(context.hsCode, context.hskCode);
  const selectedCountryCode = context.countryCode.trim().toUpperCase();

  const scored = items.map((item) => {
    const iso = item.ISO_WD2_NAT_CD.toUpperCase();
    const commodityText = `${item.CMDLT_NAME} ${item.HSCD_CN} ${item.REGL_CN}`;

    const importCountryMatched = Boolean(iso && iso === selectedCountryCode);
    const originTargetMatched = isKoreaOriginImportRegulationTarget(item.PROBE_TGT_NAT_NAME);
    const hsMatch = scoreImportRegulationHsMatch(item.HSCD, hsContext);
    const productMatch = matchImportRegulationProduct(commodityText, productTokens);

    if (
      !importCountryMatched ||
      !originTargetMatched ||
      (hsMatch.priority !== 1 && hsMatch.priority !== 2)
    ) {
      return { item, relevant: false, score: 0, dateScore: 0 };
    }

    return {
      item: withImportRegulationMatchMetadata(item, {
        priority: hsMatch.priority,
        hsMatchLevel: hsMatch.level,
        matchedTokens: productMatch.matchedTokens,
      }),
      relevant: true,
      score: 80 - hsMatch.priority * 10 + hsMatch.score + Math.min(productMatch.score, 4),
      dateScore: parseDateScore(item.REGL_STR_DE || item.REG_DT),
    };
  });

  const relevantRows = scored.filter((row) => row.relevant && row.score > 0);
  if (relevantRows.length === 0) return [];

  relevantRows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.dateScore - a.dateScore;
  });

  const out: T[] = [];
  const seen = new Set<string>();
  for (const row of relevantRows) {
    const key = `${row.item.HSCD}|${row.item.REGL_CN}|${row.item.ISO_WD2_NAT_CD}|${row.item.PROBE_TGT_NAT_NAME}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row.item);
    if (out.length >= 30) break;
  }

  return out;
}

export function rankImportRegulationsByProductReview<T extends KotraImportRegulationDetailItem>(
  items: T[],
  context: DetailRelevanceContext,
): T[] {
  if (items.length === 0) return [];

  const productTokens = normalizeImportRegulationProductTokens(context);
  if (productTokens.length === 0) return [];

  const hsContext = buildHsContext(context.hsCode, context.hskCode);
  const selectedCountryCode = context.countryCode.trim().toUpperCase();

  const scored = items.map((item) => {
    const iso = item.ISO_WD2_NAT_CD.toUpperCase();
    const commodityText = `${item.CMDLT_NAME} ${item.HSCD_CN} ${item.REGL_CN}`;
    const importCountryMatched = Boolean(iso && iso === selectedCountryCode);
    const originTargetMatched = isKoreaOriginImportRegulationTarget(item.PROBE_TGT_NAT_NAME);
    const hsMatch = scoreImportRegulationHsMatch(item.HSCD, hsContext);
    const productMatch = matchImportRegulationProduct(commodityText, productTokens);
    const confirmedHsMatched = hsMatch.priority === 1 || hsMatch.priority === 2;
    const reviewPriority = hsMatch.priority === 3 ? 3 : 4;

    if (!importCountryMatched || !originTargetMatched || confirmedHsMatched || !productMatch.highConfidence) {
      return { item, relevant: false, score: 0, dateScore: 0 };
    }

    return {
      item: withImportRegulationMatchMetadata(item, {
        priority: reviewPriority,
        hsMatchLevel: hsMatch.level,
        matchedTokens: productMatch.matchedTokens,
      }),
      relevant: true,
      score: (reviewPriority === 3 ? 50 : 30) + productMatch.score,
      dateScore: parseDateScore(item.REGL_STR_DE || item.REG_DT),
    };
  });

  const relevantRows = scored.filter((row) => row.relevant && row.score > 0);
  if (relevantRows.length === 0) return [];

  relevantRows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.dateScore - a.dateScore;
  });

  const out: T[] = [];
  const seen = new Set<string>();
  for (const row of relevantRows) {
    const key = `${row.item.HSCD}|${row.item.REGL_CN}|${row.item.ISO_WD2_NAT_CD}|${row.item.PROBE_TGT_NAT_NAME}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row.item);
    if (out.length >= 30) break;
  }

  return out;
}

function buildHsContext(hsCode: string, hskCode: string): {
  hsCode: string;
  hskCode: string;
  hsk6: string;
  hs4: string;
} {
  const normalizedHsCode = normalizeHsOrHsk(hsCode);
  const normalizedHskCode = normalizeHsOrHsk(hskCode);
  return {
    hsCode: normalizedHsCode,
    hskCode: normalizedHskCode,
    hsk6: normalizedHskCode ? normalizedHskCode.slice(0, 6) : "",
    hs4: normalizedHsCode ? normalizedHsCode.slice(0, 4) : "",
  };
}

function scoreHsSignal(
  value: string,
  context: { hsCode: string; hskCode: string; hsk6: string; hs4: string },
): number {
  if (!value) return 0;
  if (context.hskCode && value === context.hskCode) return 8;
  if (context.hsCode && value === context.hsCode) return 6;
  if (context.hsk6 && value.startsWith(context.hsk6)) return 4;
  if (context.hs4 && value.startsWith(context.hs4)) return 3;
  return 0;
}

type ImportRegulationHsMatch = {
  priority: 1 | 2 | 3 | null;
  score: number;
  level: "hsk_exact" | "hs_exact" | "hs6_prefix" | "hs4_prefix" | "none";
};

function scoreImportRegulationHsMatch(
  value: string,
  context: { hsCode: string; hskCode: string; hsk6: string; hs4: string },
): ImportRegulationHsMatch {
  const selectedHs6 = context.hsCode.length >= 6 ? context.hsCode.slice(0, 6) : context.hsk6;
  const selectedHs4 = context.hs4 || selectedHs6.slice(0, 4);
  const candidates = extractHsCandidates(value);

  for (const candidate of candidates) {
    if (context.hskCode && candidate === context.hskCode) {
      return { priority: 1, score: 12, level: "hsk_exact" };
    }
    if (context.hsCode && candidate === context.hsCode) {
      return { priority: 1, score: 10, level: "hs_exact" };
    }
  }
  for (const candidate of candidates) {
    if (selectedHs6 && candidate.length > 6 && candidate.slice(0, 6) === selectedHs6) {
      return { priority: 2, score: 8, level: "hs6_prefix" };
    }
  }
  for (const candidate of candidates) {
    if (selectedHs4 && candidate.slice(0, 4) === selectedHs4) {
      return { priority: 3, score: 4, level: "hs4_prefix" };
    }
  }

  return { priority: null, score: 0, level: "none" };
}

function scoreStrictImportRegulationHsSignal(
  value: string,
  context: { hsCode: string; hskCode: string; hsk6: string; hs4: string },
): number {
  const match = scoreImportRegulationHsMatch(value, context);
  return match.priority === 1 || match.priority === 2 ? match.score : 0;
}

function scoreStrictCertificationHsSignal(
  value: string,
  context: { hsCode: string; hskCode: string; hsk6: string; hs4: string },
): number {
  const selectedHs6 = context.hsCode.length >= 6 ? context.hsCode.slice(0, 6) : context.hsk6;
  if (!selectedHs6 && !context.hskCode) return 0;

  const candidates = extractHsCandidates(value);
  for (const candidate of candidates) {
    if (context.hskCode && candidate === context.hskCode) return 8;
  }
  for (const candidate of candidates) {
    if (selectedHs6 && candidate === selectedHs6) return 6;
    if (selectedHs6 && candidate.length > 6 && candidate.slice(0, 6) === selectedHs6) return 4;
  }
  return 0;
}

function extractHsCandidates(value: string): string[] {
  const raw = value.trim();
  if (!raw) return [];

  const groups = raw.match(/\d{4,10}/g);
  if (groups && groups.length > 0) {
    return dedupeStrings(groups.map((group) => group.slice(0, 10)));
  }

  const normalized = normalizeHsOrHsk(raw);
  return normalized ? [normalized] : [];
}

function scoreCertificationCountrySignal<T extends KotraCertDetailItem>(
  item: T,
  countryAliases: string[],
  selectedCountryCode: string,
): { score: number } {
  const countryText = `${item.nat} ${item.regn} ${item.ovrofInfo} ${item.nttSj}`.toLowerCase();
  if (!countryText.trim()) return { score: 0 };

  const tokens = countryText
    .split(/[^a-z0-9가-힣]+/g)
    .map((token) => token.trim())
    .filter(Boolean);
  const codeMatched = Boolean(
    selectedCountryCode.length === 2 && tokens.includes(selectedCountryCode),
  );
  const aliasMatched = countryAliases.some((alias) => isCountryAliasTextMatch(countryText, tokens, alias));
  if (!codeMatched && !aliasMatched) return { score: 0 };

  return { score: (codeMatched ? 4 : 0) + (aliasMatched ? 4 : 0) };
}

function isCountryAliasTextMatch(countryText: string, tokens: string[], rawAlias: string): boolean {
  const alias = rawAlias.toLowerCase().trim();
  if (!alias) return false;
  if (/^[a-z]{2}$/.test(alias)) return tokens.includes(alias);

  if (!alias.includes(" ")) {
    if (tokens.includes(alias)) return true;
    if (/[a-z]/.test(alias)) return false;
    if (/[가-힣]/.test(alias) && alias.length <= 2) {
      return tokens.some((token) => {
        if (!token.startsWith(alias)) return false;
        return ["시장", "수출", "진출", "대상", "향", "내"].includes(token.slice(alias.length));
      });
    }
  }

  if (/[가-힣]/.test(alias) && alias.length < 4) return false;
  return countryText.includes(alias);
}

function normalizeHsCode(value: string): string {
  const digits = normalizeHsOrHsk(value);
  return digits.length >= 6 ? digits.slice(0, 6) : digits;
}

function normalizeHsOrHsk(value: string): string {
  return value.replace(/\D/g, "");
}

function normalizeTokens(values: string[]): string[] {
  return dedupeStrings(values)
    .map((value) => normalizeImportRegulationText(value))
    .filter((value) => value.length >= 2);
}

function normalizeImportRegulationText(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCertificationProductTokens(
  values: string[],
  context: Pick<DetailRelevanceContext, "countryCode" | "countryAliases">,
): string[] {
  const countryTokens = buildCountryProductTokenExclusions(context);
  return normalizeTokens(values).filter((token) => {
    if (CERTIFICATION_GENERIC_PRODUCT_TOKENS.has(token)) return false;
    return !countryTokens.has(token);
  });
}

function normalizeImportRegulationProductTokens(context: DetailRelevanceContext): string[] {
  const phraseTokens = buildImportRegulationPhraseTokens(context.productName ?? "");
  return normalizeTokens([...phraseTokens, ...context.productTokens])
    .filter((token) => !/^\d{4,}$/.test(token))
    .filter((token) => {
      if (token.includes(" ")) return true;
      return !IMPORT_REGULATION_GENERIC_REVIEW_TOKENS.has(token) &&
        !IMPORT_REGULATION_GENERIC_PRODUCT_TOKENS.has(token);
    });
}

function buildImportRegulationPhraseTokens(value: string): string[] {
  const normalized = normalizeImportRegulationText(value);
  if (!normalized) return [];

  const words = normalized
    .split(/\s+/g)
    .filter((word) => word && !IMPORT_REGULATION_GENERIC_PRODUCT_TOKENS.has(word));
  const out: string[] = [];
  if (words.length >= 2) {
    out.push(words.slice(0, 2).join(" "));
    out.push(words.join(" "));
  }
  out.push(...words);
  return dedupeStrings(out);
}

function matchImportRegulationProduct(text: string, productTokens: string[]): {
  matchedTokens: string[];
  highConfidence: boolean;
  score: number;
} {
  const normalizedText = normalizeImportRegulationText(text);
  if (!normalizedText || productTokens.length === 0) {
    return { matchedTokens: [], highConfidence: false, score: 0 };
  }

  const textTokens = new Set(normalizedText.split(/\s+/g).filter(Boolean));
  const matchedTokens = productTokens.filter((token) =>
    isImportRegulationProductTokenMatched(token, normalizedText, textTokens)
  );
  const phraseMatched = matchedTokens.some((token) => token.includes(" "));
  const highConfidence =
    phraseMatched ||
    matchedTokens.length >= 2 ||
    matchedTokens.some((token) => isStrongSingleImportRegulationProductToken(token));

  return {
    matchedTokens,
    highConfidence,
    score: matchedTokens.length * 4 + (phraseMatched ? 4 : 0),
  };
}

function isImportRegulationProductTokenMatched(
  token: string,
  normalizedText: string,
  textTokens: Set<string>,
): boolean {
  if (!token) return false;
  if (token.includes(" ")) return normalizedText.includes(token);
  if (textTokens.has(token)) return true;
  if (/^[a-z0-9]+$/.test(token)) {
    const escaped = escapeRegExp(token);
    return new RegExp(`(^|\\s)${escaped}(?:s|es)?($|\\s)`).test(normalizedText);
  }
  if (/[\uAC00-\uD7AF]/.test(token) && token.length >= 2) {
    return normalizedText.includes(token);
  }
  return false;
}

function isStrongSingleImportRegulationProductToken(token: string): boolean {
  if (!token || token.includes(" ") || /^\d+$/.test(token)) return false;
  if (IMPORT_REGULATION_GENERIC_PRODUCT_TOKENS.has(token)) return false;
  if (IMPORT_REGULATION_GENERIC_REVIEW_TOKENS.has(token)) return false;
  if (/[\uAC00-\uD7AF]/.test(token)) return token.length >= 2;
  return token.length >= 4;
}

function withImportRegulationMatchMetadata<T extends KotraImportRegulationDetailItem>(
  item: T,
  metadata: {
    priority: 1 | 2 | 3 | 4;
    hsMatchLevel: KotraImportRegulationDetailItem["__hs_match_level"];
    matchedTokens: string[];
  },
): T {
  return {
    ...item,
    __match_priority: metadata.priority,
    __hs_match_level: metadata.hsMatchLevel,
    __matched_tokens: metadata.matchedTokens,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildCountryProductTokenExclusions(
  context: Pick<DetailRelevanceContext, "countryCode" | "countryAliases">,
): Set<string> {
  const tokens = new Set<string>();
  const add = (value: string) => {
    const normalized = value.toLowerCase().trim();
    if (!normalized) return;
    tokens.add(normalized);
    for (const part of normalized.split(/[^a-z0-9가-힣]+/g)) {
      if (part.length >= 2) tokens.add(part);
    }
  };

  add(context.countryCode);
  for (const alias of context.countryAliases) add(alias);
  return tokens;
}

export function isKoreaOriginImportRegulationTarget(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  if (/(north\s+korea|dprk|democratic people's republic of korea|조선민주주의|북한)/i.test(normalized)) {
    return false;
  }

  const tokenText = normalized
    .replace(/[()]/g, " ")
    .replace(/[^a-z0-9가-힣]+/g, " ")
    .trim();
  const tokens = tokenText.split(/\s+/).filter(Boolean);

  if (
    normalized.includes("대한민국") ||
    normalized.includes("한국") ||
    normalized.includes("south korea") ||
    normalized.includes("republic of korea") ||
    normalized.includes("korea, republic") ||
    tokens.includes("kr") ||
    tokens.includes("kor") ||
    tokens.includes("korea")
  ) {
    return true;
  }

  return (
    normalized.includes("전세계") ||
    normalized.includes("전체국가") ||
    normalized.includes("전체 국가") ||
    normalized.includes("전 국가") ||
    normalized.includes("모든 국가") ||
    normalized.includes("대세계") ||
    normalized.includes("all countries") ||
    normalized.includes("all country") ||
    normalized.includes("worldwide") ||
    normalized.includes("global")
  );
}

export function isKoreaTargetFlagValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return ["y", "yes", "true", "1", "t", "대상", "한국", "대한민국"].includes(normalized);
}

function normalizeCountryAliases(values: string[]): string[] {
  return dedupeStrings(values)
    .map((value) => value.toLowerCase())
    .filter((value) => {
      if (/[가-힣]/.test(value)) return value.length >= 2;
      return value.length >= 3;
    });
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const rawValue of values) {
    const value = rawValue.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function parseDateScore(value: string): number {
  const raw = value.trim();
  if (!raw) return 0;

  const yyyymmdd = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (yyyymmdd) return Number(`${yyyymmdd[1]}${yyyymmdd[2]}${yyyymmdd[3]}`);

  const date = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (date) return Number(`${date[1]}${date[2]}${date[3]}`);

  return 0;
}
