export function buildCharacterBigrams(value: string): Set<string> {
  const normalized = normalizeComparable(value);
  if (normalized.length < 2) return new Set();

  const chars = [...normalized];
  const grams = new Set<string>();
  for (let index = 0; index < chars.length - 1; index += 1) {
    const left = chars[index];
    const right = chars[index + 1];
    if (!left.trim() || !right.trim()) continue;
    grams.add(`${left}${right}`);
  }
  return grams;
}

export function overlapRatio(source: Set<string>, target: Set<string>): number {
  if (source.size === 0 || target.size === 0) return 0;
  let matched = 0;
  for (const token of source) {
    if (target.has(token)) matched += 1;
  }
  return matched / source.size;
}

export function hasSubsequenceAbbreviation(abbreviation: string, term: string): boolean {
  const short = normalizeComparable(abbreviation);
  const full = normalizeComparable(term);
  if (!short || !full) return false;
  if (short.length >= full.length) return false;

  let cursor = 0;
  for (const char of full) {
    if (char === short[cursor]) cursor += 1;
    if (cursor === short.length) return true;
  }
  return false;
}

function normalizeComparable(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
