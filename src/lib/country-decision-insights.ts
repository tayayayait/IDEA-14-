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

export type DestinationTariffDataMode = "live_api" | "official_snapshot" | "aggregate_fallback";

export interface DestinationTariffCandidate {
  tariffCode: string;
  /** 이전 USITC 저장 데이터와 보고서 호환용 별칭 */
  htsCode: string;
  statisticalSuffix: string;
  description: string;
  hierarchyDescription: string;
  indent: number | null;
  units: string[];
  footnotes: string[];
  generalRate: string;
  mfnRate: string;
  koreaPreferentialRate: string;
  specialRate: string;
  otherRate: string;
  otherRateLabel: string;
  measures: string[];
  conditions: string[];
  rateInheritedFrom: string | null;
  codeLevel: number;
  isFinalCandidate: boolean;
}

export interface DestinationTariffEvidence {
  countryCode: string;
  countryName: string;
  nomenclature: string;
  dataMode: DestinationTariffDataMode;
  finalCodeDigits: number;
  candidates: DestinationTariffCandidate[];
  primaryCandidates: DestinationTariffCandidate[];
  remainingCandidates: DestinationTariffCandidate[];
  additionalMeasures: DestinationTariffCandidate[];
  specificationHint: string | null;
  sourceName: string;
  sourceUrl: string | null;
  referenceDate: string | null;
}

export type UsitcHtsCandidate = DestinationTariffCandidate;
export type UsitcHtsEvidence = DestinationTariffEvidence;

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

export function buildDestinationTariffEvidence(facts: DecisionFact[]): DestinationTariffEvidence | null {
  const fact = facts.find((item) => (
    !item.isStale &&
    (
      item.factKey === "tariff_fta:national_tariff_candidates" ||
      item.factKey === "tariff_fta:usitc_hts_candidates"
    ) &&
    item.category === "tariff_fta"
  ));
  if (!fact) return null;

  const value = asRecord(fact.value);
  const finalCodeDigits = positiveInteger(value.finalCodeDigits) ?? 10;
  const candidates = prioritizeDestinationTariffCandidates(destinationTariffCandidates(value.candidates, finalCodeDigits));
  const finalCandidates = candidates.filter((candidate) => candidate.isFinalCandidate);
  const primaryCandidates = (finalCandidates.length ? finalCandidates : candidates).slice(0, 4);
  const primaryKeys = new Set(primaryCandidates.map((candidate) => candidate.tariffCode));
  const legacyUsitc = fact.factKey === "tariff_fta:usitc_hts_candidates";

  return {
    countryCode: text(value.countryCode) || (legacyUsitc ? "US" : ""),
    countryName: text(value.countryName) || (legacyUsitc ? "미국" : "목적국"),
    nomenclature: text(value.nomenclature) || (legacyUsitc ? "US HTS" : "목적국 관세표"),
    dataMode: destinationTariffDataMode(value.dataMode) || (legacyUsitc ? "live_api" : "official_snapshot"),
    finalCodeDigits,
    candidates,
    primaryCandidates,
    remainingCandidates: candidates.filter((candidate) => !primaryKeys.has(candidate.tariffCode)),
    additionalMeasures: destinationTariffCandidates(value.additionalMeasures, finalCodeDigits),
    specificationHint: text(value.specificationHint) || null,
    sourceName: fact.sourceName,
    sourceUrl: fact.sourceUrl,
    referenceDate: fact.referenceDate,
  };
}

export function buildUsitcHtsEvidence(facts: DecisionFact[]): UsitcHtsEvidence | null {
  return buildDestinationTariffEvidence(facts);
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

function destinationTariffCandidates(value: unknown, finalCodeDigits: number): DestinationTariffCandidate[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = asRecord(entry);
    const tariffCode = text(row.tariffCode) || text(row.htsCode);
    if (!tariffCode) return [];
    const codeLevel = tariffCode.replace(/\D/g, "").length;
    const koreaPreferentialRate = text(row.koreaPreferentialRate) || text(row.specialRate) || "-";
    const declarable = typeof row.declarable === "boolean" ? row.declarable : codeLevel === finalCodeDigits;
    return [{
      tariffCode,
      htsCode: tariffCode,
      statisticalSuffix: text(row.statisticalSuffix),
      description: text(row.description),
      hierarchyDescription: text(row.hierarchyDescription),
      indent: finiteNumber(row.indent),
      units: stringArray(row.units),
      footnotes: stringArray(row.footnotes),
      generalRate: text(row.generalRate) || "-",
      mfnRate: text(row.mfnRate) || text(row.generalRate) || "-",
      koreaPreferentialRate,
      specialRate: koreaPreferentialRate,
      otherRate: text(row.otherRate) || "-",
      otherRateLabel: text(row.otherRateLabel) || "기타",
      measures: stringArray(row.measures),
      conditions: stringArray(row.conditions),
      rateInheritedFrom: text(row.rateInheritedFrom) || null,
      codeLevel,
      isFinalCandidate: declarable && codeLevel === finalCodeDigits,
    }];
  });
}

function prioritizeDestinationTariffCandidates(candidates: DestinationTariffCandidate[]): DestinationTariffCandidate[] {
  return [...candidates].sort((left, right) => {
    if (left.codeLevel !== right.codeLevel) return left.codeLevel - right.codeLevel;
    return left.htsCode.localeCompare(right.htsCode, undefined, { numeric: true });
  });
}

function destinationTariffDataMode(value: unknown): DestinationTariffDataMode | null {
  return value === "live_api" || value === "official_snapshot" || value === "aggregate_fallback"
    ? value
    : null;
}

function positiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
