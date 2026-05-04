export type DomainRule = {
  id: string;
  label: string;
  triggerTokens: string[];
  allowChapters: string[];
  denyChapters: string[];
  allowBoost: number;
  denyPenalty: number;
  rowBoostKeywords: string[];
  rowBoost: number;
  rowPenaltyKeywords: string[];
  rowPenalty: number;
  industryCodePrefixes?: string[];
  industryMatchBonus?: number;
};

export type ActiveDomainRule = {
  rule: DomainRule;
  industryMatched: boolean;
};

type StandardPenaltyRule = {
  id: string;
  keywords: string[];
  penalty: number;
};

const DOMAIN_RULES: DomainRule[] = [
  {
    id: "memory-semiconductor",
    label: "메모리 반도체",
    triggerTokens: [
      "dram",
      "sram",
      "nand",
      "flash",
      "memory",
      "memories",
      "디램",
      "에스램",
      "메모리",
      "플래시",
      "낸드",
    ],
    allowChapters: ["85"],
    denyChapters: ["84", "16", "20", "21", "93"],
    allowBoost: 22,
    denyPenalty: 18,
    rowBoostKeywords: [
      "dram",
      "sram",
      "flash memory",
      "integrated circuits: memories",
      "memory",
      "memories",
      "디램",
      "에스램",
      "플래시 메모리",
      "메모리",
      "낸드",
    ],
    rowBoost: 26,
    rowPenaltyKeywords: [
      "manufacturing",
      "machines and mechanical appliances for making semiconductor devices",
      "transport, handling and storage",
      "machinery",
      "apparatus",
      "제조용",
      "이송",
      "핸들링",
      "저장",
      "기계",
      "장치",
      "장비",
      "flashbulb",
      "소염기",
    ],
    rowPenalty: 22,
    industryCodePrefixes: ["26111", "26112", "26113", "2611", "261"],
    industryMatchBonus: 6,
  },
  {
    id: "automotive-parts",
    label: "자동차/모빌리티 부품",
    triggerTokens: [
      "car",
      "cars",
      "vehicle",
      "vehicles",
      "automotive",
      "ev",
      "motor",
      "battery",
      "자동차",
      "차량",
      "전기차",
      "모빌리티",
      "백미러",
      "브레이크",
    ],
    allowChapters: ["40", "70", "73", "84", "85", "87", "90", "94"],
    denyChapters: ["02", "03", "04", "07", "08", "09", "10", "16", "19", "20", "21"],
    allowBoost: 10,
    denyPenalty: 16,
    rowBoostKeywords: [
      "vehicle",
      "automotive",
      "car",
      "motor vehicle",
      "rear-view mirror",
      "seats of a kind used for motor vehicles",
      "자동차",
      "차량",
      "전기차",
      "백미러",
      "브레이크",
      "차량용 의자",
    ],
    rowBoost: 12,
    rowPenaltyKeywords: [
      "peanut",
      "butter",
      "meat",
      "fish",
      "food",
      "preserved",
      "조제",
      "저장처리",
      "식품",
      "땅콩",
      "버터",
    ],
    rowPenalty: 16,
    industryCodePrefixes: ["291", "292", "293", "301", "302", "303", "304"],
    industryMatchBonus: 4,
  },
  {
    id: "chemical-materials",
    label: "화학/소재",
    triggerTokens: [
      "chemical",
      "chemicals",
      "resin",
      "polymer",
      "solvent",
      "coating",
      "adhesive",
      "additive",
      "화학",
      "수지",
      "폴리머",
      "용제",
      "도료",
      "첨가제",
    ],
    allowChapters: ["28", "29", "32", "34", "35", "38", "39"],
    denyChapters: ["16", "19", "20", "21", "84", "85"],
    allowBoost: 10,
    denyPenalty: 14,
    rowBoostKeywords: [
      "chemical",
      "resin",
      "polymer",
      "solvent",
      "compound",
      "화학",
      "수지",
      "폴리머",
      "용제",
      "화합물",
    ],
    rowBoost: 10,
    rowPenaltyKeywords: [
      "machinery",
      "machine",
      "apparatus",
      "제조용 기기",
      "장비",
      "meat",
      "fish",
      "food",
      "식품",
      "육류",
      "어류",
    ],
    rowPenalty: 12,
    industryCodePrefixes: ["201", "202", "203", "204", "205", "20"],
    industryMatchBonus: 4,
  },
  {
    id: "seat-disambiguation",
    label: "좌석/시트 문맥 구분",
    triggerTokens: ["시트", "좌석", "의자", "seat", "seats"],
    allowChapters: ["94"],
    denyChapters: ["39"],
    allowBoost: 14,
    denyPenalty: 20,
    rowBoostKeywords: [
      "seats of a kind used for motor vehicles",
      "seats of a kind used for aircraft",
      "차량용 의자",
      "항공기용 의자",
      "vehicle",
      "aircraft",
    ],
    rowBoost: 16,
    rowPenaltyKeywords: [
      "lavatory",
      "변기",
      "화장실",
      "sheet",
      "smoked",
      "rubber",
      "고무",
      "판",
      "필름",
      "film",
      "citric",
      "시트르산",
    ],
    rowPenalty: 24,
  },
];

const STANDARD_IRRELEVANT_PENALTIES: StandardPenaltyRule[] = [
  {
    id: "manufacturing-equipment",
    keywords: [
      "machines and mechanical appliances for making",
      "transport, handling and storage",
      "manufacturing",
      "machinery",
      "apparatus",
      "제조용",
      "기계",
      "장치",
      "장비",
      "이송",
      "핸들링",
      "저장",
    ],
    penalty: 14,
  },
  {
    id: "processed-food",
    keywords: [
      "peanut",
      "butter",
      "meat",
      "fish",
      "food",
      "preserved",
      "extraction or preparation of",
      "조제",
      "저장처리",
      "식품",
      "버터",
      "땅콩",
      "육류",
      "어류",
    ],
    penalty: 12,
  },
];

export function collectActiveDomainRules(queryTokens: Set<string>, industryCode: string): ActiveDomainRule[] {
  const normalizedIndustryCode = normalizeIndustryCode(industryCode);
  const loweredTokens = new Set([...queryTokens].map((token) => token.toLowerCase()));
  const active: ActiveDomainRule[] = [];

  for (const rule of DOMAIN_RULES) {
    if (!hasAnyToken(loweredTokens, rule.triggerTokens)) continue;
    const industryMatched = matchesIndustryCodePrefix(normalizedIndustryCode, rule.industryCodePrefixes ?? []);
    active.push({ rule, industryMatched });
  }

  return active;
}

export function scoreDomainRuleAdjustment({
  hs6,
  rowSearch,
  activeRules,
}: {
  hs6: string;
  rowSearch: string;
  activeRules: ActiveDomainRule[];
}): { score: number; reasons: string[] } {
  if (activeRules.length === 0) {
    return { score: 0, reasons: [] };
  }

  const chapter = normalizeChapter(hs6);
  const haystack = rowSearch.toLowerCase();
  let score = 0;
  const reasons: string[] = [];
  let allowByAnyRule = false;
  let boostedByAnyRule = false;

  for (const active of activeRules) {
    const { rule, industryMatched } = active;
    const industryBonus = industryMatched ? (rule.industryMatchBonus ?? 0) : 0;

    if (rule.allowChapters.includes(chapter)) {
      score += rule.allowBoost + industryBonus;
      allowByAnyRule = true;
      reasons.push(`${rule.label} 허용 챕터`);
    }
    if (rule.denyChapters.includes(chapter)) {
      score -= rule.denyPenalty + Math.floor(industryBonus / 2);
      reasons.push(`${rule.label} 비권장 챕터`);
    }
    if (containsAnyKeyword(haystack, rule.rowBoostKeywords)) {
      score += rule.rowBoost;
      boostedByAnyRule = true;
      reasons.push(`${rule.label} 핵심 키워드 일치`);
    }
    if (containsAnyKeyword(haystack, rule.rowPenaltyKeywords)) {
      score -= rule.rowPenalty;
      reasons.push(`${rule.label} 무관 키워드 감점`);
    }
  }

  for (const standard of STANDARD_IRRELEVANT_PENALTIES) {
    if (!containsAnyKeyword(haystack, standard.keywords)) continue;
    if (allowByAnyRule || boostedByAnyRule) continue;
    score -= standard.penalty;
    reasons.push("표준 무관 키워드 감점");
  }

  return { score, reasons: dedupe(reasons) };
}

function normalizeIndustryCode(value: string): string {
  return value.replace(/\D/g, "");
}

function normalizeChapter(hs6: string): string {
  const digits = hs6.replace(/\D/g, "");
  return digits.slice(0, 2);
}

function matchesIndustryCodePrefix(industryCode: string, prefixes: string[]): boolean {
  if (!industryCode || prefixes.length === 0) return false;
  return prefixes.some((prefix) => industryCode.startsWith(prefix));
}

function hasAnyToken(tokens: Set<string>, targets: string[]): boolean {
  for (const target of targets) {
    if (tokens.has(target.toLowerCase())) return true;
  }
  return false;
}

function containsAnyKeyword(haystack: string, keywords: string[]): boolean {
  if (!haystack) return false;
  for (const keyword of keywords) {
    if (haystack.includes(keyword.toLowerCase())) return true;
  }
  return false;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
