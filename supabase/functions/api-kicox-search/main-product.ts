const DEFAULT_TOKEN_PATTERN = /[\p{L}\p{N}]/u;

export function normalizeMainProduct(raw: string): string {
  const compact = raw.replace(/\s+/g, " ").trim();
  if (!compact) return "";

  const standardized = compact.replace(/[|\/;\u00B7\u2022]+/g, ",");
  const tokens = standardized
    .split(/[,\u3001]/g)
    .map((token) => token.trim().replace(/\s+/g, " "))
    .filter((token) => isMeaningfulToken(token));

  if (tokens.length === 0) return "";

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(token);
  }

  return deduped.join(", ");
}

function isMeaningfulToken(token: string): boolean {
  return DEFAULT_TOKEN_PATTERN.test(token);
}
