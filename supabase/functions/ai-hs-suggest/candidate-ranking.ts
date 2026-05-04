import { HS_CATALOG } from "./hs-catalog.ts";
import { collectActiveDomainRules, scoreDomainRuleAdjustment, type ActiveDomainRule } from "./domain-rules.ts";
import { buildCharacterBigrams, hasSubsequenceAbbreviation, overlapRatio } from "./token-utils.ts";
import { expandWithSynonyms, computeDisambiguationPenalty } from "./synonym-dictionary.ts";

const UNKNOWN_TEXT = "확실한 정보 없음";
const AI_REVIEW_MAX_SCORE = 79;
const NON_CORE_MATCH_MAX_SCORE = 58;
const MIN_MEANINGFUL_SIGNAL_SCORE = 18;
const SCORE_WEIGHTS = {
  officialNameExact: 220,
  officialNameContains: 170,
  exactKoName: 56,
  exactEnName: 50,
  exactCode: 100,
  codePrefix: 50,
  hs6Prefix: 30,
  exactEnglishToken: 28,
  abbreviationToken: 18,
  partialEnglishToken: 12,
  koreanToken: 28,
  koreanFuzzyStrong: 16,
  koreanFuzzyWeak: 8,
  descriptionPhrase: 16,
  specificRow: 6,
  genericRowPenalty: 12,
  standardName: 6,
  requiredSpecs: 3,
} as const;

const TOKEN_SOURCE_WEIGHT = {
  name: 1,
  components: 0.95,
  modelName: 0.75,
  description: 0.45,
  targetMarketNote: 0.35,
} as const;

const ROLE_TOKEN_WEIGHT = {
  core: 1.2,
  usage: 0.28,
  material: 0.55,
  part: 0.45,
  other: 0.5,
} as const;

const ENGLISH_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "use",
  "used",
  "using",
  "with",
]);

const KOREAN_STOPWORDS = new Set(["기타", "제품", "부품", "사용", "용도", "수출", "관련", "적용", "장치"]);

type RoleKind = "core" | "usage" | "material" | "part";

type RoleConcept = {
  id: string;
  role: RoleKind;
  detectTerms: string[];
  searchTerms: string[];
};

export type HsSearchInput = {
  name: string;
  description: string;
  components: string;
  modelName: string;
  targetMarketNote: string;
  industryCode: string;
};

export type HsCandidate = {
  hs_code: string;
  hsk_code: string;
  description: string;
  confidence: number;
  source: "CUSTOMS_HS";
  official_name_ko: string;
  official_name_en: string;
  standard_name: string | null;
  required_specs: string | null;
  match_reason: string;
  match_score: number;
};

type SearchRow = {
  hsk: string;
  hs6: string;
  koName: string;
  enName: string;
  standardNames: string;
  requiredSpecs: string;
  detailNotes: string;
  koSearch: string;
  enSearch: string;
  allSearch: string;
  enTerms: Set<string>;
  enTermList: string[];
  koBigrams: Set<string>;
  isGeneric: boolean;
};

export type RankedHsRow = {
  row: SearchRow;
  score: number;
  reasons: string[];
};

export type SearchRoleProfile = {
  coreTerms: string[];
  usageTerms: string[];
  materialTerms: string[];
  partTerms: string[];
  weightedTokens: Map<string, number>;
  matchedConcepts: RoleConcept[];
  hasNumericToken: boolean;
};

type RoleMatchScore = {
  score: number;
  signalScore: number;
  hardSignalCount: number;
  softSignalCount: number;
  coreMatched: boolean;
  reasons: string[];
};

type DirectProductNameMatch = {
  score: number;
  matched: boolean;
  reason: string;
};

const ROLE_CONCEPTS: RoleConcept[] = [
  {
    id: "seat",
    role: "core",
    detectTerms: ["시트", "좌석", "의자", "seat", "seats"],
    searchTerms: ["시트", "좌석", "의자", "seat", "seats", "차량용 의자", "항공기용 의자"],
  },
  {
    id: "filter",
    role: "core",
    detectTerms: ["필터", "여과기", "filter", "filters", "filtration"],
    searchTerms: ["필터", "여과", "filter", "filters", "filtration"],
  },
  {
    id: "lighting",
    role: "core",
    detectTerms: ["조명", "램프", "전등", "라이트", "light", "lighting", "lamp", "lamps"],
    searchTerms: ["조명", "램프", "전등", "light", "lighting", "lamp", "lamps"],
  },
  {
    id: "case",
    role: "core",
    detectTerms: ["케이스", "하우징", "외장", "case", "cases", "housing", "enclosure"],
    searchTerms: ["케이스", "하우징", "외장", "case", "cases", "housing", "enclosure"],
  },
  {
    id: "packing",
    role: "core",
    detectTerms: ["패킹", "가스켓", "실링", "packing", "gasket", "seal", "sealing"],
    searchTerms: ["패킹", "가스켓", "실링", "packing", "gasket", "seal", "sealing"],
  },
  {
    id: "memory",
    role: "core",
    detectTerms: ["dram", "sram", "nand", "flash memory", "memory", "memories", "디램", "에스램", "메모리"],
    searchTerms: ["dram", "sram", "nand", "flash memory", "memory", "memories", "디램", "에스램", "메모리"],
  },
  {
    id: "mirror",
    role: "core",
    detectTerms: ["백미러", "거울", "mirror", "mirrors", "rear-view"],
    searchTerms: ["백미러", "거울", "mirror", "mirrors", "rear-view"],
  },
  {
    id: "automotive",
    role: "usage",
    detectTerms: ["승용자동차", "자동차", "차량", "전기차", "모빌리티", "automotive", "vehicle", "vehicles", "car", "cars", "ev"],
    searchTerms: ["승용자동차", "자동차", "차량", "전기차", "automotive", "vehicle", "vehicles", "motor vehicle", "motor vehicles", "car", "cars", "ev"],
  },
  {
    id: "semiconductor-equipment",
    role: "usage",
    detectTerms: ["반도체 장비", "반도체", "장비", "semiconductor equipment", "semiconductor"],
    searchTerms: ["반도체", "장비", "semiconductor", "semiconductor equipment"],
  },
  {
    id: "ship",
    role: "usage",
    detectTerms: ["선박", "조선", "ship", "ships", "vessel", "vessels", "marine"],
    searchTerms: ["선박", "조선", "ship", "ships", "vessel", "vessels", "marine"],
  },
  {
    id: "medical-device",
    role: "usage",
    detectTerms: ["의료기기", "의료", "medical device", "medical"],
    searchTerms: ["의료기기", "의료", "medical device", "medical"],
  },
  {
    id: "plastic",
    role: "material",
    detectTerms: ["플라스틱", "plastic", "plastics"],
    searchTerms: ["플라스틱", "plastic", "plastics"],
  },
  {
    id: "rubber",
    role: "material",
    detectTerms: ["고무", "rubber"],
    searchTerms: ["고무", "rubber"],
  },
  {
    id: "steel",
    role: "material",
    detectTerms: ["철강", "철", "steel", "iron"],
    searchTerms: ["철강", "철", "steel", "iron"],
  },
  {
    id: "aluminum",
    role: "material",
    detectTerms: ["알루미늄", "알루미니움", "aluminum", "aluminium"],
    searchTerms: ["알루미늄", "알루미니움", "aluminum", "aluminium"],
  },
  {
    id: "partness",
    role: "part",
    detectTerms: ["부품", "부분품", "소재", "모듈", "커버", "프레임", "part", "parts", "component", "components", "module", "cover", "frame"],
    searchTerms: ["부품", "부분품", "소재", "모듈", "커버", "프레임", "part", "parts", "component", "components", "module", "cover", "frame"],
  },
];

const SEARCH_ROWS: SearchRow[] = HS_CATALOG.map((row) => {
  const koName = normalizeText(row.ko_name);
  const enName = normalizeText(row.en_name);
  const standardNames = normalizeText(row.standard_names);
  const requiredSpecs = normalizeText(row.required_specs);
  const detailNotes = normalizeText(row.detail_notes);
  const koSearch = [koName, standardNames, requiredSpecs, detailNotes].filter(Boolean).join(" ");
  const enSearch = normalizeComparable([enName, standardNames, requiredSpecs, detailNotes].join(" "));
  const allSearch = normalizeComparable([koSearch, enSearch].join(" "));
  const enTerms = buildTerms(enSearch);

  return {
    hsk: row.hsk,
    hs6: row.hs6,
    koName,
    enName,
    standardNames,
    requiredSpecs,
    detailNotes,
    koSearch,
    enSearch,
    allSearch,
    enTerms,
    enTermList: [...enTerms],
    koBigrams: buildCharacterBigrams(koSearch),
    isGeneric: koName === "기타" || enName.toLowerCase() === "other",
  };
});

export function analyzeSearchRoles(input: HsSearchInput): SearchRoleProfile {
  const mergedText = [
    input.name,
    input.components,
    input.modelName,
    input.description,
    input.targetMarketNote,
  ].filter(Boolean).join(" ");
  const normalizedText = normalizeComparable(mergedText);
  const baseWeightedTokens = collectBaseWeightedTokens(input);
  const matchedConcepts = ROLE_CONCEPTS.filter((concept) => matchesConcept(normalizedText, concept));

  for (const concept of matchedConcepts) {
    for (const term of concept.searchTerms) {
      const normalizedTerm = normalizeComparable(term);
      if (!isInformativeSearchToken(normalizedTerm)) continue;
      const current = baseWeightedTokens.get(normalizedTerm) ?? 0;
      baseWeightedTokens.set(normalizedTerm, Math.max(current, ROLE_TOKEN_WEIGHT[concept.role]));
    }
  }

  const coreTerms = collectMatchedTerms(normalizedText, matchedConcepts, "core");
  const usageTerms = collectMatchedTerms(normalizedText, matchedConcepts, "usage");
  const materialTerms = collectMatchedTerms(normalizedText, matchedConcepts, "material");
  const partTerms = collectMatchedTerms(normalizedText, matchedConcepts, "part");

  return {
    coreTerms,
    usageTerms,
    materialTerms,
    partTerms,
    weightedTokens: new Map([...baseWeightedTokens.entries()].slice(0, 80)),
    matchedConcepts,
    hasNumericToken: [...baseWeightedTokens.keys()].some((token) => /^\d{4,10}$/.test(token)),
  };
}

export function rankHsCandidates(input: HsSearchInput): RankedHsRow[] {
  const roles = analyzeSearchRoles(input);
  const activeDomainRules = collectActiveDomainRules(new Set(roles.weightedTokens.keys()), input.industryCode);
  const normalizedName = normalizeComparable(input.name);
  const normalizedDescription = normalizeComparable(input.description);

  const ranked: RankedHsRow[] = [];
  for (const row of SEARCH_ROWS) {
    const scored = scoreRow(row, roles, normalizedName, normalizedDescription, activeDomainRules);
    if (scored.score <= 0) continue;
    ranked.push(scored);
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.row.isGeneric !== b.row.isGeneric) return a.row.isGeneric ? 1 : -1;
    return a.row.hsk.localeCompare(b.row.hsk);
  });
  return ranked;
}

/** 배치 내 원시 점수를 0~100 정규화 점수로 변환 (Top-Relative 방식) */
export function normalizeMatchScores(rankedRows: RankedHsRow[]): RankedHsRow[] {
  if (rankedRows.length === 0) return [];
  const topRawScore = rankedRows[0].score;
  if (topRawScore <= 0) return rankedRows;

  const ceiling = computeTopCeiling(topRawScore);

  return rankedRows.map((row) => ({
    ...row,
    score: Math.max(1, Math.round((row.score / topRawScore) * ceiling)),
  }));
}

function computeTopCeiling(topScore: number): number {
  if (topScore >= 200) return 98;
  if (topScore >= 150) return 92;
  if (topScore >= 100) return 85;
  if (topScore >= 50) return 75;
  return 60;
}

export function toHsCandidate(item: RankedHsRow): HsCandidate {
  const matchScore = Math.max(0, Math.min(100, item.score));
  const confidence = Math.max(0.1, Math.min(1, Number((matchScore / 100).toFixed(2))));
  const standardName = firstPart(item.row.standardNames);

  return {
    hs_code: item.row.hs6,
    hsk_code: item.row.hsk,
    description: buildDescription(item.row, standardName),
    confidence,
    source: "CUSTOMS_HS",
    official_name_ko: item.row.koName || UNKNOWN_TEXT,
    official_name_en: item.row.enName || UNKNOWN_TEXT,
    standard_name: standardName || null,
    required_specs: item.row.requiredSpecs || null,
    match_reason: item.reasons.join(", ") || "공식 품목명 기준 매칭",
    match_score: matchScore,
  };
}

export function sortCandidatesByMatchScore(candidates: HsCandidate[]): HsCandidate[] {
  return [...candidates].sort((left, right) => {
    const scoreDiff = right.match_score - left.match_score;
    if (scoreDiff !== 0) return scoreDiff;
    const confidenceDiff = right.confidence - left.confidence;
    if (confidenceDiff !== 0) return confidenceDiff;
    return left.hsk_code.localeCompare(right.hsk_code);
  });
}

export function buildFallbackRationale(candidates: HsCandidate[], input: HsSearchInput): string {
  const top = candidates.slice(0, 3).map((candidate) => `${candidate.hsk_code}(${candidate.official_name_ko})`);
  const roleProfile = analyzeSearchRoles(input);
  const corePreview = roleProfile.coreTerms.slice(0, 4).join(", ") || "확실한 정보 없음";
  const usagePreview = roleProfile.usageTerms.slice(0, 4).join(", ") || "확실한 정보 없음";

  return [
    "관세청 HS부호/표준품명 공식 데이터에서 역할 기반 점수로 후보를 정렬했습니다.",
    `상위 후보: ${top.join(", ") || UNKNOWN_TEXT}.`,
    `핵심 품목어: ${corePreview}. 사용처/산업어: ${usagePreview}.`,
  ].join(" ");
}

export function collectTokens(input: HsSearchInput): Set<string> {
  return new Set(analyzeSearchRoles(input).weightedTokens.keys());
}

function scoreRow(
  row: SearchRow,
  roles: SearchRoleProfile,
  normalizedName: string,
  normalizedDescription: string,
  activeDomainRules: ActiveDomainRule[],
): RankedHsRow {
  let score = 0;
  let signalScore = 0;
  let hardSignalCount = 0;
  let softSignalCount = 0;
  const reasons: string[] = [];

  const directNameMatch = scoreDirectProductName(row, normalizedName);
  if (directNameMatch.matched) {
    score += directNameMatch.score;
    signalScore += directNameMatch.score;
    hardSignalCount += 1;
    reasons.push(directNameMatch.reason);
  }

  for (const [token, tokenWeight] of roles.weightedTokens) {
    if (!token) continue;

    if (/^\d{4,10}$/.test(token)) {
      if (row.hsk === token) {
        score += SCORE_WEIGHTS.exactCode;
        signalScore += SCORE_WEIGHTS.exactCode;
        hardSignalCount += 1;
        reasons.push(`코드(${token}) 정확 일치`);
        continue;
      }
      if (row.hsk.startsWith(token)) {
        score += SCORE_WEIGHTS.codePrefix;
        signalScore += SCORE_WEIGHTS.codePrefix;
        hardSignalCount += 1;
        reasons.push(`코드(${token}) 접두 일치`);
        continue;
      }
      if (row.hs6.startsWith(token.slice(0, 6))) {
        score += SCORE_WEIGHTS.hs6Prefix;
        signalScore += SCORE_WEIGHTS.hs6Prefix;
        hardSignalCount += 1;
        reasons.push(`HS6(${token.slice(0, 6)}) 일치`);
      }
      continue;
    }

    if (isAsciiToken(token)) {
      if (row.enTerms.has(token)) {
        const gain = applyTokenWeight(SCORE_WEIGHTS.exactEnglishToken, tokenWeight);
        score += gain;
        signalScore += gain;
        if (tokenWeight >= ROLE_TOKEN_WEIGHT.core) hardSignalCount += 1;
        else softSignalCount += 1;
        reasons.push(`영문 키워드(${token}) 일치`);
      } else if (hasEnglishAbbreviationMatch(token, row.enTermList)) {
        const gain = applyTokenWeight(SCORE_WEIGHTS.abbreviationToken, tokenWeight);
        score += gain;
        signalScore += gain;
        if (tokenWeight >= ROLE_TOKEN_WEIGHT.core) hardSignalCount += 1;
        else softSignalCount += 1;
        reasons.push(`영문 약어(${token}) 일치`);
      } else if (row.enSearch.includes(token)) {
        const gain = applyTokenWeight(SCORE_WEIGHTS.partialEnglishToken, tokenWeight);
        score += gain;
        signalScore += gain;
        softSignalCount += 1;
        reasons.push(`영문 부분 일치(${token})`);
      }
      continue;
    }

    if (row.koSearch.includes(token)) {
      const gain = applyTokenWeight(SCORE_WEIGHTS.koreanToken, tokenWeight);
      score += gain;
      signalScore += gain;
      if (tokenWeight >= ROLE_TOKEN_WEIGHT.core) hardSignalCount += 1;
      else softSignalCount += 1;
      reasons.push(`한글 키워드(${token}) 일치`);
      continue;
    }

    const fuzzyScore = scoreKoreanFuzzyToken(token, row.koBigrams);
    if (fuzzyScore > 0) {
      const gain = applyTokenWeight(fuzzyScore, tokenWeight);
      score += gain;
      signalScore += gain;
      if (fuzzyScore >= SCORE_WEIGHTS.koreanFuzzyStrong && tokenWeight >= ROLE_TOKEN_WEIGHT.core) hardSignalCount += 1;
      else softSignalCount += 1;
      reasons.push(`한글 유사 키워드(${token}) 일치`);
    }
  }

  const roleMatch = scoreRoleMatch(row, roles);
  score += roleMatch.score;
  signalScore += roleMatch.signalScore;
  hardSignalCount += roleMatch.hardSignalCount;
  softSignalCount += roleMatch.softSignalCount;
  reasons.push(...roleMatch.reasons);

  if (
    normalizedDescription
    && normalizedDescription.length <= 80
    && row.allSearch.includes(normalizedDescription.slice(0, 24))
  ) {
    score += SCORE_WEIGHTS.descriptionPhrase;
    signalScore += SCORE_WEIGHTS.descriptionPhrase;
    hardSignalCount += 1;
    reasons.push("설명문 핵심 구간 일치");
  }

  const hasMeaningfulSignal = hardSignalCount > 0 || (softSignalCount >= 2 && signalScore >= MIN_MEANINGFUL_SIGNAL_SCORE);
  if (!hasMeaningfulSignal) {
    return { row, score: 0, reasons: [] };
  }

  if (!row.isGeneric) score += SCORE_WEIGHTS.specificRow;
  else score -= SCORE_WEIGHTS.genericRowPenalty;

  if (row.standardNames) score += SCORE_WEIGHTS.standardName;
  if (row.requiredSpecs) score += SCORE_WEIGHTS.requiredSpecs;

  const domainAdjustment = scoreDomainRuleAdjustment({
    hs6: row.hs6,
    rowSearch: row.allSearch,
    activeRules: activeDomainRules,
  });
  if (domainAdjustment.score !== 0) {
    score += domainAdjustment.score;
    reasons.push(...domainAdjustment.reasons);
  }

  // 동음이의어 감점: 입력 컨텍스트와 카탈로그 행의 의미 충돌 감지
  const inputContextForDisambiguation = normalizeComparable(
    [normalizedName, normalizedDescription].filter(Boolean).join(" "),
  );
  const matchedTokenStrings = [...roles.weightedTokens.keys()].filter(
    (token) => !isAsciiToken(token) && row.koSearch.includes(token),
  );
  const disambiguationPenalty = computeDisambiguationPenalty(
    row.allSearch,
    inputContextForDisambiguation,
    matchedTokenStrings,
  );
  if (disambiguationPenalty > 0) {
    score -= disambiguationPenalty;
    reasons.push(`동음이의어 감점(-${disambiguationPenalty})`);
  }

  score = applyRoleCaps(Math.max(0, score), roles, roleMatch, directNameMatch.matched);

  return {
    row,
    score: Math.max(0, score),
    reasons: dedupeReasons(reasons).slice(0, 5),
  };
}

function scoreDirectProductName(row: SearchRow, normalizedName: string): DirectProductNameMatch {
  if (!isInformativeDirectProductName(normalizedName)) {
    return { score: 0, matched: false, reason: "" };
  }

  const officialKoName = normalizeComparable(row.koName);
  const standardNames = row.standardNames
    .split("|")
    .map((part) => normalizeComparable(part))
    .filter(Boolean);

  if (officialKoName === normalizedName || standardNames.some((part) => part === normalizedName)) {
    return {
      score: SCORE_WEIGHTS.officialNameExact,
      matched: true,
      reason: "official product name exact match",
    };
  }

  if (containsTerm(officialKoName, normalizedName) || standardNames.some((part) => containsTerm(part, normalizedName))) {
    return {
      score: SCORE_WEIGHTS.officialNameContains,
      matched: true,
      reason: "official product name contains query",
    };
  }

  return { score: 0, matched: false, reason: "" };
}

function scoreRoleMatch(row: SearchRow, roles: SearchRoleProfile): RoleMatchScore {
  let score = 0;
  let signalScore = 0;
  let hardSignalCount = 0;
  let softSignalCount = 0;
  const reasons: string[] = [];

  const coreConcepts = roles.matchedConcepts.filter((concept) => concept.role === "core");
  const usageConcepts = roles.matchedConcepts.filter((concept) => concept.role === "usage");
  const materialConcepts = roles.matchedConcepts.filter((concept) => concept.role === "material");
  const partConcepts = roles.matchedConcepts.filter((concept) => concept.role === "part");

  const coreMatches = coreConcepts.filter((concept) => conceptMatchesRow(row, concept));
  for (const concept of coreMatches) {
    score += 64;
    signalScore += 64;
    hardSignalCount += 1;
    reasons.push(`핵심 품목어(${concept.id}) 일치`);
  }

  const usageMatches = usageConcepts.filter((concept) => conceptMatchesRow(row, concept));
  for (const concept of usageMatches.slice(0, 2)) {
    score += 8;
    signalScore += 8;
    softSignalCount += 1;
    reasons.push(`사용처/산업어(${concept.id}) 보조 일치`);
  }

  const materialMatches = materialConcepts.filter((concept) => conceptMatchesRow(row, concept));
  for (const concept of materialMatches.slice(0, 2)) {
    score += coreMatches.length > 0 ? 8 : 3;
    signalScore += coreMatches.length > 0 ? 8 : 3;
    softSignalCount += 1;
    reasons.push(`재질어(${concept.id}) 보조 일치`);
  }

  const partMatches = partConcepts.filter((concept) => conceptMatchesRow(row, concept));
  for (const concept of partMatches.slice(0, 1)) {
    score += coreMatches.length > 0 ? 6 : 4;
    signalScore += coreMatches.length > 0 ? 6 : 4;
    softSignalCount += 1;
    reasons.push(`부품 여부(${concept.id}) 보조 일치`);
  }

  return {
    score,
    signalScore,
    hardSignalCount,
    softSignalCount,
    coreMatched: coreMatches.length > 0,
    reasons,
  };
}

function applyRoleCaps(
  score: number,
  roles: SearchRoleProfile,
  roleMatch: RoleMatchScore,
  hasDirectProductNameMatch: boolean,
): number {
  if (roles.hasNumericToken) return score;
  if (hasDirectProductNameMatch) return score;

  if (roles.coreTerms.length > 0 && !roleMatch.coreMatched) {
    return Math.min(score, NON_CORE_MATCH_MAX_SCORE);
  }

  if (isBroadUsagePartQuery(roles)) {
    return Math.min(score, AI_REVIEW_MAX_SCORE);
  }

  return score;
}

function isBroadUsagePartQuery(roles: SearchRoleProfile): boolean {
  return roles.coreTerms.length === 0 && roles.usageTerms.length > 0 && roles.partTerms.length > 0;
}

function isInformativeDirectProductName(normalizedName: string): boolean {
  if (!normalizedName) return false;
  if (/^\d{4,10}$/.test(normalizedName)) return false;
  if (isAsciiToken(normalizedName)) return normalizedName.length >= 3 && !ENGLISH_STOPWORDS.has(normalizedName);
  return normalizedName.length >= 2 && !KOREAN_STOPWORDS.has(normalizedName);
}

function collectBaseWeightedTokens(input: HsSearchInput): Map<string, number> {
  const collected = new Map<string, number>();
  const sources: Array<{ text: string; weight: number }> = [
    { text: input.name, weight: TOKEN_SOURCE_WEIGHT.name },
    { text: input.components, weight: TOKEN_SOURCE_WEIGHT.components },
    { text: input.modelName, weight: TOKEN_SOURCE_WEIGHT.modelName },
    { text: input.description, weight: TOKEN_SOURCE_WEIGHT.description },
    { text: input.targetMarketNote, weight: TOKEN_SOURCE_WEIGHT.targetMarketNote },
  ];

  for (const source of sources) {
    if (!source.text) continue;
    const tokens = tokenize(source.text).filter((token) => isInformativeSearchToken(token));
    for (const token of tokens) {
      const prev = collected.get(token) ?? 0;
      const roleWeight = resolveDetectedTokenRoleWeight(token);
      const merged = Math.max(prev, Math.min(source.weight, roleWeight));
      const overlapBonus = prev > 0 ? 0.08 : 0;
      collected.set(token, Math.min(1.2, merged + overlapBonus));
    }
  }

  // 유의어 사전 확장: 입력 컨텍스트 기반으로 동의어 토큰 추가
  const inputContext = normalizeComparable(
    [input.name, input.description, input.components].filter(Boolean).join(" "),
  );
  const synonymTokens = expandWithSynonyms(collected, inputContext);
  for (const [synToken, synWeight] of synonymTokens) {
    if (collected.has(synToken)) continue;
    if (!isInformativeSearchToken(synToken)) continue;
    collected.set(synToken, synWeight);
  }

  return new Map(
    [...collected.entries()].sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      return right[0].length - left[0].length;
    }),
  );
}

function resolveDetectedTokenRoleWeight(token: string): number {
  for (const concept of ROLE_CONCEPTS) {
    if (!concept.detectTerms.some((term) => normalizeComparable(term) === token)) continue;
    return ROLE_TOKEN_WEIGHT[concept.role];
  }
  return ROLE_TOKEN_WEIGHT.other;
}

function matchesConcept(normalizedText: string, concept: RoleConcept): boolean {
  return concept.detectTerms.some((term) => containsTerm(normalizedText, normalizeComparable(term)));
}

function collectMatchedTerms(normalizedText: string, concepts: RoleConcept[], role: RoleKind): string[] {
  const terms: string[] = [];
  for (const concept of concepts) {
    if (concept.role !== role) continue;
    for (const term of concept.detectTerms) {
      const normalizedTerm = normalizeComparable(term);
      if (!containsTerm(normalizedText, normalizedTerm)) continue;
      terms.push(term);
    }
  }
  return dedupe(terms);
}

function conceptMatchesRow(row: SearchRow, concept: RoleConcept): boolean {
  return concept.searchTerms.some((term) => containsTerm(row.allSearch, normalizeComparable(term)));
}

function containsTerm(haystack: string, term: string): boolean {
  if (!haystack || !term) return false;
  if (isAsciiToken(term)) return new RegExp(`(^|[^a-z0-9])${escapeRegExp(term)}([^a-z0-9]|$)`, "i").test(haystack);
  return haystack.includes(term);
}

function tokenize(text: string): string[] {
  return normalizeComparable(text)
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter(Boolean);
}

function buildDescription(row: SearchRow, standardName: string): string {
  const titleKo = row.koName || UNKNOWN_TEXT;
  const titleEn = row.enName ? ` (${row.enName})` : "";

  if (row.isGeneric && standardName) return `${titleKo}${titleEn} · 표준품명: ${standardName}`;
  if (standardName && standardName !== titleKo) return `${titleKo}${titleEn} · 표준품명: ${standardName}`;
  return `${titleKo}${titleEn}`;
}

function applyTokenWeight(base: number, weight: number): number {
  const clamped = Math.min(1.2, Math.max(0.25, weight));
  return Math.max(1, Math.round(base * clamped));
}

function isInformativeSearchToken(token: string): boolean {
  if (!token) return false;
  if (/^\d{4,10}$/.test(token)) return true;

  if (isAsciiToken(token)) {
    if (token.length < 3) return false;
    return !ENGLISH_STOPWORDS.has(token);
  }

  if (token.length < 2) return false;
  return !KOREAN_STOPWORDS.has(token);
}

function hasEnglishAbbreviationMatch(token: string, terms: string[]): boolean {
  if (token.length < 2 || token.length > 6) return false;
  for (const term of terms) {
    if (term.length <= token.length) continue;
    if (hasSubsequenceAbbreviation(token, term)) return true;
  }
  return false;
}

function scoreKoreanFuzzyToken(token: string, rowBigrams: Set<string>): number {
  if (token.length < 3) return 0;
  const tokenBigrams = buildCharacterBigrams(token);
  if (tokenBigrams.size === 0) return 0;

  const ratio = overlapRatio(tokenBigrams, rowBigrams);
  if (ratio >= 0.67) return SCORE_WEIGHTS.koreanFuzzyStrong;
  if (ratio >= 0.34) return SCORE_WEIGHTS.koreanFuzzyWeak;
  return 0;
}

function isAsciiToken(token: string): boolean {
  return /^[a-z0-9]+$/i.test(token);
}

function buildTerms(text: string): Set<string> {
  return new Set(
    text
      .split(/[^a-z0-9]+/g)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2),
  );
}

function normalizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function normalizeComparable(value: unknown): string {
  return normalizeText(String(value ?? "")).toLowerCase();
}

function firstPart(value: string): string {
  return value.split("|").map((part) => part.trim()).filter(Boolean)[0] ?? "";
}

function dedupeReasons(reasons: string[]): string[] {
  return dedupe(reasons.filter(Boolean));
}

function dedupe<T>(values: T[]): T[] {
  return [...new Set(values.filter(Boolean))];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
