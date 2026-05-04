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
  arcvCn: string;
  crtfcTyVal: string;
  hscd: string;
  nat: string;
  regn: string;
  nttSj: string;
  ovrofInfo: string;
  othbcDt: string;
  regDt: string;
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

export function rankCertificationsByDetailRelevance<T extends KotraCertDetailItem>(
  items: T[],
  context: DetailRelevanceContext,
): T[] {
  if (items.length === 0) return [];

  const countryAliases = normalizeCountryAliases(context.countryAliases);
  const selectedCountryCode = context.countryCode.trim().toLowerCase();
  const productTokens = normalizeCertificationProductTokens(context.productTokens, context);
  if (productTokens.length === 0) return [];
  const hsContext = buildHsContext(context.hsCode, context.hskCode);

  const scored = items.map((item) => {
    const commodityText = [
      item.applyTgtCmdltCn,
      item.expansApplyCmdltCn,
      item.cmdltDfnCn,
      item.nttSj,
      item.systName,
      item.systCn,
      item.basisRegltnCn,
    ].join(" ").toLowerCase();
    const countryMatch = scoreCertificationCountrySignal(item, countryAliases, selectedCountryCode);
    const hsScore = scoreStrictCertificationHsSignal(item.hscd, hsContext);
    const tokenMatched = productTokens.some((token) => commodityText.includes(token));
    const productScore = tokenMatched ? 4 : 0;
    const metadataScore = (item.nttSj ? 1 : 0) + (item.crtfcTyVal || item.arcvCn ? 1 : 0);
    const relevant = countryMatch.score > 0 && hsScore > 0 && tokenMatched;

    return {
      item,
      relevant,
      score: countryMatch.score + hsScore + productScore + metadataScore,
      dateScore: parseDateScore(item.othbcDt || item.regDt),
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
    const key = `${row.item.hscd}|${row.item.systName}|${row.item.nttSj}|${row.item.nat}|${row.item.regn}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row.item);
    if (out.length >= 10) break;
  }

  return out;
}

export function rankCertificationsByProductFallback<T extends KotraCertDetailItem>(
  items: T[],
  context: DetailRelevanceContext,
): T[] {
  if (items.length === 0) return [];

  const countryAliases = normalizeCountryAliases(context.countryAliases);
  const selectedCountryCode = context.countryCode.trim().toLowerCase();
  const productTokens = normalizeCertificationProductTokens(context.productTokens, context);
  if (productTokens.length === 0) return [];
  const hsContext = buildHsContext(context.hsCode, context.hskCode);

  const scored = items.map((item) => {
    const commodityText = [
      item.applyTgtCmdltCn,
      item.expansApplyCmdltCn,
      item.cmdltDfnCn,
      item.nttSj,
      item.systName,
      item.systCn,
      item.basisRegltnCn,
    ].join(" ").toLowerCase();
    const countryMatch = scoreCertificationCountrySignal(item, countryAliases, selectedCountryCode);
    const hsScore = scoreStrictCertificationHsSignal(item.hscd, hsContext);
    const matchedTokenCount = productTokens.filter((token) => commodityText.includes(token)).length;
    const productScore = matchedTokenCount * 4;
    const metadataScore = (item.nttSj ? 1 : 0) + (item.crtfcTyVal || item.arcvCn ? 1 : 0);
    const relevant = countryMatch.score > 0 && productScore > 0 && hsScore === 0;

    return {
      item,
      relevant,
      score: countryMatch.score + productScore + metadataScore,
      dateScore: parseDateScore(item.othbcDt || item.regDt),
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
    const key = `${row.item.hscd}|${row.item.systName}|${row.item.nttSj}|${row.item.nat}|${row.item.regn}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row.item);
    if (out.length >= 10) break;
  }

  return out;
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
