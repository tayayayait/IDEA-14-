import {
  filterSafetyRecallMatches,
  normalizeSafetySearchInput,
  RECALL_NO_MATCH_MESSAGE,
  type SafetySearchInput,
} from "./safety-search.ts";

type Consumer24Status = "success" | "empty" | "error" | "key_missing";

export type Consumer24RecallItem = {
  source: "domestic_recall";
  recordId: string;
  productName: string;
  brandName: string;
  modelName: string;
  noticeDate: string;
  recallType: string;
  sourceUrl: string;
  actionSummary: string;
  defectSummary: string;
  hazardSummary: string;
  productDescription: string;
  imageUrls: string[];
  matchBasis?: string[];
  excludedReason?: string;
  raw: Record<string, unknown>;
};

export type Consumer24RecallFetchResult = {
  status: Consumer24Status;
  message: string;
  errorCode: string | null;
  certifications: [];
  items: Consumer24RecallItem[];
  excludedItems: Consumer24RecallItem[];
  query: string;
  httpStatus: number | null;
  certCount: 0;
  domesticCount: number;
  foreignCount: 0;
  warnings: string[];
};

type Consumer24ApiResult = {
  ok: boolean;
  code: string;
  message: string;
  errorCode: string | null;
  status: number | null;
  xml: string | null;
};

type Consumer24RecallQuery = {
  key: "productNm" | "bsnmNm" | "modlNmInfo" | "recallProcssInfo";
  value: string;
};

const CONSUMER24_RECALL_URL = "https://www.consumer.go.kr/openapi/recall/contents/index.do";
const CONSUMER24_AUTO_RECALL_MENU_ID = "0301";
const CONSUMER24_SOURCE_URL = "https://www.consumer.go.kr/user/ftc/consumer/openApiSvcUser/120/selectOpenApiSvcList.do";
const CONSUMER24_RECALL_LIST_URL = "https://www.consumer.go.kr/user/ftc/consumer/recallInfo/629/selectRecallInfoInternalList.do";
const CONSUMER24_RECALL_DETAIL_URL = "https://www.consumer.go.kr/user/ftc/consumer/recallInfo/629/selectRecallInfoInternalDetail.do";
const CONSUMER24_FETCH_TIMEOUT_MS = 10000;

export const isAutomobileSafetySearch = (input: SafetySearchInput, fallbackTokens: string[] = []): boolean => {
  const haystack = [
    input.productName,
    input.modelName,
    input.brandName,
    ...fallbackTokens,
  ].join(" ").toLowerCase();

  if (!haystack.trim()) return false;

  const autoTerms = [
    "자동차",
    "승용자동차",
    "승용차",
    "차량",
    "자동차부품",
    "그랜저",
    "소나타",
    "쏘나타",
    "아이오닉",
    "아반떼",
    "투싼",
    "싼타페",
    "팰리세이드",
    "제네시스",
    "hyundai",
    "kia",
    "genesis",
    "sonata",
    "grandeur",
    "ioniq",
  ];

  return autoTerms.some((term) => haystack.includes(term));
};

export async function fetchConsumer24AutoRecallCases(params: {
  apiKey: string;
  search: SafetySearchInput;
  fallbackTokens?: string[];
}): Promise<Consumer24RecallFetchResult> {
  const apiKey = normalizeServiceKey(params.apiKey);
  if (!apiKey) {
    return emptyResult({
      status: "key_missing",
      message: "Consumer24 auto recall API serviceKey is missing.",
      errorCode: "consumer24_auto_recall_key_missing",
      httpStatus: null,
    });
  }

  const search = normalizeSafetySearchInput(params.search);
  const queries = buildRecallQueries(search, params.fallbackTokens ?? []);
  const queryText = formatConsumer24Queries(queries);
  if (queries.length === 0) {
    return emptyResult({
      status: "empty",
      message: "Consumer24 auto recall query is empty.",
      errorCode: null,
      httpStatus: 200,
      query: "",
    });
  }

  let successfulCallCount = 0;
  let failedCallCount = 0;
  let lastHttpStatus: number | null = null;
  let firstErrorCode: string | null = null;
  const warnings: string[] = [];
  const collected: Consumer24RecallItem[] = [];

  for (const query of queries) {
    const response = await fetchConsumer24RecallRequest(apiKey, query);
    if (response.status != null) lastHttpStatus = response.status;

    if (!response.ok) {
      failedCallCount += 1;
      warnings.push(`${query.key} failed (${response.errorCode ?? response.code}): ${sanitizeConsumer24Text(response.message)}`);
      if (!firstErrorCode) firstErrorCode = response.errorCode;
      continue;
    }

    successfulCallCount += 1;
    collected.push(...parseRecallItems(response.xml));
  }

  if (successfulCallCount === 0 && failedCallCount > 0) {
    return emptyResult({
      status: "error",
      message: sanitizeConsumer24Text(warnings[0] ?? "Consumer24 auto recall request failed."),
      errorCode: firstErrorCode ?? "consumer24_auto_recall_failed",
      httpStatus: lastHttpStatus,
      query: queryText,
      warnings,
    });
  }

  const deduped = dedupeByKey(collected, (item) => item.recordId);
  const filtered = filterSafetyRecallMatches(deduped, search);
  const included = filtered.included as Consumer24RecallItem[];
  const excluded = filtered.excluded as Consumer24RecallItem[];

  if (included.length > 0) {
    return {
      status: "success",
      message: `Consumer24 auto recall result: domestic recall ${included.length}`,
      errorCode: null,
      certifications: [],
      items: included,
      excludedItems: excluded,
      query: queryText,
      httpStatus: lastHttpStatus ?? 200,
      certCount: 0,
      domesticCount: included.length,
      foreignCount: 0,
      warnings,
    };
  }

  return {
    status: "empty",
    message: RECALL_NO_MATCH_MESSAGE,
    errorCode: null,
    certifications: [],
    items: [],
    excludedItems: excluded,
    query: queryText,
    httpStatus: lastHttpStatus ?? 200,
    certCount: 0,
    domesticCount: 0,
    foreignCount: 0,
    warnings,
  };
}

async function fetchConsumer24RecallRequest(
  apiKey: string,
  query: Consumer24RecallQuery,
): Promise<Consumer24ApiResult> {
  const url = new URL(CONSUMER24_RECALL_URL);
  url.searchParams.set("serviceKey", apiKey);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("cntPerPage", "100");
  url.searchParams.set("cntntsId", CONSUMER24_AUTO_RECALL_MENU_ID);
  url.searchParams.set(query.key, query.value);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONSUMER24_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), { method: "GET", signal: controller.signal });
    const status = response.status;
    const text = await response.text();

    if (!response.ok) {
      return {
        ok: false,
        code: `http_${status}`,
        message: `Consumer24 HTTP ${status}`,
        errorCode: normalizeConsumer24ErrorCode(`http_${status}`),
        status,
        xml: null,
      };
    }

    const xml = text;
    if (!xml.includes("</")) {
      return {
        ok: false,
        code: "invalid_xml",
        message: "Consumer24 returned an invalid XML response.",
        errorCode: "consumer24_invalid_xml",
        status,
        xml: null,
      };
    }

    const code = textFromFirst(xml, "code");
    const message = textFromFirst(xml, "codeMsg") || "Consumer24 response";

    if (code === "00" || (!code && xml.includes("<content>"))) {
      return { ok: true, code: code || "00", message, errorCode: null, status, xml };
    }

    if (code === "30") {
      return { ok: true, code, message: message || "No data", errorCode: null, status, xml };
    }

    return {
      ok: false,
      code,
      message,
      errorCode: normalizeConsumer24ErrorCode(code || "consumer24_provider_error"),
      status,
      xml,
    };
  } catch (error) {
    const failure = classifyConsumer24TransportError(error);
    return {
      ok: false,
      code: failure.errorCode,
      message: failure.message,
      errorCode: failure.errorCode,
      status: null,
      xml: null,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildRecallQueries(search: SafetySearchInput, fallbackTokens: string[]): Consumer24RecallQuery[] {
  const queries: Consumer24RecallQuery[] = [];
  const modelCandidates = [
    search.modelName,
    ...extractAutomobileModelCandidates(search.productName),
    ...fallbackTokens,
  ]
    .map(normalizeQueryValue)
    .filter((value) => value.length >= 2);

  for (const model of modelCandidates.slice(0, 4)) {
    queries.push({ key: "modlNmInfo", value: model });
  }

  if (search.productName) queries.push({ key: "productNm", value: search.productName });
  if (search.certNum) queries.push({ key: "recallProcssInfo", value: search.certNum });
  if (search.brandName) queries.push({ key: "bsnmNm", value: search.brandName });

  return dedupeByKey(queries, (query) => `${query.key}|${query.value.toLowerCase()}`).slice(0, 6);
}

function extractAutomobileModelCandidates(value: string): string[] {
  const normalized = normalizeQueryValue(value);
  if (!normalized) return [];

  const candidates = normalized
    .replace(/[()]/g, ",")
    .split(/[,/]|·|ㆍ/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .filter((item) => !["자동차", "승용자동차", "승용차", "차량"].includes(item));

  return candidates;
}

function parseRecallItems(xml: string | null): Consumer24RecallItem[] {
  if (!xml) return [];

  const contents = extractXmlTags(xml, "content");
  return contents
    .map((nodeText) => mapRecallContent(nodeText))
    .filter((item) => Boolean(item.recordId && (item.productName || item.modelName)));
}

function mapRecallContent(nodeText: string): Consumer24RecallItem {
  const row = elementToRecord(nodeText);
  const recordId = asText(row.recallSn);
  const sourceUrl = resolveConsumer24RecallSourceUrl(row, recordId);

  return {
    source: "domestic_recall",
    recordId,
    productName: stripHtmlTags(asText(row.productNm)),
    brandName: stripHtmlTags(asText(row.bsnmNm) || asText(row.makr)),
    modelName: stripHtmlTags(asText(row.modlNmInfo)),
    noticeDate: asText(row.recallPublictBgnde) || asText(row.recallBgnde),
    recallType: asText(row.recallSe),
    sourceUrl,
    actionSummary: stripHtmlTags(asText(row.cnsmrGhvrTips) || asText(row.recallProcssInfo)),
    defectSummary: stripHtmlTags(asText(row.shrtcomCn)),
    hazardSummary: stripHtmlTags(asText(row.injryCauseResult) || asText(row.acdntCn)),
    productDescription: stripHtmlTags(asText(row.aditfield13) || asText(row.etcInfo)),
    imageUrls: parseImageUrls(row.recallImgUrls),
    raw: {
      ...row,
      provider: "Consumer24",
      cntntsId: CONSUMER24_AUTO_RECALL_MENU_ID,
    },
  };
}

function resolveConsumer24RecallSourceUrl(row: Record<string, unknown>, recordId: string): string {
  const originUrl = normalizeHttpUrlWithQuery(asText(row.infoOriginUrl));
  const createdUrl = normalizeHttpUrlWithQuery(asText(row.infoCreatUrl));
  return repairConsumer24RecallUrl(originUrl || createdUrl, recordId) || buildConsumer24RecallUrl(recordId);
}

function buildConsumer24RecallUrl(recordId: string): string {
  const url = new URL(recordId ? CONSUMER24_RECALL_DETAIL_URL : CONSUMER24_RECALL_LIST_URL);
  if (recordId) {
    url.searchParams.set("recallSn", recordId);
  } else {
    url.searchParams.set("searchCondition1", CONSUMER24_AUTO_RECALL_MENU_ID);
  }
  return url.toString();
}

function repairConsumer24RecallUrl(sourceUrl: string, recordId: string): string {
  if (!sourceUrl) return "";

  try {
    const parsed = new URL(sourceUrl);
    if (parsed.hostname !== "www.consumer.go.kr") return sourceUrl;

    const hasLegacyRecallDetail = parsed.pathname.endsWith("/consumer/safe/recall/selectRecallDetail.do");
    const hasLegacyRecallList = parsed.pathname.endsWith("/consumer/safe/recall/selectRecallList.do");
    if (!hasLegacyRecallDetail && !hasLegacyRecallList) return sourceUrl;

    const fallbackRecordId = parsed.searchParams.get("recallSn")?.trim() || recordId;
    return buildConsumer24RecallUrl(fallbackRecordId);
  } catch {
    return sourceUrl;
  }
}

function elementToRecord(xmlContent: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const regex = /<([^>]+)>([\s\S]*?)<\/\1>/g;
  let match;
  while ((match = regex.exec(xmlContent)) !== null) {
    let value = match[2].trim();
    if (value.startsWith("<![CDATA[") && value.endsWith("]]>")) {
      value = value.slice(9, -3).trim();
    }
    value = value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    out[match[1]] = value;
  }
  return out;
}

function extractXmlTags(xml: string, tagName: string): string[] {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, "g");
  const matches: string[] = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    matches.push(match[1]);
  }
  return matches;
}

function textFromFirst(xml: string, tagName: string): string {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`);
  const match = regex.exec(xml);
  if (!match) return "";
  let value = match[1].trim();
  if (value.startsWith("<![CDATA[") && value.endsWith("]]>")) {
    value = value.slice(9, -3).trim();
  }
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function emptyResult(params: {
  status: Consumer24Status;
  message: string;
  errorCode: string | null;
  httpStatus: number | null;
  query?: string;
  warnings?: string[];
}): Consumer24RecallFetchResult {
  return {
    status: params.status,
    message: params.message,
    errorCode: params.errorCode,
    certifications: [],
    items: [],
    excludedItems: [],
    query: params.query ?? "",
    httpStatus: params.httpStatus,
    certCount: 0,
    domesticCount: 0,
    foreignCount: 0,
    warnings: params.warnings ?? [],
  };
}

function formatConsumer24Queries(queries: Consumer24RecallQuery[]): string {
  return queries.map((query) => `auto.${query.key}=${query.value}`).join(", ");
}

function classifyConsumer24TransportError(error: unknown): { errorCode: string; message: string } {
  const message = asText((error as { message?: unknown } | null | undefined)?.message).toLowerCase();
  if (message.includes("abort") || message.includes("timeout")) {
    return {
      errorCode: "consumer24_timeout",
      message: `Consumer24 request timed out after ${CONSUMER24_FETCH_TIMEOUT_MS}ms.`,
    };
  }
  if (message.includes("network") || message.includes("connection") || message.includes("dns") || message.includes("socket")) {
    return {
      errorCode: "consumer24_network_error",
      message: "Consumer24 network request failed.",
    };
  }
  return {
    errorCode: "consumer24_request_failed",
    message: "Consumer24 request failed.",
  };
}

function normalizeConsumer24ErrorCode(rawCode: string): string {
  const code = rawCode.trim().toLowerCase();
  if (!code) return "consumer24_api_failed";
  if (code.startsWith("http_")) return `consumer24_${code}`;
  if (/^\d+$/.test(code)) return `consumer24_${code}`;
  return `consumer24_${code.replace(/[^a-z0-9_]+/g, "_")}`;
}

function sanitizeConsumer24Text(value: string): string {
  let out = value.trim();
  out = out.replace(
    /([?&]\s*(?:servicekey|authkey|api[_-]?key|access[_-]?key|secret)\s*=\s*)([^&\s]+)/gi,
    (_matched, prefix) => `${prefix}[REDACTED]`,
  );
  out = out.replace(/\b(?:servicekey|authkey|api[_-]?key|access[_-]?key|secret)\s*[:=]\s*([^\s,;]+)/gi, (matched) => {
    const separatorIndex = Math.max(matched.indexOf("="), matched.indexOf(":"));
    if (separatorIndex < 0) return matched;
    return `${matched.slice(0, separatorIndex + 1)} [REDACTED]`;
  });
  return out || "Consumer24 request failed.";
}

function parseImageUrls(value: unknown): string[] {
  const raw = asText(value);
  if (!raw) return [];

  return unique(
    raw
      .split(/[,|\n\r\t ]+/)
      .map((item) => normalizeHttpUrlWithQuery(item))
      .filter(Boolean),
  );
}

function normalizeHttpUrlWithQuery(value: string): string {
  const text = value.trim();
  if (!text || !/^https?:\/\//i.test(text)) return "";
  try {
    const parsed = new URL(text);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function normalizeServiceKey(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if ((first === "\"" && last === "\"") || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function normalizeQueryValue(value: unknown): string {
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, 80);
}

function dedupeByKey<T>(items: T[], keyFn: (item: T) => string): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function asText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function stripHtmlTags(html: string): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/?([a-z]+)([^>]*)>/gim, '')
    .trim()
    .replace(/\n{2,}/g, '\n')
    .trim();
}
