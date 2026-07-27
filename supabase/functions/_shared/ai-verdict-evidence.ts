/**
 * Step 4 AI 판단에서 공공데이터 팩트와 공식 웹 근거를 동일한 형식으로
 * 검증하기 위한 순수 함수 모듈입니다. Deno와 Vitest에서 함께 실행되도록
 * 런타임 종속성을 두지 않습니다.
 */

export type VerdictEvidenceLevel =
  | "cross_checked"
  | "official_confirmed"
  | "ai_interpretation"
  | "needs_verification";

export type VerifiedEvidence = {
  id: string;
  category: string;
  claim: string;
  value: unknown;
  sourceName: string;
  sourceUrl: string;
  referenceDate: string | null;
  retrievedAt: string;
  level: "official_confirmed" | "needs_verification";
  origin: "program" | "official_web";
};

export type RejectedResearchClaim = {
  claimId: string;
  claim: string;
  reason:
    | "invalid_claim"
    | "official_source_required"
    | "grounding_source_mismatch"
    | "target_scope_mismatch"
    | "not_confirmed";
};

export type VerifiedEvidenceCatalog = {
  evidence: VerifiedEvidence[];
  rejectedClaims: RejectedResearchClaim[];
  conflicts: Array<{ claimId: string; claim: string }>;
};

type EvidenceCatalogInput = {
  countryCode: string;
  hs6: string;
  retrievedAt: string;
  decisionFacts: unknown[];
  groundedSources: unknown[];
  groundedClaims: unknown[];
};

const OFFICIAL_HOSTS = new Set([
  "comtradeplus.un.org",
  "comtradeapi.un.org",
  "data.worldbank.org",
  "dream.kotra.or.kr",
  "hts.usitc.gov",
  "jisc.go.jp",
  "ksight.ksure.or.kr",
  "wits.worldbank.org",
  "www.customs.go.jp",
  "www.data.go.kr",
  "www.jisc.go.jp",
  "www.kicox.or.kr",
  "www.ksure.or.kr",
  "www.meti.go.jp",
  "www.wto.org",
  "yestrade.go.kr",
]);

export function buildVerifiedEvidenceCatalog(input: EvidenceCatalogInput): VerifiedEvidenceCatalog {
  const evidence: VerifiedEvidence[] = [];
  const rejectedClaims: RejectedResearchClaim[] = [];
  const conflicts: Array<{ claimId: string; claim: string }> = [];
  const seenIds = new Set<string>();

  for (const rawFact of asArray(input.decisionFacts)) {
    const fact = asRecord(rawFact);
    const factKey = text(fact.factKey ?? fact.fact_key) || text(fact.id);
    const summary = text(fact.summary);
    const sourceUrl = normalizeUrl(fact.sourceUrl ?? fact.source_url);
    if (!factKey || !summary || !sourceUrl) continue;
    const id = `program:${factKey}`;
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    const status = text(fact.status);
    evidence.push({
      id,
      category: text(fact.category) || "other",
      claim: summary,
      value: fact.value ?? fact.value_json ?? null,
      sourceName: text(fact.sourceName ?? fact.source_name) || hostnameOf(sourceUrl),
      sourceUrl,
      referenceDate: nullableText(fact.referenceDate ?? fact.reference_date),
      retrievedAt: nullableText(fact.fetchedAt ?? fact.fetched_at) || input.retrievedAt,
      level: status === "confirmed" && isOfficialAuthorityUrl(sourceUrl)
        ? "official_confirmed"
        : "needs_verification",
      origin: "program",
    });
  }

  const groundedSources = asArray(input.groundedSources)
    .map(asRecord)
    .map((source) => ({
      name: text(source.name),
      url: normalizeUrl(source.resolvedUrl ?? source.url),
    }))
    .filter((source): source is { name: string; url: string } => Boolean(source.url));
  const groundedUrls = new Set(groundedSources.map((source) => source.url));

  for (const rawClaim of asArray(input.groundedClaims)) {
    const claim = asRecord(rawClaim);
    const claimId = text(claim.claimId ?? claim.claim_id);
    const claimText = text(claim.claim);
    if (!claimId || !claimText) {
      rejectedClaims.push({ claimId: claimId || "unknown", claim: claimText, reason: "invalid_claim" });
      continue;
    }
    if (text(claim.verificationStatus ?? claim.verification_status) === "conflict") {
      conflicts.push({ claimId, claim: claimText });
      rejectedClaims.push({ claimId, claim: claimText, reason: "not_confirmed" });
      continue;
    }
    if (text(claim.verificationStatus ?? claim.verification_status) !== "confirmed") {
      rejectedClaims.push({ claimId, claim: claimText, reason: "not_confirmed" });
      continue;
    }
    const sourceUrl = normalizeUrl(claim.resolvedUrl ?? claim.sourceUrl ?? claim.source_url);
    if (!sourceUrl || !isOfficialAuthorityUrl(sourceUrl)) {
      rejectedClaims.push({ claimId, claim: claimText, reason: "official_source_required" });
      continue;
    }
    if (!groundedUrls.has(sourceUrl)) {
      rejectedClaims.push({ claimId, claim: claimText, reason: "grounding_source_mismatch" });
      continue;
    }
    const claimCountry = text(claim.countryCode ?? claim.country_code).toUpperCase();
    const claimHs6 = digits(claim.hsCode ?? claim.hs_code).slice(0, 6);
    const targetCountry = text(input.countryCode).toUpperCase();
    const targetHs6 = digits(input.hs6).slice(0, 6);
    const scopeMatched = claim.scopeMatch === true || claim.scope_match === true;
    if (!scopeMatched || (claimCountry && claimCountry !== targetCountry) || (claimHs6 && claimHs6 !== targetHs6)) {
      rejectedClaims.push({ claimId, claim: claimText, reason: "target_scope_mismatch" });
      continue;
    }
    if (seenIds.has(claimId)) continue;
    seenIds.add(claimId);
    const matchedSource = groundedSources.find((source) => source.url === sourceUrl);
    evidence.push({
      id: claimId,
      category: text(claim.category) || "other",
      claim: claimText,
      value: claim.value ?? null,
      sourceName: text(claim.sourceName ?? claim.source_name) || matchedSource?.name || hostnameOf(sourceUrl),
      sourceUrl,
      referenceDate: nullableText(claim.effectiveDate ?? claim.effective_date ?? claim.publishedDate ?? claim.published_date),
      retrievedAt: input.retrievedAt,
      level: "official_confirmed",
      origin: "official_web",
    });
  }

  return { evidence, rejectedClaims, conflicts };
}

export function finalizeAiVerdict({
  rawVerdict,
  catalog,
  requiredCategories,
  now,
}: {
  rawVerdict: unknown;
  catalog: VerifiedEvidenceCatalog;
  requiredCategories: string[];
  now: string;
}): Record<string, unknown> {
  const raw = asRecord(rawVerdict);
  const byId = new Map(catalog.evidence.map((item) => [item.id, item]));
  const keyBasis = asArray(raw.keyBasis).map((item) => attachEvidence(item, byId));
  const majorRisks = asArray(raw.majorRisks).map((item) => attachEvidence(item, byId));
  const recommendedActions = asArray(raw.recommendedActions).map((item) => {
    const enriched = attachEvidence(item, byId);
    const estimatedCost = text(enriched.estimatedCost);
    const evidenceIds = asArray(enriched.evidenceIds).map(text).filter(Boolean);
    if (estimatedCost && evidenceIds.length === 0) {
      enriched.estimatedCost = estimatedCost.startsWith("AI 계획용 추정 ·")
        ? estimatedCost
        : `AI 계획용 추정 · ${estimatedCost}`;
      enriched.estimateType = "ai_planning_estimate";
      enriched.estimateBasis = "공식 수수료 또는 시험기관 견적이 연결되지 않은 계획용 범위입니다.";
    } else if (estimatedCost) {
      enriched.estimateType = "source_based_estimate";
    } else {
      enriched.estimateType = "quote_required";
    }
    return enriched;
  });

  const assertions = [...keyBasis, ...majorRisks];
  const supportedAssertions = assertions.filter((item) => (
    item.evidenceLevel === "official_confirmed" || item.evidenceLevel === "cross_checked"
  ));
  const supportedRatio = assertions.length === 0 ? 0 : supportedAssertions.length / assertions.length;
  const confirmedCategories = new Set(
    catalog.evidence
      .filter((item) => item.level === "official_confirmed")
      .map((item) => item.category),
  );
  const required = [...new Set(requiredCategories.map((category) => text(category)).filter(Boolean))];
  const missingCriticalChecks = required.filter((category) => !confirmedCategories.has(category));
  const criticalRatio = required.length === 0 ? 1 : (required.length - missingCriticalChecks.length) / required.length;
  const officialSources = uniqueOfficialSources(catalog.evidence);
  const sourceDiversity = Math.min(1, officialSources.length / 3);
  const confirmedEvidence = catalog.evidence.filter((item) => item.level === "official_confirmed");
  const freshnessRatio = confirmedEvidence.length === 0
    ? 0
    : confirmedEvidence.filter((item) => isFresh(item.referenceDate, item.retrievedAt, now)).length / confirmedEvidence.length;

  let confidenceScore = Math.round(
    supportedRatio * 45 +
    criticalRatio * 30 +
    sourceDiversity * 15 +
    freshnessRatio * 10 -
    catalog.conflicts.length * 15,
  );
  const unsupportedCount = assertions.length - supportedAssertions.length;
  if (missingCriticalChecks.length > 0) confidenceScore = Math.min(confidenceScore, 79);
  if (unsupportedCount > 0) confidenceScore = Math.min(confidenceScore, 64);
  if (catalog.conflicts.length > 0) confidenceScore = Math.min(confidenceScore, 49);
  confidenceScore = clamp(confidenceScore, 0, 100);
  const confidence = confidenceScore >= 85 ? "높음" : confidenceScore >= 65 ? "보통" : "낮음";
  const confidenceReason = [
    `핵심 주장 근거 연결 ${supportedAssertions.length}/${assertions.length || 0}건`,
    `공식 출처 ${officialSources.length}곳`,
    missingCriticalChecks.length > 0
      ? `추가 확인 필요: ${missingCriticalChecks.join(", ")}`
      : "필수 분야 공식 근거 확인",
    catalog.conflicts.length > 0 ? `상충 근거 ${catalog.conflicts.length}건` : "상충 근거 없음",
  ].join(" · ");

  return {
    ...raw,
    keyBasis,
    majorRisks,
    recommendedActions,
    confidence,
    confidenceScore,
    confidenceReason,
    officialSources,
    evidenceSummary: {
      programFactCount: catalog.evidence.filter((item) => item.origin === "program").length,
      officialWebClaimCount: catalog.evidence.filter((item) => item.origin === "official_web").length,
      rejectedWebClaimCount: catalog.rejectedClaims.length,
      supportedClaimCount: supportedAssertions.length,
      totalClaimCount: assertions.length,
      supportedClaimRatio: Math.round(supportedRatio * 100),
      conflictCount: catalog.conflicts.length,
      missingCriticalChecks,
    },
  };
}

export function isOfficialAuthorityUrl(value: unknown): boolean {
  const normalized = normalizeUrl(value);
  if (!normalized) return false;
  const hostname = hostnameOf(normalized);
  if (OFFICIAL_HOSTS.has(hostname)) return true;
  return (
    hostname.endsWith(".go.kr") ||
    hostname.endsWith(".go.jp") ||
    hostname.endsWith(".gov") ||
    hostname.endsWith(".gov.uk") ||
    hostname.endsWith(".gouv.fr") ||
    hostname.endsWith(".gc.ca") ||
    hostname.endsWith(".europa.eu") ||
    hostname.endsWith(".un.org") ||
    hostname.endsWith(".worldbank.org") ||
    hostname.endsWith(".wto.org")
  );
}

function attachEvidence(
  rawItem: unknown,
  byId: Map<string, VerifiedEvidence>,
): Record<string, unknown> {
  const item = asRecord(rawItem);
  const evidenceIds = [...new Set(
    asArray(item.evidenceIds ?? item.evidence_ids)
      .map(text)
      .filter((id) => byId.has(id)),
  )];
  const linked = evidenceIds.map((id) => byId.get(id)).filter((entry): entry is VerifiedEvidence => Boolean(entry));
  const confirmed = linked.filter((entry) => entry.level === "official_confirmed");
  const uniqueSources = new Set(confirmed.map((entry) => entry.sourceUrl));
  const evidenceLevel: VerdictEvidenceLevel = uniqueSources.size >= 2
    ? "cross_checked"
    : uniqueSources.size === 1
      ? "official_confirmed"
      : linked.length > 0
        ? "needs_verification"
        : "needs_verification";
  const primary = confirmed[0] ?? linked[0];
  return {
    ...item,
    evidenceIds,
    evidenceLevel,
    verificationNote: evidenceLevel === "needs_verification"
      ? "직접 연결된 공식 근거가 없어 관계기관 또는 전문가 확인이 필요합니다."
      : evidenceLevel === "cross_checked"
        ? "서로 다른 공식 출처로 교차 확인했습니다."
        : "공식 원문 근거가 연결되었습니다.",
    source: primary?.sourceName,
    sourceUrl: primary?.sourceUrl,
  };
}

function uniqueOfficialSources(evidence: VerifiedEvidence[]): Array<Record<string, unknown>> {
  const byUrl = new Map<string, Record<string, unknown>>();
  for (const item of evidence) {
    if (item.level !== "official_confirmed" || !isOfficialAuthorityUrl(item.sourceUrl)) continue;
    const existing = byUrl.get(item.sourceUrl);
    const evidenceIds = existing ? asArray(existing.evidenceIds).map(text) : [];
    byUrl.set(item.sourceUrl, {
      name: item.sourceName,
      url: item.sourceUrl,
      relevance: item.claim,
      referenceDate: item.referenceDate,
      evidenceIds: [...new Set([...evidenceIds, item.id])],
    });
  }
  return [...byUrl.values()];
}

function isFresh(referenceDate: string | null, retrievedAt: string, now: string): boolean {
  const value = referenceDate || retrievedAt;
  const timestamp = Date.parse(value);
  const nowTimestamp = Date.parse(now);
  if (!Number.isFinite(timestamp) || !Number.isFinite(nowTimestamp)) return false;
  const ageDays = Math.max(0, (nowTimestamp - timestamp) / (24 * 60 * 60 * 1_000));
  return ageDays <= 730;
}

function normalizeUrl(value: unknown): string | null {
  const raw = text(value);
  if (!/^https?:\/\//i.test(raw)) return null;
  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function hostnameOf(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function nullableText(value: unknown): string | null {
  return text(value) || null;
}

function digits(value: unknown): string {
  return text(value).replace(/\D/g, "");
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
