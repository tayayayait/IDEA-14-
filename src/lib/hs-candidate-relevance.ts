export type HsCandidateLike = {
  hs_code: string;
  hsk_code?: string;
  description?: string | null;
  official_name_ko?: string | null;
  official_name_en?: string | null;
  standard_name?: string | null;
  required_specs?: string | null;
};

type RelevanceInput = {
  productName: string;
  description?: string;
  components?: string[] | string;
};

const KO_STOPWORDS = new Set(["기타", "제품", "부품", "수출", "사용", "용도"]);
const EN_STOPWORDS = new Set(["the", "and", "for", "with", "other", "parts", "component", "components"]);
const MEMORY_QUERY_TOKENS = new Set(["dram", "sram", "nand", "flash", "memory", "memories", "디램", "에스램", "메모리", "플래시", "낸드"]);
const MEMORY_STRONG_QUERY_TOKENS = new Set(["dram", "sram", "nand", "memory", "memories", "디램", "에스램", "메모리", "낸드"]);
const MEMORY_CANDIDATE_TOKENS = new Set([
  "dram",
  "sram",
  "memory",
  "memories",
  "flash memory",
  "디램",
  "에스램",
  "메모리",
  "플래시 메모리",
  "낸드",
]);
const MACHINE_CANDIDATE_TOKENS = new Set([
  "machinery",
  "machine",
  "machines",
  "apparatus",
  "manufacturing",
  "handling",
  "transport",
  "storage",
  "기계",
  "장치",
  "장비",
  "제조용",
  "이송",
  "핸들링",
  "저장",
]);

type RelevanceContext = {
  tokens: string[];
  memoryChipQuery: boolean;
};

export function filterRelevantHsCandidates<T extends HsCandidateLike>(
  candidates: T[],
  input: RelevanceInput,
): T[] {
  if (candidates.length <= 1) return candidates;

  const context = buildRelevanceContext(input);
  if (context.tokens.length === 0) return candidates;

  const filtered = candidates.filter(
    (candidate) => passesHardRelevanceGuard(candidate, context) && scoreCandidateRelevance(candidate, context.tokens) > 0,
  );
  if (filtered.length > 0) return filtered;

  if (context.memoryChipQuery) {
    const memoryOnly = candidates.filter((candidate) => isMemoryCandidate(candidate));
    if (memoryOnly.length > 0) return memoryOnly;
  }

  return candidates;
}

function buildRelevanceContext(input: RelevanceInput): RelevanceContext {
  const tokens = collectRelevanceTokens(input);
  const hasStrongMemoryContext = hasAnyToken(tokens, MEMORY_STRONG_QUERY_TOKENS)
    || (tokens.includes("flash") && hasAnyToken(tokens, new Set(["memory", "nand", "메모리", "낸드"])));
  return {
    tokens,
    memoryChipQuery: hasAnyToken(tokens, MEMORY_QUERY_TOKENS) && hasStrongMemoryContext,
  };
}

function collectRelevanceTokens(input: RelevanceInput): string[] {
  const componentsText = Array.isArray(input.components) ? input.components.join(" ") : input.components ?? "";
  const merged = [input.productName, input.description ?? "", componentsText].join(" ");
  const rawTokens = merged
    .split(/[^0-9A-Za-z가-힣]+/g)
    .map((token) => normalizeToken(token))
    .filter(Boolean);

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const token of rawTokens) {
    if (seen.has(token)) continue;
    if (!isMeaningfulToken(token)) continue;
    seen.add(token);
    deduped.push(token);
  }
  return deduped.slice(0, 30);
}

function passesHardRelevanceGuard(candidate: HsCandidateLike, context: RelevanceContext): boolean {
  if (!context.memoryChipQuery) return true;

  if (isMemoryCandidate(candidate)) return true;
  if (isMachineCandidate(candidate)) return false;
  return false;
}

function isMemoryCandidate(candidate: HsCandidateLike): boolean {
  const haystack = normalizeText([
    candidate.description ?? "",
    candidate.official_name_ko ?? "",
    candidate.official_name_en ?? "",
    candidate.standard_name ?? "",
    candidate.required_specs ?? "",
  ].join(" "));
  const hsCode = normalizeCode(candidate.hs_code);
  const hskCode = normalizeCode(candidate.hsk_code ?? "");
  return hsCode.startsWith("854232") || hskCode.startsWith("854232") || containsAnyText(haystack, MEMORY_CANDIDATE_TOKENS);
}

function isMachineCandidate(candidate: HsCandidateLike): boolean {
  const haystack = normalizeText([
    candidate.description ?? "",
    candidate.official_name_ko ?? "",
    candidate.official_name_en ?? "",
    candidate.standard_name ?? "",
    candidate.required_specs ?? "",
  ].join(" "));
  const hskCode = normalizeCode(candidate.hsk_code ?? "");
  return hskCode.startsWith("84") || containsAnyText(haystack, MACHINE_CANDIDATE_TOKENS);
}

function scoreCandidateRelevance(candidate: HsCandidateLike, tokens: string[]): number {
  const haystack = normalizeText([
    candidate.description ?? "",
    candidate.official_name_ko ?? "",
    candidate.official_name_en ?? "",
    candidate.standard_name ?? "",
    candidate.required_specs ?? "",
  ].join(" "));
  const hsCode = normalizeCode(candidate.hs_code);
  const hskCode = normalizeCode(candidate.hsk_code ?? "");
  if (!haystack && !hsCode && !hskCode) return 0;

  let score = 0;
  for (const token of tokens) {
    if (/^\d{4,10}$/.test(token)) {
      if (hskCode === token) score += 4;
      else if (hskCode.startsWith(token) || hsCode.startsWith(token.slice(0, 6))) score += 2;
      continue;
    }

    if (/^[a-z0-9]+$/i.test(token)) {
      if (token.length < 3) continue;
      if (haystack.includes(token)) score += 2;
      continue;
    }

    if (haystack.includes(token)) score += 3;
  }
  return score;
}

function isMeaningfulToken(token: string): boolean {
  if (!token) return false;
  if (/^\d{4,10}$/.test(token)) return true;

  if (/^[a-z0-9]+$/i.test(token)) {
    if (token.length < 3) return false;
    return !EN_STOPWORDS.has(token);
  }

  if (token.length < 2) return false;
  return !KO_STOPWORDS.has(token);
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeCode(value: string): string {
  return value.replace(/\D/g, "");
}

function normalizeToken(value: string): string {
  return normalizeText(value);
}

function containsAnyText(haystack: string, needles: Set<string>): boolean {
  if (!haystack) return false;
  for (const needle of needles) {
    if (haystack.includes(needle)) return true;
  }
  return false;
}

function hasAnyToken(tokens: string[], targets: Set<string>): boolean {
  for (const token of tokens) {
    if (targets.has(token)) return true;
  }
  return false;
}
