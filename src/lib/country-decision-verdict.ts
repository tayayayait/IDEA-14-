/**
 * AI 최종 판단 — Edge Function 연동 유틸
 *
 * 기존 규칙 기반 로직을 대체하여 Gemini + Google Search 그라운딩
 * Edge Function과 연동합니다.
 */

import type { DecisionFact } from "./country-decision";
import { normalizeExternalUrl } from "./url-validator";

/* ──────────── 공개 인터페이스 ──────────── */

export type VerdictEvidenceLevel = "cross_checked" | "official_confirmed" | "ai_interpretation" | "needs_verification";

interface VerdictEvidenceFields {
  evidenceIds: string[];
  evidenceLevel: VerdictEvidenceLevel;
  verificationNote?: string;
}

export interface AiVerdictBasisItem extends VerdictEvidenceFields {
  point: string;
  source?: string;
  sourceUrl?: string;
}

export interface AiVerdictRiskItem extends VerdictEvidenceFields {
  risk: string;
  mitigation: string;
  source?: string;
  sourceUrl?: string;
  severity?: "치명적" | "높음" | "보통";
  likelihood?: "높음" | "보통" | "낮음";
  financialImpact?: string;
}

export interface AiVerdictActionItem extends VerdictEvidenceFields {
  action: string;
  reason: string;
  priority: "high" | "medium";
  timeline?: string;
  difficulty?: "쉬움" | "보통" | "어려움";
  estimatedCost?: string;
  govSupport?: string;
  subSteps?: string[];
  estimateType?: "source_based_estimate" | "ai_planning_estimate" | "quote_required";
  estimateBasis?: string;
}

export interface AiVerdictSource {
  name: string;
  url: string;
  relevance: string;
  referenceDate?: string;
  evidenceIds: string[];
}

export interface VerdictEvidenceSummary {
  programFactCount: number;
  officialWebClaimCount: number;
  rejectedWebClaimCount: number;
  supportedClaimCount: number;
  totalClaimCount: number;
  supportedClaimRatio: number;
  conflictCount: number;
  missingCriticalChecks: string[];
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
  confidenceScore?: number;
  confidenceReason: string;
  officialSources: AiVerdictSource[];
  evidenceSummary?: VerdictEvidenceSummary;
}

export interface VerdictCacheEntry {
  verdict: AiFinalVerdict;
  evidenceHash: string;
  createdAt: string;
}

/* ──────────── evidence hash ──────────── */

export function computeEvidenceHash(
  facts: DecisionFact[],
  context: Record<string, unknown> = {},
): string {
  const activeFacts = facts
    .filter((f) => !f.isStale)
    .map((f) => stableSerialize({
      id: f.id,
      factKey: f.factKey ?? null,
      category: f.category,
      status: f.status,
      severity: f.severity,
      summary: f.summary,
      value: f.value,
      scope: f.scope,
      sourceName: f.sourceName,
      sourceUrl: f.sourceUrl,
      referenceDate: f.referenceDate,
      caveat: f.caveat,
      nextAction: f.nextAction,
    }))
    .sort()
    .join("|");
  const activeKeys = `${stableSerialize(context)}|${activeFacts}`;
  // Simple hash (djb2)
  let hash = 5381;
  for (let i = 0; i < activeKeys.length; i++) {
    hash = ((hash << 5) + hash + activeKeys.charCodeAt(i)) & 0x7fffffff;
  }
  return hash.toString(36);
}

function stableSerialize(value: unknown): string {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(",")}}`;
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
      const resolvedUrl = normalizeExternalUrl(rawUrl);
      return {
        point: asText(r.point),
        source,
        sourceUrl: resolvedUrl || undefined,
        ...parseEvidenceFields(r),
      };
    }),
    majorRisks: asArray(data.majorRisks).map((item) => {
      const r = asRecord(item);
      const source = asText(r.source) || undefined;
      const rawUrl = asText(r.sourceUrl);
      const resolvedUrl = normalizeExternalUrl(rawUrl);
      return {
        risk: asText(r.risk),
        mitigation: asText(r.mitigation),
        source,
        sourceUrl: resolvedUrl || undefined,
        severity: asSeverity(r.severity),
        likelihood: asRiskLevel(r.likelihood) || undefined,
        financialImpact: asText(r.financialImpact) || undefined,
        ...parseEvidenceFields(r),
      };
    }),
    recommendedActions: asArray(data.recommendedActions).map((item) => {
      const r = asRecord(item);
      return {
        action: asText(r.action),
        reason: asText(r.reason),
        priority: asText(r.priority) === "high" ? "high" as const : "medium" as const,
        timeline: asText(r.timeline) || undefined,
        difficulty: asDifficulty(r.difficulty),
        estimatedCost: asText(r.estimatedCost) || undefined,
        govSupport: asText(r.govSupport) || undefined,
        subSteps: asArray(r.subSteps).map((s) => asText(s)).filter(Boolean) || undefined,
        estimateType: asEstimateType(r.estimateType),
        estimateBasis: asText(r.estimateBasis) || undefined,
        ...parseEvidenceFields(r),
      };
    }),
    confidence: asNumber(data.confidenceScore) == null
      ? "보통"
      : asVerdictConfidence(data.confidence) ?? "낮음",
    confidenceScore: asNumber(data.confidenceScore) ?? undefined,
    confidenceReason: asNumber(data.confidenceScore) == null
      ? "이전 형식의 AI 판단으로 계산형 신뢰도가 없습니다. AI 판단을 재생성하세요."
      : asText(data.confidenceReason),
    officialSources: asArray(data.officialSources).map((item) => {
      const r = asRecord(item);
      const name = asText(r.name);
      const rawUrl = asText(r.url);
      const resolvedUrl = normalizeExternalUrl(rawUrl);
      return {
        name,
        url: resolvedUrl || "",
        relevance: asText(r.relevance),
        referenceDate: asText(r.referenceDate) || undefined,
        evidenceIds: asArray(r.evidenceIds).map(asText).filter(Boolean),
      };
    }).filter((source) => Boolean(source.name && source.url)),
    evidenceSummary: parseEvidenceSummary(data.evidenceSummary),
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

function asDifficulty(value: unknown): "쉬움" | "보통" | "어려움" | undefined {
  const text = asText(value);
  if (text === "쉬움" || text === "보통" || text === "어려움") return text;
  return undefined;
}

function parseEvidenceFields(record: Record<string, unknown>): VerdictEvidenceFields {
  return {
    evidenceIds: asArray(record.evidenceIds).map(asText).filter(Boolean),
    evidenceLevel: asEvidenceLevel(record.evidenceLevel),
    verificationNote: asText(record.verificationNote) || undefined,
  };
}

function asEvidenceLevel(value: unknown): VerdictEvidenceLevel {
  const text = asText(value);
  if (text === "cross_checked" || text === "official_confirmed" || text === "ai_interpretation" || text === "needs_verification") {
    return text;
  }
  return "needs_verification";
}

function asEstimateType(value: unknown): AiVerdictActionItem["estimateType"] {
  const text = asText(value);
  if (text === "source_based_estimate" || text === "ai_planning_estimate" || text === "quote_required") return text;
  return undefined;
}

function parseEvidenceSummary(value: unknown): VerdictEvidenceSummary | undefined {
  const record = asRecord(value);
  if (Object.keys(record).length === 0) return undefined;
  return {
    programFactCount: asNumber(record.programFactCount) ?? 0,
    officialWebClaimCount: asNumber(record.officialWebClaimCount) ?? 0,
    rejectedWebClaimCount: asNumber(record.rejectedWebClaimCount) ?? 0,
    supportedClaimCount: asNumber(record.supportedClaimCount) ?? 0,
    totalClaimCount: asNumber(record.totalClaimCount) ?? 0,
    supportedClaimRatio: asNumber(record.supportedClaimRatio) ?? 0,
    conflictCount: asNumber(record.conflictCount) ?? 0,
    missingCriticalChecks: asArray(record.missingCriticalChecks).map(asText).filter(Boolean),
  };
}

function asNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
