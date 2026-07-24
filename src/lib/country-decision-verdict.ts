/**
 * AI 최종 판단 — Edge Function 연동 유틸
 *
 * 기존 규칙 기반 로직을 대체하여 Gemini + Google Search 그라운딩
 * Edge Function과 연동합니다.
 */

import type { DecisionFact } from "./country-decision";

/* ──────────── 공개 인터페이스 ──────────── */

export interface AiVerdictBasisItem {
  point: string;
  source?: string;
  sourceUrl?: string;
}

export interface AiVerdictRiskItem {
  risk: string;
  mitigation: string;
  source?: string;
  sourceUrl?: string;
}

export interface AiVerdictActionItem {
  action: string;
  reason: string;
  priority: "high" | "medium";
}

export interface AiVerdictSource {
  name: string;
  url: string;
  relevance: string;
}

export type VerdictOpinion = "적극 검토 권장" | "조건부 진출 가능" | "진출 보류 권장" | "추가 데이터 필요";
export type VerdictConfidence = "높음" | "보통" | "낮음";

export interface AiFinalVerdict {
  opinion: VerdictOpinion;
  opinionDetail: string;
  keyBasis: AiVerdictBasisItem[];
  majorRisks: AiVerdictRiskItem[];
  recommendedActions: AiVerdictActionItem[];
  confidence: VerdictConfidence;
  confidenceReason: string;
  officialSources: AiVerdictSource[];
}

export interface VerdictCacheEntry {
  verdict: AiFinalVerdict;
  evidenceHash: string;
  createdAt: string;
}

/* ──────────── evidence hash ──────────── */

export function computeEvidenceHash(facts: DecisionFact[]): string {
  const activeKeys = facts
    .filter((f) => !f.isStale)
    .map((f) => `${f.category}:${f.status}:${f.id}`)
    .sort()
    .join("|");
  // Simple hash (djb2)
  let hash = 5381;
  for (let i = 0; i < activeKeys.length; i++) {
    hash = ((hash << 5) + hash + activeKeys.charCodeAt(i)) & 0x7fffffff;
  }
  return hash.toString(36);
}

/* ──────────── verdict 파싱 ──────────── */

export function parseVerdictResponse(raw: unknown): AiFinalVerdict | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;

  const opinion = asVerdictOpinion(data.opinion);
  if (!opinion) return null;

  return {
    opinion,
    opinionDetail: asText(data.opinionDetail),
    keyBasis: asArray(data.keyBasis).map((item) => {
      const r = asRecord(item);
      return { point: asText(r.point), source: asText(r.source) || undefined, sourceUrl: asText(r.sourceUrl) || undefined };
    }),
    majorRisks: asArray(data.majorRisks).map((item) => {
      const r = asRecord(item);
      return {
        risk: asText(r.risk),
        mitigation: asText(r.mitigation),
        source: asText(r.source) || undefined,
        sourceUrl: asText(r.sourceUrl) || undefined,
      };
    }),
    recommendedActions: asArray(data.recommendedActions).map((item) => {
      const r = asRecord(item);
      return {
        action: asText(r.action),
        reason: asText(r.reason),
        priority: asText(r.priority) === "high" ? "high" : "medium",
      };
    }),
    confidence: asVerdictConfidence(data.confidence) ?? "보통",
    confidenceReason: asText(data.confidenceReason),
    officialSources: asArray(data.officialSources).map((item) => {
      const r = asRecord(item);
      return { name: asText(r.name), url: asText(r.url), relevance: asText(r.relevance) };
    }),
  };
}

/* ──────────── 유틸 ──────────── */

const VALID_OPINIONS: VerdictOpinion[] = ["적극 검토 권장", "조건부 진출 가능", "진출 보류 권장", "추가 데이터 필요"];
const VALID_CONFIDENCES: VerdictConfidence[] = ["높음", "보통", "낮음"];

function asVerdictOpinion(value: unknown): VerdictOpinion | null {
  const text = asText(value);
  return VALID_OPINIONS.includes(text as VerdictOpinion) ? (text as VerdictOpinion) : null;
}

function asVerdictConfidence(value: unknown): VerdictConfidence | null {
  const text = asText(value);
  return VALID_CONFIDENCES.includes(text as VerdictConfidence) ? (text as VerdictConfidence) : null;
}

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
