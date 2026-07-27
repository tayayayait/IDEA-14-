import { z } from "zod";

export const EVIDENCE_STATUSES = [
  "confirmed",
  "estimated",
  "needs_verification",
  "not_run",
  "unavailable",
] as const;

export const DECISION_CATEGORIES = [
  "tariff_fta",
  "certification",
  "import_regulation",
  "customs_requirement",
  "customs_documents",
  "payment_risk",
  "cost",
  "market",
  "sanctions",
  "strategic_goods",
] as const;

export const DECISION_SCOPES = ["hsk10", "hs6", "product_name", "country"] as const;
export const DECISION_SEVERITIES = ["info", "caution", "blocker"] as const;
export const ACTION_STATUSES = ["todo", "in_progress", "done", "blocked"] as const;

export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];
export type DecisionCategory = (typeof DECISION_CATEGORIES)[number];
export type DecisionScope = (typeof DECISION_SCOPES)[number];
export type DecisionSeverity = (typeof DECISION_SEVERITIES)[number];
export type ActionStatus = (typeof ACTION_STATUSES)[number];
export type ExportSuitability = "검토 유망" | "조건부 검토" | "우선 보류" | "추가 확인 필요";

export interface DecisionFact {
  id: string;
  factKey?: string;
  category: DecisionCategory;
  status: EvidenceStatus;
  severity: DecisionSeverity;
  summary: string;
  value: unknown;
  scope: DecisionScope;
  sourceName: string;
  sourceUrl: string | null;
  referenceDate: string | null;
  fetchedAt: string;
  caveat: string | null;
  nextAction: string | null;
  isStale: boolean;
}

export interface DecisionActionItem {
  id?: string;
  actionKey: string;
  title: string;
  reason: string;
  status: ActionStatus;
  priority: number;
  sourceUrl: string | null;
}

export interface DecisionSummary {
  suitability: ExportSuitability;
  opportunityScore: number | null;
  evidenceCompleteness: number;
  blockerCount: number;
  confirmedCount: number;
  estimatedCount: number;
  keyReasons: DecisionFact[];
}

const decisionFactSchema = z.object({
  id: z.string().min(1),
  factKey: z.string().trim().min(1).max(200).optional(),
  category: z.enum(DECISION_CATEGORIES),
  status: z.enum(EVIDENCE_STATUSES),
  severity: z.enum(DECISION_SEVERITIES).default("info"),
  summary: z.string().trim().min(1).max(2_000),
  value: z.unknown().nullable(),
  scope: z.enum(DECISION_SCOPES),
  sourceName: z.string().trim().min(1).max(200),
  sourceUrl: z.string().url().nullable().optional(),
  referenceDate: z.string().trim().max(100).nullable().optional(),
  fetchedAt: z.string().datetime({ offset: true }),
  caveat: z.string().trim().max(2_000).nullable().optional(),
  nextAction: z.string().trim().max(1_000).nullable().optional(),
  isStale: z.boolean().default(false),
});

const actionItemSchema = z.object({
  id: z.string().min(1).optional(),
  actionKey: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(1).max(1_000),
  status: z.enum(ACTION_STATUSES),
  priority: z.number().int().min(1).max(99),
  sourceUrl: z.string().url().nullable().optional(),
});

const REQUIRED_EVIDENCE_CATEGORIES: DecisionCategory[] = [
  "tariff_fta",
  "certification",
  "import_regulation",
  "customs_requirement",
  "payment_risk",
  "market",
  "strategic_goods",
];

const STATUS_LABELS: Record<EvidenceStatus, string> = {
  confirmed: "확인됨",
  estimated: "추정",
  needs_verification: "확인 필요",
  not_run: "미실행",
  unavailable: "조회 불가",
};

const SCOPE_LABELS: Record<DecisionScope, string> = {
  hsk10: "HSK10 정확 일치",
  hs6: "HS6 기준",
  product_name: "제품명 참고",
  country: "국가 기준",
};

const CATEGORY_LABELS: Record<DecisionCategory, string> = {
  tariff_fta: "관세·FTA",
  certification: "인증 후보",
  import_regulation: "수입규제",
  customs_requirement: "세관장확인",
  customs_documents: "통관서류",
  payment_risk: "결제 위험",
  cost: "예상 비용",
  market: "시장성",
  sanctions: "제재정보",
  strategic_goods: "전략물자",
};

export function parseDecisionFactRows(rows: unknown): DecisionFact[] {
  if (!Array.isArray(rows)) return [];
  const parsed: DecisionFact[] = [];
  for (const rawRow of rows) {
    const row = toFactCandidate(rawRow);
    const result = decisionFactSchema.safeParse(row);
    if (result.success) {
      parsed.push({
        ...result.data,
        sourceUrl: result.data.sourceUrl ?? null,
        referenceDate: result.data.referenceDate ?? null,
        caveat: result.data.caveat ?? null,
        nextAction: result.data.nextAction ?? null,
      });
    }
  }
  return parsed;
}

export function parseDecisionActionRows(rows: unknown): DecisionActionItem[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((rawRow) => {
    const row = asRecord(rawRow);
    const result = actionItemSchema.safeParse({
      id: text(row.id) || undefined,
      actionKey: text(row.actionKey ?? row.action_key),
      title: text(row.title),
      reason: text(row.reason),
      status: text(row.status),
      priority: numberValue(row.priority) ?? 50,
      sourceUrl: nullableText(row.sourceUrl ?? row.source_url),
    });
    return result.success
      ? [{ ...result.data, sourceUrl: result.data.sourceUrl ?? null }]
      : [];
  });
}

export function buildDecisionSummary({
  opportunityScore,
  facts,
}: {
  opportunityScore: number | null | undefined;
  facts: DecisionFact[];
}): DecisionSummary {
  const activeFacts = facts.filter((fact) => !fact.isStale);
  const coveredCategories = new Set(
    activeFacts
      .filter((fact) => fact.status === "confirmed" || fact.status === "estimated")
      .map((fact) => fact.category)
      .filter((category) => REQUIRED_EVIDENCE_CATEGORIES.includes(category)),
  );
  const evidenceCompleteness = Math.round(
    (coveredCategories.size / REQUIRED_EVIDENCE_CATEGORIES.length) * 100,
  );
  const blockerCount = activeFacts.filter(
    (fact) => fact.status === "confirmed" && fact.severity === "blocker",
  ).length;
  const normalizedScore = normalizeScore(opportunityScore);

  let suitability: ExportSuitability;
  if (blockerCount > 0) {
    suitability = "우선 보류";
  } else if (evidenceCompleteness < 50) {
    suitability = "추가 확인 필요";
  } else if (normalizedScore != null && normalizedScore >= 70 && evidenceCompleteness >= 70) {
    suitability = "검토 유망";
  } else {
    suitability = "조건부 검토";
  }

  const priority: Record<DecisionSeverity, number> = { blocker: 0, caution: 1, info: 2 };
  const statusPriority: Record<EvidenceStatus, number> = {
    confirmed: 0,
    estimated: 1,
    needs_verification: 2,
    unavailable: 3,
    not_run: 4,
  };

  return {
    suitability,
    opportunityScore: normalizedScore,
    evidenceCompleteness,
    blockerCount,
    confirmedCount: activeFacts.filter((fact) => fact.status === "confirmed").length,
    estimatedCount: activeFacts.filter((fact) => fact.status === "estimated").length,
    keyReasons: [...activeFacts]
      .sort((a, b) => priority[a.severity] - priority[b.severity] || statusPriority[a.status] - statusPriority[b.status])
      .slice(0, 3),
  };
}

export function buildDefaultActionItems(facts: DecisionFact[]): DecisionActionItem[] {
  const tariffFact = facts.find((fact) => fact.factKey === "tariff_fta:national_tariff_candidates")
    ?? facts.find((fact) => fact.factKey?.startsWith("tariff_fta:wits_"));
  const customsFact = facts.find(
    (fact) => fact.category === "customs_requirement" && fact.status === "confirmed",
  );
  const strategicFact = facts.find(
    (fact) =>
      fact.category === "strategic_goods" &&
      !fact.factKey?.endsWith("no_direct_match") &&
      fact.factKey !== "strategic_goods:classification",
  );
  const paymentFact = facts.find((fact) => fact.factKey === "payment_risk:ksure");

  return [
    tariffFact ? {
      actionKey: "confirm_destination_tariff_code",
      title: "목적국 세부 품목코드 확인",
      reason: "HS6 관세 범위가 확인되어 목적국 8·10자리 세부코드를 확정해야 합니다.",
      status: "todo",
      priority: 1,
      sourceUrl: tariffFact.sourceUrl,
    } : null,
    customsFact ? {
      actionKey: "contact_customs_requirement_agency",
      title: "세관장확인 승인기관 문의",
      reason: "조회된 법령별 허가·승인·표시 요건과 제출 시점을 확인해야 합니다.",
      status: "todo",
      priority: 2,
      sourceUrl: customsFact.sourceUrl,
    } : null,
    strategicFact ? {
      actionKey: "classify_strategic_goods",
      title: "전략물자 판정",
      reason: "HSK 통제번호 후보가 발견되어 자가판정 또는 전문판정이 필요합니다.",
      status: "todo",
      priority: 3,
      sourceUrl: strategicFact.sourceUrl,
    } : null,
    paymentFact ? {
      actionKey: "review_payment_and_insurance",
      title: "결제조건·무역보험 검토",
      reason: "조회된 국가·결제 위험에 맞는 대금회수 조건과 보험 가입 여부를 검토해야 합니다.",
      status: "todo",
      priority: 4,
      sourceUrl: paymentFact.sourceUrl,
    } : null,
  ].filter((item): item is DecisionActionItem => item !== null);
}

export function evidenceStatusLabel(status: EvidenceStatus): string {
  return STATUS_LABELS[status];
}

export function decisionScopeLabel(scope: DecisionScope): string {
  return SCOPE_LABELS[scope];
}

export function decisionCategoryLabel(category: DecisionCategory): string {
  return CATEGORY_LABELS[category];
}

function toFactCandidate(rawValue: unknown): Record<string, unknown> {
  const row = asRecord(rawValue);
  return {
    id: text(row.id),
    factKey: text(row.factKey ?? row.fact_key) || undefined,
    category: text(row.category),
    status: text(row.status),
    severity: text(row.severity) || "info",
    summary: text(row.summary),
    value: row.value ?? row.value_json ?? null,
    scope: text(row.scope ?? row.scope_level),
    sourceName: text(row.sourceName ?? row.source_name),
    sourceUrl: nullableText(row.sourceUrl ?? row.source_url),
    referenceDate: nullableText(row.referenceDate ?? row.reference_date),
    fetchedAt: text(row.fetchedAt ?? row.fetched_at),
    caveat: nullableText(row.caveat),
    nextAction: nullableText(row.nextAction ?? row.next_action),
    isStale: booleanValue(row.isStale ?? row.is_stale),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown): string | null {
  const valueText = text(value);
  return valueText || null;
}

function numberValue(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanValue(value: unknown): boolean {
  return value === true || value === "true";
}

function normalizeScore(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}
