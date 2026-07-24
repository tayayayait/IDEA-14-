import type { DecisionFact } from "@/lib/country-decision";

export interface MarketEvidence {
  period: string | null;
  importMarketUsd: number;
  importsFromKoreaUsd: number;
  koreaSharePct: number;
  sourceName: string;
  referenceDate: string | null;
}

export interface TariffRangeEvidence {
  minRatePct: number;
  averageRatePct: number;
  maxRatePct: number;
  sourceName: string;
  referenceDate: string | null;
}

export interface LogisticsEvidence {
  overall: number | null;
  customs: number | null;
  infrastructure: number | null;
  internationalShipments: number | null;
  year: string | null;
  sourceName: string;
  referenceDate: string | null;
}

export interface UsitcHtsCandidate {
  htsCode: string;
  statisticalSuffix: string;
  description: string;
  indent: number | null;
  units: string[];
  footnotes: string[];
  generalRate: string;
  specialRate: string;
  otherRate: string;
  rateInheritedFrom: string | null;
  codeLevel: number;
  isFinalCandidate: boolean;
}
export interface UsitcHtsEvidence {
  candidates: UsitcHtsCandidate[];
  primaryCandidates: UsitcHtsCandidate[];
  remainingCandidates: UsitcHtsCandidate[];
  additionalMeasures: UsitcHtsCandidate[];
  specificationHint: string | null;
  sourceName: string;
  referenceDate: string | null;
}

export interface DecisionServiceGroups {
  marketOpportunity: DecisionFact[];
  marketEntry: DecisionFact[];
  transactionRisk: DecisionFact[];
  commonExportChecks: DecisionFact[];
}

export function buildMarketEvidence(facts: DecisionFact[]): MarketEvidence | null {
  const fact = facts.find((item) => (
    !item.isStale &&
    item.factKey === "market:un_comtrade" &&
    item.category === "market"
  ));
  if (!fact) return null;

  const value = asRecord(fact.value);
  const importMarketUsd = nonNegativeNumber(value.importMarketUsd);
  const importsFromKoreaUsd = nonNegativeNumber(value.importsFromKoreaUsd);
  if (importMarketUsd == null || importsFromKoreaUsd == null || importMarketUsd <= 0) return null;

  const reportedShare = finiteNumber(value.koreaSharePct);
  const koreaSharePct = reportedShare == null
    ? (importsFromKoreaUsd / importMarketUsd) * 100
    : reportedShare;

  return {
    period: text(value.period) || fact.referenceDate,
    importMarketUsd,
    importsFromKoreaUsd,
    koreaSharePct: round2(Math.max(0, Math.min(100, koreaSharePct))),
    sourceName: fact.sourceName,
    referenceDate: fact.referenceDate,
  };
}

export function buildTariffRangeEvidence(facts: DecisionFact[]): TariffRangeEvidence | null {
  const fact = facts.find((item) => (
    !item.isStale &&
    item.factKey === "tariff_fta:wits_hs6_range" &&
    item.category === "tariff_fta"
  ));
  if (!fact) return null;

  const value = asRecord(fact.value);
  const rawMin = finiteNumber(value.minRatePct);
  const rawAverage = finiteNumber(value.simpleAveragePct);
  const rawMax = finiteNumber(value.maxRatePct);
  if (rawMin == null || rawAverage == null || rawMax == null) return null;

  const minRatePct = Math.min(rawMin, rawMax);
  const maxRatePct = Math.max(rawMin, rawMax);
  return {
    minRatePct: round2(minRatePct),
    averageRatePct: round2(Math.max(minRatePct, Math.min(maxRatePct, rawAverage))),
    maxRatePct: round2(maxRatePct),
    sourceName: fact.sourceName,
    referenceDate: fact.referenceDate,
  };
}

export function buildLogisticsEvidence(facts: DecisionFact[]): LogisticsEvidence | null {
  const fact = facts.find((item) => (
    !item.isStale &&
    item.factKey === "logistics:world_bank_lpi" &&
    item.category === "cost"
  ));
  if (!fact) return null;

  const value = asRecord(fact.value);
  return {
    overall: boundedLpi(value.overall),
    customs: boundedLpi(value.customs),
    infrastructure: boundedLpi(value.infrastructure),
    internationalShipments: boundedLpi(value.internationalShipments),
    year: text(value.year) || fact.referenceDate,
    sourceName: fact.sourceName,
    referenceDate: fact.referenceDate,
  };
}

export function buildUsitcHtsEvidence(facts: DecisionFact[]): UsitcHtsEvidence | null {
  const fact = facts.find((item) => (
    !item.isStale &&
    item.factKey === "tariff_fta:usitc_hts_candidates" &&
    item.category === "tariff_fta"
  ));
  if (!fact) return null;

  const value = asRecord(fact.value);
  const candidates = prioritizeUsitcHtsCandidates(usitcCandidates(value.candidates));
  const finalCandidates = candidates.filter((candidate) => candidate.isFinalCandidate);
  const primaryCandidates = (finalCandidates.length ? finalCandidates : candidates).slice(0, 4);
  const primaryKeys = new Set(primaryCandidates.map((candidate) => candidate.htsCode));

  return {
    candidates,
    primaryCandidates,
    remainingCandidates: candidates.filter((candidate) => !primaryKeys.has(candidate.htsCode)),
    additionalMeasures: usitcCandidates(value.additionalMeasures),
    specificationHint: text(value.specificationHint) || null,
    sourceName: fact.sourceName,
    referenceDate: fact.referenceDate,
  };
}

export function groupDecisionFactsForService(facts: DecisionFact[]): DecisionServiceGroups {
  const active = facts.filter((fact) => !fact.isStale);
  return {
    marketOpportunity: active.filter((fact) => fact.category === "market"),
    marketEntry: active.filter((fact) => (
      fact.category === "tariff_fta" ||
      fact.category === "certification" ||
      fact.category === "import_regulation"
    )),
    transactionRisk: active.filter((fact) => (
      fact.category === "payment_risk" || fact.category === "cost"
    )),
    commonExportChecks: active.filter((fact) => (
      fact.category === "customs_requirement" ||
      fact.category === "customs_documents" ||
      fact.category === "strategic_goods" ||
      fact.category === "sanctions"
    )),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean)
    : [];
}
function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nonNegativeNumber(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed != null && parsed >= 0 ? parsed : null;
}

function boundedLpi(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed != null && parsed >= 0 && parsed <= 5 ? round2(parsed) : null;
}

function usitcCandidates(value: unknown): UsitcHtsCandidate[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = asRecord(entry);
    const htsCode = text(row.htsCode);
    if (!htsCode) return [];
    const codeLevel = htsCode.replace(/\D/g, "").length;
    return [{
      htsCode,
      statisticalSuffix: text(row.statisticalSuffix),
      description: text(row.description),
      indent: finiteNumber(row.indent),
      units: stringArray(row.units),
      footnotes: stringArray(row.footnotes),
      generalRate: text(row.generalRate) || "-",
      specialRate: text(row.specialRate) || "-",
      otherRate: text(row.otherRate) || "-",
      rateInheritedFrom: text(row.rateInheritedFrom) || null,
      codeLevel,
      isFinalCandidate: codeLevel === 10,
    }];
  });
}

function prioritizeUsitcHtsCandidates(candidates: UsitcHtsCandidate[]): UsitcHtsCandidate[] {
  return [...candidates].sort((left, right) => {
    if (left.codeLevel !== right.codeLevel) return left.codeLevel - right.codeLevel;
    return left.htsCode.localeCompare(right.htsCode, undefined, { numeric: true });
  });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
