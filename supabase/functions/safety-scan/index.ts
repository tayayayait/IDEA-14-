import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { STRATEGIC_HSK_MAP } from "./strategic-hsk-map.ts";
import {
  fetchConsumer24AutoRecallCases,
  isAutomobileSafetySearch,
} from "./consumer24-recall.ts";
import {
  buildSafetyKoreaRequests,
  filterSafetyRecallMatches,
  normalizeSafetySearchInput,
  RECALL_NO_MATCH_MESSAGE,
  RECALL_REVIEW_REQUIRED_ACTION,
  type SafetyKoreaRequestSpec,
  type SafetySearchInput,
} from "./safety-search.ts";

type SafetyStatus = "success" | "empty" | "error" | "key_missing";
type StrategicStatus = "success" | "empty";

type SafetySource = "domestic_recall" | "foreign_recall";

type SafetyItem = {
  source: SafetySource;
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

type SafetyCertification = {
  certUid: string;
  certNum: string;
  certState: string;
  certDate: string;
  productName: string;
  brandName: string;
  modelName: string;
  categoryName: string;
  makerName: string;
  makerCntryName: string;
  importerName: string;
  sourceUrl: string;
  imageUrls: string[];
  raw: Record<string, unknown>;
};

type SafetyFetchResult = {
  status: SafetyStatus;
  message: string;
  errorCode: string | null;
  certifications: SafetyCertification[];
  items: SafetyItem[];
  excludedItems: SafetyItem[];
  query: string;
  httpStatus: number | null;
  certCount: number;
  domesticCount: number;
  foreignCount: number;
  warnings: string[];
};

type StrategicOutcome = {
  severity: "info" | "warn";
  summary: string;
  recommendedAction: string;
  status: StrategicStatus;
  raw: Record<string, unknown>;
};

type SafetyKoreaEnvelope = {
  resultCode: string;
  resultMsg: string;
  resultData: unknown;
};

type SafetyApiResult = {
  ok: boolean;
  code: string;
  message: string;
  errorCode: string | null;
  status: number | null;
  data: unknown;
};

const SAFETYKOREA_BASE_URL = "http://www.safetykorea.kr";
const SAFETYKOREA_OPENAPI_PAGE = "https://www.safetykorea.kr/release/openapi";
const SAFETYKOREA_RECALL_PAGE = "https://www.safetykorea.kr/recall/recallList";
const SAFETYKOREA_CERT_LIST_URL = `${SAFETYKOREA_BASE_URL}/openapi/api/cert/certificationList.json`;
const SAFETYKOREA_CERT_DETAIL_URL = `${SAFETYKOREA_BASE_URL}/openapi/api/cert/certificationDetail.json`;
const SAFETYKOREA_RECALL_LIST_URL = `${SAFETYKOREA_BASE_URL}/openapi/api/recall/recallList.json`;
const SAFETYKOREA_RECALL_DETAIL_URL = `${SAFETYKOREA_BASE_URL}/openapi/api/recall/recallDetail.json`;
const SAFETYKOREA_FOREIGN_RECALL_LIST_URL = `${SAFETYKOREA_BASE_URL}/openapi/api/recall/fRecallList.json`;
const CONSUMER24_OPENAPI_PAGE = "https://www.consumer.go.kr/user/ftc/consumer/openApiSvcUser/120/selectOpenApiSvcList.do";
const SOURCE_DATE = "2026-04-24";
const EXTERNAL_FETCH_TIMEOUT_MS = 10000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = asRecord(await req.json().catch(() => ({})));
    const lookupMode = body.lookup === true;
    const projectId = asText(body.project_id);

    const auth = req.headers.get("Authorization") ?? "";
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );

    const { data: userData } = await supa.auth.getUser();
    if (!userData.user) return json({ error: "unauthorized" }, 401);

    if (lookupMode) {
      const rawSearch = asRecord(body.search);
      const safetySearch = normalizeSafetySearchInput({
        productName: rawSearch.productName,
        modelName: rawSearch.modelName,
        brandName: rawSearch.brandName,
        certNum: rawSearch.certNum,
        barcodeNum: rawSearch.barcodeNum,
      });
      const useConsumer24AutoRecall = isAutomobileSafetySearch(safetySearch, []);
      const safetyProvider = useConsumer24AutoRecall
        ? {
            label: "Consumer24 auto recall",
            sourceOrg: "Consumer24",
            sourceUrl: CONSUMER24_OPENAPI_PAGE,
          }
        : {
            label: "SafetyKorea",
            sourceOrg: "KATS SafetyKorea",
            sourceUrl: SAFETYKOREA_OPENAPI_PAGE,
          };
      const safetyResult = useConsumer24AutoRecall
        ? await fetchConsumer24AutoRecallCases({
            apiKey: resolveConsumer24AutoRecallApiKey(),
            search: safetySearch,
            fallbackTokens: [],
          })
        : await fetchSafetyKoreaCases({
            apiKey: resolveSafetyKoreaApiKey(),
            search: safetySearch,
            fallbackTokens: [],
          });
      const sortedItems = [...safetyResult.items].sort((a, b) => compareDateDesc(a.noticeDate, b.noticeDate));
      const sortedExcludedItems = [...safetyResult.excludedItems].sort((a, b) => compareDateDesc(a.noticeDate, b.noticeDate));

      return json({
        state: mapStandaloneSafetyState(safetyResult.status),
        message: sanitizeSensitiveText(safetyResult.message),
        provider: safetyProvider.label,
        source_org: safetyProvider.sourceOrg,
        source_url: safetyProvider.sourceUrl,
        status: safetyResult.status,
        query: safetyResult.query || null,
        cert_count: safetyResult.certCount,
        domestic_recall_count: safetyResult.domesticCount,
        foreign_recall_count: safetyResult.foreignCount,
        certifications: safetyResult.certifications.slice(0, 20),
        domestic_recalls: sortedItems.filter((item) => item.source === "domestic_recall").slice(0, 20),
        foreign_recalls: sortedItems.filter((item) => item.source === "foreign_recall").slice(0, 20),
        excluded_domestic_recalls: sortedExcludedItems.filter((item) => item.source === "domestic_recall").slice(0, 20),
        excluded_foreign_recalls: sortedExcludedItems.filter((item) => item.source === "foreign_recall").slice(0, 20),
        warnings: safetyResult.warnings.map(sanitizeSensitiveText),
      });
    }

    if (!projectId) return json({ error: "missing project_id" }, 400);

    const { data: product } = await supa
      .from("project_products")
      .select("hs_code,hsk_code,name,description,components")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    await supa.from("project_safety_flags").delete().eq("project_id", projectId);

    const strategic = buildStrategicOutcome(product?.hs_code, product?.hsk_code);
    const productMeta = parseProductMeta(product?.components);
    const safetySearch = normalizeSafetySearchInput({
      productName: productMeta.safetySearch.productName || asText(product?.name),
      modelName: productMeta.safetySearch.modelName || productMeta.modelName,
      brandName: productMeta.safetySearch.brandName,
      certNum: productMeta.safetySearch.certNum,
      barcodeNum: productMeta.safetySearch.barcodeNum,
    });

    const useConsumer24AutoRecall = isAutomobileSafetySearch(safetySearch, productMeta.tags);
    const safetyProvider = useConsumer24AutoRecall
      ? {
          label: "Consumer24 auto recall",
          apiKeyName: "consumer24_auto_recall",
          sourceOrg: "Consumer24",
          sourceUrl: CONSUMER24_OPENAPI_PAGE,
        }
      : {
          label: "SafetyKorea",
          apiKeyName: "safetykorea_recall",
          sourceOrg: "KATS SafetyKorea",
          sourceUrl: SAFETYKOREA_OPENAPI_PAGE,
        };
    const safetyResult = useConsumer24AutoRecall
      ? await fetchConsumer24AutoRecallCases({
          apiKey: resolveConsumer24AutoRecallApiKey(),
          search: safetySearch,
          fallbackTokens: productMeta.tags,
        })
      : await fetchSafetyKoreaCases({
          apiKey: resolveSafetyKoreaApiKey(),
          search: safetySearch,
          fallbackTokens: productMeta.tags,
        });

    const flags: Array<Record<string, unknown>> = [];

    flags.push({
      project_id: projectId,
      user_id: userData.user.id,
      flag_type: "strategic",
      severity: strategic.severity,
      summary: strategic.summary,
      recommended_action: strategic.recommendedAction,
      source_org: "Trade Security Institute (YESTrade)",
      source_url: "https://www.yestrade.go.kr/",
      raw: strategic.raw,
    });

    if (safetyResult.status === "success") {
      const sortedItems = [...safetyResult.items].sort((a, b) => compareDateDesc(a.noticeDate, b.noticeDate));
      const sortedExcludedItems = [...safetyResult.excludedItems].sort((a, b) => compareDateDesc(a.noticeDate, b.noticeDate));
      const topItems = sortedItems.slice(0, 5);

      for (const item of topItems) {
        const matchBasis = item.matchBasis ?? [];
        flags.push({
          project_id: projectId,
          user_id: userData.user.id,
          flag_type: "recall",
          severity: "warn",
          summary: `${item.source === "domestic_recall" ? "국내 리콜" : "국외 리콜"} 매칭: ${item.productName || "제품명 없음"} (${item.noticeDate || "공표일 없음"})`,
          recommended_action: item.actionSummary || "리콜 공지의 모델·로트 일치 여부를 확인하고 출하 전 보류·교환·환불 범위를 검토하세요.",
          source_org: safetyProvider.sourceOrg,
          source_url: item.sourceUrl || safetyProvider.sourceUrl,
          raw: {
            match_type: matchBasis.join(", ") || classifyNameMatch(item.productName, safetySearch.productName, safetySearch.modelName),
            match_basis: matchBasis,
            query: safetyResult.query,
            matched_name: item.productName,
            model_name: item.modelName || null,
            notice_date: item.noticeDate || null,
            source_record_id: item.recordId || null,
            source: item.source,
            recall_type: item.recallType || null,
            brand_name: item.brandName || null,
            defect_summary: item.defectSummary || null,
            hazard_summary: item.hazardSummary || null,
            product_description: item.productDescription || null,
            image_urls: item.imageUrls,
          },
        });
      }

      const recallCount = safetyResult.domesticCount + safetyResult.foreignCount;
      const severity = recallCount > 0 ? "warn" : "info";
      const summary = recallCount > 0
        ? `${safetyProvider.label} 조회 결과: 인증 ${safetyResult.certCount}건, 국내 리콜 ${safetyResult.domesticCount}건, 국외 리콜 ${safetyResult.foreignCount}건`
        : `${safetyProvider.label} 조회 결과: 인증 ${safetyResult.certCount}건, 국내 리콜 0건, 국외 리콜 0건 · ${RECALL_NO_MATCH_MESSAGE}`;
      flags.push({
        project_id: projectId,
        user_id: userData.user.id,
        flag_type: "product_safety",
        severity,
        summary,
        recommended_action:
          recallCount > 0
            ? "리콜 공지의 모델·로트 일치 여부를 확인하고 출하 전 보류·교환·환불 등 조치 범위를 검토하세요."
            : RECALL_REVIEW_REQUIRED_ACTION,
        source_org: safetyProvider.sourceOrg,
        source_url: safetyProvider.sourceUrl,
        raw: {
          safety_cert_required:
            useConsumer24AutoRecall
              ? "자동차 리콜 API 조회 대상"
              : safetyResult.certCount > 0
                ? `KC 인증 기록 ${safetyResult.certCount}건`
                : "입력 조건 기준 KC 인증 기록 없음",
          safety_provider: safetyProvider.label,
          query: safetyResult.query,
          cert_match_count: safetyResult.certCount,
          domestic_recall_count: safetyResult.domesticCount,
          foreign_recall_count: safetyResult.foreignCount,
          safety_search: safetySearch,
          certifications: safetyResult.certifications.slice(0, 10),
          domestic_recalls: sortedItems.filter((item) => item.source === "domestic_recall").slice(0, 10),
          foreign_recalls: sortedItems.filter((item) => item.source === "foreign_recall").slice(0, 10),
          excluded_domestic_recalls: sortedExcludedItems.filter((item) => item.source === "domestic_recall").slice(0, 10),
          excluded_foreign_recalls: sortedExcludedItems.filter((item) => item.source === "foreign_recall").slice(0, 10),
          excluded_recall_count: sortedExcludedItems.length,
          recall_no_match_message: recallCount === 0 ? RECALL_NO_MATCH_MESSAGE : null,
          warning_messages: safetyResult.warnings,
        },
      });
    } else {
      const summary =
        safetyResult.status === "key_missing"
          ? `${safetyProvider.label} API 키 미등록`
          : safetyResult.status === "empty"
            ? RECALL_NO_MATCH_MESSAGE
            : `${safetyProvider.label} 오류 (${safetyResult.errorCode ?? "product_safety_api_failed"})`;

      flags.push({
        project_id: projectId,
        user_id: userData.user.id,
        flag_type: "product_safety",
        severity: safetyResult.status === "error" ? "warn" : "info",
        summary,
        recommended_action:
          safetyResult.status === "error"
            ? `${safetyProvider.label} 조회를 다시 실행하고 서비스키, 호출 조건, 제공기관 상태를 확인하세요.`
            : RECALL_REVIEW_REQUIRED_ACTION,
        source_org: safetyProvider.sourceOrg,
        source_url: safetyProvider.sourceUrl,
        raw: {
          safety_cert_required: useConsumer24AutoRecall ? "자동차 리콜 API 조회 대상" : "확실한 정보 없음",
          safety_provider: safetyProvider.label,
          query: safetyResult.query || null,
          message: sanitizeSensitiveText(safetyResult.message),
          error_code: safetyResult.errorCode,
          cert_match_count: safetyResult.certCount,
          domestic_recall_count: safetyResult.domesticCount,
          foreign_recall_count: safetyResult.foreignCount,
          safety_search: safetySearch,
          certifications: safetyResult.certifications.slice(0, 10),
          domestic_recalls: [],
          foreign_recalls: [],
          excluded_domestic_recalls: safetyResult.excludedItems.filter((item) => item.source === "domestic_recall").slice(0, 10),
          excluded_foreign_recalls: safetyResult.excludedItems.filter((item) => item.source === "foreign_recall").slice(0, 10),
          excluded_recall_count: safetyResult.excludedItems.length,
          recall_no_match_message: safetyResult.status === "empty" ? RECALL_NO_MATCH_MESSAGE : null,
          warning_messages: safetyResult.warnings,
        },
      });
    }

    await supa.from("project_safety_flags").insert(flags);

    await supa.from("api_call_logs").insert([
      {
        user_id: userData.user.id,
        project_id: projectId,
        api_key_name: "trade_security_hsk_strategic",
        status: strategic.status,
        http_status: 200,
        response_count: strategic.raw.match_type === "none" ? 0 : 1,
        error_code: null,
        detail: {
          hs_code: asText(strategic.raw.hs_code),
          hsk_code: asText(strategic.raw.hsk_code),
          match_type: asText(strategic.raw.match_type),
          control_no: asText(strategic.raw.control_no) || null,
        },
        message: `match_type=${asText(strategic.raw.match_type)}, hs=${asText(strategic.raw.hs_code)}, hsk=${asText(strategic.raw.hsk_code)}, control_no=${asText(strategic.raw.control_no) || "N/A"}`,
      },
      {
        user_id: userData.user.id,
        project_id: projectId,
        api_key_name: safetyProvider.apiKeyName,
        status: mapSafetyStatusToApiState(safetyResult.status),
        http_status: safetyResult.httpStatus,
        response_count: safetyResult.certifications.length + safetyResult.items.length,
        error_code: safetyResult.status === "error" || safetyResult.status === "key_missing"
          ? (safetyResult.errorCode ?? "product_safety_api_failed")
          : null,
        detail: {
          query: safetyResult.query || null,
          item_count: safetyResult.certifications.length + safetyResult.items.length,
          excluded_recall_count: safetyResult.excludedItems.length,
          cert_count: safetyResult.certCount,
          domestic_recall_count: safetyResult.domesticCount,
          foreign_recall_count: safetyResult.foreignCount,
          safety_search: safetySearch,
          status: safetyResult.status,
          error_code: safetyResult.errorCode,
          warning_messages: safetyResult.warnings,
        },
        message: sanitizeSensitiveText(safetyResult.message),
      },
    ]);

    await supa.from("projects").update({ current_step: 5 }).eq("id", projectId);

    const state = deriveScanState(strategic.status, safetyResult.status);
    return json({
      state,
      strategic_status: strategic.status,
      safety_status: safetyResult.status,
      scanned_at: new Date().toISOString(),
      recall_count: safetyResult.items.length,
      message: buildScanResultMessage(state, strategic.status, safetyResult.status, safetyResult.items.length, safetyProvider.label),
    });
  } catch (error) {
    const failure = classifyTransportError(error);
    return json({ error: failure.message, error_code: failure.errorCode }, 500);
  }
});

async function fetchSafetyKoreaCases(params: {
  apiKey: string;
  search: SafetySearchInput;
  fallbackTokens: string[];
}): Promise<SafetyFetchResult> {
  if (!params.apiKey.trim()) {
    return {
      status: "key_missing",
      message: "SafetyKorea API 키가 등록되지 않았습니다.",
      errorCode: "safetykorea_api_key_missing",
      certifications: [],
      items: [],
      excludedItems: [],
      query: "",
      httpStatus: null,
      certCount: 0,
      domesticCount: 0,
      foreignCount: 0,
      warnings: [],
    };
  }

  const requests = buildSafetyKoreaRequests(params.search, params.fallbackTokens);
  const queryText = formatSafetyRequests(requests);
  if (requests.length === 0) {
    return {
      status: "empty",
      message: "SafetyKorea 조회 조건이 없습니다.",
      errorCode: null,
      certifications: [],
      items: [],
      excludedItems: [],
      query: "",
      httpStatus: 200,
      certCount: 0,
      domesticCount: 0,
      foreignCount: 0,
      warnings: [],
    };
  }

  let successfulCallCount = 0;
  let failedCallCount = 0;
  let lastHttpStatus: number | null = null;
  let firstErrorCode: string | null = null;
  const warnings: string[] = [];

  const certItems: SafetyCertification[] = [];
  const domesticItems: SafetyItem[] = [];
  const foreignItems: SafetyItem[] = [];

  for (const request of requests) {
    const response = await fetchSafetyRequest(params.apiKey, request);
    if (response.ok) {
      successfulCallCount += 1;
      if (request.scope === "cert") {
        certItems.push(...(response.items as SafetyCertification[]));
      } else if (request.scope === "domestic") {
        domesticItems.push(...(response.items as SafetyItem[]));
      } else {
        foreignItems.push(...(response.items as SafetyItem[]));
      }
    } else {
      failedCallCount += 1;
      warnings.push(formatSafetyWarning(endpointNameForRequest(request), response));
      if (!firstErrorCode) firstErrorCode = response.errorCode;
    }
    if (response.status != null) lastHttpStatus = response.status;
  }

  const dedupedCerts = dedupeByKey(certItems, (item) => `cert|${item.certNum || item.certUid}`);
  const certDetailMap = await fetchCertificationDetailMap(params.apiKey, dedupedCerts.slice(0, 5));
  const enrichedCerts = dedupedCerts.map((item) => mergeCertificationDetail(item, certDetailMap.get(item.certNum)));

  const dedupedDomestic = dedupeByKey(domesticItems, (item) => `domestic|${item.recordId}`);
  const detailMap = await fetchDomesticRecallDetailMap(params.apiKey, dedupedDomestic.slice(0, 5));
  const enrichedDomestic = dedupedDomestic.map((item) => mergeDomesticDetail(item, detailMap.get(item.recordId)));

  const dedupedForeign = dedupeByKey(foreignItems, (item) => `foreign|${item.recordId}`);
  const domesticFilter = filterSafetyRecallMatches(enrichedDomestic, params.search);
  const foreignFilter = filterSafetyRecallMatches(dedupedForeign, params.search);
  const filteredDomestic = domesticFilter.included;
  const filteredForeign = foreignFilter.included;
  const excludedItems = [...domesticFilter.excluded, ...foreignFilter.excluded];
  const allItems = [...filteredDomestic, ...filteredForeign];
  if (excludedItems.length > 0) {
    warnings.push(`SafetyKorea final recall filter excluded ${excludedItems.length} brand-only or product/model-mismatched candidate(s).`);
  }

  if (successfulCallCount === 0 && failedCallCount > 0) {
    return {
      status: "error",
      message: sanitizeSensitiveText(warnings[0] ?? "SafetyKorea API request failed."),
      errorCode: firstErrorCode ?? "safetykorea_api_failed",
      certifications: [],
      items: [],
      excludedItems: [],
      query: queryText,
      httpStatus: lastHttpStatus,
      certCount: 0,
      domesticCount: 0,
      foreignCount: 0,
      warnings,
    };
  }

  if (enrichedCerts.length > 0 || allItems.length > 0) {
    const recallMessage = allItems.length > 0 ? "" : ` · ${RECALL_NO_MATCH_MESSAGE}`;
    return {
      status: "success",
      message: `SafetyKorea 조회 결과: KC 인증 ${enrichedCerts.length}건, 국내 리콜 ${filteredDomestic.length}건, 국외 리콜 ${filteredForeign.length}건${recallMessage}`,
      errorCode: null,
      certifications: enrichedCerts,
      items: allItems,
      excludedItems,
      query: queryText,
      httpStatus: lastHttpStatus ?? 200,
      certCount: enrichedCerts.length,
      domesticCount: filteredDomestic.length,
      foreignCount: filteredForeign.length,
      warnings,
    };
  }

  return {
    status: "empty",
    message: RECALL_NO_MATCH_MESSAGE,
    errorCode: null,
    certifications: [],
    items: [],
    excludedItems,
    query: queryText,
    httpStatus: lastHttpStatus ?? 200,
    certCount: 0,
    domesticCount: 0,
    foreignCount: 0,
    warnings,
  };
}

type SafetyEndpointResult<T> = {
  ok: boolean;
  status: number | null;
  message: string;
  errorCode: string | null;
  items: T;
};

async function fetchSafetyRequest(
  apiKey: string,
  request: SafetyKoreaRequestSpec,
): Promise<SafetyEndpointResult<SafetyCertification[] | SafetyItem[]>> {
  if (request.scope === "cert") return fetchCertList(apiKey, request);
  if (request.scope === "domestic") return fetchDomesticRecallList(apiKey, request);
  return fetchForeignRecallList(apiKey, request);
}

async function fetchCertList(
  apiKey: string,
  request: SafetyKoreaRequestSpec,
): Promise<SafetyEndpointResult<SafetyCertification[]>> {
  const url = new URL(SAFETYKOREA_CERT_LIST_URL);
  url.searchParams.set("conditionKey", request.conditionKey);
  url.searchParams.set("conditionValue", request.conditionValue);

  const result = await requestSafetyKorea(apiKey, url);
  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      message: sanitizeSensitiveText(result.message),
      errorCode: result.errorCode ?? normalizeErrorCode(result.code),
      items: [],
    };
  }

  const items = asArray(result.data)
    .map(asRecord)
    .map(mapCertificationItem)
    .filter((item) => Boolean(item.certNum || item.certUid));
  return { ok: true, status: result.status, message: result.message, errorCode: null, items };
}

async function fetchDomesticRecallList(
  apiKey: string,
  request: SafetyKoreaRequestSpec,
): Promise<SafetyEndpointResult<SafetyItem[]>> {
  const url = new URL(SAFETYKOREA_RECALL_LIST_URL);
  url.searchParams.set("conditionKey", request.conditionKey);
  url.searchParams.set("conditionValue", request.conditionValue);

  const result = await requestSafetyKorea(apiKey, url);
  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      message: sanitizeSensitiveText(result.message),
      errorCode: result.errorCode ?? normalizeErrorCode(result.code),
      items: [],
    };
  }

  const rows = asArray(result.data).map(asRecord);
  const items = rows
    .map(mapDomesticRecallItem)
    .filter((item) => Boolean(item.recordId && (item.productName || item.modelName)));

  return { ok: true, status: result.status, message: result.message, errorCode: null, items };
}

async function fetchForeignRecallList(
  apiKey: string,
  request: SafetyKoreaRequestSpec,
): Promise<SafetyEndpointResult<SafetyItem[]>> {
  const url = new URL(SAFETYKOREA_FOREIGN_RECALL_LIST_URL);
  url.searchParams.set("conditionKey", request.conditionKey);
  url.searchParams.set("conditionValue", request.conditionValue);

  const result = await requestSafetyKorea(apiKey, url);
  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      message: sanitizeSensitiveText(result.message),
      errorCode: result.errorCode ?? normalizeErrorCode(result.code),
      items: [],
    };
  }

  const rows = asArray(result.data).map(asRecord);
  const items = rows
    .map(mapForeignRecallItem)
    .filter((item) => Boolean(item.recordId && (item.productName || item.modelName)));

  return { ok: true, status: result.status, message: result.message, errorCode: null, items };
}

async function fetchCertificationDetailMap(
  apiKey: string,
  items: SafetyCertification[],
): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const item of items) {
    const certNum = item.certNum.trim();
    if (!certNum) continue;

    const url = new URL(SAFETYKOREA_CERT_DETAIL_URL);
    url.searchParams.set("certNum", certNum);

    const result = await requestSafetyKorea(apiKey, url);
    if (!result.ok) continue;

    const detail = asRecord(result.data);
    if (Object.keys(detail).length === 0) continue;
    map.set(certNum, detail);
  }
  return map;
}

function mergeCertificationDetail(
  item: SafetyCertification,
  detail: Record<string, unknown> | undefined,
): SafetyCertification {
  if (!detail) return item;

  const merged = {
    ...item,
    certUid: asText(detail.certUid) || item.certUid,
    certNum: asText(detail.certNum) || item.certNum,
    certState: asText(detail.certState) || item.certState,
    certDate: asText(detail.certDate) || item.certDate,
    productName: asText(detail.productName) || item.productName,
    brandName: asText(detail.brandName) || item.brandName,
    modelName: asText(detail.modelName) || item.modelName,
    categoryName: asText(detail.categoryName) || item.categoryName,
    makerName: asText(detail.makerName) || item.makerName,
    makerCntryName: asText(detail.makerCntryName) || item.makerCntryName,
    importerName: asText(detail.importerName) || item.importerName,
    imageUrls: parseImageUrls(detail.certificationImageUrls).length > 0
      ? parseImageUrls(detail.certificationImageUrls)
      : item.imageUrls,
    raw: {
      ...item.raw,
      detail,
    },
  };

  return {
    ...merged,
    sourceUrl: buildCertificationSourceUrl(merged.certNum),
  };
}

async function fetchDomesticRecallDetailMap(
  apiKey: string,
  items: SafetyItem[],
): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const item of items) {
    const recallUid = item.recordId.trim();
    if (!recallUid) continue;

    const url = new URL(SAFETYKOREA_RECALL_DETAIL_URL);
    url.searchParams.set("recallUid", recallUid);

    const result = await requestSafetyKorea(apiKey, url);
    if (!result.ok) continue;

    const detail = asRecord(result.data);
    if (Object.keys(detail).length === 0) continue;
    map.set(recallUid, detail);
  }
  return map;
}

function mergeDomesticDetail(item: SafetyItem, detail: Record<string, unknown> | undefined): SafetyItem {
  if (!detail) return item;

  const actionSummary = asText(detail.publishActionDscr) || item.actionSummary;
  // recallUid 기반 상세 URL을 우선 사용하고, 없으면 detail.recallUrl, 없으면 기존 item.sourceUrl 유지
  const detailUrlFromApi = normalizeHttpUrlWithQuery(asText(detail.recallUrl));
  const resolvedSourceUrl = buildRecallDetailUrl(item.recordId) || detailUrlFromApi || item.sourceUrl;
  const imageUrls = [
    ...item.imageUrls,
    ...parseImageUrls(detail.recallFiles),
    ...parseImageUrls(detail.imageUrl),
  ];

  return {
    ...item,
    sourceUrl: resolvedSourceUrl,
    actionSummary,
    defectSummary: asText(detail.harmDscr) || item.defectSummary,
    hazardSummary: asText(detail.accidentCaseDscr) || item.hazardSummary,
    productDescription: asText(detail.recallProductDscr) || item.productDescription,
    imageUrls: unique(imageUrls),
    raw: {
      ...item.raw,
      detail,
    },
  };
}

async function requestSafetyKorea(apiKey: string, url: URL): Promise<SafetyApiResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EXTERNAL_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { AuthKey: apiKey },
      signal: controller.signal,
    });

    const status = response.status;
    const text = await response.text();

    if (!response.ok) {
      return {
        ok: false,
        code: `http_${status}`,
        message: `SafetyKorea HTTP ${status}`,
        errorCode: normalizeErrorCode(`http_${status}`),
        status,
        data: null,
      };
    }

    const parsed = safeParseJson(text);
    if (!parsed) {
      return {
        ok: false,
        code: "invalid_json",
        message: "SafetyKorea returned an invalid JSON response.",
        errorCode: "safetykorea_invalid_json",
        status,
        data: null,
      };
    }

    const envelope = normalizeSafetyEnvelope(parsed);
    const code = envelope.resultCode;
    const message = sanitizeSensitiveText(envelope.resultMsg || "");

    if (code === "2000") {
      return { ok: true, code, message: message || "Success", errorCode: null, status, data: envelope.resultData };
    }

    if (code === "2004") {
      return { ok: true, code, message: message || "No Data", errorCode: null, status, data: [] };
    }

    const mapped = mapSafetyKoreaProviderError(code);
    return {
      ok: false,
      code,
      message: mapped.message,
      errorCode: mapped.errorCode,
      status,
      data: envelope.resultData,
    };
  } catch (error) {
    const failure = classifyTransportError(error);
    return {
      ok: false,
      code: failure.errorCode,
      message: failure.message,
      errorCode: failure.errorCode,
      status: null,
      data: null,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeSafetyEnvelope(value: Record<string, unknown>): SafetyKoreaEnvelope {
  return {
    resultCode: asText(value.resultCode),
    resultMsg: asText(value.resultMsg),
    resultData: value.resultData,
  };
}

function mapCertificationItem(row: Record<string, unknown>): SafetyCertification {
  const certNum = asText(row.certNum);
  return {
    certUid: asText(row.certUid),
    certNum,
    certState: asText(row.certState),
    certDate: asText(row.certDate),
    productName: asText(row.productName),
    brandName: asText(row.brandName),
    modelName: asText(row.modelName),
    categoryName: asText(row.categoryName),
    makerName: asText(row.makerName),
    makerCntryName: asText(row.makerCntryName),
    importerName: asText(row.importerName),
    sourceUrl: buildCertificationSourceUrl(certNum),
    imageUrls: parseImageUrls(row.certificationImageUrls),
    raw: row,
  };
}

function mapDomesticRecallItem(row: Record<string, unknown>): SafetyItem {
  const recallUid = asText(row.recallUid);
  return {
    source: "domestic_recall",
    recordId: recallUid,
    productName: asText(row.recallProductName),
    brandName: asText(row.recallBrandName),
    modelName: asText(row.recallModelName),
    noticeDate: asText(row.publishDate),
    recallType: asText(row.recallTypeName),
    sourceUrl: buildRecallDetailUrl(recallUid) || normalizeHttpUrlWithQuery(asText(row.recallUrl)) || SAFETYKOREA_RECALL_PAGE,
    actionSummary: asText(row.publishActionDscr),
    defectSummary: asText(row.harmDscr),
    hazardSummary: asText(row.accidentCaseDscr),
    productDescription: asText(row.recallProductDscr),
    imageUrls: [...parseImageUrls(row.recallFiles), ...parseImageUrls(row.imageUrl)],
    raw: row,
  };
}

function mapForeignRecallItem(row: Record<string, unknown>): SafetyItem {
  const fRecallUid = asText(row.fRecallUid);
  return {
    source: "foreign_recall",
    recordId: fRecallUid,
    productName: asText(row.recallProductName),
    brandName: asText(row.recallBrandName),
    modelName: asText(row.recallModelName),
    noticeDate: asText(row.publishDate),
    recallType: asText(row.recallTypeName),
    sourceUrl: buildForeignRecallDetailUrl(fRecallUid) || normalizeHttpUrlWithQuery(asText(row.recallUrl)) || SAFETYKOREA_RECALL_PAGE,
    actionSummary: asText(row.publishActionDscr),
    defectSummary: asText(row.violateDscr),
    hazardSummary: asText(row.accidentCaseDscr),
    productDescription: asText(row.recallProductDscr),
    imageUrls: parseImageUrls(row.imageUrl),
    raw: row,
  };
}

function formatSafetyRequests(requests: SafetyKoreaRequestSpec[]): string {
  return requests
    .map((request) => `${request.scope}.${request.conditionKey}=${request.conditionValue}`)
    .join(", ");
}

function endpointNameForRequest(
  request: SafetyKoreaRequestSpec,
): "certificationList" | "recallList" | "fRecallList" {
  if (request.scope === "cert") return "certificationList";
  if (request.scope === "domestic") return "recallList";
  return "fRecallList";
}

function buildCertificationSourceUrl(certNum: string): string {
  if (!certNum) return SAFETYKOREA_OPENAPI_PAGE;
  return `https://www.safetykorea.kr/search/searchPop?certNum=${encodeURIComponent(certNum)}`;
}

/** 국내 리콜 상세 페이지 URL 생성 (recallUid 기반) */
function buildRecallDetailUrl(recallUid: string): string {
  if (!recallUid) return "";
  return `https://www.safetykorea.kr/recall/ajax/recallBoard?recallUid=${encodeURIComponent(recallUid)}`;
}

/** 국외 리콜 상세 페이지 URL 생성 (fRecallUid 기반) */
function buildForeignRecallDetailUrl(fRecallUid: string): string {
  if (!fRecallUid) return "";
  return `https://www.safetykorea.kr/recall/ajax/fRecallBoard?recallUid=${encodeURIComponent(fRecallUid)}`;
}

/** API에서 받은 recallUrl 등 쿼리스트링을 보존하되 해시만 제거하는 URL 정규화 */
function normalizeHttpUrlWithQuery(value: string): string {
  const text = value.trim();
  if (!text) return "";
  if (!/^https?:\/\//i.test(text)) return "";
  try {
    const parsed = new URL(text);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function parseImageUrls(value: unknown): string[] {
  const candidates: string[] = [];

  if (typeof value === "string") {
    candidates.push(...value.split(","));
  } else if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") {
        candidates.push(item);
      } else {
        const record = asRecord(item);
        candidates.push(asText(record.imageUrl), asText(record.url));
      }
    }
  } else {
    const record = asRecord(value);
    candidates.push(asText(record.imageUrl), asText(record.url));
  }

  return unique(
    candidates
      .map((item) => normalizeHttpUrl(item))
      .filter(Boolean),
  );
}

function resolveSafetyKoreaApiKey(): string {
  return normalizeAuthKeyValue(
    Deno.env.get("SAFETYKOREA_API_KEY") ||
    Deno.env.get("SAFETYKOREA_AUTH_KEY") ||
    "",
  );
}

function resolveConsumer24AutoRecallApiKey(): string {
  return normalizeAuthKeyValue(Deno.env.get("CONSUMER24_AUTO_RECALL_API_KEY") || "");
}

function normalizeAuthKeyValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;

  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if ((first === "\"" && last === "\"") || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function normalizeCode(value: unknown): string {
  return asText(value).replace(/\D/g, "");
}

function buildStrategicOutcome(hsCodeRaw: unknown, hskCodeRaw: unknown): StrategicOutcome {
  const hsCode = normalizeCode(hsCodeRaw);
  const hskCode = normalizeCode(hskCodeRaw);

  const baseAction = "수출 전 전략물자관리원(YESTrade)에서 전략물자 해당 여부를 사전 확인하세요.";

  if (hskCode && STRATEGIC_HSK_MAP[hskCode]) {
    const entry = STRATEGIC_HSK_MAP[hskCode];
    const controlNo = entry.controlNos.join(", ");
    return {
      severity: "warn",
      summary: `HSK ${hskCode} 기준 전략물자 연계 품목과 일치합니다.`,
      recommendedAction: `${baseAction} 통제번호 후보: ${controlNo}.`,
      status: "success",
      raw: {
        hs_code: hsCode || null,
        hsk_code: hskCode,
        match_type: "exact_hsk",
        control_no: controlNo,
        control_no_list: entry.controlNos,
        item_name_ko: entry.hskName || null,
        item_name_en: entry.hskNameEn || null,
        source: "Trade Security Institute HSK linkage",
        source_date: SOURCE_DATE,
      },
    };
  }

  const prefix6 = (hskCode || hsCode).slice(0, 6);
  if (prefix6.length === 6) {
    const matched = findByPrefix(prefix6);
    if (matched.length > 0) {
      const controlNos = unique(matched.flatMap((item) => item.controlNos));
      return {
        severity: "warn",
        summary: `HS6 ${prefix6} 기준 전략물자 후보 ${matched.length}건이 매칭되었습니다.`,
        recommendedAction: `${baseAction} 최종 10단위 HSK와 통제번호는 기관 검토로 확정해야 합니다.`,
        status: "success",
        raw: {
          hs_code: hsCode || null,
          hsk_code: hskCode || null,
          match_type: "prefix6_candidate",
          prefix6,
          candidate_count: matched.length,
          control_no: controlNos.slice(0, 10).join(", "),
          control_no_list: controlNos.slice(0, 20),
          candidate_hsk_list: matched.slice(0, 20).map((item) => item.hsk),
          source: "Trade Security Institute HSK linkage",
          source_date: SOURCE_DATE,
        },
      };
    }
  }

  return {
    severity: "info",
    summary: "입력 HS/HSK 기준 전략물자 연계 매칭 결과가 없습니다.",
    recommendedAction: baseAction,
    status: "empty",
    raw: {
      hs_code: hsCode || null,
      hsk_code: hskCode || null,
      match_type: "none",
      control_no: null,
      source: "Trade Security Institute HSK linkage",
      source_date: SOURCE_DATE,
    },
  };
}

function findByPrefix(prefix6: string): Array<{ hsk: string; controlNos: string[] }> {
  const out: Array<{ hsk: string; controlNos: string[] }> = [];
  for (const [hsk, entry] of Object.entries(STRATEGIC_HSK_MAP)) {
    if (!hsk.startsWith(prefix6)) continue;
    out.push({ hsk, controlNos: entry.controlNos });
    if (out.length >= 100) break;
  }
  return out;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function parseProductMeta(raw: unknown): { modelName: string; tags: string[]; safetySearch: SafetySearchInput } {
  const text = asText(raw);
  if (!text.startsWith("{")) return { modelName: "", tags: [], safetySearch: normalizeSafetySearchInput({}) };

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const modelName = asText(parsed.modelName);
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.map((value) => asText(value)).filter(Boolean)
      : [];
    const safetySearch = normalizeSafetySearchInput(asRecord(parsed.safetySearch));
    return { modelName, tags, safetySearch };
  } catch {
    return { modelName: "", tags: [], safetySearch: normalizeSafetySearchInput({}) };
  }
}

function classifyNameMatch(
  matchedName: string,
  productName: string,
  modelName: string,
): "exact_name" | "similar_name" {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9\u3131-\u318e\uac00-\ud7a3]/g, "");
  const matched = normalize(matchedName);
  const product = normalize(productName);
  const model = normalize(modelName);
  if (matched && (matched === product || matched === model)) return "exact_name";
  return "similar_name";
}

function mapSafetyStatusToApiState(status: SafetyStatus): "success" | "empty" | "error" | "idle" {
  if (status === "success") return "success";
  if (status === "empty") return "empty";
  if (status === "key_missing") return "idle";
  return "error";
}

function mapStandaloneSafetyState(status: SafetyStatus): "success" | "empty" | "error" {
  if (status === "success") return "success";
  if (status === "empty") return "empty";
  return "error";
}

function deriveScanState(
  strategicStatus: StrategicStatus,
  safetyStatus: SafetyStatus,
): "success" | "partial_success" | "empty" {
  if (safetyStatus === "error") return "partial_success";
  if (safetyStatus === "key_missing") {
    return strategicStatus === "empty" ? "empty" : "success";
  }
  if (strategicStatus === "empty" && safetyStatus === "empty") return "empty";
  return "success";
}

function buildScanResultMessage(
  state: "success" | "partial_success" | "empty",
  strategicStatus: StrategicStatus,
  safetyStatus: SafetyStatus,
  recallCount: number,
  safetyProviderLabel: string,
): string {
  if (safetyStatus === "key_missing") {
    return `${safetyProviderLabel} API 키가 등록되지 않았습니다.`;
  }
  if (safetyStatus === "error") {
    return `${safetyProviderLabel} 조회는 실패했고 전략물자 결과는 저장했습니다.`;
  }
  if (state === "empty") {
    return `전략물자와 ${safetyProviderLabel} 입력 조건 기준 매칭 결과가 없습니다.`;
  }
  if (safetyStatus === "empty" && strategicStatus === "success") {
    return `전략물자 후보가 확인되었고 ${safetyProviderLabel} 입력 조건 기준 매칭 결과는 없습니다.`;
  }
  if (recallCount > 0) {
    return `${safetyProviderLabel} 리콜 매칭 ${recallCount}건을 확인했습니다.`;
  }
  return "전략물자·제품안전 검토를 완료했습니다.";
}

function compareDateDesc(a: string, b: string): number {
  const da = normalizeDateNumber(a);
  const db = normalizeDateNumber(b);
  return db - da;
}

function normalizeDateNumber(value: string): number {
  const digits = value.replace(/\D/g, "");
  if (!digits) return 0;
  const n = Number(digits);
  return Number.isFinite(n) ? n : 0;
}

function normalizeHttpUrl(value: string): string {
  const text = value.trim();
  if (!text) return "";
  if (!/^https?:\/\//i.test(text)) return "";
  try {
    const parsed = new URL(text);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function formatSafetyWarning(
  endpoint: "certificationList" | "recallList" | "fRecallList",
  result: Pick<SafetyEndpointResult<unknown>, "errorCode" | "status" | "message">,
): string {
  const code = result.errorCode ?? "safetykorea_api_failed";
  const statusText = result.status != null ? `HTTP ${result.status}` : "HTTP N/A";
  return `${endpoint} failed (${code}, ${statusText}): ${sanitizeSensitiveText(result.message)}`;
}

function mapSafetyKoreaProviderError(code: string): { errorCode: string; message: string } {
  if (code === "4000") {
    return {
      errorCode: "safetykorea_invalid_auth_key",
      message: "SafetyKorea rejected the authentication key.",
    };
  }
  if (code === "4001") {
    return {
      errorCode: "safetykorea_invalid_ip",
      message: "SafetyKorea rejected the caller IP.",
    };
  }
  if (code === "4005") {
    return {
      errorCode: "safetykorea_invalid_parameter",
      message: "SafetyKorea request parameter is invalid.",
    };
  }
  if (code === "5000") {
    return {
      errorCode: "safetykorea_provider_internal_error",
      message: "SafetyKorea returned an internal server error.",
    };
  }
  return {
    errorCode: normalizeErrorCode(code),
    message: "SafetyKorea returned an unexpected provider error.",
  };
}

function classifyTransportError(error: unknown): { errorCode: string; message: string } {
  const message = asText((error as { message?: unknown } | null | undefined)?.message).toLowerCase();
  if (message.includes("abort") || message.includes("timeout")) {
    return {
      errorCode: "safetykorea_timeout",
      message: `SafetyKorea request timed out after ${EXTERNAL_FETCH_TIMEOUT_MS}ms.`,
    };
  }
  if (
    message.includes("handshake") ||
    message.includes("handshakefailure") ||
    message.includes("certificate") ||
    message.includes("tls")
  ) {
    return {
      errorCode: "safetykorea_tls_handshake_failed",
      message: "SafetyKorea TLS handshake failed. Please retry later.",
    };
  }
  if (
    message.includes("network") ||
    message.includes("connection") ||
    message.includes("dns") ||
    message.includes("socket")
  ) {
    return {
      errorCode: "safetykorea_network_error",
      message: "SafetyKorea network request failed. Please retry later.",
    };
  }
  return {
    errorCode: "safetykorea_request_failed",
    message: "SafetyKorea request failed.",
  };
}

function normalizeErrorCode(rawCode: string): string {
  const code = rawCode.trim().toLowerCase();
  if (!code) return "safetykorea_api_failed";
  if (code.startsWith("http_")) return `safetykorea_${code}`;
  if (/^\d{3}$/.test(code)) return `safetykorea_http_${code}`;
  return `safetykorea_${code.replace(/[^a-z0-9_]+/g, "_")}`;
}

function sanitizeSensitiveText(value: string): string {
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
  out = out.replace(/https?:\/\/[^\s<>"')]+/gi, (urlToken) => normalizeHttpUrl(urlToken) || "[INVALID_URL]");
  return out || "SafetyKorea request failed.";
}

function safeParseJson(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
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

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
