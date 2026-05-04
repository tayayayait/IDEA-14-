import { sanitizeNullable } from "@/lib/scoring";

export const REPORT_UNKNOWN_TEXT = "확실한 정보 없음";
export const NEWS_IMPACT_NO_EVIDENCE_TEXT = "대상국 일치 직접 뉴스 근거 없음 — 관련 뉴스 모니터링 필요";
export const NEWS_IMPACT_PENDING_MARKER = "Gemini 뉴스 본문 분석 미생성";

export const NEWS_IMPACT_SECTION_LABELS = ["핵심 판단", "영향 근거", "실행 대응"] as const;
export type NewsImpactSectionLabel = typeof NEWS_IMPACT_SECTION_LABELS[number];
export type NewsImpactAnalysisState = "structured" | "pending" | "no_evidence" | "plain";

export interface NewsImpactSection {
  label: NewsImpactSectionLabel;
  body: string;
}

export interface ParsedNewsImpactAnalysis {
  state: NewsImpactAnalysisState;
  text: string;
  sections: NewsImpactSection[];
}

const SENSITIVE_PARAM_PATTERN =
  /([?&]\s*(?:servicekey|authkey|api[_-]?key|access[_-]?key|secret)\s*=\s*)([^&\s]+)/gi;
const SENSITIVE_ASSIGNMENT_PATTERN =
  /\b(?:servicekey|authkey|api[_-]?key|access[_-]?key|secret)\s*[:=]\s*([^\s,;]+)/gi;
const URL_TOKEN_PATTERN = /https?:\/\/[^\s<>"')]+/gi;
const SENSITIVE_QUERY_PARAM_NAMES = new Set(["servicekey", "authkey", "apikey", "accesskey", "secret"]);

export function formatFlagTypeLabel(flagType: string | null | undefined): string {
  const normalized = normalizeReportText(flagType)?.toLowerCase() ?? "";
  if (normalized === "strategic") return "전략물자";
  if (normalized === "product_safety") return "제품안전";
  if (normalized === "recall") return "리콜";
  return normalizeReportText(flagType) ?? REPORT_UNKNOWN_TEXT;
}

export function normalizeReportText(value: string | null | undefined): string | null {
  const sanitized = sanitizeNullable(value);
  if (!sanitized) return sanitized;
  const decoded = decodeHtmlEntities(sanitized).replace(/\s+/g, " ").trim();
  return redactSensitiveText(decoded);
}

export function composeFlagSummary(flagType: string | null | undefined, summary: string | null | undefined): string {
  return `${formatFlagTypeLabel(flagType)}: ${normalizeReportText(summary) ?? REPORT_UNKNOWN_TEXT}`;
}

export function parseNewsImpactAnalysis(value: string | null | undefined): ParsedNewsImpactAnalysis {
  const text = normalizeReportText(value) ?? "";
  if (!text) return { state: "plain", text, sections: [] };
  if (text.includes(NEWS_IMPACT_PENDING_MARKER)) return { state: "pending", text, sections: [] };
  if (text.includes(NEWS_IMPACT_NO_EVIDENCE_TEXT) || text.startsWith("대상국 일치 직접 뉴스 근거 없음")) {
    return { state: "no_evidence", text, sections: [] };
  }

  const sections = parseStructuredNewsImpactSections(text);
  if (sections) return { state: "structured", text, sections };
  return { state: "plain", text, sections: [] };
}

export function redactSensitiveText(value: string | null | undefined): string | null {
  if (!value) return value ?? null;

  let out = value;
  out = out.replace(SENSITIVE_PARAM_PATTERN, (_all, prefix) => `${prefix}[REDACTED]`);
  out = out.replace(SENSITIVE_ASSIGNMENT_PATTERN, (all) => {
    const separatorIndex = Math.max(all.indexOf("="), all.indexOf(":"));
    if (separatorIndex < 0) return all;
    return `${all.slice(0, separatorIndex + 1)} [REDACTED]`;
  });
  out = out.replace(URL_TOKEN_PATTERN, (url) => toSafePublicUrl(url) ?? "[INVALID_URL]");
  return out.trim();
}

export function toSafePublicUrl(value: string | null | undefined): string | null {
  const text = decodeHtmlEntities(value?.trim() ?? "");
  if (!text) return null;
  if (!/^https?:\/\//i.test(text)) return null;

  try {
    const parsed = new URL(text);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

export function toSafePublicHref(value: string | null | undefined): string | null {
  const text = decodeHtmlEntities(value?.trim() ?? "");
  if (!text) return null;
  if (!/^https?:\/\//i.test(text)) return null;

  try {
    const parsed = new URL(text);
    parsed.hash = "";
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (isSensitiveQueryParam(key)) parsed.searchParams.delete(key);
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function isSensitiveQueryParam(name: string): boolean {
  return SENSITIVE_QUERY_PARAM_NAMES.has(name.replace(/[\s_-]+/g, "").toLowerCase());
}

function parseStructuredNewsImpactSections(text: string): NewsImpactSection[] | null {
  const labelPattern = /(핵심 판단|영향 근거|실행 대응)\s*:\s*/g;
  const matches = [...text.matchAll(labelPattern)];
  if (matches.length < NEWS_IMPACT_SECTION_LABELS.length) return null;

  const byLabel = new Map<NewsImpactSectionLabel, NewsImpactSection>();
  matches.forEach((match, index) => {
    const label = match[1] as NewsImpactSectionLabel;
    if (byLabel.has(label)) return;
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    const body = normalizeReportText(text.slice(start, end).replace(/(?:^|\s)[-•]\s*$/, "")) ?? "";
    if (body) byLabel.set(label, { label, body });
  });

  const ordered = NEWS_IMPACT_SECTION_LABELS
    .map((label) => byLabel.get(label))
    .filter((section): section is NewsImpactSection => Boolean(section));
  return ordered.length === NEWS_IMPACT_SECTION_LABELS.length ? ordered : null;
}

function decodeHtmlEntities(value: string): string {
  const namedEntityMap: Record<string, string> = {
    "&nbsp;": " ",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": "\"",
    "&apos;": "'",
    "&#39;": "'",
    "&lsquo;": "'",
    "&rsquo;": "'",
    "&ldquo;": "\"",
    "&rdquo;": "\"",
    "&middot;": "·",
    "&hellip;": "...",
  };

  let out = value.replace(
    /&(nbsp|amp|lt|gt|quot|apos|#39|lsquo|rsquo|ldquo|rdquo|middot|hellip);/gi,
    (matched) => namedEntityMap[matched.toLowerCase()] ?? matched,
  );
  out = out.replace(/&#(\d+);/g, (matched, dec) => {
    const codePoint = Number(dec);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : matched;
  });
  out = out.replace(/&#x([0-9a-f]+);/gi, (matched, hex) => {
    const codePoint = Number.parseInt(hex, 16);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : matched;
  });
  return out;
}
