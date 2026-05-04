export const KOTRA_CSV_CACHE_KEYS = {
  exportRegionRank: "kotra_csv_export_region_rank",
  importRegulation: "kotra_csv_import_regulation",
  tradeOffice: "kotra_csv_trade_office",
} as const;

export type HsNormalizationIssue = "empty" | "too_short" | "truncated" | null;

export type HsNormalizationResult = {
  raw: string;
  normalized: string;
  valid: boolean;
  issue: HsNormalizationIssue;
};

const COUNTRY_ALIAS_MAP: Record<string, string> = {
  "대한민국": "한국",
  "한국": "한국",
  "남한": "한국",
  "republicofkorea": "한국",
  "southkorea": "한국",
  "korea": "한국",
  "미합중국": "미국",
  "미국": "미국",
  "usa": "미국",
  "us": "미국",
  "unitedstates": "미국",
  "unitedstatesofamerica": "미국",
  "중화인민공화국": "중국",
  "중국": "중국",
  "china": "중국",
  "일본국": "일본",
  "일본": "일본",
  "japan": "일본",
  "베트남사회주의공화국": "베트남",
  "베트남": "베트남",
  "vietnam": "베트남",
  "인도네시아공화국": "인도네시아",
  "인도네시아": "인도네시아",
  "indonesia": "인도네시아",
  "아랍에미리트": "UAE",
  "아랍에미리트연합": "UAE",
  "uae": "UAE",
  "unitedarabemirates": "UAE",
};

const ISO2_FALLBACK_NAME: Record<string, string> = {
  AE: "UAE",
  US: "미국",
  VN: "베트남",
  ID: "인도네시아",
  CN: "중국",
  JP: "일본",
  KR: "한국",
};

const REGION_DISPLAY =
  typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames(["ko"], { type: "region" })
    : null;

export function normalizeCountryName(value: unknown): string {
  const raw = asText(value);
  if (!raw) return "";
  const compact = toAliasKey(raw);
  const mapped = COUNTRY_ALIAS_MAP[compact];
  if (mapped) return mapped;
  return normalizeWhitespace(raw);
}

export function resolveCountryNameFromIso2(value: unknown): string {
  const code = asText(value).toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "";
  const fallback = ISO2_FALLBACK_NAME[code];
  if (fallback) return normalizeCountryName(fallback);
  const localized = REGION_DISPLAY?.of(code);
  if (!localized || localized === code) return code;
  return normalizeCountryName(localized);
}

export function normalizeHsCode(value: unknown): HsNormalizationResult {
  const raw = asText(value);
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) {
    return { raw, normalized: "", valid: false, issue: "empty" };
  }
  if (digits.length < 6) {
    return { raw, normalized: "", valid: false, issue: "too_short" };
  }
  if (digits.length > 10) {
    return { raw, normalized: digits.slice(0, 10), valid: true, issue: "truncated" };
  }
  return { raw, normalized: digits, valid: true, issue: null };
}

export function normalizeOptionalText(value: unknown, maxLength = 0): string | null {
  const text = asText(value);
  if (!text) return null;
  if (maxLength > 0 && text.length > maxLength) {
    return text.slice(0, maxLength);
  }
  return text;
}

export function normalizeRequiredText(value: unknown, maxLength = 0): string {
  const normalized = normalizeOptionalText(value, maxLength);
  return normalized ?? "";
}

export function normalizeYnBoolean(value: unknown): boolean {
  const text = asText(value).toUpperCase();
  return text === "Y" || text === "YES" || text === "TRUE" || text === "1";
}

export function buildDedupeKey(parts: Array<string | number | null | undefined>): string {
  return parts
    .map((part) => {
      if (part === null || part === undefined) return "-";
      const text = typeof part === "number" ? String(part) : normalizeWhitespace(part);
      return text || "-";
    })
    .join("|")
    .toLowerCase();
}

export function asInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return null;
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function normalizeWhitespace(value: string): string {
  return value
    .replace(/\uFEFF/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function asText(value: unknown): string {
  if (typeof value === "string") return normalizeWhitespace(value);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function toAliasKey(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[\s'".,()/\-]/g, "");
}
