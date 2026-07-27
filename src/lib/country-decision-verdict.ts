/**
 * AI 최종 판단 — Edge Function 연동 유틸
 *
 * 기존 규칙 기반 로직을 대체하여 Gemini + Google Search 그라운딩
 * Edge Function과 연동합니다.
 */

import type { DecisionFact } from "./country-decision";
import { normalizeExternalUrl, resolveFallbackSourceUrl } from "./url-validator";

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
  severity?: "치명적" | "높음" | "보통";
  likelihood?: "높음" | "보통" | "낮음";
  financialImpact?: string;
}

export interface AiVerdictActionItem {
  action: string;
  reason: string;
  subSteps?: string[];
}

export interface AiVerdictSource {
  name: string;
  url: string;
  relevance: string;
}

export interface RiskScoreboard {
  tariffRisk: "높음" | "보통" | "낮음";
  certificationRisk: "높음" | "보통" | "낮음";
  paymentRisk: "높음" | "보통" | "낮음";
  logisticsRisk: "높음" | "보통" | "낮음";
  legalRisk: "높음" | "보통" | "낮음";
}

export type VerdictOpinion = "적극 검토 권장" | "조건부 진출 가능" | "진출 보류 권장" | "추가 데이터 필요";
export type VerdictConfidence = "높음" | "보통" | "낮음";

export interface AiFinalVerdict {
  opinion: VerdictOpinion;
  opinionDetail: string;
  executiveSummary: string;
  riskScoreboard: RiskScoreboard;
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

  const scoreboardRaw = asRecord(data.riskScoreboard);
  const riskScoreboard: RiskScoreboard = {
    tariffRisk: asRiskLevel(scoreboardRaw.tariffRisk),
    certificationRisk: asRiskLevel(scoreboardRaw.certificationRisk),
    paymentRisk: asRiskLevel(scoreboardRaw.paymentRisk),
    logisticsRisk: asRiskLevel(scoreboardRaw.logisticsRisk),
    legalRisk: asRiskLevel(scoreboardRaw.legalRisk),
  };

  return {
    opinion,
    opinionDetail: asText(data.opinionDetail),
    executiveSummary: asText(data.executiveSummary),
    riskScoreboard,
    keyBasis: asArray(data.keyBasis).map((item) => {
      const r = asRecord(item);
      const source = asText(r.source) || undefined;
      const rawUrl = asText(r.sourceUrl);
      const resolvedUrl = resolveFallbackSourceUrl(source, rawUrl);
      return {
        point: asText(r.point),
        source,
        sourceUrl: resolvedUrl || undefined,
      };
    }),
    majorRisks: asArray(data.majorRisks).map((item) => {
      const r = asRecord(item);
      const source = asText(r.source) || undefined;
      const rawUrl = asText(r.sourceUrl);
      const resolvedUrl = resolveFallbackSourceUrl(source, rawUrl);
      return {
        risk: asText(r.risk),
        mitigation: asText(r.mitigation),
        source,
        sourceUrl: resolvedUrl || undefined,
        severity: asSeverity(r.severity),
        likelihood: asRiskLevel(r.likelihood) || undefined,
        financialImpact: asText(r.financialImpact) || undefined,
      };
    }),
    recommendedActions: asArray(data.recommendedActions).map((item) => {
      const r = asRecord(item);
      return {
        action: asText(r.action),
        reason: asText(r.reason),
        subSteps: asArray(r.subSteps).map((s) => asText(s)).filter(Boolean) || undefined,
      };
    }),
    confidence: asVerdictConfidence(data.confidence) ?? "보통",
    confidenceReason: asText(data.confidenceReason),
    officialSources: asArray(data.officialSources).map((item) => {
      const r = asRecord(item);
      const name = asText(r.name);
      const rawUrl = asText(r.url);
      const resolvedUrl = resolveFallbackSourceUrl(name, rawUrl);
      return {
        name,
        url: resolvedUrl || "",
        relevance: asText(r.relevance),
      };
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

function asRiskLevel(value: unknown): "높음" | "보통" | "낮음" {
  const text = asText(value);
  if (text === "높음" || text === "보통" || text === "낮음") return text;
  return "보통";
}

function asSeverity(value: unknown): "치명적" | "높음" | "보통" | undefined {
  const text = asText(value);
  if (text === "치명적" || text === "높음" || text === "보통") return text;
  return undefined;
}
