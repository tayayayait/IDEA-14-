export type KicoxApiKeyEnv = {
  KICOX_API_KEY?: string;
  PUBLIC_DATA_API_KEY?: string;
};

export function normalizeAuthKeyValue(value: string | undefined): string {
  const trimmed = (value ?? "").trim();
  if (trimmed.length < 2) return trimmed;

  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

export function resolveKicoxApiKeys(env: KicoxApiKeyEnv): string[] {
  const candidates = [
    normalizeAuthKeyValue(env.KICOX_API_KEY),
    normalizeAuthKeyValue(env.PUBLIC_DATA_API_KEY),
  ];
  return [...new Set(candidates.filter(Boolean))];
}
