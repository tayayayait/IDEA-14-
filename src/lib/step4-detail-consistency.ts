export type DetailSectionState = "not_run" | "ready" | "empty" | "error" | "stale";
export type DetailRowState = "success" | "empty" | "error" | "stale";
export type CountryDetailApiState = "idle" | "running" | "success" | "partial_success" | "error" | "stale";
export type DetailContextKind = "certification" | "regulation";
export type CertificationSourceKind = "kotra_overseas_cert" | "sme_overseas_cert" | "unknown_certification";
export type RegulationSourceKind = "kotra_import_regulation" | "wto_eping" | "unknown_regulation";
export type CurrentDetailContext = {
  countryCode?: string | null;
  productName?: string | null;
  hsCode?: string | null;
  hskCode?: string | null;
};

export type DetailLikeRow = {
  raw?: unknown;
  source_org?: string | null;
};

export function isIndustryMatchFailed(raw: Record<string, unknown> | null | undefined): boolean {
  const flag = raw?.industry_match_failed;
  if (typeof flag === "boolean") return flag;
  if (typeof flag === "string") return flag.trim().toLowerCase() === "true";
  return false;
}

export function readDetailRowState(row: DetailLikeRow): DetailRowState | null {
  const raw = asRecord(row.raw);
  const state = asText(raw.detail_state).toLowerCase();
  if (state === "success" || state === "empty" || state === "error" || state === "stale") return state;
  return null;
}

export function getSuccessfulDetailRows<T extends DetailLikeRow>(rows: T[]): T[] {
  return rows.filter((row) => readDetailRowState(row) === "success");
}

export function filterRowsByCurrentDetailContext<T extends DetailLikeRow>(
  rows: T[],
  context: CurrentDetailContext,
  kind: DetailContextKind,
): T[] {
  return rows.filter((row) => isCurrentDetailContextRow(row, context, kind));
}

export function isCurrentDetailContextRow(
  row: DetailLikeRow,
  context: CurrentDetailContext,
  kind: DetailContextKind,
): boolean {
  const raw = asRecord(row.raw);
  const currentCountry = asText(context.countryCode).toUpperCase();
  const rawCountry = asText(raw.input_country_code).toUpperCase();
  if (currentCountry && rawCountry && rawCountry !== currentCountry) return false;

  if (!detailHsMatchesContext(raw, context)) return false;

  const currentProduct = asText(context.productName);
  const inputProduct = asText(raw.input_product_name);
  if (currentProduct && inputProduct) {
    if (normalizeComparableText(inputProduct) !== normalizeComparableText(currentProduct)) return false;
  }

  if (kind === "certification") {
    if (!currentProduct) return false;
    return hasProductTextEvidence(raw, currentProduct);
  }

  return true;
}

export function isCertificationReviewRequired(row: DetailLikeRow): boolean {
  const raw = asRecord(row.raw);
  const confidence = asText(raw.match_confidence).toLowerCase();
  const strategy = asText(raw.match_strategy).toLowerCase();
  return confidence === "review_required" || strategy === "country_product_fallback";
}

export function isRegulationReviewRequired(row: DetailLikeRow): boolean {
  const raw = asRecord(row.raw);
  const confidence = asText(raw.match_confidence).toLowerCase();
  const strategy = asText(raw.match_strategy).toLowerCase();
  return confidence === "review_required" || strategy === "kr_origin_product_review";
}

export function getCertificationSourceKind(row: DetailLikeRow): CertificationSourceKind {
  const raw = asRecord(row.raw);
  const sourceType = asText(raw.source_type).toLowerCase();
  const sourceOrg = asText(row.source_org).toLowerCase();

  if (sourceType === "sme_overseas_cert" || sourceOrg.includes("중소벤처기업부")) {
    return "sme_overseas_cert";
  }
  if (sourceType === "kotra_overseas_cert" || sourceOrg === "kotra") {
    return "kotra_overseas_cert";
  }
  return "unknown_certification";
}

export function getRegulationSourceKind(row: DetailLikeRow): RegulationSourceKind {
  const raw = asRecord(row.raw);
  const sourceType = asText(raw.source_type).toLowerCase();
  const sourceOrg = asText(row.source_org).toLowerCase();

  if (sourceType === "wto_eping" || sourceOrg === "wto eping") return "wto_eping";
  if (
    sourceOrg === "kotra" ||
    sourceType === "kotra_cache" ||
    sourceType === "kotra_api_sync" ||
    sourceType === "csv_backup"
  ) {
    return "kotra_import_regulation";
  }
  return "unknown_regulation";
}

export function pickPlaceholderState<T extends DetailLikeRow>(rows: T[]): Exclude<DetailRowState, "success"> | null {
  let hasStale = false;
  let hasEmpty = false;
  for (const row of rows) {
    const state = readDetailRowState(row);
    if (state === "error") return "error";
    if (state === "stale") hasStale = true;
    if (state === "empty") hasEmpty = true;
  }
  if (hasStale) return "stale";
  if (hasEmpty) return "empty";
  return null;
}

export function resolveSectionState(params: {
  detailExecuted: boolean;
  successfulRowCount: number;
  placeholderState: Exclude<DetailRowState, "success"> | null;
}): DetailSectionState {
  if (!params.detailExecuted) return "not_run";
  if (params.successfulRowCount > 0) return "ready";
  if (params.placeholderState === "error") return "error";
  if (params.placeholderState === "stale") return "stale";
  if (params.placeholderState === "empty") return "empty";
  return "empty";
}

export function resolveMatchedCountForDisplay(params: {
  detailExecuted: boolean;
  matchedCount: number;
  successfulRowCount: number;
}): number {
  if (params.detailExecuted) return params.successfulRowCount;
  return params.matchedCount;
}

export function isKsureCategory(category: string | null | undefined): boolean {
  const normalized = asText(category).toLowerCase();
  return normalized === "k_sure" || normalized === "k_sure_industry" || normalized === "k_sure_payment";
}

export function resolveCountryDetailApiState(params: {
  ok: boolean;
  resultState: string | null | undefined;
  responseState?: string | null;
  hasLoadedDetailRows: boolean;
}): CountryDetailApiState {
  if (params.ok) {
    return normalizeCountryDetailApiState(params.responseState, "success");
  }
  if (params.hasLoadedDetailRows) {
    return "partial_success";
  }
  return normalizeCountryDetailApiState(params.resultState, "error");
}

function normalizeCountryDetailApiState(
  value: string | null | undefined,
  fallback: CountryDetailApiState,
): CountryDetailApiState {
  const state = asText(value).toLowerCase();
  if (state === "idle") return "idle";
  if (state === "running" || state === "loading") return "running";
  if (state === "success") return "success";
  if (state === "partial_success" || state === "empty") return "partial_success";
  if (state === "error") return "error";
  if (state === "stale") return "stale";
  return fallback;
}

function detailHsMatchesContext(raw: Record<string, unknown>, context: CurrentDetailContext): boolean {
  const contextHs = normalizeHsOrHsk(asText(context.hsCode));
  const contextHsk = normalizeHsOrHsk(asText(context.hskCode));
  const selectedHs6 = contextHs.length >= 6 ? contextHs.slice(0, 6) : contextHsk.slice(0, 6);
  if (!selectedHs6 && !contextHsk) return false;

  const candidates = [
    ...extractHsCandidates(raw.input_hs_code),
    ...extractHsCandidates(raw.input_hsk_code),
    ...extractHsCandidates(raw.hs_code),
    ...extractHsCandidates(raw.hsk_code),
  ];
  if (candidates.length === 0) return false;

  for (const candidate of candidates) {
    if (contextHsk && candidate === contextHsk) return true;
  }
  for (const candidate of candidates) {
    if (selectedHs6 && candidate.slice(0, 6) === selectedHs6) return true;
  }
  return false;
}

function hasProductTextEvidence(raw: Record<string, unknown>, productName: string): boolean {
  const tokens = buildProductTokens(productName);
  if (tokens.length === 0) return false;
  const haystack = normalizeComparableText([
    asText(raw.product_name),
    asText(raw.applicable_items),
    asText(raw.subject),
    asText(raw.basis_regulation),
    asText(raw.raw_system_desc),
    asText(raw.raw_extra),
  ].join(" "));
  if (!haystack) return false;
  return tokens.some((token) => haystack.includes(token));
}

function buildProductTokens(value: string): string[] {
  const normalized = normalizeComparableText(value);
  const splitTokens = asText(value)
    .toLowerCase()
    .split(/[\s,/()|+_\-]+/g)
    .map((token) => normalizeComparableText(token))
    .filter((token) => token.length >= 2);
  return dedupeStrings([normalized, ...splitTokens]).filter((token) => token.length >= 2);
}

function extractHsCandidates(value: unknown): string[] {
  const text = asText(value);
  if (!text) return [];
  const groups = text.match(/\d{4,10}/g);
  if (groups && groups.length > 0) return dedupeStrings(groups.map((group) => group.slice(0, 10)));
  const normalized = normalizeHsOrHsk(text);
  return normalized ? [normalized] : [];
}

function normalizeHsOrHsk(value: string): string {
  return value.replace(/\D/g, "");
}

function normalizeComparableText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "").trim();
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function asText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
