export type SafetyRequestScope = "cert" | "domestic" | "foreign";

export interface SafetySearchInput {
  productName: string;
  modelName: string;
  brandName: string;
  certNum: string;
  barcodeNum: string;
}

export interface SafetyKoreaRequestSpec {
  scope: SafetyRequestScope;
  conditionKey: string;
  conditionValue: string;
}

export interface SafetyRecallCandidate {
  productName?: string;
  modelName?: string;
  brandName?: string;
  certNum?: string;
  barcodeNum?: string;
  raw?: unknown;
  [key: string]: unknown;
}

export type SafetyRecallMatchBasis =
  | "모델명 일치"
  | "제품명 일치"
  | "KC 인증번호 일치"
  | "바코드 일치"
  | "브랜드 보조 일치";

export type SafetyRecallMatchedItem<T extends SafetyRecallCandidate> = T & {
  matchBasis: SafetyRecallMatchBasis[];
  excludedReason?: string;
};

export interface SafetyRecallFilterResult<T extends SafetyRecallCandidate> {
  included: Array<SafetyRecallMatchedItem<T>>;
  excluded: Array<SafetyRecallMatchedItem<T>>;
  noMatchMessage: string;
  recommendedAction: string;
}

export const BRAND_ONLY_RECALL_EXCLUSION_REASON = "브랜드만 일치하여 제외됨";
export const RECALL_NO_MATCH_MESSAGE = "입력한 제품명·모델명 기준으로 확인된 리콜 정보 없음";
export const RECALL_REVIEW_REQUIRED_ACTION = "기관 확인 필요";

export const normalizeSafetySearchInput = (
  input: Partial<SafetySearchInput> | null | undefined,
): SafetySearchInput => ({
  productName: normalizeQueryValue(input?.productName),
  modelName: normalizeQueryValue(input?.modelName),
  brandName: normalizeQueryValue(input?.brandName),
  certNum: normalizeQueryValue(input?.certNum),
  barcodeNum: normalizeQueryValue(input?.barcodeNum),
});

export const buildSafetyKoreaRequests = (
  input: SafetySearchInput,
  fallbackTokens: string[] = [],
): SafetyKoreaRequestSpec[] => {
  const normalized = normalizeSafetySearchInput(input);
  const productCandidates = buildProductCandidates(normalized, fallbackTokens);
  const requests: SafetyKoreaRequestSpec[] = [];

  pushRequest(requests, "cert", "certNum", normalized.certNum);
  pushRequest(requests, "cert", "modelName", normalized.modelName);
  for (const productName of productCandidates) {
    pushRequest(requests, "cert", "productName", productName);
  }

  pushRequest(requests, "domestic", "barcodeNum", normalized.barcodeNum);
  pushRequest(requests, "domestic", "certNum", normalized.certNum);
  pushRequest(requests, "domestic", "recallModelName", normalized.modelName);
  pushRequest(requests, "domestic", "recallBrandName", normalized.brandName);
  for (const productName of productCandidates) {
    pushRequest(requests, "domestic", "recallProductName", productName);
  }

  pushRequest(requests, "foreign", "recallModelName", normalized.modelName);
  pushRequest(requests, "foreign", "recallBrandName", normalized.brandName);
  for (const productName of productCandidates) {
    pushRequest(requests, "foreign", "recallProductName", productName);
  }

  return dedupeRequests(requests);
};

export const filterSafetyRecallMatches = <T extends SafetyRecallCandidate>(
  items: T[],
  input: SafetySearchInput,
): SafetyRecallFilterResult<T> => {
  const normalized = normalizeSafetySearchInput(input);
  const included: Array<SafetyRecallMatchedItem<T>> = [];
  const excluded: Array<SafetyRecallMatchedItem<T>> = [];

  for (const item of items) {
    const decision = evaluateRecallMatch(item, normalized);
    const annotated = {
      ...item,
      matchBasis: decision.matchBasis,
      ...(decision.excludedReason ? { excludedReason: decision.excludedReason } : {}),
    } as SafetyRecallMatchedItem<T>;

    if (decision.included) {
      included.push(annotated);
    } else {
      excluded.push(annotated);
    }
  }

  return {
    included,
    excluded,
    noMatchMessage: RECALL_NO_MATCH_MESSAGE,
    recommendedAction: RECALL_REVIEW_REQUIRED_ACTION,
  };
};

const buildProductCandidates = (input: SafetySearchInput, fallbackTokens: string[]): string[] => {
  const blocked = new Set(
    [input.modelName, input.brandName, input.certNum, input.barcodeNum]
      .map((value) => value.toLowerCase())
      .filter(Boolean),
  );
  const candidates = [input.productName, ...fallbackTokens]
    .map(normalizeQueryValue)
    .filter((value) => value.length >= 2)
    .filter((value) => !blocked.has(value.toLowerCase()));

  return dedupeText(candidates).slice(0, 3);
};

const evaluateRecallMatch = (
  item: SafetyRecallCandidate,
  input: SafetySearchInput,
): {
  included: boolean;
  matchBasis: SafetyRecallMatchBasis[];
  excludedReason?: string;
} => {
  const modelMatch = hasIdentifierMatch(input.modelName, readCandidateTexts(item, ["modelName", "recallModelName"]));
  const productMatch = hasProductMatch(
    input.productName,
    readCandidateTexts(item, ["productName", "recallProductName", "productDescription", "recallProductDscr"]),
  );
  const certMatch = hasIdentifierMatch(
    input.certNum,
    readCandidateTexts(item, ["certNum", "certNo", "certificationNum", "certificationNo"]),
  );
  const barcodeMatch = hasIdentifierMatch(
    input.barcodeNum,
    readCandidateTexts(item, ["barcodeNum", "barcode", "barCode", "ean", "gtin"]),
  );
  const brandMatch = hasIdentifierMatch(input.brandName, readCandidateTexts(item, ["brandName", "recallBrandName"]));

  const matchBasis: SafetyRecallMatchBasis[] = [];
  if (modelMatch) matchBasis.push("모델명 일치");
  if (productMatch) matchBasis.push("제품명 일치");
  if (certMatch) matchBasis.push("KC 인증번호 일치");
  if (barcodeMatch) matchBasis.push("바코드 일치");

  const hasStrongIdentifier = modelMatch || certMatch || barcodeMatch;
  const included = input.modelName
    ? hasStrongIdentifier
    : hasStrongIdentifier || productMatch;

  if (included && brandMatch) matchBasis.push("브랜드 보조 일치");

  if (included) return { included, matchBasis };

  if (brandMatch && !modelMatch && !productMatch && !certMatch && !barcodeMatch) {
    return {
      included: false,
      matchBasis: ["브랜드 보조 일치"],
      excludedReason: BRAND_ONLY_RECALL_EXCLUSION_REASON,
    };
  }

  return {
    included: false,
    matchBasis,
    excludedReason: input.modelName && productMatch
      ? "제품명은 일치하나 모델명 불일치로 제외됨"
      : "제품명·모델명 불일치로 제외됨",
  };
};

const pushRequest = (
  requests: SafetyKoreaRequestSpec[],
  scope: SafetyRequestScope,
  conditionKey: string,
  conditionValue: string,
) => {
  if (!conditionValue || conditionValue.length < 2) return;
  requests.push({ scope, conditionKey, conditionValue });
};

const dedupeRequests = (requests: SafetyKoreaRequestSpec[]): SafetyKoreaRequestSpec[] => {
  const seen = new Set<string>();
  const out: SafetyKoreaRequestSpec[] = [];

  for (const request of requests) {
    const key = `${request.scope}|${request.conditionKey}|${request.conditionValue.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(request);
  }

  return out;
};

const dedupeText = (values: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }

  return out;
};

const normalizeQueryValue = (value: unknown): string => {
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, 80);
};

const readCandidateTexts = (item: SafetyRecallCandidate, keys: string[]): string[] => {
  const raw = asRecord(item.raw);
  const values: string[] = [];

  for (const key of keys) {
    values.push(asText(item[key]), asText(raw[key]));
  }

  return values.filter(Boolean);
};

const hasIdentifierMatch = (query: string, candidates: string[]): boolean => {
  const normalizedQuery = normalizeIdentifier(query);
  if (normalizedQuery.length < 2) return false;

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeIdentifier(candidate);
    if (normalizedCandidate.length < 2) continue;

    if (normalizedCandidate === normalizedQuery) return true;
    if (normalizedQuery.length >= 4 && normalizedCandidate.includes(normalizedQuery)) return true;
    if (normalizedCandidate.length >= 4 && normalizedQuery.includes(normalizedCandidate)) return true;
  }

  return false;
};

const hasProductMatch = (query: string, candidates: string[]): boolean => {
  const normalizedQuery = normalizeProductText(query);
  if (normalizedQuery.length < 2) return false;

  const queryTokens = buildProductTokens(query);
  for (const candidate of candidates) {
    const normalizedCandidate = normalizeProductText(candidate);
    if (normalizedCandidate.length < 2) continue;

    if (normalizedCandidate.includes(normalizedQuery) || normalizedQuery.includes(normalizedCandidate)) return true;

    const candidateTokens = buildProductTokens(candidate);
    for (const token of queryTokens) {
      if (candidateTokens.has(token)) return true;
    }
  }

  return false;
};

const buildProductTokens = (value: string): Set<string> => {
  const tokens = value
    .toLowerCase()
    .match(/[a-z0-9]+|[가-힣]+/g) ?? [];

  return new Set(
    tokens
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
      .filter((token) => !GENERIC_PRODUCT_TOKENS.has(token)),
  );
};

const GENERIC_PRODUCT_TOKENS = new Set([
  "전기",
  "전자",
  "제품",
  "기기",
  "부품",
  "모듈",
  "장치",
  "set",
  "unit",
  "part",
  "parts",
  "module",
  "product",
  "electric",
  "electronic",
  "electronics",
]);

const normalizeIdentifier = (value: string): string => (
  value
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, "")
);

const normalizeProductText = (value: string): string => normalizeIdentifier(value);

const asRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const asText = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
};
