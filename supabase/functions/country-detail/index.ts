import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { STATUS_TEXT, toApiErrorMessage } from "../_shared/status-text.ts";
import {
  assessNewsRelevance,
  buildExportImpactSummary,
  buildNewsRelevanceText,
  buildNewsSelectionReason,
  buildProductRelevanceTokens,
  buildCountryAliases,
  classifyNewsForProductContext,
  classifyNewsCategory,
  classifyNewsRecency,
  detectCountryCodesFromText,
  EXPORT_ENVIRONMENT_QUERY_TERMS,
  extractProductTokens as extractRecommendationTokens,
  hasDefensibleProductExportFit,
  isCountryTextMatched,
  isWeakProductRelevanceToken,
  parseProductMeta,
  newsCategoryFromAiAssessment,
  selectNewsEvidence,
  type NewsCategory,
  type NewsRecencyTier,
} from "../_shared/recommendation.ts";
import {
  buildCertificationMatchBasis,
  buildCertificationSearchAttempts,
  rankCertificationsByDetailRelevance,
  rankCertificationsByProductFallback,
  rankImportRegulationsByDetailRelevance,
  rankImportRegulationsByProductReview,
  isKoreaTargetFlagValue,
} from "../_shared/kotra-detail-tools.ts";
import { fetchCountryScopedKsureExportPayment } from "../_shared/ksure-payment.ts";
import {
  evaluateKotraImportRegulationCacheFreshness,
  KOTRA_IMPORT_REGULATION_CACHE_KEY,
  toImportRegulationItemFromCacheRow,
  normalizeImportRegulationCacheStatus,
  KOTRA_IMPORT_REGULATION_DEFAULT_STALE_DAYS,
  shouldAttemptKotraImportRegulationApiSync,
} from "../_shared/kotra-import-regulation-cache.ts";
import {
  buildWtoEpingTermPlan,
  classifyWtoEpingNotification,
  buildWtoEpingSearchUrl,
  buildWtoEpingSummary,
  normalizeWtoEpingNotification,
  resolveWtoEpingCountryIds,
  type WtoEpingClassification,
  type WtoEpingNotification,
  type WtoEpingQueryType,
  type WtoEpingTermPlan,
} from "../_shared/wto-eping.ts";

const KOTRA_MARKET_NEWS_ENDPOINT =
  "https://apis.data.go.kr/B410001/kotra_overseasMarketNews/ovseaMrktNews/ovseaMrktNews";
const KOTRA_COUNTRY_INFO_PAGE = "https://dream.kotra.or.kr/kotranews/cms/com/index.do?MENU_ID=30";
const KOTRA_MARKET_NEWS_PAGE = "https://dream.kotra.or.kr/kotranews/index.do";

const KOTRA_OVERSEAS_AUTH_ENDPOINT =
  "https://apis.data.go.kr/B410001/overseasAuthInfo/getOverseasAuthInfo";
const KOTRA_OVERSEAS_AUTH_PAGE = "https://dream.kotra.or.kr/dream/cms/com/index.do?MENU_ID=4030";

const KOTRA_IMPORT_REGULATION_PAGE = "https://dream.kotra.or.kr/dream/cms/com/index.do?MENU_ID=3700";
const KOTRA_IMPORT_REGULATION_BACKUP_PAGE =
  "https://www.data.go.kr/tcs/dss/selectDataSetList.do?keyword=%EA%B5%AD%EB%B3%84%20%EB%8C%80%EC%84%B8%EA%B3%84%20%EC%88%98%EC%9E%85%EA%B7%9C%EC%A0%9C%20%ED%98%84%ED%99%A9";

const KSURE_COUNTRY_GRADE_ENDPOINT =
  "https://apis.data.go.kr/B552696/countrygrade/credit-grade";
const KSURE_COUNTRY_GRADE_PAGE = "https://ksight.ksure.or.kr/rsrch/nation/nationView";

const KSURE_INDUSTRY_RISK_ENDPOINT =
  "https://apis.data.go.kr/B552696/ksight/riskindex";
const KSURE_INDUSTRY_RISK_PAGE = "https://ksight.ksure.or.kr/risk-index";

const KSURE_EXPORT_PAYMENT_ENDPOINT =
  "https://apis.data.go.kr/B552696/exportPayment/getPaymentInfo";
const KSURE_EXPORT_PAYMENT_PAGE = "https://ksight.ksure.or.kr/analysis/risk-advisor/payment";
const WTO_EPING_NOTIFICATION_SEARCH_ENDPOINT = "https://api.wto.org/eping/notifications/search";
const WTO_EPING_PAGE = "https://eping.wto.org/en/Search/Index";
const KOTRA_NATIONAL_INFO_ENDPOINT =
  "https://apis.data.go.kr/B410001/kotra_nationalInformation/natnInfo/natnInfo";
const EXTERNAL_FETCH_TIMEOUT_MS = 8000;
const KOTRA_IMPORT_REGULATION_SYNC_TIMEOUT_MS = 25000;
const MAX_NEWS_QUERY_COUNT = 4;

const KSURE_INDUSTRY_CODE_CANDIDATE_MAP: Record<string, string[]> = {
  C29294: ["C29294", "29294", "C2929", "2929", "C292", "292", "C29", "29"],
  "29294": ["C29294", "29294", "C2929", "2929", "C292", "292", "C29", "29"],
};

const KOTRA_NEWS_QUERY_BY_CODE: Record<string, string[]> = {
  CN: ["China"],
  DE: ["Germany", "Deutschland"],
  JP: ["Japan"],
  US: ["United States", "USA"],
  VN: ["Vietnam"],
  ID: ["Indonesia"],
  IN: ["India"],
  MX: ["Mexico"],
  PL: ["Poland"],
  MY: ["Malaysia"],
  TH: ["Thailand"],
  AE: ["UAE", "United Arab Emirates"],
  BR: ["Brazil"],
  TR: ["Turkey", "Turkiye"],
};

type ApiState = "success" | "partial_success" | "error" | "empty" | "stale";
type DetailState = "success" | "empty" | "error" | "stale";

type DetailSearchAttempt = {
  label: string;
  filters: Record<string, string>;
};

type DetailSearchAttemptLog = {
  label: string;
  filters: Record<string, string>;
  status: number | null;
  message: string;
  item_count: number;
  raw_count?: number;
  direct_count?: number;
  broad_count?: number;
  excluded_count?: number;
};

type DetailSearchDiagnostics = {
  query_terms: string[];
  attempts: DetailSearchAttemptLog[];
  api_status: number | null;
  api_message: string;
  fallback_source_url: string;
  institution_review_required: boolean;
};

type DetailContext = {
  countryCode: string;
  countryName: string;
  industryCode: string;
  productName: string;
  productDescription: string;
  productTags: string[];
  hsCode: string;
  hskCode: string;
  englishTerms: string[];
  tagTerms: string[];
  countryTerms: string[];
};

type KotraNewsItem = {
  newsTitl: string;
  kotraNewsUrl: string;
  cntntSumar: string;
  kwrd: string;
  othbcDt: string;
  natn: string;
  newsWrterNm: string;
  infoCl: string;
  regn: string;
  newsBdt: string;
  bbstxSn: string;
};

type KotraNewsResult = {
  ok: boolean;
  status: number | null;
  message: string;
  query: string;
  items: KotraNewsItem[];
};

type NewsEvidenceCandidate = {
  item: KotraNewsItem;
  type: "product_evidence" | "country_background";
  recencyTier: NewsRecencyTier;
  newsCategory: NewsCategory;
  selectionReason: string;
  impactSummary: string;
  publishedAt: string | null;
  scoreRelevant: boolean;
};

type KotraCertItem = {
  testInsttCn: string;
  basisRegltnCn: string;
  eryyFctryJdgmtCn: string;
  systName: string;
  systCn: string;
  expansApplyCmdltCn: string;
  applyTgtCmdltCn: string;
  arcvCn: string;
  cmdltDfnCn: string;
  crtfcProsCn: string;
  crtfcCostCn: string;
  crtfcGbnVal: string;
  atnotiCn: string;
  testStdrCn: string;
  etcCn: string;
  hscd: string;
  nat: string;
  nttSj: string;
  testRqrmnPdCn: string;
  crtfcInsttCn: string;
  aftfatMntCostCn: string;
  indcEraCn: string;
  needPapersCn: string;
  testCostCn: string;
  regn: string;
  regDt: string;
  crtfcTyVal: string;
  ovrofInfo: string;
  othbcDt: string;
  crtfcInfoAtnotiCn: string;
  crtfcRqrmnPdCn: string;
  crtfcValidPdCn: string;
};

async function translateTextFast(text: string): Promise<string> {
  if (!text) return text;
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ko&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (!res.ok) return text;
    const json = await res.json();
    let translated = "";
    if (Array.isArray(json) && Array.isArray(json[0])) {
      for (const part of json[0]) {
        if (part[0]) translated += part[0];
      }
    }
    return translated || text;
  } catch (e) {
    return text;
  }
}

type KotraCertResult = {
  ok: boolean;
  status: number | null;
  message: string;
  items: KotraCertItem[];
  diagnostics: DetailSearchDiagnostics;
  matchStrategy: "country_hs_product" | "country_product_fallback";
};

type KotraCertApiResponse = {
  ok: boolean;
  status: number | null;
  message: string;
  items: KotraCertItem[];
};

type KotraImportRegulationItem = {
  HQURT_NAME: string;
  CMDLT_NAME: string;
  HSCD: string;
  HSCD_CN: string;
  REG_DT: string;
  REGL_CN: string;
  ISO_WD2_NAT_CD: string;
  REGL_STR_DE: string;
  REGL_END_DE: string;
  PROBE_TGT_NAT_NAME: string;
  __source?: "kotra_cache" | "kotra_api_sync" | "csv_backup";
  __backup_row_id?: number;
  __match_strategy?: "kr_origin_country_hs" | "kr_origin_product_review";
  __match_priority?: 1 | 2 | 3 | 4;
  __matched_tokens?: string[];
  __hs_match_level?: "hsk_exact" | "hs_exact" | "hs6_prefix" | "hs4_prefix" | "none";
};

type KotraImportRegulationResult = {
  ok: boolean;
  status: number | null;
  message: string;
  detailState: DetailState;
  items: KotraImportRegulationItem[];
  reviewItems: KotraImportRegulationItem[];
  diagnostics: DetailSearchDiagnostics;
  sourceUrl?: string;
  cacheMeta?: {
    cache_status: string;
    cache_last_success_at: string | null;
    cache_active_batch_id: string | null;
    cache_stale_after_days: number;
    cache_age_days: number | null;
    cache_reason: string | null;
    sync_attempted: boolean;
    sync_message: string | null;
  };
};

type WtoEpingNotificationResult = {
  ok: boolean;
  status: number | null;
  message: string;
  detailState: DetailState;
  items: WtoEpingNotification[];
  broadItems: WtoEpingNotification[];
  excludedItems: WtoEpingNotification[];
  rawCount: number;
  totalCount: number;
  diagnostics: DetailSearchDiagnostics;
  sourceUrl: string;
};

type WtoEpingSearchSpec = {
  label: string;
  queryType: WtoEpingQueryType;
  hsCode?: string;
  freeText?: string;
};

type WtoEpingAttemptResult = {
  ok: boolean;
  status: number | null;
  message: string;
  items: WtoEpingNotification[];
  broadItems: WtoEpingNotification[];
  excludedItems: WtoEpingNotification[];
  totalCount: number;
  rawCount: number;
  attempt: DetailSearchAttemptLog;
};

type CsvImportRegulationBackupResult = {
  items: KotraImportRegulationItem[];
  reviewItems: KotraImportRegulationItem[];
  attempts: DetailSearchAttemptLog[];
  message: string;
};

type KotraImportRegulationFetchOptions = {
  allowApiSync?: boolean;
  priorAttempts?: DetailSearchAttemptLog[];
  sourceTypeOverride?: "kotra_api_sync";
  syncAttempted?: boolean;
  syncMessage?: string | null;
};

type KotraImportRegulationSyncResult = {
  ok: boolean;
  status: number | null;
  message: string;
};

type KsureCountryGradeItem = {
  ctryCd: string;
  ctryNm: string;
  evalGrd: string;
  evalDd: string;
};

type KsureCountryGradeResult = {
  ok: boolean;
  status: number | null;
  message: string;
  item: KsureCountryGradeItem | null;
};

type KsureIndustryRiskItem = {
  ctryCd: string;
  ctryNm: string;
  biztypCd: string;
  biztypNm: string;
  riskIdx: number | null;
};

type KsureIndustryRiskResult = {
  ok: boolean;
  status: number | null;
  message: string;
  items: KsureIndustryRiskItem[];
  inputIndustryCode: string;
  mappedIndustryCodes: string[];
  countryItemCount: number;
  industryMatchFailed: boolean;
};

type KsureSeriesValue = {
  YEAR: string;
  VALUE: number | null;
  CNT: number | null;
};

type KsurePaymentTermsBlock = {
  CODE: string;
  CODE_NM: string;
  PAYMENT_TERMS: KsureSeriesValue[];
};

type KsurePaymentPeriodBlock = {
  CODE: string;
  CODE_NM: string;
  PAYMENT_PERIOD: KsureSeriesValue[];
};

type KsureExportPaymentItem = {
  lastUpdateDate: string;
  yearList: string[];
  paymentTerms: KsurePaymentTermsBlock[];
  averagePaymentPeriod: KsureSeriesValue[];
  latePaymentRate: KsureSeriesValue[];
  averagelatePaymentPeriod: KsureSeriesValue[];
  paymentPeriod: KsurePaymentPeriodBlock[];
};

type KsureExportPaymentResult = {
  ok: boolean;
  status: number | null;
  message: string;
  item: KsureExportPaymentItem | null;
  scope: "country" | "global" | null;
};

type KotraNationalInfoResult = {
  ok: boolean;
  status: number | null;
  message: string;
  item: Record<string, unknown> | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = asRecord(await req.json().catch(() => ({})));
    const projectId = asText(body.project_id);
    const countryCode = asText(body.country_code).toUpperCase();

    if (!projectId || !countryCode) {
      return json({ error: "project_id and country_code are required" }, 400);
    }

    const auth = req.headers.get("Authorization") ?? "";
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });

    const { data: userData } = await supa.auth.getUser();
    if (!userData.user) return json({ error: "unauthorized" }, 401);

    const [{ data: countryRow }, { data: productRow }, { data: companyRow }] = await Promise.all([
      supa
        .from("project_countries")
        .select("country_name, rationale")
        .eq("project_id", projectId)
        .eq("country_code", countryCode)
        .maybeSingle(),
      supa
        .from("project_products")
        .select("name, hs_code, hsk_code, description, components")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supa
        .from("project_companies")
        .select("industry_code")
        .eq("project_id", projectId)
        .maybeSingle(),
    ]);

    const countryName = asText(countryRow?.country_name) || countryCode;
    const productName = asText(productRow?.name);
    const hsCode = normalizeHsCode(asText(productRow?.hs_code));
    const hskCode = normalizeHskCode(asText(productRow?.hsk_code));
    const productDescription = asText(productRow?.description);
    const productComponents = asText(productRow?.components);
    const productMeta = parseProductMeta(productComponents);
    const productTokens = extractRecommendationTokens(productName, productDescription, productMeta.tags);
    const productRelevanceTokens = buildProductRelevanceTokens(productName, hsCode, productTokens);
    const industryCode = normalizeIndustryCode(asText(companyRow?.industry_code));
    const englishTerms = extractEnglishSearchTerms(productName, productDescription);
    const tagTerms = extractSearchTermsFromList(productMeta.tags);
    const countryTerms = buildCountrySearchTerms(countryCode, countryName);

    const kotraKey = resolveKotraKey();
    const ksureKey = resolveKsureKey();
    const wtoKey = resolveWtoApiKey();

    await Promise.all([
      supa.from("project_certifications").delete().eq("project_id", projectId).eq("country_code", countryCode),
      supa.from("project_regulations").delete().eq("project_id", projectId).eq("country_code", countryCode),
      supa.from("project_risks").delete().eq("project_id", projectId).eq("country_code", countryCode),
    ]);

    const detailContext: DetailContext = {
      countryCode,
      countryName,
      industryCode,
      productName,
      productDescription,
      productTags: productMeta.tags,
      hsCode,
      hskCode,
      englishTerms,
      tagTerms,
      countryTerms,
    };
    const [
      certResult,
      regulationResult,
      wtoEpingResult,
      ksureResult,
      ksureIndustryResult,
      ksurePaymentResult,
      newsResult,
      nationalInfoResult,
    ] =
      await Promise.all([
        fetchKotraOverseasCertInfo(detailContext, kotraKey),
        fetchKotraImportRegulations(detailContext, supa, auth),
        fetchWtoEpingNotifications(detailContext, wtoKey),
        fetchKsureCountryGrade({ countryCode, countryName }, ksureKey),
        fetchKsureIndustryRisks({ countryCode, countryName, industryCode }, ksureKey),
        fetchKsureExportPayment({ countryCode }, ksureKey),
        fetchKotraMarketNews({ countryCode, countryName }, kotraKey),
        fetchKotraNationalInfo(countryCode, kotraKey),
      ]);

    const translatePromises: Promise<void>[] = [];
    for (const item of wtoEpingResult.broadItems.slice(0, 10)) {
      if (item.title) {
        translatePromises.push(translateTextFast(item.title).then(t => { item.title = t; }));
      }
    }
    for (const item of wtoEpingResult.items.slice(0, 10)) {
      if (item.title) {
        translatePromises.push(translateTextFast(item.title).then(t => { item.title = t; }));
      }
    }
    await Promise.allSettled(translatePromises);

    const selectedNewsEvidence = classifyAndSelectNewsEvidence({
      items: newsResult.items,
      countryCode,
      productName,
      hsCode,
      relevanceTokens: productRelevanceTokens,
    });

    const certRows: Array<Record<string, unknown>> = [];
    if (certResult.ok && certResult.items.length > 0) {
      certRows.push(
        ...certResult.items.slice(0, 10).map((item) =>
          mapCertificationRow(item, {
            projectId,
            userId: userData.user.id,
            countryCode,
            countryName,
            hsCode,
            hskCode,
            productName,
            matchStrategy: certResult.matchStrategy,
          }),
        ),
      );
    } else {
      const certDetailState = certResult.ok ? "empty" : "error";
      const certDiagnostics = certResult.diagnostics;
      certRows.push({
        project_id: projectId,
        user_id: userData.user.id,
        country_code: countryCode,
        scheme: `인증 정보 ${STATUS_TEXT.checkOrgRequired}`,
        required: null,
        est_cost_krw: null,
        est_lead_days: null,
        source_org: "KOTRA",
        source_url: KOTRA_OVERSEAS_AUTH_PAGE,
        raw: {
          detail_state: certDetailState,
          input_country_code: countryCode,
          input_country_name: countryName,
          input_product_name: productName,
          input_hs_code: hsCode,
          input_hsk_code: hskCode,
          applicable_items: productName || STATUS_TEXT.noCertainInfo,
          required_docs: STATUS_TEXT.noCertainInfo,
          procedure: certResult.ok ? STATUS_TEXT.noResult : toApiErrorMessage(certResult.message),
          validity_period: STATUS_TEXT.noCertainInfo,
          hs_code: hsCode || STATUS_TEXT.noCertainInfo,
          hsk_code: hskCode || STATUS_TEXT.noCertainInfo,
          match_basis: buildCertificationMatchBasis({
            countryName,
            countryCode,
            hsCode,
            hskCode,
            productName,
          }),
          search_terms: certDiagnostics.query_terms,
          search_attempts: certDiagnostics.attempts,
          search_condition_summary: formatSearchConditionSummary(certDiagnostics),
          api_status: certDiagnostics.api_status,
          api_message: certDiagnostics.api_message,
          fallback_source_url: certDiagnostics.fallback_source_url,
          institution_review_required: certDiagnostics.institution_review_required,
          source_type: "kotra_overseas_cert",
          match_confidence: "review_required",
          match_strategy: certResult.matchStrategy,
          hs_match: false,
          product_match: false,
        },
      });
    }

    console.log("=== Inserting certRows:", certRows.length);
    const { error: certInsertError } = await supa.from("project_certifications").insert(certRows);
    if (certInsertError) {
      console.error("=== Cert Insert Error:", certInsertError);
    }

    const regulationRows: Array<Record<string, unknown>> = [];
    const regulationItems = Array.isArray(regulationResult.items) ? regulationResult.items : [];
    const regulationReviewItems = Array.isArray(regulationResult.reviewItems) ? regulationResult.reviewItems : [];
    if (regulationResult.ok && (regulationItems.length > 0 || regulationReviewItems.length > 0)) {
      regulationRows.push(
        ...regulationItems.slice(0, 20).map((item) =>
          mapRegulationRow(item, {
            projectId,
            userId: userData.user.id,
            countryCode,
            countryName,
            productName,
            hsCode,
            hskCode,
            cacheMeta: regulationResult.cacheMeta,
          }),
        ),
        ...regulationReviewItems.slice(0, 10).map((item) =>
          mapRegulationRow(item, {
            projectId,
            userId: userData.user.id,
            countryCode,
            countryName,
            productName,
            hsCode,
            hskCode,
            cacheMeta: regulationResult.cacheMeta,
          }),
        ),
      );
    } else {
      const regulationDetailState = regulationResult.detailState;
      const regulationDiagnostics = regulationResult.diagnostics;
      regulationRows.push({
        project_id: projectId,
        user_id: userData.user.id,
        country_code: countryCode,
        topic: "수입규제 항목",
        summary: regulationDetailState === "stale"
          ? `수입규제 캐시가 미동기화 또는 만료된 상태여서 ${STATUS_TEXT.checkOrgRequired}`
          : regulationDetailState === "empty"
            ? `조건에 맞는 수입규제 항목이 없어 ${STATUS_TEXT.checkOrgRequired}`
            : toApiErrorMessage(regulationResult.message),
        source_org: "KOTRA",
        source_url: regulationResult.sourceUrl ?? KOTRA_IMPORT_REGULATION_PAGE,
        raw: {
          detail_state: regulationDetailState,
          input_country_code: countryCode,
          input_country_name: countryName,
          input_product_name: productName,
          input_hs_code: hsCode,
          input_hsk_code: hskCode,
          country_name: countryName,
          hs_code: hsCode || STATUS_TEXT.noCertainInfo,
          hsk_code: hskCode || STATUS_TEXT.noCertainInfo,
          regulation_type: STATUS_TEXT.noCertainInfo,
          effective_date: STATUS_TEXT.noCertainInfo,
          product_name: productName || STATUS_TEXT.noCertainInfo,
          search_terms: regulationDiagnostics.query_terms,
          search_attempts: regulationDiagnostics.attempts,
          search_condition_summary: formatSearchConditionSummary(regulationDiagnostics),
          api_status: regulationDiagnostics.api_status,
          api_message: regulationDiagnostics.api_message,
          fallback_source_url: regulationDiagnostics.fallback_source_url,
          institution_review_required: regulationDiagnostics.institution_review_required,
          cache_status: regulationResult.cacheMeta?.cache_status ?? "",
          cache_last_success_at: regulationResult.cacheMeta?.cache_last_success_at ?? "",
          cache_active_batch_id: regulationResult.cacheMeta?.cache_active_batch_id ?? "",
          cache_stale_after_days: regulationResult.cacheMeta?.cache_stale_after_days ?? "",
          cache_age_days: regulationResult.cacheMeta?.cache_age_days ?? "",
          cache_reason: regulationResult.cacheMeta?.cache_reason ?? "",
          source_type: regulationResult.cacheMeta?.sync_attempted ? "kotra_api_sync" : "kotra_cache",
          sync_attempted: regulationResult.cacheMeta?.sync_attempted ?? false,
          sync_message: regulationResult.cacheMeta?.sync_message ?? "",
          origin_country_fixed: "KR",
          origin_target_match: false,
          import_country_match: false,
          hs_match: false,
          match_confidence: "review_required",
          match_strategy: "kr_origin_country_hs",
        },
      });
    }
    if (wtoEpingResult.items.length > 0) {
      regulationRows.push(
        ...wtoEpingResult.items.slice(0, 10).map((item) =>
          mapWtoEpingRegulationRow(item, {
            projectId,
            userId: userData.user.id,
            countryCode,
            countryName,
            productName,
            hsCode,
            hskCode,
            totalCount: wtoEpingResult.totalCount,
          }),
        ),
      );
    }
    regulationRows.push(
      buildWtoEpingPlaceholderRegulationRow({
        projectId,
        userId: userData.user.id,
        countryCode,
        countryName,
        productName,
        hsCode,
        hskCode,
        result: wtoEpingResult,
      }),
    );
    await supa.from("project_regulations").insert(regulationRows);

    const riskRows: Array<Record<string, unknown>> = [];
    if (ksureResult.ok) {
      if (ksureResult.item) {
        const evalDate = parseKsureEvalDate(ksureResult.item.evalDd);
        riskRows.push({
          project_id: projectId,
          user_id: userData.user.id,
          country_code: countryCode,
          category: "k_sure",
          level: mapKsureRiskLevel(ksureResult.item.evalGrd),
          summary: buildKsureSummary(ksureResult.item),
          source_org: "K-SURE",
          source_url: KSURE_COUNTRY_GRADE_PAGE,
          raw: {
            detail_state: "success",
            country_code: ksureResult.item.ctryCd,
            country_name: ksureResult.item.ctryNm,
            eval_grade: ksureResult.item.evalGrd || "N/A",
            eval_date: evalDate || ksureResult.item.evalDd || "N/A",
          },
        });
      } else {
        riskRows.push({
          project_id: projectId,
          user_id: userData.user.id,
          country_code: countryCode,
          category: "k_sure",
          level: "info",
          summary: `No K-SURE country grade matched '${countryCode}'.`,
          source_org: "K-SURE",
          source_url: KSURE_COUNTRY_GRADE_PAGE,
          raw: {
            detail_state: "empty",
            country_code: countryCode,
          },
        });
      }
    } else {
      riskRows.push({
        project_id: projectId,
        user_id: userData.user.id,
        country_code: countryCode,
        category: "k_sure",
        level: "unavailable",
        summary: `K-SURE country grade fetch failed: ${ksureResult.message}`,
        source_org: "K-SURE",
        source_url: KSURE_COUNTRY_GRADE_PAGE,
        raw: {
          detail_state: "error",
          country_code: countryCode,
          error_message: ksureResult.message,
        },
      });
    }

    if (ksureIndustryResult.ok) {
      if (ksureIndustryResult.items.length > 0) {
        for (const item of ksureIndustryResult.items.slice(0, 10)) {
          riskRows.push({
            project_id: projectId,
            user_id: userData.user.id,
            country_code: countryCode,
            category: "k_sure_industry",
            level: mapKsureIndustryRiskLevel(item.riskIdx),
            summary: buildKsureIndustrySummary(item),
            source_org: "K-SURE",
            source_url: KSURE_INDUSTRY_RISK_PAGE,
            raw: {
              detail_state: "success",
              country_code: item.ctryCd,
              country_name: item.ctryNm,
              biz_type_code: item.biztypCd || "N/A",
              biz_type_name: item.biztypNm || "N/A",
              risk_index: item.riskIdx,
              input_industry_code: ksureIndustryResult.inputIndustryCode || "N/A",
              mapped_industry_codes: ksureIndustryResult.mappedIndustryCodes,
              industry_match_failed: false,
            },
          });
        }
      } else {
        const industrySummary = buildKsureIndustryEmptySummary(ksureIndustryResult, countryCode);
        riskRows.push({
          project_id: projectId,
          user_id: userData.user.id,
          country_code: countryCode,
          category: "k_sure_industry",
          level: "info",
          summary: industrySummary,
          source_org: "K-SURE",
          source_url: KSURE_INDUSTRY_RISK_PAGE,
          raw: {
            detail_state: "empty",
            country_code: countryCode,
            input_industry_code: ksureIndustryResult.inputIndustryCode || "N/A",
            mapped_industry_codes: ksureIndustryResult.mappedIndustryCodes,
            country_item_count: ksureIndustryResult.countryItemCount,
            industry_match_failed: ksureIndustryResult.industryMatchFailed,
            detail_message: industrySummary,
          },
        });
      }
    } else {
      riskRows.push({
        project_id: projectId,
        user_id: userData.user.id,
        country_code: countryCode,
        category: "k_sure_industry",
        level: "unavailable",
        summary: `K-SURE industry risk fetch failed: ${ksureIndustryResult.message}`,
        source_org: "K-SURE",
        source_url: KSURE_INDUSTRY_RISK_PAGE,
        raw: {
          detail_state: "error",
          country_code: countryCode,
          error_message: ksureIndustryResult.message,
        },
      });
    }

    if (ksurePaymentResult.ok) {
      if (ksurePaymentResult.item) {
        riskRows.push({
          project_id: projectId,
          user_id: userData.user.id,
          country_code: countryCode,
          category: "k_sure_payment",
          level: mapKsurePaymentRiskLevel(ksurePaymentResult.item, ksurePaymentResult.scope),
          summary: buildKsurePaymentSummary(ksurePaymentResult.item, ksurePaymentResult.scope),
          source_org: "K-SURE",
          source_url: KSURE_EXPORT_PAYMENT_PAGE,
          raw: {
            detail_state: "success",
            ...buildKsurePaymentRaw(ksurePaymentResult.item, ksurePaymentResult.scope),
          },
        });
      } else {
        const paymentUnavailableMessage = buildKsurePaymentUnavailableMessage(
          countryName,
          countryCode,
          ksurePaymentResult.message,
        );
        riskRows.push({
          project_id: projectId,
          user_id: userData.user.id,
          country_code: countryCode,
          category: "k_sure_payment",
          level: "info",
          summary: paymentUnavailableMessage,
          source_org: "K-SURE",
          source_url: KSURE_EXPORT_PAYMENT_PAGE,
          raw: {
            detail_state: "empty",
            scope: ksurePaymentResult.scope || "country",
            country_code: countryCode,
            country_name: countryName,
            api_status: ksurePaymentResult.status,
            api_message: ksurePaymentResult.message,
            detail_message: paymentUnavailableMessage,
          },
        });
      }
    } else {
      riskRows.push({
        project_id: projectId,
        user_id: userData.user.id,
        country_code: countryCode,
        category: "k_sure_payment",
        level: "unavailable",
        summary: `K-SURE export payment fetch failed: ${ksurePaymentResult.message}`,
        source_org: "K-SURE",
        source_url: KSURE_EXPORT_PAYMENT_PAGE,
        raw: {
          detail_state: "error",
          scope: ksurePaymentResult.scope,
          country_code: countryCode,
          country_name: countryName,
          api_status: ksurePaymentResult.status,
          api_message: ksurePaymentResult.message,
          detail_message: `K-SURE 수출 결제 조회 실패 (${countryName || countryCode}): ${ksurePaymentResult.message}`,
          error_message: ksurePaymentResult.message,
        },
      });
    }

    if (newsResult.ok) {
    if (selectedNewsEvidence.length > 0) {
      for (const evidence of selectedNewsEvidence) {
        const item = evidence.item;
          riskRows.push({
            project_id: projectId,
            user_id: userData.user.id,
            country_code: countryCode,
            category: "news",
            level: classifyNewsRiskLevel(evidence.newsCategory),
            summary: buildNewsSummary(item),
            source_org: "KOTRA",
            source_url: toPublicNewsUrl(item.kotraNewsUrl, item.bbstxSn),
            raw: {
              ...item,
              news_category: evidence.newsCategory,
              recency_tier: evidence.recencyTier,
              selection_reason: evidence.selectionReason,
              impact_summary: evidence.impactSummary || undefined,
              score_relevant: evidence.scoreRelevant,
            },
          });
        }
      } else {
        riskRows.push({
          project_id: projectId,
          user_id: userData.user.id,
          country_code: countryCode,
          category: "news",
          level: "info",
          summary: `No recent KOTRA market news matched '${countryName}'.`,
          source_org: "KOTRA",
          source_url: null,
        });
      }
    } else {
      riskRows.push({
        project_id: projectId,
        user_id: userData.user.id,
        country_code: countryCode,
        category: "news",
        level: "unavailable",
        summary: `KOTRA market news fetch failed: ${newsResult.message}`,
        source_org: "KOTRA",
        source_url: null,
      });
    }

    if (riskRows.length > 0) {
      await supa.from("project_risks").insert(riskRows);
    }

    const existingRationale = asRecord(countryRow?.rationale);
    const certDetailState = resolveDetailState(certResult.ok, certResult.items.length);
    const regulationDetailState = resolveCombinedRegulationDetailState(
      regulationResult.detailState,
      wtoEpingResult.detailState,
    );
    const sourcePairs = replaceDetailMatchedSources(
      normalizeRationaleSources(existingRationale.sources),
      {
        countryName,
        certification: {
          count: countSuccessfulDetailRows(certRows),
          state: certDetailState,
          url: KOTRA_OVERSEAS_AUTH_PAGE,
        },
        regulation: {
          count: countSuccessfulDetailRows(regulationRows),
          state: regulationDetailState,
          url: regulationResult.sourceUrl ?? KOTRA_IMPORT_REGULATION_PAGE,
        },
      },
    ).filter((source) => {
      const type = asText(source.type).toLowerCase();
      if (type === "ksure_country_risk" || type === "ksure_industry_risk" || type === "ksure_export_payment") {
        return false;
      }
      const title = asText(source.title).toLowerCase();
      return !title.startsWith("k-sure 국가위험") &&
        !title.startsWith("k-sure 업종위험") &&
        !title.startsWith("k-sure 수출 결제");
    });

    sourcePairs.push({
      type: "market_profile",
      title: `${countryName} country and market profile`,
      url: KOTRA_COUNTRY_INFO_PAGE,
      country: countryName,
    });

    sourcePairs.push({
      type: "wto_eping",
      title: buildDetailMatchedTitle(
        "WTO ePing SPS/TBT",
        wtoEpingResult.items.length,
        wtoEpingResult.detailState,
      ),
      url: WTO_EPING_PAGE,
      country: countryName,
      summary: wtoEpingResult.ok
        ? `WTO ePing notifications collected: ${wtoEpingResult.items.length} of ${wtoEpingResult.totalCount}`
        : `WTO ePing fetch failed: ${wtoEpingResult.message}`,
      score_relevant: false,
    });

    const ksureIndustryTop = ksureIndustryResult.items[0];
    const ksureIndustrySourceSummary = buildKsureIndustrySourceSummary(ksureIndustryResult, countryCode);

    sourcePairs.push({
      type: "ksure_country_risk",
      title: buildDetailMatchedTitle("K-SURE 국가위험", ksureResult.item ? 1 : 0, resolveDetailState(ksureResult.ok, ksureResult.item ? 1 : 0)),
      url: KSURE_COUNTRY_GRADE_PAGE,
      country: countryName,
      summary: ksureResult.ok
        ? (ksureResult.item ? buildKsureSummary(ksureResult.item) : "K-SURE 국가등급 조회 결과 없음")
        : toApiErrorMessage(ksureResult.message),
      score_relevant: false,
    });

    sourcePairs.push({
      type: "ksure_industry_risk",
      title: buildDetailMatchedTitle(
        "K-SURE 업종위험",
        ksureIndustryResult.items.length,
        resolveDetailState(ksureIndustryResult.ok, ksureIndustryResult.items.length),
      ),
      url: KSURE_INDUSTRY_RISK_PAGE,
      country: countryName,
      summary: ksureIndustrySourceSummary,
      score_relevant: false,
    });

    sourcePairs.push({
      type: "ksure_export_payment",
      title: buildDetailMatchedTitle(
        "K-SURE 수출 결제",
        ksurePaymentResult.item ? 1 : 0,
        resolveDetailState(ksurePaymentResult.ok, ksurePaymentResult.item ? 1 : 0),
      ),
      url: KSURE_EXPORT_PAYMENT_PAGE,
      country: countryName,
      summary: ksurePaymentResult.ok
        ? (ksurePaymentResult.item ? buildKsurePaymentSummary(ksurePaymentResult.item, ksurePaymentResult.scope) : "K-SURE 수출 결제 조회 결과 없음")
        : toApiErrorMessage(ksurePaymentResult.message),
      score_relevant: false,
    });

    for (const evidence of selectedNewsEvidence) {
      const item = evidence.item;
      sourcePairs.push({
        type: evidence.type,
        title: cleanText(item.newsTitl || "KOTRA Overseas Market News"),
        url: toPublicNewsUrl(item.kotraNewsUrl, item.bbstxSn),
        country: countryName,
        published_at: evidence.publishedAt ?? undefined,
        summary: buildNewsSourceSummary(item),
        keywords: parseKeywordList(item.kwrd),
        score_relevant: evidence.scoreRelevant,
        news_category: evidence.newsCategory,
        recency_tier: evidence.recencyTier,
        selection_reason: evidence.selectionReason,
        impact_summary: evidence.impactSummary || undefined,
      });
    }
    const firstNews = selectedNewsEvidence[0]?.item;

    const certSummary = certResult.ok
      ? certResult.items.length > 0
        ? `Certification records collected: ${certResult.items.length}`
        : `Certification records: ${STATUS_TEXT.noResult} (hs=${hsCode || "N/A"}, product=${productName || "N/A"})`
      : `Certification fetch failed: ${certResult.message}`;

    const regSummary = regulationResult.ok
      ? regulationItems.length > 0 || regulationReviewItems.length > 0
        ? `Import-regulation records collected: confirmed ${regulationItems.length}, KOTRA review ${regulationReviewItems.length}, WTO ePing review ${wtoEpingResult.items.length}`
        : `Import-regulation records: ${STATUS_TEXT.noResult} (hs=${hsCode || "N/A"}, country=${countryName}); WTO ePing review ${wtoEpingResult.items.length}`
      : `Import-regulation fetch failed: ${regulationResult.message}`;

    const newsSummary = newsResult.ok
      ? firstNews
        ? `Recent news: ${buildNewsSummary(firstNews)}`
        : `Recent news: no matched items for ${countryName}.`
      : `Recent news fetch failed: ${newsResult.message}`;

    const ksureSummary = ksureResult.ok
      ? ksureResult.item
        ? `K-SURE country grade: ${ksureResult.item.evalGrd || "N/A"} (${parseKsureEvalDate(ksureResult.item.evalDd) || ksureResult.item.evalDd || "date N/A"})`
        : `K-SURE country grade not found for ${countryCode}.`
      : `K-SURE country grade fetch failed: ${ksureResult.message}`;

    const ksureIndustrySummary = ksureIndustryResult.ok
      ? ksureIndustryTop
        ? `K-SURE industry risk(filtered): ${ksureIndustryTop.biztypNm || ksureIndustryTop.biztypCd || "N/A"} (RI ${formatRiskIndex(ksureIndustryTop.riskIdx)})`
        : buildKsureIndustryEmptySummary(ksureIndustryResult, countryCode)
      : `K-SURE industry risk fetch failed: ${ksureIndustryResult.message}`;

    const paymentLateRate = ksurePaymentResult.item
      ? getLatestSeriesPoint(ksurePaymentResult.item.latePaymentRate)?.VALUE
      : null;
    const ksurePaymentSummary = ksurePaymentResult.ok
      ? ksurePaymentResult.item
        ? `K-SURE export payment (${ksurePaymentResult.scope || "global"}): late rate ${formatRate(paymentLateRate)}`
        : `K-SURE export payment not found for ${countryCode}.`
      : `K-SURE export payment fetch failed: ${ksurePaymentResult.message}`;

    const certSummaryKo = certResult.ok
      ? certResult.items.length > 0
        ? `Certification records collected: ${certResult.items.length}`
        : `Certification records: ${STATUS_TEXT.noResult} (hs=${hsCode || "N/A"}, product=${productName || "N/A"})`
      : `Certification fetch failed: ${certResult.message}`;

    const regSummaryKo = regulationResult.ok
      ? regulationItems.length > 0 || regulationReviewItems.length > 0
        ? `Import-regulation records collected: confirmed ${regulationItems.length}, KOTRA review ${regulationReviewItems.length}, WTO ePing review ${wtoEpingResult.items.length}`
        : `Import-regulation records: ${STATUS_TEXT.noResult} (hs=${hsCode || "N/A"}, country=${countryName}); WTO ePing review ${wtoEpingResult.items.length}`
      : `Import-regulation fetch failed: ${regulationResult.message}`;

    const mergedSummary = [
      asText(existingRationale.summary),
      certSummaryKo,
      regSummaryKo,
      ksureSummary,
      ksureIndustrySummary,
      ksurePaymentSummary,
      newsSummary,
    ]
      .filter(Boolean)
      .join(" | ");

    await supa
      .from("project_countries")
      .update({
        rationale: {
          ...existingRationale,
          summary: truncate(mergedSummary, 500),
          sources: dedupeSources(sourcePairs),
        },
      })
      .eq("project_id", projectId)
      .eq("country_code", countryCode);

    const isAllSuccessful =
      certResult.ok &&
      certResult.items.length > 0 &&
      regulationDetailState === "success" &&
      newsResult.ok &&
      ksureResult.ok &&
      !!ksureResult.item &&
      ksureIndustryResult.ok &&
      ksureIndustryResult.items.length > 0 &&
      ksurePaymentResult.ok &&
      !!ksurePaymentResult.item;

    let state: ApiState = isAllSuccessful ? "success" : "partial_success";
    const errorIssueLabels: string[] = [];
    const emptyIssueLabels: string[] = [];
    const staleIssueLabels: string[] = [];

    if (!certResult.ok) errorIssueLabels.push("인증");
    else if (certResult.items.length === 0) emptyIssueLabels.push("인증");

    if (regulationDetailState === "error") errorIssueLabels.push("수입규제");
    else if (regulationDetailState === "stale") staleIssueLabels.push("수입규제 캐시");
    else if (regulationDetailState === "empty") emptyIssueLabels.push("수입규제");

    if (!ksureResult.ok) errorIssueLabels.push("K-SURE 국가등급");
    else if (!ksureResult.item) emptyIssueLabels.push("K-SURE 국가등급");

    if (!ksureIndustryResult.ok) errorIssueLabels.push("K-SURE 업종위험");
    else if (ksureIndustryResult.items.length === 0) {
      if (ksureIndustryResult.industryMatchFailed) {
        emptyIssueLabels.push("K-SURE 업종위험(입력 업종 매칭 실패)");
      } else {
        emptyIssueLabels.push("K-SURE 업종위험");
      }
    }

    if (!ksurePaymentResult.ok) errorIssueLabels.push("K-SURE 수출 결제");
    else if (!ksurePaymentResult.item) emptyIssueLabels.push("K-SURE 수출 결제");

    if (!newsResult.ok) errorIssueLabels.push("해외시장 뉴스");
    else if (newsResult.items.length === 0) emptyIssueLabels.push("해외시장 뉴스");

    if (errorIssueLabels.length === 0 && staleIssueLabels.length > 0 && state !== "success") {
      state = "stale";
    }

    const userMessage =
      errorIssueLabels.length > 0
        ? `상세 데이터 일부 항목(${errorIssueLabels.join(", ")})이 미완료입니다. Step 5 및 리포트 진행은 가능하지만 원문 확인 후 재실행을 권장합니다.`
        : staleIssueLabels.length > 0
          ? `상세 데이터는 완료되었지만 일부 항목(${staleIssueLabels.join(", ")})이 캐시 미동기화 또는 만료 상태입니다. 캐시 동기화 후 재실행이 필요합니다.`
          : emptyIssueLabels.length > 0
            ? `상세 데이터는 완료되었지만 일부 항목(${emptyIssueLabels.join(", ")})은 조회 결과가 없습니다.`
            : null;

    await supa.from("api_call_logs").insert([
      {
        user_id: userData.user.id,
        project_id: projectId,
        api_key_name: "kotra_overseas_certification",
        status: certResult.ok ? (certResult.items.length > 0 ? "success" : "empty") : "error",
        http_status: certResult.status,
        response_count: certResult.items.length,
        error_code: certResult.ok ? null : "kotra_overseas_certification_fetch_failed",
        detail: {
          country: countryName,
          hs_code: hsCode || null,
          hsk_code: hskCode || null,
          product_name: productName || null,
          query_terms: certResult.diagnostics.query_terms,
          search_attempts: certResult.diagnostics.attempts,
          api_status: certResult.diagnostics.api_status,
          api_message: certResult.diagnostics.api_message,
          fallback_source_url: certResult.diagnostics.fallback_source_url,
          institution_review_required: certResult.diagnostics.institution_review_required,
        },
        message: certResult.ok
          ? `country=${countryName}, item_count=${certResult.items.length}, hs=${hsCode || "N/A"}, hsk=${hskCode || "N/A"}, product=${productName || "N/A"}, attempts=${certResult.diagnostics.attempts.length}`
          : `country=${countryName}, error=${certResult.message}, attempts=${certResult.diagnostics.attempts.length}`,
      },
      {
        user_id: userData.user.id,
        project_id: projectId,
        api_key_name: "kotra_import_regulation",
        status: regulationResult.detailState,
        http_status: regulationResult.status,
        response_count: regulationItems.length + regulationReviewItems.length,
        error_code: regulationResult.detailState === "error"
          ? "kotra_import_regulation_fetch_failed"
          : regulationResult.detailState === "stale"
            ? "kotra_import_regulation_cache_stale"
            : null,
        detail: {
          country: countryName,
          hs_code: hsCode || null,
          hsk_code: hskCode || null,
          product_name: productName || null,
          query_terms: regulationResult.diagnostics.query_terms,
          search_attempts: regulationResult.diagnostics.attempts,
          api_status: regulationResult.diagnostics.api_status,
          api_message: regulationResult.diagnostics.api_message,
          fallback_source_url: regulationResult.diagnostics.fallback_source_url,
          institution_review_required: regulationResult.diagnostics.institution_review_required,
          cache_meta: regulationResult.cacheMeta ?? null,
        },
        message: regulationResult.detailState === "error"
          ? `country=${countryName}, state=error, error=${regulationResult.message}, attempts=${regulationResult.diagnostics.attempts.length}`
          : `country=${countryName}, state=${regulationResult.detailState}, item_count=${regulationItems.length}, review_count=${regulationReviewItems.length}, hs=${hsCode || "N/A"}, hsk=${hskCode || "N/A"}, product=${productName || "N/A"}, attempts=${regulationResult.diagnostics.attempts.length}`,
      },
      {
        user_id: userData.user.id,
        project_id: projectId,
        api_key_name: "wto_eping",
        status: wtoEpingResult.detailState,
        http_status: wtoEpingResult.status,
        response_count: wtoEpingResult.items.length,
        error_code: wtoEpingResult.ok ? null : "wto_eping_fetch_failed",
        detail: {
          country: countryName,
          country_code: countryCode,
          hs_code: hsCode || null,
          hsk_code: hskCode || null,
          product_name: productName || null,
          total_count: wtoEpingResult.totalCount,
          raw_count: wtoEpingResult.rawCount,
          direct_count: wtoEpingResult.items.length,
          broad_count: wtoEpingResult.broadItems.length,
          excluded_count: wtoEpingResult.excludedItems.length,
          query_terms: wtoEpingResult.diagnostics.query_terms,
          search_attempts: wtoEpingResult.diagnostics.attempts,
          api_status: wtoEpingResult.diagnostics.api_status,
          api_message: wtoEpingResult.diagnostics.api_message,
          fallback_source_url: wtoEpingResult.diagnostics.fallback_source_url,
          institution_review_required: true,
        },
        message: wtoEpingResult.ok
          ? `country=${countryName}, state=${wtoEpingResult.detailState}, direct_count=${wtoEpingResult.items.length}, broad_count=${wtoEpingResult.broadItems.length}, excluded_count=${wtoEpingResult.excludedItems.length}, raw_count=${wtoEpingResult.rawCount}, total_count=${wtoEpingResult.totalCount}, hs=${hsCode || "N/A"}`
          : `country=${countryName}, error=${wtoEpingResult.message}, attempts=${wtoEpingResult.diagnostics.attempts.length}`,
      },
      {
        user_id: userData.user.id,
        project_id: projectId,
        api_key_name: "ksure_country_risk",
        status: ksureResult.ok ? (ksureResult.item ? "success" : "empty") : "error",
        http_status: ksureResult.status,
        response_count: ksureResult.item ? 1 : 0,
        error_code: ksureResult.ok ? null : "ksure_country_risk_fetch_failed",
        detail: {
          country: countryName,
          country_code: countryCode,
        },
        message: ksureResult.ok
          ? ksureResult.item
            ? `country=${countryName}, country_code=${ksureResult.item.ctryCd || countryCode}, grade=${ksureResult.item.evalGrd || "N/A"}, eval_date=${parseKsureEvalDate(ksureResult.item.evalDd) || ksureResult.item.evalDd || "N/A"}`
            : `country=${countryName}, country_code=${countryCode}, item_count=0`
          : `country=${countryName}, error=${ksureResult.message}`,
      },
      {
        user_id: userData.user.id,
        project_id: projectId,
        api_key_name: "ksure_industry_risk",
        status: ksureIndustryResult.ok ? (ksureIndustryResult.items.length > 0 ? "success" : "empty") : "error",
        http_status: ksureIndustryResult.status,
        response_count: ksureIndustryResult.items.length,
        error_code: ksureIndustryResult.ok ? null : "ksure_industry_risk_fetch_failed",
        detail: {
          country: countryName,
          country_code: countryCode,
          input_industry_code: ksureIndustryResult.inputIndustryCode || null,
          mapped_industry_codes: ksureIndustryResult.mappedIndustryCodes,
          country_item_count: ksureIndustryResult.countryItemCount,
          industry_match_failed: ksureIndustryResult.industryMatchFailed,
        },
        message: ksureIndustryResult.ok
          ? `country=${countryName}, country_code=${countryCode}, item_count=${ksureIndustryResult.items.length}, industry_match_failed=${ksureIndustryResult.industryMatchFailed}, top_risk=${formatRiskIndex(ksureIndustryResult.items[0]?.riskIdx ?? null)}`
          : `country=${countryName}, error=${ksureIndustryResult.message}`,
      },
      {
        user_id: userData.user.id,
        project_id: projectId,
        api_key_name: "ksure_export_payment",
        status: ksurePaymentResult.ok ? (ksurePaymentResult.item ? "success" : "empty") : "error",
        http_status: ksurePaymentResult.status,
        response_count: ksurePaymentResult.item ? 1 : 0,
        error_code: ksurePaymentResult.ok ? null : "ksure_export_payment_fetch_failed",
        detail: {
          country: countryName,
          country_code: countryCode,
          scope: ksurePaymentResult.scope,
        },
        message: ksurePaymentResult.ok
          ? ksurePaymentResult.item
            ? `country=${countryName}, country_code=${countryCode}, scope=${ksurePaymentResult.scope || "unknown"}, late_rate=${formatRate(getLatestSeriesPoint(ksurePaymentResult.item.latePaymentRate)?.VALUE)}`
            : `country=${countryName}, country_code=${countryCode}, item_count=0`
          : `country=${countryName}, error=${ksurePaymentResult.message}`,
      },
      {
        user_id: userData.user.id,
        project_id: projectId,
        api_key_name: "kotra_market_news",
        status: newsResult.ok ? (newsResult.items.length > 0 ? "success" : "empty") : "error",
        http_status: newsResult.status,
        response_count: newsResult.items.length,
        error_code: newsResult.ok ? null : "kotra_market_news_fetch_failed",
        detail: {
          country: countryName,
          query: newsResult.query || null,
        },
        message: newsResult.ok
          ? `country=${countryName}, query=${newsResult.query || "N/A"}, item_count=${newsResult.items.length}`
          : `country=${countryName}, query=${newsResult.query || "N/A"}, error=${newsResult.message}`,
      },
    ]);

    const nationalInfoFields = nationalInfoResult.ok && nationalInfoResult.item
      ? {
          ecnmyTrendCntnt: asText(nationalInfoResult.item.ecnmyTrendCntnt),
          ecnmyPrsptCntnt: asText(nationalInfoResult.item.ecnmyPrsptCntnt),
          entrPrcstCntnt: asText(nationalInfoResult.item.entrPrcstCntnt),
          tarifSystSumryCntnt: asText(nationalInfoResult.item.tarifSystSumryCntnt),
          tarifCnfrmMthCntnt: asText(nationalInfoResult.item.tarifCnfrmMthCntnt),
          tbtCntnt: asText(nationalInfoResult.item.tbtCntnt),
          crtfcSystCntnt: asText(nationalInfoResult.item.crtfcSystCntnt),
          imprtPrhbtCmdltCntnt: asText(nationalInfoResult.item.imprtPrhbtCmdltCntnt),
          expBhrcCmdltCntnt: asText(nationalInfoResult.item.expBhrcCmdltCntnt),
          tp10cImprtCmdltList: asText(nationalInfoResult.item.tp10cImprtCmdltList),
        }
      : null;

    return json({
      state,
      message: userMessage,
      detail_incomplete: errorIssueLabels.length > 0,
      detail_incomplete_items: errorIssueLabels,
      detail_stale_items: staleIssueLabels,
      detail_empty_items: emptyIssueLabels,
      certification_count: certResult.items.length,
      regulation_count: regulationItems.length,
      regulation_review_count: regulationReviewItems.length,
      ksure_grade: ksureResult.item?.evalGrd || null,
      ksure_eval_date: ksureResult.item ? parseKsureEvalDate(ksureResult.item.evalDd) || ksureResult.item.evalDd || null : null,
      ksure_industry_count: ksureIndustryResult.items.length,
      ksure_payment_scope: ksurePaymentResult.scope,
      ksure_payment_late_rate: ksurePaymentResult.item
        ? getLatestSeriesPoint(ksurePaymentResult.item.latePaymentRate)?.VALUE ?? null
        : null,
      news_count: newsResult.items.length,
      national_info: nationalInfoFields,
    });
  } catch (e) {
    console.error("country-detail failed", {
      message: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : null,
    });
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

function resolveKotraKey(): string {
  return normalizeAuthKeyValue(
    Deno.env.get("KOTRA_API_KEY") ||
    Deno.env.get("PUBLIC_DATA_API_KEY") ||
    Deno.env.get("KICOX_API_KEY") ||
    "",
  );
}

function resolveKsureKey(): string {
  return normalizeAuthKeyValue(
    Deno.env.get("KSURE_API_KEY") ||
    Deno.env.get("PUBLIC_DATA_API_KEY") ||
    Deno.env.get("KICOX_API_KEY") ||
    "",
  );
}

function resolveWtoApiKey(): string {
  return normalizeAuthKeyValue(Deno.env.get("WTO_API_KEY") || "");
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

function buildDetailQueryTerms(params: DetailContext): string[] {
  return dedupeStrings([
    params.countryCode ? `country_code:${params.countryCode}` : "",
    params.countryName ? `country_name:${params.countryName}` : "",
    params.hsCode ? `hs6:${params.hsCode}` : "",
    params.hskCode ? `hsk10:${params.hskCode}` : "",
    params.productName ? `product:${params.productName}` : "",
    ...params.englishTerms.map((term) => `en:${term}`),
    ...params.tagTerms.map((term) => `tag:${term}`),
  ]).slice(0, 20);
}

function buildCountrySearchTerms(countryCode: string, countryName: string): string[] {
  return dedupeStrings([
    countryCode,
    countryName,
    ...getCountryAliases(countryCode, countryName),
  ]).slice(0, 8);
}

function getDetailSearchTokens(params: DetailContext): string[] {
  return dedupeStrings([
    ...extractDetailProductTokens(
      params.productName,
      params.productDescription,
      params.productTags,
    ),
    ...params.englishTerms,
    ...params.tagTerms,
  ]).filter((token) => token.length >= 2);
}

function extractEnglishSearchTerms(...sources: string[]): string[] {
  const terms: string[] = [];
  for (const source of sources) {
    const tokens = source
      .split(/[\s,/()|]+/g)
      .map((token) => token.trim())
      .filter((token) => /[A-Za-z]/.test(token))
      .map((token) => token.replace(/[^A-Za-z0-9\-]/g, ""));
    terms.push(...tokens);
  }
  return dedupeStrings(terms).filter((token) => token.length >= 2).slice(0, 8);
}

function extractSearchTermsFromList(values: string[]): string[] {
  const tokens: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    tokens.push(normalized);
    tokens.push(...normalized.split(/[\s,/()|]+/g));
  }
  return dedupeStrings(tokens).filter((token) => token.length >= 2).slice(0, 12);
}

function createDetailDiagnostics(params: {
  queryTerms: string[];
  attempts: DetailSearchAttemptLog[];
  apiStatus: number | null;
  apiMessage: string;
  fallbackSourceUrl: string;
}): DetailSearchDiagnostics {
  return {
    query_terms: params.queryTerms,
    attempts: params.attempts,
    api_status: params.apiStatus,
    api_message: params.apiMessage || "NO ERROR",
    fallback_source_url: params.fallbackSourceUrl,
    institution_review_required: true,
  };
}

function formatSearchConditionSummary(diagnostics: DetailSearchDiagnostics): string {
  const queryText = diagnostics.query_terms.length > 0
    ? diagnostics.query_terms.join(", ")
    : "N/A";
  const attemptText = diagnostics.attempts.length > 0
    ? diagnostics.attempts
      .map((attempt) => {
        const raw = attempt.raw_count == null ? "" : `/raw:${attempt.raw_count}`;
        return `${attempt.label}:${attempt.item_count}${raw}`;
      })
      .join(" | ")
    : "N/A";
  return truncate(`query=${queryText}; attempts=${attemptText}`, 600);
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const rawValue of values) {
    const value = rawValue.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

async function fetchKotraOverseasCertInfo(
  params: DetailContext,
  key: string,
): Promise<KotraCertResult> {
  if (!key) {
    return {
      ok: false,
      status: null,
      message: "KOTRA API key is missing",
      items: [],
      diagnostics: createDetailDiagnostics({
        queryTerms: buildDetailQueryTerms(params),
        attempts: [],
        apiStatus: null,
        apiMessage: "KOTRA API key is missing",
        fallbackSourceUrl: KOTRA_OVERSEAS_AUTH_PAGE,
      }),
      matchStrategy: "country_hs_product",
    };
  }

  const queryTerms = buildDetailQueryTerms(params);
  const attempts = buildCertificationSearchAttempts({
    hsCode: params.hsCode,
    hskCode: params.hskCode,
    productName: params.productName,
    englishTerms: params.englishTerms,
    tagTerms: params.tagTerms,
    countryTerms: params.countryTerms,
    maxAttempts: 12,
  });
  const attemptLogs: DetailSearchAttemptLog[] = [];
  const relevanceContext = {
    countryCode: params.countryCode,
    countryAliases: getCountryAliases(params.countryCode, params.countryName),
    hsCode: params.hsCode,
    hskCode: params.hskCode,
    productName: params.productName,
    productTokens: getDetailSearchTokens(params),
  };

  let firstError: KotraCertApiResponse | null = null;
  let lastStatus: number | null = null;
  let lastOkStatus: number | null = null;
  let lastMessage = "NO ERROR";
  let successfulAttemptCount = 0;
  const fallbackCandidates: KotraCertItem[] = [];

  for (const attempt of attempts) {
    const isBaseQuery = attempt.label === "base_query";
    const maxPages = isBaseQuery ? 8 : 1;
    const numOfRows = isBaseQuery ? 100 : 20;

    for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
      const result = await callKotraOverseasAuthEndpoint(attempt.filters, key, {
        pageNo,
        numOfRows,
      });
      attemptLogs.push({
        label: isBaseQuery ? `${attempt.label}_page_${pageNo}` : attempt.label,
        filters: {
          ...attempt.filters,
          pageNo: String(pageNo),
          numOfRows: String(numOfRows),
        },
        status: result.status,
        message: result.message,
        item_count: result.items.length,
      });
      if (result.status != null) lastStatus = result.status;
      if (result.message) lastMessage = result.message;

      if (!result.ok) {
        if (!firstError) firstError = result;
        continue;
      }
      successfulAttemptCount += 1;
      if (result.status != null) lastOkStatus = result.status;
      fallbackCandidates.push(...result.items);

      const countryFiltered = filterCertificationByCountry(result.items, params.countryCode, params.countryName);
      const ranked = rankCertificationsByDetailRelevance(countryFiltered, relevanceContext);
      if (ranked.length > 0) {
        return {
          ok: true,
          status: result.status,
          message: result.message,
          items: ranked,
          diagnostics: createDetailDiagnostics({
            queryTerms,
            attempts: attemptLogs,
            apiStatus: result.status,
            apiMessage: result.message,
            fallbackSourceUrl: KOTRA_OVERSEAS_AUTH_PAGE,
          }),
          matchStrategy: "country_hs_product",
        };
      }

      if (result.items.length < numOfRows) break;
    }
  }

  const fallbackRanked = rankCertificationsByProductFallback(fallbackCandidates, relevanceContext);
  if (fallbackRanked.length > 0) {
    return {
      ok: true,
      status: lastOkStatus ?? lastStatus ?? 200,
      message: "country_product_fallback",
      items: fallbackRanked,
      diagnostics: createDetailDiagnostics({
        queryTerms,
        attempts: attemptLogs,
        apiStatus: lastOkStatus ?? lastStatus ?? 200,
        apiMessage: `country_product_fallback (${lastMessage || "NO ERROR"})`,
        fallbackSourceUrl: KOTRA_OVERSEAS_AUTH_PAGE,
      }),
      matchStrategy: "country_product_fallback",
    };
  }

  if (firstError && successfulAttemptCount === 0) {
    return {
      ok: false,
      status: firstError.status,
      message: firstError.message,
      items: [],
      diagnostics: createDetailDiagnostics({
        queryTerms,
        attempts: attemptLogs,
        apiStatus: firstError.status,
        apiMessage: firstError.message,
        fallbackSourceUrl: KOTRA_OVERSEAS_AUTH_PAGE,
      }),
      matchStrategy: "country_hs_product",
    };
  }

  return {
    ok: true,
    status: lastOkStatus ?? lastStatus ?? 200,
    message: lastMessage,
    items: [],
    diagnostics: createDetailDiagnostics({
      queryTerms,
      attempts: attemptLogs,
      apiStatus: lastOkStatus ?? lastStatus ?? 200,
      apiMessage: lastMessage,
      fallbackSourceUrl: KOTRA_OVERSEAS_AUTH_PAGE,
    }),
    matchStrategy: "country_hs_product",
  };
}

async function callKotraOverseasAuthEndpoint(
  filters: Record<string, string>,
  key: string,
  options?: { pageNo?: number; numOfRows?: number },
): Promise<KotraCertApiResponse> {
  const url = new URL(KOTRA_OVERSEAS_AUTH_ENDPOINT);
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("type", "json");
  url.searchParams.set("numOfRows", String(options?.numOfRows ?? 20));
  url.searchParams.set("pageNo", String(options?.pageNo ?? 1));

  for (const [filterKey, filterValue] of Object.entries(filters)) {
    const v = filterValue.trim();
    if (!v) continue;
    url.searchParams.set(filterKey, v);
  }

  const external = await fetchExternal(url.toString());
  if (!external.ok) {
    return { ok: false, status: null, message: external.message, items: [] };
  }
  const res = external.response;
  if (!res.ok) {
    return { ok: false, status: res.status, message: `HTTP ${res.status}`, items: [] };
  }

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, status: res.status, message: "Invalid JSON response", items: [] };
  }

  const response = asRecord(asRecord(parsed).response);
  const header = asRecord(response.header);
  const resultCode = asText(header.resultCode);
  const resultMsg = asText(header.resultMsg);

  if (resultCode && resultCode !== "00") {
    return { ok: false, status: res.status, message: `${resultCode}${resultMsg ? ` ${resultMsg}` : ""}`, items: [] };
  }

  const body = asRecord(response.body);
  const itemList = asRecord(body.itemList);
  const items = asArray(itemList.item)
    .map(normalizeCertificationItem)
    .filter((item) => item.systName || item.nttSj);

  return { ok: true, status: res.status, message: resultMsg || "NO ERROR", items };
}

async function fetchWtoEpingNotifications(
  params: DetailContext,
  key: string,
): Promise<WtoEpingNotificationResult> {
  const queryTerms = buildDetailQueryTerms(params);
  const countryIds = resolveWtoEpingCountryIds(params.countryCode);
  const attempts: DetailSearchAttemptLog[] = [];

  if (!key) {
    return {
      ok: false,
      status: null,
      message: "WTO_API_KEY is missing",
      detailState: "empty",
      items: [],
      broadItems: [],
      excludedItems: [],
      rawCount: 0,
      totalCount: 0,
      diagnostics: createDetailDiagnostics({
        queryTerms,
        attempts,
        apiStatus: null,
        apiMessage: "WTO_API_KEY is missing",
        fallbackSourceUrl: WTO_EPING_PAGE,
      }),
      sourceUrl: WTO_EPING_PAGE,
    };
  }

  if (countryIds.length === 0) {
    return {
      ok: true,
      status: null,
      message: "No WTO ePing member id mapped",
      detailState: "empty",
      items: [],
      broadItems: [],
      excludedItems: [],
      rawCount: 0,
      totalCount: 0,
      diagnostics: createDetailDiagnostics({
        queryTerms,
        attempts,
        apiStatus: null,
        apiMessage: "No WTO ePing member id mapped",
        fallbackSourceUrl: WTO_EPING_PAGE,
      }),
      sourceUrl: WTO_EPING_PAGE,
    };
  }

  const termPlan = buildWtoEpingTermPlan({
    productName: params.productName,
    productDescription: params.productDescription,
    productTags: params.productTags,
    englishTerms: params.englishTerms,
    tagTerms: params.tagTerms,
    hsCode: params.hsCode,
    hskCode: params.hskCode,
  });
  const specs = buildWtoEpingSearchSpecs(params, termPlan);
  if (specs.length === 0) {
    return {
      ok: true,
      status: null,
      message: "HS code and product search terms are missing",
      detailState: "empty",
      items: [],
      broadItems: [],
      excludedItems: [],
      rawCount: 0,
      totalCount: 0,
      diagnostics: createDetailDiagnostics({
        queryTerms,
        attempts,
        apiStatus: null,
        apiMessage: "HS code and product search terms are missing",
        fallbackSourceUrl: WTO_EPING_PAGE,
      }),
      sourceUrl: WTO_EPING_PAGE,
    };
  }
  const attemptResults = await Promise.all(
    specs.map((spec) => fetchWtoEpingSearchAttempt(params, countryIds, key, spec, termPlan)),
  );
  attempts.push(...attemptResults.map((result) => result.attempt));

  const successfulAttempts = attemptResults.filter((result) => result.ok);
  if (successfulAttempts.length === 0) {
    const firstError = attemptResults[0];
    const message = firstError?.message || "WTO ePing fetch failed";
    return {
      ok: false,
      status: firstError?.status ?? null,
      message,
      detailState: "error",
      items: [],
      broadItems: [],
      excludedItems: [],
      rawCount: 0,
      totalCount: 0,
      diagnostics: createDetailDiagnostics({
        queryTerms,
        attempts,
        apiStatus: firstError?.status ?? null,
        apiMessage: message,
        fallbackSourceUrl: WTO_EPING_PAGE,
      }),
      sourceUrl: WTO_EPING_PAGE,
    };
  }

  const rawTotalCount = successfulAttempts.reduce((sum, result) => sum + result.rawCount, 0);
  const apiTotalCount = successfulAttempts.reduce((sum, result) => sum + result.totalCount, 0);
  const items = dedupeWtoEpingNotifications(successfulAttempts.flatMap((result) => result.items)).slice(0, 10);
  const broadItems = dedupeWtoEpingNotifications(successfulAttempts.flatMap((result) => result.broadItems)).slice(0, 10);
  const excludedItems = dedupeWtoEpingNotifications(successfulAttempts.flatMap((result) => result.excludedItems)).slice(0, 10);
  const totalCount = apiTotalCount || rawTotalCount || items.length;
  const message = items.length > 0
    ? "NO ERROR"
    : rawTotalCount > 0 || broadItems.length > 0 || excludedItems.length > 0
      ? `No direct WTO ePing notifications matched (${rawTotalCount} raw items, ${broadItems.length} broad, ${excludedItems.length} excluded)`
      : "No WTO ePing notifications matched";

  return {
    ok: true,
    status: successfulAttempts[0]?.status ?? null,
    message,
    detailState: items.length > 0 ? "success" : "empty",
    items,
    broadItems,
    excludedItems,
    rawCount: rawTotalCount,
    totalCount,
    diagnostics: createDetailDiagnostics({
      queryTerms,
      attempts,
      apiStatus: successfulAttempts[0]?.status ?? null,
      apiMessage: message,
      fallbackSourceUrl: WTO_EPING_PAGE,
    }),
    sourceUrl: WTO_EPING_PAGE,
  };
}

function buildWtoEpingSearchSpecs(params: DetailContext, termPlan: WtoEpingTermPlan): WtoEpingSearchSpec[] {
  const hsDigits = params.hsCode.replace(/\D/g, "");
  const hs6 = hsDigits.length >= 6 ? hsDigits.slice(0, 6) : hsDigits;
  const hs4 = hsDigits.length >= 4 ? hsDigits.slice(0, 4) : "";
  const exactTerms = termPlan.exactTerms.slice(0, 3);
  const familyTerms = termPlan.familyTerms.slice(0, 4);

  return [
    hs6 ? { label: "wto_eping_hs6_country", queryType: "hs6", hsCode: hs6 } : null,
    hs4 && hs4 !== hs6 ? { label: "wto_eping_hs4_country", queryType: "hs4", hsCode: hs4 } : null,
    ...exactTerms.map((term) => ({
      label: "wto_eping_exact_product_country",
      queryType: "exact_product" as const,
      freeText: term,
    })),
    ...familyTerms.map((term) => ({
      label: "wto_eping_product_family_country",
      queryType: "product_family" as const,
      freeText: term,
    })),
  ].filter((spec): spec is WtoEpingSearchSpec => Boolean(spec));
}

function buildWtoEpingFreeTextTerms(params: DetailContext): string[] {
  const terms = extractEnglishSearchTerms(
    params.productName,
    params.productDescription,
    ...params.productTags,
  );
  return dedupeStrings(terms)
    .filter((term) => /^[A-Z0-9][A-Z0-9-]{2,}$/i.test(term))
    .filter((term) => /^[A-Z0-9-]+$/.test(term) || /\d/.test(term))
    .filter((term) => !isWeakProductRelevanceToken(term.toLowerCase()))
    .slice(0, 2);
}

async function fetchWtoEpingSearchAttempt(
  params: DetailContext,
  countryIds: string[],
  key: string,
  spec: WtoEpingSearchSpec,
  termPlan: WtoEpingTermPlan,
): Promise<WtoEpingAttemptResult> {
  const url = buildWtoEpingSearchUrl(WTO_EPING_NOTIFICATION_SEARCH_ENDPOINT, {
    countryIds,
    hsCode: spec.hsCode,
    freeText: spec.freeText,
    page: 1,
    pageSize: 10,
  });
  const filters: Record<string, string> = {};
  for (const [key, value] of Object.entries({
    countryIds: countryIds.join(","),
    hs: spec.hsCode ?? "",
    freeText: spec.freeText ?? "",
    language: "1",
  })) {
    if (value) filters[key] = value;
  }

  const external = await fetchExternal(url, {
    headers: {
      "Ocp-Apim-Subscription-Key": key,
    },
  });
  if (!external.ok) {
    return {
      ok: false,
      status: null,
      message: external.message,
      items: [],
      broadItems: [],
      excludedItems: [],
      totalCount: 0,
      rawCount: 0,
      attempt: {
        label: spec.label,
        filters,
        status: null,
        message: external.message,
        item_count: 0,
        raw_count: 0,
        direct_count: 0,
        broad_count: 0,
        excluded_count: 0,
      },
    };
  }

  const res = external.response;
  if (!res.ok) {
    const message = `HTTP ${res.status}`;
    return {
      ok: false,
      status: res.status,
      message,
      items: [],
      broadItems: [],
      excludedItems: [],
      totalCount: 0,
      rawCount: 0,
      attempt: {
        label: spec.label,
        filters,
        status: res.status,
        message,
        item_count: 0,
        raw_count: 0,
        direct_count: 0,
        broad_count: 0,
        excluded_count: 0,
      },
    };
  }

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const message = "Invalid JSON response";
    return {
      ok: false,
      status: res.status,
      message,
      items: [],
      broadItems: [],
      excludedItems: [],
      totalCount: 0,
      rawCount: 0,
      attempt: {
        label: spec.label,
        filters,
        status: res.status,
        message,
        item_count: 0,
        raw_count: 0,
        direct_count: 0,
        broad_count: 0,
        excluded_count: 0,
      },
    };
  }

  const rawItems = extractWtoEpingRecordList(parsed);
  const allNormalized = rawItems
    .map(normalizeWtoEpingNotification)
    .filter((item) => item.documentSymbol || item.title || item.productsText)
    .map((item) => ({
      ...item,
      matchScope: spec.label,
      matchText: spec.hsCode || spec.freeText || "",
      queryType: spec.queryType,
    }));
  const classifiedItems = allNormalized.map((item) => {
    const classification = classifyWtoEpingNotification(item, {
      hsCode: params.hsCode,
      exactTerms: termPlan.exactTerms,
      familyTerms: termPlan.familyTerms,
    });
    return {
      ...item,
      epingClassification: classification.classification,
      epingScore: classification.score,
      epingReason: classification.reason,
      epingMatchedTerms: classification.matchedTerms,
    };
  });
  const items = classifiedItems.filter((item) => item.epingClassification === "direct_candidate");
  const broadItems = classifiedItems.filter((item) => item.epingClassification === "broad_reference");
  const excludedItems = classifiedItems.filter((item) => item.epingClassification === "excluded_noise");
  const totalCount = extractWtoEpingTotalCount(parsed, allNormalized.length);
  const message = items.length > 0
    ? "NO ERROR"
    : allNormalized.length > 0
      ? `No direct WTO ePing notifications in ${allNormalized.length} raw items`
      : "No WTO ePing notifications matched";

  return {
    ok: true,
    status: res.status,
    message,
    items,
    broadItems,
    excludedItems,
    totalCount,
    rawCount: allNormalized.length,
    attempt: {
      label: spec.label,
      filters,
      status: res.status,
      message,
      item_count: items.length,
      raw_count: allNormalized.length,
      direct_count: items.length,
      broad_count: broadItems.length,
      excluded_count: excludedItems.length,
    },
  };
}

function dedupeWtoEpingNotifications(items: WtoEpingNotification[]): WtoEpingNotification[] {
  const seen = new Set<string>();
  const out: WtoEpingNotification[] = [];
  for (const item of items) {
    const key = [
      item.documentSymbol.trim().toUpperCase(),
      item.sourceUrl.trim().toLowerCase(),
      item.title.trim().toLowerCase(),
    ].filter(Boolean).join("|");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * HS 6자리 정밀 매칭 또는 제품 토큰 매칭으로 관련성 높은 ePing 통보문만 필터링.
 * HS 4자리(예: 8703) 수준의 느슨한 매칭으로 무관한 안전 규정이 대량 표시되는 문제를 해결.
 */
function filterEpingByRelevance(
  items: WtoEpingNotification[],
  params: DetailContext,
): WtoEpingNotification[] {
  const hsDigits = params.hsCode.replace(/\D/g, "");
  const hs6 = hsDigits.length >= 6 ? hsDigits.slice(0, 6) : "";
  const hs4 = hsDigits.length >= 4 ? hsDigits.slice(0, 4) : "";
  const productTokens = extractDetailProductTokens(
    params.productName,
    params.productDescription,
    params.productTags,
  );

  return items.filter((item) => {
    // 1. HS 6자리 정밀 매칭: item의 HS 코드 목록에 우리 HS6가 포함되는지
    const itemHsText = item.hsCodeText || "";
    const itemHsDigits = itemHsText.match(/\d{4,10}/g) || [];
    if (hs6) {
      const has6digitMatch = itemHsDigits.some((h) => {
        const prefix = h.slice(0, 6);
        return prefix === hs6;
      });
      if (has6digitMatch) return true;
    }

    const has4digitMatch = Boolean(hs4) &&
      itemHsDigits.some((h) => h.length === 4 && h.slice(0, 4) === hs4);
    if (has4digitMatch) return true;

    // 2. 제품명/설명 토큰 매칭: 통보문 제목·제품·설명에 제품 토큰이 포함되는지
    if (productTokens.length > 0) {
      const haystack = [
        item.title,
        item.productsText,
      ].join(" ").toLowerCase();
      const hasProductMatch = productTokens.some(
        (token) => token.length >= 3 && haystack.includes(token.toLowerCase()),
      );
      if (hasProductMatch) return true;
    }

    // 3. HS 4자리만 일치하고 제품 토큰 매칭 없으면 → 관련성 낮음, 필터링
    return false;
  });
}

function extractWtoEpingRecordList(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  const record = asRecord(parsed);
  for (const key of ["items", "notifications", "results", "records", "value"]) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  const data = record.data;
  if (Array.isArray(data)) return data;
  const dataRecord = asRecord(data);
  for (const key of ["items", "notifications", "results", "records", "value"]) {
    const value = dataRecord[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function extractWtoEpingTotalCount(parsed: unknown, fallback: number): number {
  const records = [asRecord(parsed), asRecord(asRecord(parsed).data)];
  for (const record of records) {
    for (const key of ["totalCount", "count", "total", "totalResults", "recordCount"]) {
      const value = Number(record[key]);
      if (Number.isFinite(value) && value >= 0) return value;
    }
  }
  return fallback;
}

async function fetchKotraImportRegulations(
  params: DetailContext,
  supa: ReturnType<typeof createClient>,
  authHeader: string,
  options: KotraImportRegulationFetchOptions = {},
): Promise<KotraImportRegulationResult> {
  const queryTerms = buildDetailQueryTerms(params);
  const attemptLogs: DetailSearchAttemptLog[] = [...(options.priorAttempts ?? [])];
  const allowApiSync = options.allowApiSync !== false;
  const relevanceContext = {
    countryCode: params.countryCode,
    countryAliases: getCountryAliases(params.countryCode, params.countryName),
    hsCode: params.hsCode,
    hskCode: params.hskCode,
    productName: params.productName,
    productTokens: getDetailSearchTokens(params),
  };

  const cacheStatusResponse = await supa
    .from("api_cache_status")
    .select("cache_key,status,active_batch_id,total_count,fetched_count,upserted_count,last_attempt_at,last_success_at,last_error,stale_after_days")
    .eq("cache_key", KOTRA_IMPORT_REGULATION_CACHE_KEY)
    .maybeSingle();

  if (cacheStatusResponse.error) {
    attemptLogs.push({
      label: "cache_status",
      filters: { cache_key: KOTRA_IMPORT_REGULATION_CACHE_KEY },
      status: null,
      message: cacheStatusResponse.error.message,
      item_count: 0,
    });
    if (allowApiSync) {
      const syncResult = await invokeKotraImportRegulationSync(authHeader);
      attemptLogs.push({
        label: "api_sync",
        filters: { reason: "cache_status_error" },
        status: syncResult.status,
        message: syncResult.message,
        item_count: 0,
      });
      if (syncResult.ok) {
        return await fetchKotraImportRegulations(params, supa, authHeader, {
          allowApiSync: false,
          priorAttempts: attemptLogs,
          sourceTypeOverride: "kotra_api_sync",
          syncAttempted: true,
          syncMessage: syncResult.message,
        });
      }
    }
    const backupResult = await fetchCsvImportRegulationBackup(params, supa, relevanceContext);
    attemptLogs.push(...backupResult.attempts);
    const backupHasRows = backupResult.items.length > 0 || backupResult.reviewItems.length > 0;
    return {
      ok: backupHasRows,
      status: backupHasRows ? 200 : null,
      message: backupHasRows
        ? `캐시 상태 조회 실패로 CSV 백업 근거를 사용했습니다. (${cacheStatusResponse.error.message})`
        : cacheStatusResponse.error.message,
      detailState: backupHasRows ? "success" : "error",
      items: backupResult.items,
      reviewItems: backupResult.reviewItems,
      diagnostics: createDetailDiagnostics({
        queryTerms,
        attempts: attemptLogs,
        apiStatus: backupHasRows ? 200 : null,
        apiMessage: backupHasRows
          ? `csv_backup_used (${backupResult.message})`
          : cacheStatusResponse.error.message,
        fallbackSourceUrl: KOTRA_IMPORT_REGULATION_BACKUP_PAGE,
      }),
      sourceUrl: backupHasRows ? KOTRA_IMPORT_REGULATION_BACKUP_PAGE : KOTRA_IMPORT_REGULATION_PAGE,
    };
  }

  const normalizedCacheStatus = normalizeImportRegulationCacheStatus(cacheStatusResponse.data);
  const freshness = evaluateKotraImportRegulationCacheFreshness(normalizedCacheStatus);
  const cacheMeta = {
    cache_status: normalizedCacheStatus?.status || "",
    cache_last_success_at: normalizedCacheStatus?.lastSuccessAt || null,
    cache_active_batch_id: normalizedCacheStatus?.activeBatchId || null,
    cache_stale_after_days: normalizedCacheStatus?.staleAfterDays || KOTRA_IMPORT_REGULATION_DEFAULT_STALE_DAYS,
    cache_age_days: freshness.ageDays,
    cache_reason: freshness.reason,
    sync_attempted: options.syncAttempted ?? false,
    sync_message: options.syncMessage ?? null,
  };

  attemptLogs.push({
    label: "cache_status",
    filters: { cache_key: KOTRA_IMPORT_REGULATION_CACHE_KEY },
    status: 200,
    message: freshness.stale
      ? formatImportRegulationCacheStaleMessage(cacheMeta.cache_reason, cacheMeta.cache_stale_after_days)
      : "cache_ready",
    item_count: 0,
  });

  if (shouldAttemptKotraImportRegulationApiSync(normalizedCacheStatus, freshness, null)) {
    const staleMessage = formatImportRegulationCacheStaleMessage(cacheMeta.cache_reason, cacheMeta.cache_stale_after_days);
    if (allowApiSync) {
      const syncResult = await invokeKotraImportRegulationSync(authHeader);
      attemptLogs.push({
        label: "api_sync",
        filters: { reason: cacheMeta.cache_reason || "missing_active_batch_or_stale" },
        status: syncResult.status,
        message: syncResult.message,
        item_count: 0,
      });
      if (syncResult.ok) {
        return await fetchKotraImportRegulations(params, supa, authHeader, {
          allowApiSync: false,
          priorAttempts: attemptLogs,
          sourceTypeOverride: "kotra_api_sync",
          syncAttempted: true,
          syncMessage: syncResult.message,
        });
      }
      cacheMeta.sync_attempted = true;
      cacheMeta.sync_message = syncResult.message;
    }
    const backupResult = await fetchCsvImportRegulationBackup(params, supa, relevanceContext);
    attemptLogs.push(...backupResult.attempts);
    const backupHasRows = backupResult.items.length > 0 || backupResult.reviewItems.length > 0;
    if (backupHasRows) {
      return {
        ok: true,
        status: 200,
        message: `${staleMessage} / CSV 백업 ${backupResult.items.length}건 사용`,
        detailState: "success",
        items: backupResult.items,
        reviewItems: backupResult.reviewItems,
        diagnostics: createDetailDiagnostics({
          queryTerms,
          attempts: attemptLogs,
          apiStatus: 200,
          apiMessage: `stale_cache_with_csv_backup (${backupResult.message})`,
          fallbackSourceUrl: KOTRA_IMPORT_REGULATION_BACKUP_PAGE,
        }),
        sourceUrl: KOTRA_IMPORT_REGULATION_BACKUP_PAGE,
        cacheMeta,
      };
    }
    return {
      ok: true,
      status: 200,
      message: staleMessage,
      detailState: "stale",
      items: [],
      reviewItems: [],
      diagnostics: createDetailDiagnostics({
        queryTerms,
        attempts: attemptLogs,
        apiStatus: 200,
        apiMessage: staleMessage,
        fallbackSourceUrl: KOTRA_IMPORT_REGULATION_BACKUP_PAGE,
      }),
      sourceUrl: KOTRA_IMPORT_REGULATION_BACKUP_PAGE,
      cacheMeta,
    };
  }

  const pageSize = 1000;
  const allItems: KotraImportRegulationItem[] = [];
  let from = 0;
  while (true) {
    const to = from + pageSize - 1;
    const cacheRowsResponse = await supa
      .from("kotra_import_regulation_cache")
      .select("id,batch_id,is_active,hqurt_name,cmdlt_name,hscd,hscd_cn,reg_dt,regl_cn,iso_wd2_nat_cd,regl_str_de,regl_end_de,probe_tgt_nat_name,raw")
      .eq("batch_id", normalizedCacheStatus.activeBatchId)
      .eq("is_active", true)
      .order("id", { ascending: true })
      .range(from, to);

    if (cacheRowsResponse.error) {
      const errorMessage = cacheRowsResponse.error.message;
      attemptLogs.push({
        label: `cache_page_${Math.floor(from / pageSize) + 1}`,
        filters: {
          batch_id: normalizedCacheStatus.activeBatchId,
          from: String(from),
          to: String(to),
        },
        status: null,
        message: errorMessage,
        item_count: 0,
      });
      if (shouldAttemptKotraImportRegulationApiSync(normalizedCacheStatus, freshness, errorMessage) && allowApiSync) {
        const syncResult = await invokeKotraImportRegulationSync(authHeader);
        attemptLogs.push({
          label: "api_sync",
          filters: { reason: "cache_read_error" },
          status: syncResult.status,
          message: syncResult.message,
          item_count: 0,
        });
        if (syncResult.ok) {
          return await fetchKotraImportRegulations(params, supa, authHeader, {
            allowApiSync: false,
            priorAttempts: attemptLogs,
            sourceTypeOverride: "kotra_api_sync",
            syncAttempted: true,
            syncMessage: syncResult.message,
          });
        }
        cacheMeta.sync_attempted = true;
        cacheMeta.sync_message = syncResult.message;
      }
      const backupResult = await fetchCsvImportRegulationBackup(params, supa, relevanceContext);
      attemptLogs.push(...backupResult.attempts);
      const backupHasRows = backupResult.items.length > 0 || backupResult.reviewItems.length > 0;
      if (backupHasRows) {
        return {
          ok: true,
          status: 200,
          message: `캐시 조회 오류로 CSV 백업 ${backupResult.items.length}건을 사용했습니다. (${errorMessage})`,
          detailState: "success",
          items: backupResult.items,
          reviewItems: backupResult.reviewItems,
          diagnostics: createDetailDiagnostics({
            queryTerms,
            attempts: attemptLogs,
            apiStatus: 200,
            apiMessage: `cache_read_error_csv_backup (${backupResult.message})`,
            fallbackSourceUrl: KOTRA_IMPORT_REGULATION_BACKUP_PAGE,
          }),
          sourceUrl: KOTRA_IMPORT_REGULATION_BACKUP_PAGE,
          cacheMeta,
        };
      }
      return {
        ok: false,
        status: null,
        message: errorMessage,
        detailState: "error",
        items: [],
        reviewItems: [],
        diagnostics: createDetailDiagnostics({
          queryTerms,
          attempts: attemptLogs,
          apiStatus: null,
          apiMessage: errorMessage,
          fallbackSourceUrl: KOTRA_IMPORT_REGULATION_BACKUP_PAGE,
        }),
        sourceUrl: KOTRA_IMPORT_REGULATION_PAGE,
        cacheMeta,
      };
    }

    const chunk = asArray(cacheRowsResponse.data)
      .map((row) => {
        const item = toImportRegulationItemFromCacheRow(row);
        return options.sourceTypeOverride ? { ...item, __source: options.sourceTypeOverride } : item;
      })
      .filter((item) => item.HSCD || item.CMDLT_NAME || item.REGL_CN);
    attemptLogs.push({
      label: `cache_page_${Math.floor(from / pageSize) + 1}`,
      filters: {
        batch_id: normalizedCacheStatus.activeBatchId,
        from: String(from),
        to: String(to),
        numOfRows: String(pageSize),
      },
      status: 200,
      message: "cache_read_ok",
      item_count: chunk.length,
    });

    allItems.push(...chunk);
    if (chunk.length < pageSize) {
      break;
    }
    from += pageSize;
  }

  const ranked = rankImportRegulationsByDetailRelevance(allItems, relevanceContext)
    .map((item) => ({ ...item, __match_strategy: "kr_origin_country_hs" as const }));
  const reviewRanked = rankImportRegulationsByProductReview(allItems, relevanceContext)
    .map((item) => ({ ...item, __match_strategy: "kr_origin_product_review" as const }));
  if (ranked.length > 0 || reviewRanked.length > 0) {
    return {
      ok: true,
      status: 200,
      message: "cache_read_ok",
      detailState: "success",
      items: ranked,
      reviewItems: reviewRanked,
      diagnostics: createDetailDiagnostics({
        queryTerms,
        attempts: attemptLogs,
        apiStatus: 200,
        apiMessage: "cache_read_ok",
        fallbackSourceUrl: KOTRA_IMPORT_REGULATION_PAGE,
      }),
      sourceUrl: KOTRA_IMPORT_REGULATION_PAGE,
      cacheMeta,
    };
  }

  const backupResult = await fetchCsvImportRegulationBackup(params, supa, relevanceContext);
  attemptLogs.push(...backupResult.attempts);
  const backupHasRows = backupResult.items.length > 0 || backupResult.reviewItems.length > 0;
  if (backupHasRows) {
    return {
      ok: true,
      status: 200,
      message: `전체 캐시 기준 필터 매칭 0건 / CSV 백업 ${backupResult.items.length}건, 검토 후보 ${backupResult.reviewItems.length}건 사용`,
      detailState: "success",
      items: backupResult.items,
      reviewItems: backupResult.reviewItems,
      diagnostics: createDetailDiagnostics({
        queryTerms,
        attempts: attemptLogs,
        apiStatus: 200,
        apiMessage: `cache_filter_match_0_csv_backup_used (${backupResult.message})`,
        fallbackSourceUrl: KOTRA_IMPORT_REGULATION_BACKUP_PAGE,
      }),
      sourceUrl: KOTRA_IMPORT_REGULATION_BACKUP_PAGE,
      cacheMeta,
    };
  }

  return {
    ok: true,
    status: 200,
    message: "cache_filter_match_0",
    detailState: "empty",
    items: [],
    reviewItems: [],
    diagnostics: createDetailDiagnostics({
      queryTerms,
      attempts: attemptLogs,
      apiStatus: 200,
      apiMessage: `cache_filter_match_0_csv_backup_no_match (${backupResult.message})`,
      fallbackSourceUrl: KOTRA_IMPORT_REGULATION_BACKUP_PAGE,
    }),
    sourceUrl: KOTRA_IMPORT_REGULATION_BACKUP_PAGE,
    cacheMeta,
  };
}

async function invokeKotraImportRegulationSync(authHeader: string): Promise<KotraImportRegulationSyncResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl) {
    return { ok: false, status: null, message: "SUPABASE_URL is missing" };
  }
  if (!supabaseServiceRoleKey && !authHeader) {
    return { ok: false, status: null, message: "SUPABASE_SERVICE_ROLE_KEY or user Authorization is missing" };
  }

  const syncAuthHeader = supabaseServiceRoleKey ? `Bearer ${supabaseServiceRoleKey}` : authHeader;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), KOTRA_IMPORT_REGULATION_SYNC_TIMEOUT_MS);
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/sync-kotra-import-regulations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: syncAuthHeader,
      },
      body: JSON.stringify({ numOfRows: 200 }),
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = asRecord(JSON.parse(text));
    } catch {
      parsed = {};
    }
    const ok = response.ok && asBoolean(parsed.ok);
    const message = asText(parsed.message) || (ok ? "KOTRA import regulation cache sync completed" : `HTTP ${response.status}`);
    return { ok, status: response.status, message };
  } catch (error) {
    return { ok: false, status: null, message: toExternalFetchMessage(error) };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchCsvImportRegulationBackup(
  params: DetailContext,
  supa: ReturnType<typeof createClient>,
  relevanceContext: {
    countryCode: string;
    countryAliases: string[];
    hsCode: string;
    hskCode: string;
    productName?: string;
    productTokens: string[];
  },
): Promise<CsvImportRegulationBackupResult> {
  const attempts: DetailSearchAttemptLog[] = [];
  const pageSize = 2000;
  const matchedItems: KotraImportRegulationItem[] = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const response = await supa
      .from("kotra_csv_import_regulation_cache")
      .select("id,regulation_country_code,regulation_country_name,regulation_country_normalized,hs_code_raw,hs_code_normalized,item_name,regulation_type,target_country_text,decision_period,decision_tariff,korea_target_yn,is_korea_target,is_active")
      .eq("is_active", true)
      .order("id", { ascending: true })
      .range(from, to);

    if (response.error) {
      attempts.push({
        label: `csv_backup_page_${Math.floor(from / pageSize) + 1}`,
        filters: { from: String(from), to: String(to), is_active: "true" },
        status: null,
        message: response.error.message,
        item_count: 0,
      });
      return {
        items: [],
        reviewItems: [],
        attempts,
        message: response.error.message,
      };
    }

    const chunk = asArray(response.data);
    let matchedInChunk = 0;
    for (const entry of chunk) {
      if (!isCsvBackupCountryMatched(entry, params, relevanceContext.countryAliases)) continue;
      if (!isCsvBackupKoreaTarget(entry)) continue;
      const item = toImportRegulationItemFromCsvBackupRow(entry, params.countryCode);
      if (!item.HSCD && !item.CMDLT_NAME && !item.REGL_CN) continue;
      matchedItems.push(item);
      matchedInChunk += 1;
    }

    attempts.push({
      label: `csv_backup_page_${Math.floor(from / pageSize) + 1}`,
      filters: { from: String(from), to: String(to), is_active: "true" },
      status: 200,
      message: "csv_backup_read_ok",
      item_count: matchedInChunk,
    });

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  const ranked = rankImportRegulationsByDetailRelevance(matchedItems, relevanceContext)
    .slice(0, 30)
    .map((item) => ({ ...item, __source: "csv_backup" as const, __match_strategy: "kr_origin_country_hs" as const }));
  const reviewRanked = rankImportRegulationsByProductReview(matchedItems, relevanceContext)
    .slice(0, 30)
    .map((item) => ({ ...item, __source: "csv_backup" as const, __match_strategy: "kr_origin_product_review" as const }));
  if (ranked.length > 0 || reviewRanked.length > 0) {
    attempts.push({
      label: "csv_backup_rank",
      filters: { strategy: "detail_relevance" },
      status: 200,
      message: "csv_backup_rank_ok",
      item_count: ranked.length + reviewRanked.length,
    });
    return {
      items: ranked,
      reviewItems: reviewRanked,
      attempts,
      message: `csv_backup_rank_ok:${ranked.length},review:${reviewRanked.length}`,
    };
  }

  attempts.push({
    label: "csv_backup_rank_strict",
    filters: { strategy: "kr_origin_country_hs" },
    status: 200,
    message: "csv_backup_no_match",
    item_count: 0,
  });
  return {
    items: [],
    reviewItems: [],
    attempts,
    message: "csv_backup_no_match",
  };
}

function formatImportRegulationCacheStaleMessage(
  reason: string | null,
  staleAfterDays: number,
): string {
  if (reason === "missing_status") return "Import-regulation cache status is missing.";
  if (reason === "missing_active_batch") return "Import-regulation cache active batch is missing.";
  if (reason === "missing_last_success") return "Import-regulation cache has no successful refresh timestamp.";
  if (reason === "expired") return `Import-regulation cache is older than ${staleAfterDays} days.`;
  return "Import-regulation cache is stale or not synchronized.";
}

function rankImportRegulations(
  items: KotraImportRegulationItem[],
  params: DetailContext,
): KotraImportRegulationItem[] {
  if (items.length === 0) return [];

  const productTokens = getDetailSearchTokens(params);
  const hsCode = params.hsCode;
  const hskCode = params.hskCode;
  const hsk6 = hskCode ? hskCode.slice(0, 6) : "";
  const hs4 = hsCode ? hsCode.slice(0, 4) : "";
  const requireProductSignal = true;

  const scored = items.map((item) => {
    let score = 0;

    const iso = item.ISO_WD2_NAT_CD.toUpperCase();
    const targetCountryText = `${item.PROBE_TGT_NAT_NAME} ${item.HQURT_NAME}`;
    const commodityText = `${item.CMDLT_NAME} ${item.HSCD_CN} ${item.REGL_CN}`.toLowerCase();
    const normalizedHs = normalizeHsOrHsk(item.HSCD);

    const countryMatchedByIso = Boolean(iso && iso === params.countryCode);
    const countryMatchedByAlias = isCountryTextMatched(params.countryCode, params.countryName, targetCountryText);
    const countrySignal = countryMatchedByIso || countryMatchedByAlias;

    const hs6ExactMatched = Boolean(hsCode && normalizedHs === hsCode);
    const hsk10ExactMatched = Boolean(hskCode && normalizedHs === hskCode);
    const hsk6Matched = Boolean(!hs6ExactMatched && !hsk10ExactMatched && hsk6 && normalizedHs.startsWith(hsk6));
    const hs4PrefixMatched = Boolean(!hs6ExactMatched && !hsk10ExactMatched && hs4 && normalizedHs.startsWith(hs4));
    const tokenMatched = productTokens.some((token) => commodityText.includes(token));
    const hsSignal = hs6ExactMatched || hsk10ExactMatched || hsk6Matched || hs4PrefixMatched;
    const tripleMatched = hsSignal && tokenMatched;

    if (!countrySignal) return { item, score: 0, relevant: false, countrySignal: false, countryScore: 0 };
    if (requireProductSignal && !tripleMatched) {
      return {
        item,
        score: 0,
        relevant: false,
        countrySignal: true,
        countryScore: (countryMatchedByIso ? 4 : 0) + (countryMatchedByAlias ? 3 : 0),
      };
    }

    if (countryMatchedByIso) score += 4;
    if (countryMatchedByAlias) score += 3;
    if (hsk10ExactMatched) score += 8;
    else if (hs6ExactMatched) score += 6;
    else if (hsk6Matched) score += 4;
    else if (hs4PrefixMatched) score += 3;
    if (tokenMatched) score += 4;

    return {
      item,
      score,
      relevant: true,
      countrySignal,
      countryScore: (countryMatchedByIso ? 4 : 0) + (countryMatchedByAlias ? 3 : 0),
    };
  });

  const strictRows = scored.filter((row) => row.relevant && row.score > 0);
  if (strictRows.length === 0) return [];

  strictRows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return normalizeRegEpoch(b.item) - normalizeRegEpoch(a.item);
  });

  const out: KotraImportRegulationItem[] = [];
  const seen = new Set<string>();
  for (const row of strictRows) {
    const key = `${row.item.HSCD}|${row.item.REGL_CN}|${row.item.ISO_WD2_NAT_CD}|${row.item.PROBE_TGT_NAT_NAME}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row.item);
    if (out.length >= 30) break;
  }

  return out;
}

function normalizeImportRegulationItem(value: unknown): KotraImportRegulationItem {
  const row = asRecord(value);
  return {
    HQURT_NAME: asText(row.HQURT_NAME),
    CMDLT_NAME: asText(row.CMDLT_NAME),
    HSCD: asText(row.HSCD),
    HSCD_CN: asText(row.HSCD_CN),
    REG_DT: asText(row.REG_DT),
    REGL_CN: asText(row.REGL_CN),
    ISO_WD2_NAT_CD: asText(row.ISO_WD2_NAT_CD),
    REGL_STR_DE: asText(row.REGL_STR_DE),
    REGL_END_DE: asText(row.REGL_END_DE),
    PROBE_TGT_NAT_NAME: asText(row.PROBE_TGT_NAT_NAME),
  };
}

function toImportRegulationItemFromCsvBackupRow(
  value: unknown,
  countryCode: string,
): KotraImportRegulationItem {
  const row = asRecord(value);
  const hsCode = asText(row.hs_code_normalized) || asText(row.hs_code_raw);
  const countryName = asText(row.regulation_country_name) || asText(row.target_country_text);
  const originalCountryCode = asText(row.regulation_country_code);
  const backupRowId = asNumber(row.id);
  const probeTargetCountry = isCsvBackupKoreaTarget(row) ? "Republic of Korea" : asText(row.target_country_text);
  const hsDetailParts = dedupeStrings([
    asText(row.decision_period) ? `판정기간 ${asText(row.decision_period)}` : "",
    asText(row.decision_tariff) ? `관세 ${asText(row.decision_tariff)}` : "",
    asText(row.korea_target_yn) ? `한국 대상 ${asText(row.korea_target_yn)}` : "",
  ]);

  return {
    HQURT_NAME: countryName || STATUS_TEXT.noCertainInfo,
    CMDLT_NAME: asText(row.item_name),
    HSCD: hsCode,
    HSCD_CN: hsDetailParts.join(" | "),
    REG_DT: "",
    REGL_CN: asText(row.regulation_type),
    ISO_WD2_NAT_CD: originalCountryCode || countryCode,
    REGL_STR_DE: "",
    REGL_END_DE: "",
    PROBE_TGT_NAT_NAME: probeTargetCountry,
    __source: "csv_backup",
    __backup_row_id: backupRowId == null ? undefined : Math.trunc(backupRowId),
  };
}

function isCsvBackupKoreaTarget(value: unknown): boolean {
  const row = asRecord(value);
  return isKoreaTargetFlagValue(row.is_korea_target) || isKoreaTargetFlagValue(row.korea_target_yn);
}

function isCsvBackupCountryMatched(
  value: unknown,
  params: DetailContext,
  aliases: string[],
): boolean {
  const row = asRecord(value);
  const code = asText(row.regulation_country_code).toUpperCase();
  if (code && code === params.countryCode) return true;

  const countryText = cleanText([
    asText(row.regulation_country_code),
    asText(row.regulation_country_name),
    asText(row.regulation_country_normalized),
    asText(row.target_country_text),
  ].join(" ")).toLowerCase();
  if (!countryText) return false;
  return aliases.some((alias) => countryText.includes(alias));
}

async function fetchKsureCountryGrade(
  params: { countryCode: string; countryName: string },
  key: string,
): Promise<KsureCountryGradeResult> {
  if (!key) {
    return { ok: false, status: null, message: "K-SURE API key is missing", item: null };
  }

  const pageResult = await callKsureCountryGradePage(1, 500, key);
  if (!pageResult.ok) {
    return { ok: false, status: pageResult.status, message: pageResult.message, item: null };
  }

  const exactByCode = pageResult.items.find(
    (item) => item.ctryCd.toUpperCase() === params.countryCode,
  );
  if (exactByCode) {
    return { ok: true, status: pageResult.status, message: pageResult.message, item: exactByCode };
  }

  const byName = pageResult.items.find((item) => {
    return isCountryTextMatched(params.countryCode, params.countryName, item.ctryNm);
  });

  return { ok: true, status: pageResult.status, message: pageResult.message, item: byName ?? null };
}

async function callKsureCountryGradePage(
  pageNo: number,
  numOfRows: number,
  key: string,
): Promise<{ ok: boolean; status: number | null; message: string; items: KsureCountryGradeItem[] }> {
  const url = new URL(KSURE_COUNTRY_GRADE_ENDPOINT);
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("numOfRows", String(numOfRows));
  url.searchParams.set("_type", "json");

  const external = await fetchExternal(url.toString());
  if (!external.ok) {
    return { ok: false, status: null, message: external.message, items: [] };
  }
  const res = external.response;
  if (!res.ok) {
    return { ok: false, status: res.status, message: `HTTP ${res.status}`, items: [] };
  }

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, status: res.status, message: "Invalid JSON response", items: [] };
  }

  const response = asRecord(asRecord(parsed).response);
  const header = asRecord(response.header);
  const resultCode = asText(header.resultCode);
  const resultMsg = asText(header.resultMsg);

  if (resultCode && resultCode !== "0" && resultCode !== "00") {
    return {
      ok: false,
      status: res.status,
      message: `${resultCode}${resultMsg ? ` ${resultMsg}` : ""}`,
      items: [],
    };
  }

  const body = asRecord(response.body);
  const itemsNode = asRecord(body.items);
  const items = asArray(itemsNode.item)
    .map(normalizeKsureCountryGradeItem)
    .filter((item) => item.ctryCd || item.ctryNm || item.evalGrd || item.evalDd);

  return {
    ok: true,
    status: res.status,
    message: resultMsg || "NO ERROR",
    items,
  };
}

function normalizeKsureCountryGradeItem(value: unknown): KsureCountryGradeItem {
  const row = asRecord(value);
  return {
    ctryCd: asText(row.ctryCd).toUpperCase(),
    ctryNm: asText(row.ctryNm),
    evalGrd: asText(row.evalGrd),
    evalDd: asText(row.evalDd),
  };
}

async function fetchKsureIndustryRisks(
  params: { countryCode: string; countryName: string; industryCode: string },
  key: string,
): Promise<KsureIndustryRiskResult> {
  const inputIndustryCode = normalizeIndustryCode(params.industryCode);
  if (!key) {
    return {
      ok: false,
      status: null,
      message: "K-SURE API key is missing",
      items: [],
      inputIndustryCode,
      mappedIndustryCodes: [],
      countryItemCount: 0,
      industryMatchFailed: false,
    };
  }

  const maxPages = 10;
  const pageSize = 200;
  const countryMatched: KsureIndustryRiskItem[] = [];
  let firstError: KsureIndustryRiskResult | null = null;

  for (let page = 1; page <= maxPages; page += 1) {
    const pageResult = await callKsureIndustryRiskPage(page, pageSize, key);
    if (!pageResult.ok) {
      if (!firstError) firstError = pageResult;
      continue;
    }

    const filtered = filterKsureIndustryRisksByCountry(pageResult.items, params.countryCode, params.countryName);
    if (filtered.length > 0) countryMatched.push(...filtered);

    if (countryMatched.length >= 60 || pageResult.items.length < pageSize) {
      break;
    }
  }

  if (countryMatched.length === 0) {
    if (firstError) return firstError;
    return {
      ok: true,
      status: 200,
      message: "NO ERROR",
      items: [],
      inputIndustryCode,
      mappedIndustryCodes: [],
      countryItemCount: 0,
      industryMatchFailed: false,
    };
  }

  const mappedIndustryCodes = buildIndustryCodeCandidates(inputIndustryCode);
  if (mappedIndustryCodes.length === 0) {
    return {
      ok: true,
      status: 200,
    message: "업종 코드 매핑 실패",
      items: [],
      inputIndustryCode,
      mappedIndustryCodes,
      countryItemCount: countryMatched.length,
      industryMatchFailed: true,
    };
  }

  const industryMatched = filterKsureIndustryRisksByIndustry(countryMatched, mappedIndustryCodes);
  if (industryMatched.length === 0) {
    return {
      ok: true,
      status: 200,
    message: "입력 업종 매칭 실패",
      items: [],
      inputIndustryCode,
      mappedIndustryCodes,
      countryItemCount: countryMatched.length,
      industryMatchFailed: true,
    };
  }

  return {
    ok: true,
    status: 200,
    message: "NO ERROR",
    items: rankKsureIndustryRisks(industryMatched),
    inputIndustryCode,
    mappedIndustryCodes,
    countryItemCount: countryMatched.length,
    industryMatchFailed: false,
  };
}

async function callKsureIndustryRiskPage(
  pageNo: number,
  numOfRows: number,
  key: string,
): Promise<KsureIndustryRiskResult> {
  const url = new URL(KSURE_INDUSTRY_RISK_ENDPOINT);
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("numOfRows", String(numOfRows));
  url.searchParams.set("_type", "json");

  const external = await fetchExternal(url.toString());
  if (!external.ok) {
    return {
      ok: false,
      status: null,
      message: external.message,
      items: [],
      inputIndustryCode: "",
      mappedIndustryCodes: [],
      countryItemCount: 0,
      industryMatchFailed: false,
    };
  }
  const res = external.response;
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      message: `HTTP ${res.status}`,
      items: [],
      inputIndustryCode: "",
      mappedIndustryCodes: [],
      countryItemCount: 0,
      industryMatchFailed: false,
    };
  }

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      status: res.status,
      message: "Invalid JSON response",
      items: [],
      inputIndustryCode: "",
      mappedIndustryCodes: [],
      countryItemCount: 0,
      industryMatchFailed: false,
    };
  }

  const root = asRecord(parsed);
  const envelope = asRecord(root.response);
  const normalized = Object.keys(envelope).length > 0 ? envelope : root;

  const header = asRecord(normalized.header);
  const resultCode = asText(header.resultCode);
  const resultMsg = asText(header.resultMsg);
  if (resultCode && resultCode !== "0" && resultCode !== "00") {
    return {
      ok: false,
      status: res.status,
      message: `${resultCode}${resultMsg ? ` ${resultMsg}` : ""}`,
      items: [],
      inputIndustryCode: "",
      mappedIndustryCodes: [],
      countryItemCount: 0,
      industryMatchFailed: false,
    };
  }

  const body = asRecord(normalized.body);
  const itemsNode = asRecord(body.items);
  const items = asArray(itemsNode.item)
    .map(normalizeKsureIndustryRiskItem)
    .filter((item) => item.ctryCd || item.ctryNm || item.biztypCd || item.biztypNm || item.riskIdx != null);

  return {
    ok: true,
    status: res.status,
    message: resultMsg || "NO ERROR",
    items,
    inputIndustryCode: "",
    mappedIndustryCodes: [],
    countryItemCount: 0,
    industryMatchFailed: false,
  };
}

function normalizeKsureIndustryRiskItem(value: unknown): KsureIndustryRiskItem {
  const row = asRecord(value);
  return {
    ctryCd: asText(row.ctryCd).toUpperCase(),
    ctryNm: asText(row.ctryNm),
    biztypCd: asText(row.biztypCd),
    biztypNm: asText(row.biztypNm),
    riskIdx: asNumber(row.riskIdx),
  };
}

function filterKsureIndustryRisksByCountry(
  items: KsureIndustryRiskItem[],
  countryCode: string,
  countryName: string,
): KsureIndustryRiskItem[] {
  if (items.length === 0) return [];

  return items.filter((item) => {
    if (item.ctryCd && item.ctryCd.toUpperCase() === countryCode) return true;
    return isCountryTextMatched(countryCode, countryName, item.ctryNm);
  });
}

function filterKsureIndustryRisksByIndustry(
  items: KsureIndustryRiskItem[],
  mappedIndustryCodes: string[],
): KsureIndustryRiskItem[] {
  if (items.length === 0 || mappedIndustryCodes.length === 0) return [];

  return items.filter((item) => {
    const code = normalizeIndustryCode(item.biztypCd);
    const name = asText(item.biztypNm).toLowerCase();
    return mappedIndustryCodes.some((candidate) => isIndustryCodeMatched(code, name, candidate));
  });
}

function isIndustryCodeMatched(itemCode: string, itemName: string, candidateCode: string): boolean {
  const candidate = normalizeIndustryCode(candidateCode);
  if (!candidate) return false;

  const itemDigits = itemCode.startsWith("C") ? itemCode.slice(1) : itemCode;
  const candidateDigits = candidate.startsWith("C") ? candidate.slice(1) : candidate;

  if (itemCode && itemCode.startsWith(candidate)) return true;
  if (itemDigits && candidateDigits && itemDigits.startsWith(candidateDigits)) return true;
  if (itemName.includes(candidate.toLowerCase())) return true;
  if (candidateDigits.length >= 3 && itemName.includes(candidateDigits)) return true;
  return false;
}

function buildIndustryCodeCandidates(industryCode: string): string[] {
  const normalized = normalizeIndustryCode(industryCode);
  if (!normalized) return [];

  const mapped = KSURE_INDUSTRY_CODE_CANDIDATE_MAP[normalized];
  if (mapped && mapped.length > 0) {
    return dedupeStrings(mapped.map((code) => normalizeIndustryCode(code)).filter(Boolean));
  }

  const out = new Set<string>();
  const digits = normalized.startsWith("C") ? normalized.slice(1) : normalized;

  out.add(normalized);
  if (!normalized.startsWith("C")) out.add(`C${normalized}`);

  if (/^\d+$/.test(digits)) {
    const maxLen = Math.min(5, digits.length);
    for (let len = maxLen; len >= 2; len -= 1) {
      const prefix = digits.slice(0, len);
      out.add(prefix);
      out.add(`C${prefix}`);
    }
  }

  return [...out];
}

function rankKsureIndustryRisks(items: KsureIndustryRiskItem[]): KsureIndustryRiskItem[] {
  const scored = [...items];
  scored.sort((a, b) => {
    const aRisk = a.riskIdx ?? -1;
    const bRisk = b.riskIdx ?? -1;
    if (bRisk !== aRisk) return bRisk - aRisk;
    return a.biztypCd.localeCompare(b.biztypCd);
  });

  const out: KsureIndustryRiskItem[] = [];
  const seen = new Set<string>();
  for (const item of scored) {
    const key = `${item.ctryCd}|${item.biztypCd}|${item.biztypNm}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

async function fetchKsureExportPayment(
  params: { countryCode: string },
  key: string,
): Promise<KsureExportPaymentResult> {
  return fetchCountryScopedKsureExportPayment(params, key, callKsureExportPayment);
}

async function callKsureExportPayment(
  filters: Record<string, string>,
  key: string,
): Promise<KsureExportPaymentResult> {
  const url = new URL(KSURE_EXPORT_PAYMENT_ENDPOINT);
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("type", "json");

  for (const [k, v] of Object.entries(filters)) {
    const value = v.trim();
    if (!value) continue;
    url.searchParams.set(k, value);
  }

  const external = await fetchExternal(url.toString());
  if (!external.ok) {
    return { ok: false, status: null, message: external.message, item: null, scope: null };
  }
  const res = external.response;
  if (!res.ok) {
    return { ok: false, status: res.status, message: `HTTP ${res.status}`, item: null, scope: null };
  }

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, status: res.status, message: "Invalid JSON response", item: null, scope: null };
  }

  const root = asRecord(parsed);
  const envelope = asRecord(root.response);
  const normalized = Object.keys(envelope).length > 0 ? envelope : root;

  const header = asRecord(normalized.header);
  const resultCode = asText(header.resultCode);
  const resultMsg = asText(header.resultMsg);
  if (resultCode && resultCode !== "0" && resultCode !== "00") {
    if (resultCode === "3") {
      return { ok: true, status: res.status, message: resultMsg || "No data", item: null, scope: null };
    }
    return {
      ok: false,
      status: res.status,
      message: `${resultCode}${resultMsg ? ` ${resultMsg}` : ""}`,
      item: null,
      scope: null,
    };
  }

  const body = asRecord(normalized.body);
  const itemsNode = asRecord(body.items);
  const firstItem = asArray(itemsNode.item)[0];
  if (!firstItem) {
    return { ok: true, status: res.status, message: resultMsg || "No data", item: null, scope: null };
  }

  return {
    ok: true,
    status: res.status,
    message: resultMsg || "NO ERROR",
    item: normalizeKsureExportPaymentItem(firstItem),
    scope: null,
  };
}

function normalizeKsureExportPaymentItem(value: unknown): KsureExportPaymentItem {
  const row = asRecord(value);
  return {
    lastUpdateDate: asText(row.lastUpdateDate),
    yearList: asArray(row.yearList).map(asText).filter(Boolean),
    paymentTerms: asArray(row.paymentTerms).map(normalizeKsurePaymentTermsBlock),
    averagePaymentPeriod: asArray(row.averagePaymentPeriod).map(normalizeKsureSeriesValue),
    latePaymentRate: asArray(row.latePaymentRate).map(normalizeKsureSeriesValue),
    averagelatePaymentPeriod: asArray(row.averagelatePaymentPeriod).map(normalizeKsureSeriesValue),
    paymentPeriod: asArray(row.paymentPeriod).map(normalizeKsurePaymentPeriodBlock),
  };
}

function normalizeKsurePaymentTermsBlock(value: unknown): KsurePaymentTermsBlock {
  const row = asRecord(value);
  return {
    CODE: asText(row.CODE),
    CODE_NM: asText(row.CODE_NM),
    PAYMENT_TERMS: asArray(row.PAYMENT_TERMS).map(normalizeKsureSeriesValue),
  };
}

function normalizeKsurePaymentPeriodBlock(value: unknown): KsurePaymentPeriodBlock {
  const row = asRecord(value);
  return {
    CODE: asText(row.CODE),
    CODE_NM: asText(row.CODE_NM),
    PAYMENT_PERIOD: asArray(row.PAYMENT_PERIOD).map(normalizeKsureSeriesValue),
  };
}

function normalizeKsureSeriesValue(value: unknown): KsureSeriesValue {
  const row = asRecord(value);
  return {
    YEAR: asText(row.YEAR),
    VALUE: asNumber(row.VALUE),
    CNT: asNumber(row.CNT),
  };
}

function getLatestSeriesPoint(series: KsureSeriesValue[]): KsureSeriesValue | null {
  const rows = series.filter((row) => row.YEAR || row.VALUE != null || row.CNT != null);
  if (rows.length === 0) return null;

  let best = rows[0];
  let bestScore = parseYearScore(best.YEAR);
  for (let i = 1; i < rows.length; i += 1) {
    const candidate = rows[i];
    const score = parseYearScore(candidate.YEAR);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function parseYearScore(year: string): number {
  const n = Number(year);
  return Number.isFinite(n) ? n : -1;
}

function getTopPaymentTermByYear(
  terms: KsurePaymentTermsBlock[],
  yearHint: string,
): { code: string; name: string; year: string; value: number | null; cnt: number | null } | null {
  let best: { code: string; name: string; year: string; value: number | null; cnt: number | null } | null = null;
  let bestValue = -1;

  for (const term of terms) {
    let point: KsureSeriesValue | undefined;
    if (yearHint) {
      point = term.PAYMENT_TERMS.find((entry) => entry.YEAR === yearHint);
    }
    if (!point) {
      point = getLatestSeriesPoint(term.PAYMENT_TERMS) || undefined;
    }
    if (!point) continue;

    const value = point.VALUE ?? -1;
    if (value > bestValue) {
      bestValue = value;
      best = {
        code: term.CODE,
        name: term.CODE_NM,
        year: point.YEAR,
        value: point.VALUE,
        cnt: point.CNT,
      };
    }
  }

  return best;
}

function mapKsurePaymentRiskLevel(item: KsureExportPaymentItem, scope: "country" | "global" | null): string {
  if (scope === "global") return "info";
  const lateRate = getLatestSeriesPoint(item.latePaymentRate)?.VALUE;
  const latePeriod = getLatestSeriesPoint(item.averagelatePaymentPeriod)?.VALUE;

  if (lateRate != null) {
    if (lateRate >= 20) return "high";
    if (lateRate >= 10) return "caution";
  }

  if (latePeriod != null && latePeriod >= 25) return "caution";
  return "info";
}

function buildKsurePaymentSummary(item: KsureExportPaymentItem, scope: "country" | "global" | null): string {
  const lateRate = getLatestSeriesPoint(item.latePaymentRate);
  const avgPayment = getLatestSeriesPoint(item.averagePaymentPeriod);
  const avgLatePeriod = getLatestSeriesPoint(item.averagelatePaymentPeriod);
  const topTerm = getTopPaymentTermByYear(item.paymentTerms, lateRate?.YEAR || avgPayment?.YEAR || "");

  const parts = [
    scope === "country"
      ? "Scope: country-specific"
      : scope === "global"
      ? "Scope: global reference (low confidence)"
      : "Scope: unknown",
    `Late rate: ${formatRate(lateRate?.VALUE ?? null)}`,
    `Avg payment period: ${formatDays(avgPayment?.VALUE ?? null)}`,
    `Avg late period: ${formatDays(avgLatePeriod?.VALUE ?? null)}`,
    topTerm ? `Top term: ${topTerm.name || topTerm.code} (${formatRate(topTerm.value)})` : "",
  ].filter(Boolean);

  return truncate(parts.join(" | "), 500);
}

function buildKsurePaymentUnavailableMessage(countryName: string, countryCode: string, apiMessage: string): string {
  const label = countryName && countryCode ? `${countryName}/${countryCode}` : countryName || countryCode || "선택 국가";
  const reason = apiMessage ? ` API 응답: ${apiMessage}.` : "";
  return `${label} 기준 국가 단위 수출 결제 데이터 없음.${reason} 전세계 집계는 국가 단위가 아니므로 표시하지 않습니다.`;
}

function buildKsurePaymentRaw(
  item: KsureExportPaymentItem,
  scope: "country" | "global" | null,
): Record<string, unknown> {
  const lateRate = getLatestSeriesPoint(item.latePaymentRate);
  const avgPayment = getLatestSeriesPoint(item.averagePaymentPeriod);
  const avgLatePeriod = getLatestSeriesPoint(item.averagelatePaymentPeriod);
  const topTerm = getTopPaymentTermByYear(item.paymentTerms, lateRate?.YEAR || avgPayment?.YEAR || "");

  return {
    scope: scope || "unknown",
    confidence_level: scope === "global" ? "low" : "normal",
    last_update_date: item.lastUpdateDate || "N/A",
    year_list: item.yearList,
    latest_year: lateRate?.YEAR || avgPayment?.YEAR || avgLatePeriod?.YEAR || "N/A",
    late_payment_rate: lateRate?.VALUE ?? null,
    average_payment_period: avgPayment?.VALUE ?? null,
    average_late_payment_period: avgLatePeriod?.VALUE ?? null,
    top_payment_term_code: topTerm?.code || "N/A",
    top_payment_term_name: topTerm?.name || "N/A",
    top_payment_term_share: topTerm?.value ?? null,
    top_payment_term_count: topTerm?.cnt ?? null,
  };
}

function formatRate(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return `${value.toFixed(1)}%`;
}

function formatDays(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return `${value.toFixed(1)}d`;
}

function filterCertificationByCountry(
  items: KotraCertItem[],
  countryCode: string,
  countryName: string,
): KotraCertItem[] {
  if (items.length === 0) return items;

  return items.filter((item) => {
    const text = `${item.nat} ${item.regn} ${item.ovrofInfo} ${item.nttSj}`;
    if (!text.trim()) return false;
    return isCountryTextMatched(countryCode, countryName, text);
  });
}

function rankCertificationsByRelevance(
  items: KotraCertItem[],
  params: DetailContext,
): KotraCertItem[] {
  if (items.length === 0) return [];

  const productTokens = getDetailSearchTokens(params);
  const hsCode = params.hsCode;
  const hskCode = params.hskCode;
  const hsk6 = hskCode ? hskCode.slice(0, 6) : "";
  const hs4 = hsCode ? hsCode.slice(0, 4) : "";
  const requireProductSignal = true;

  const scored = items.map((item) => {
    let score = 0;

    const commodityText = [
      item.applyTgtCmdltCn,
      item.expansApplyCmdltCn,
      item.cmdltDfnCn,
      item.nttSj,
      item.systName,
      item.systCn,
      item.basisRegltnCn,
    ]
      .join(" ")
      .toLowerCase();

    const normalizedHs = normalizeHsOrHsk(item.hscd);
    const hs6ExactMatched = Boolean(hsCode && normalizedHs === hsCode);
    const hsk10ExactMatched = Boolean(hskCode && normalizedHs === hskCode);
    const hsk6Matched = Boolean(!hs6ExactMatched && !hsk10ExactMatched && hsk6 && normalizedHs.startsWith(hsk6));
    const hs4PrefixMatched = Boolean(!hs6ExactMatched && !hsk10ExactMatched && hs4 && normalizedHs.startsWith(hs4));
    const tokenMatched = productTokens.some((token) => commodityText.includes(token));
    const hsSignal = hs6ExactMatched || hsk10ExactMatched || hsk6Matched || hs4PrefixMatched;
    const tripleMatched = hsSignal && tokenMatched;

    if (requireProductSignal && !tripleMatched) {
      return {
        item,
        score: 0,
        relevant: false,
        fallbackScore: item.nttSj || item.systName ? 1 : 0,
      };
    }

    if (hsk10ExactMatched) score += 8;
    else if (hs6ExactMatched) score += 6;
    else if (hsk6Matched) score += 4;
    else if (hs4PrefixMatched) score += 3;
    if (tokenMatched) score += 4;
    if (item.nttSj) score += 1;
    if (item.crtfcTyVal || item.arcvCn) score += 1;

    return {
      item,
      score,
      relevant: true,
      fallbackScore: item.nttSj || item.systName ? 1 : 0,
    };
  });

  const strictRows = scored.filter((row) => row.relevant && row.score > 0);
  if (strictRows.length === 0) return [];

  strictRows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return parseDateEpoch(b.item.othbcDt || b.item.regDt) - parseDateEpoch(a.item.othbcDt || a.item.regDt);
  });

  const out: KotraCertItem[] = [];
  const seen = new Set<string>();
  for (const row of strictRows) {
    const key = `${row.item.hscd}|${row.item.systName}|${row.item.nttSj}|${row.item.nat}|${row.item.regn}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row.item);
    if (out.length >= 10) break;
  }

  return out;
}

function getCountryAliases(countryCode: string, countryName: string): string[] {
  return buildCountryAliases(countryCode, countryName);
}

function mapCertificationRow(
  item: KotraCertItem,
  context: {
    projectId: string;
    userId: string;
    countryCode: string;
    countryName: string;
    hsCode: string;
    hskCode: string;
    productName: string;
    matchStrategy: "country_hs_product" | "country_product_fallback";
  },
): Record<string, unknown> {
  const applicableItems =
    item.applyTgtCmdltCn || item.expansApplyCmdltCn || item.cmdltDfnCn || item.nttSj || STATUS_TEXT.noCertainInfo;
  const isFallback = context.matchStrategy === "country_product_fallback";

  return {
    project_id: context.projectId,
    user_id: context.userId,
    country_code: context.countryCode,
    scheme: item.systName || item.nttSj || "Overseas Certification",
    required: isFallback ? null : inferCertificationRequired(item),
    est_cost_krw: parseCertificationCost(item),
    est_lead_days: parseLeadDays(item.crtfcRqrmnPdCn || item.testRqrmnPdCn),
    source_org: "KOTRA",
    source_url: KOTRA_OVERSEAS_AUTH_PAGE,
    raw: {
      detail_state: "success",
      input_country_code: context.countryCode,
      input_country_name: context.countryName,
      input_product_name: context.productName,
      input_hs_code: context.hsCode,
      input_hsk_code: context.hskCode,
      source_type: "kotra_overseas_cert",
      match_confidence: isFallback ? "review_required" : "high",
      match_strategy: context.matchStrategy,
      hs_match: !isFallback,
      product_match: true,
      applicable_items: applicableItems,
      required_docs: item.needPapersCn || STATUS_TEXT.noCertainInfo,
      procedure: item.crtfcProsCn || STATUS_TEXT.noCertainInfo,
      validity_period: item.crtfcValidPdCn || STATUS_TEXT.noCertainInfo,
      hs_code: item.hscd || STATUS_TEXT.noCertainInfo,
      match_basis: buildCertificationMatchBasis({
        countryName: context.countryName,
        countryCode: context.countryCode,
        hsCode: context.hsCode,
        hskCode: context.hskCode,
        productName: context.productName,
      }),
      country: item.nat,
      region: item.regn,
      office: item.ovrofInfo,
      subject: item.nttSj,
      test_institute: item.testInsttCn,
      certification_institute: item.crtfcInsttCn,
      basis_regulation: item.basisRegltnCn,
      test_standard: item.testStdrCn,
      certification_type: item.crtfcTyVal,
      certification_group: item.crtfcGbnVal,
      test_required_period: item.testRqrmnPdCn,
      certification_required_period: item.crtfcRqrmnPdCn,
      cost_text: item.crtfcCostCn || item.testCostCn || item.aftfatMntCostCn,
      notice: item.crtfcInfoAtnotiCn || item.atnotiCn,
      published_at: item.othbcDt || item.regDt,
      raw_system_desc: item.systCn,
      raw_extra: item.etcCn,
    },
  };
}

function mapRegulationRow(
  item: KotraImportRegulationItem,
  context: {
    projectId: string;
    userId: string;
    countryCode: string;
    countryName: string;
    productName: string;
    hsCode: string;
    hskCode: string;
    cacheMeta?: KotraImportRegulationResult["cacheMeta"];
  },
): Record<string, unknown> {
  const effectiveDate = parseImportRegulationDate(item.REGL_STR_DE) || parseImportRegulationDate(item.REG_DT);
  const summary = buildRegulationSummary(item);
  const isCsvBackup = item.__source === "csv_backup";
  const sourceType = item.__source ?? "kotra_cache";
  const matchStrategy = item.__match_strategy ?? "kr_origin_country_hs";
  const isReviewCandidate = matchStrategy === "kr_origin_product_review";
  const matchPriority = item.__match_priority ?? (isReviewCandidate ? 4 : 2);

  return {
    project_id: context.projectId,
    user_id: context.userId,
    country_code: context.countryCode,
    topic: item.REGL_CN || item.HQURT_NAME || "  젣",
    summary,
    effective_date: effectiveDate,
    source_org: "KOTRA",
    source_url: isCsvBackup ? KOTRA_IMPORT_REGULATION_BACKUP_PAGE : KOTRA_IMPORT_REGULATION_PAGE,
    raw: {
      detail_state: "success",
      input_country_code: context.countryCode,
      input_country_name: context.countryName,
      input_product_name: context.productName,
      input_hs_code: context.hsCode,
      input_hsk_code: context.hskCode,
      match_confidence: isReviewCandidate ? "review_required" : "high",
      match_strategy: matchStrategy,
      match_priority: matchPriority,
      matched_tokens: item.__matched_tokens ?? [],
      origin_country_fixed: "KR",
      origin_target_match: true,
      import_country_match: true,
      hs_match: !isReviewCandidate,
      hs_match_level: item.__hs_match_level ?? (isReviewCandidate ? "none" : "hs6_prefix"),
      hs_partial_match: matchPriority === 3,
      source_type: sourceType,
      backup_row_id: item.__backup_row_id ?? null,
      backup_source_url: isCsvBackup ? KOTRA_IMPORT_REGULATION_BACKUP_PAGE : "",
      cache_status: context.cacheMeta?.cache_status ?? "",
      cache_reason: context.cacheMeta?.cache_reason ?? "",
      sync_attempted: context.cacheMeta?.sync_attempted ?? false,
      sync_message: context.cacheMeta?.sync_message ?? "",
      hs_code: item.HSCD || STATUS_TEXT.noCertainInfo,
      regulation_type: item.REGL_CN || STATUS_TEXT.noCertainInfo,
      effective_date: effectiveDate || STATUS_TEXT.noCertainInfo,
      regulation_end_date: parseImportRegulationDate(item.REGL_END_DE) || STATUS_TEXT.noCertainInfo,
      product_name: item.CMDLT_NAME || STATUS_TEXT.noCertainInfo,
      hs_code_detail: item.HSCD_CN || STATUS_TEXT.noCertainInfo,
      country_code_iso2: item.ISO_WD2_NAT_CD || STATUS_TEXT.noCertainInfo,
      probe_target_country: item.PROBE_TGT_NAT_NAME || STATUS_TEXT.noCertainInfo,
      hq_region: item.HQURT_NAME || STATUS_TEXT.noCertainInfo,
      reg_input_date_raw: item.REG_DT || "",
      reg_start_date_raw: item.REGL_STR_DE || "",
      reg_end_date_raw: item.REGL_END_DE || "",
    },
  };
}

function mapWtoEpingRegulationRow(
  item: WtoEpingNotification,
  context: {
    projectId: string;
    userId: string;
    countryCode: string;
    countryName: string;
    productName: string;
    hsCode: string;
    hskCode: string;
    totalCount: number;
  },
): Record<string, unknown> {
  const regulationType = buildWtoEpingRegulationType(item);
  const sourceUrl = item.sourceUrl || WTO_EPING_PAGE;

  return {
    project_id: context.projectId,
    user_id: context.userId,
    country_code: context.countryCode,
    topic: item.documentSymbol || regulationType || "WTO ePing SPS/TBT notification",
    summary: buildWtoEpingSummary(item),
    effective_date: item.distributionDate || null,
    source_org: "WTO ePing",
    source_url: sourceUrl,
    raw: {
      detail_state: "success",
      input_country_code: context.countryCode,
      input_country_name: context.countryName,
      input_product_name: context.productName,
      input_hs_code: context.hsCode,
      input_hsk_code: context.hskCode,
      match_confidence: "review_required",
      match_strategy: "wto_eping_sps_tbt",
      match_priority: "wto_eping",
      matched_tokens: resolveEpingMatchedTokens(item, context.hsCode),
      source_type: "wto_eping",
      eping_classification: item.epingClassification ?? "direct_candidate",
      eping_score: item.epingScore ?? null,
      eping_query_type: item.queryType ?? STATUS_TEXT.noCertainInfo,
      eping_reason: item.epingReason ?? STATUS_TEXT.noCertainInfo,
      eping_matched_terms: item.epingMatchedTerms ?? [],
      hs_match: resolveEpingHsMatchLevel(item, context.hsCode) !== "none",
      hs_match_level: resolveEpingHsMatchLevel(item, context.hsCode),
      product_match: Boolean(resolveEpingProductMatchedText(item)),
      match_basis_label: resolveEpingMatchBasisLabel(item, context.hsCode),
      eping_query_scope: item.matchScope || STATUS_TEXT.noCertainInfo,
      eping_query_text: item.matchText || STATUS_TEXT.noCertainInfo,
      origin_country_fixed: "KR",
      origin_target_match: false,
      import_country_match: true,
      hs_code: item.hsCodeText || context.hsCode || STATUS_TEXT.noCertainInfo,
      hsk_code: context.hskCode || STATUS_TEXT.noCertainInfo,
      regulation_type: regulationType || STATUS_TEXT.noCertainInfo,
      effective_date: item.distributionDate || STATUS_TEXT.noCertainInfo,
      comment_deadline_date: item.commentDeadlineDate || STATUS_TEXT.noCertainInfo,
      product_name: item.productsText || context.productName || STATUS_TEXT.noCertainInfo,
      notifying_member: item.notifyingMember || STATUS_TEXT.noCertainInfo,
      notification_area: item.area || STATUS_TEXT.noCertainInfo,
      notification_type: item.notificationType || STATUS_TEXT.noCertainInfo,
      document_symbol: item.documentSymbol || STATUS_TEXT.noCertainInfo,
      notification_title: item.title || STATUS_TEXT.noCertainInfo,
      source_url: sourceUrl,
      fallback_source_url: WTO_EPING_PAGE,
      wto_total_count: context.totalCount,
      review_reason: "WTO ePing SPS/TBT notification candidate. Verify the original notice and product specification.",
    },
  };
}

function buildWtoEpingPlaceholderRegulationRow(context: {
  projectId: string;
  userId: string;
  countryCode: string;
  countryName: string;
  productName: string;
  hsCode: string;
  hskCode: string;
  result: WtoEpingNotificationResult;
}): Record<string, unknown> {
  const result = context.result;
  const isMissingKey = /WTO_API_KEY is missing/i.test(result.message) ||
    /WTO_API_KEY is missing/i.test(result.diagnostics.api_message ?? "");
  const detailState = result.items.length > 0 && result.detailState === "success" ? "empty" : result.detailState;
  const rawCount = result.rawCount || sumWtoEpingRawAttemptCount(result.diagnostics.attempts);
  const directCount = result.items.length;
  const broadCount = result.broadItems.length;
  const excludedCount = result.excludedItems.length;
  const summary = isMissingKey
    ? "WTO_API_KEY 미설정으로 WTO ePing SPS/TBT 통보문 조회를 실행하지 못했습니다."
    : detailState === "empty"
      ? `WTO ePing 직접 후보 ${directCount}건, 광역 참고 ${broadCount}건, 제외 ${excludedCount}건입니다.`
      : `WTO ePing SPS/TBT 통보문 조회 실패: ${toApiErrorMessage(result.message)}`;

  return {
    project_id: context.projectId,
    user_id: context.userId,
    country_code: context.countryCode,
    topic: "WTO ePing SPS/TBT",
    summary,
    effective_date: null,
    source_org: "WTO ePing",
    source_url: result.sourceUrl || WTO_EPING_PAGE,
    raw: {
      detail_state: detailState,
      input_country_code: context.countryCode,
      input_country_name: context.countryName,
      input_product_name: context.productName,
      input_hs_code: context.hsCode,
      input_hsk_code: context.hskCode,
      country_name: context.countryName,
      hs_code: context.hsCode || STATUS_TEXT.noCertainInfo,
      hsk_code: context.hskCode || STATUS_TEXT.noCertainInfo,
      product_name: context.productName || STATUS_TEXT.noCertainInfo,
      source_type: "wto_eping",
      match_confidence: "review_required",
      match_strategy: "wto_eping_sps_tbt",
      match_priority: "wto_eping",
      hs_match: false,
      product_match: false,
      import_country_match: false,
      origin_country_fixed: "KR",
      origin_target_match: false,
      api_status: result.status,
      api_message: isMissingKey ? "WTO_API_KEY is missing" : result.diagnostics.api_message,
      search_terms: result.diagnostics.query_terms,
      search_attempts: result.diagnostics.attempts,
      fallback_source_url: result.diagnostics.fallback_source_url,
      institution_review_required: true,
      wto_total_count: result.totalCount,
      wto_raw_count: rawCount,
      raw_count: rawCount,
      direct_count: directCount,
      broad_count: broadCount,
      excluded_count: excludedCount,
      broad_references: compactWtoEpingReferences(result.broadItems),
      excluded_samples: compactWtoEpingReferences(result.excludedItems),
      wto_api_key_missing: isMissingKey,
    },
  };
}

function compactWtoEpingReferences(items: WtoEpingNotification[]): Array<Record<string, unknown>> {
  return items.slice(0, 5).map((item) => ({
    document_symbol: item.documentSymbol,
    title: item.title,
    products_text: item.productsText,
    hs_code_text: item.hsCodeText,
    notifying_member: item.notifyingMember,
    area: item.area,
    distribution_date: item.distributionDate,
    source_url: item.sourceUrl,
    eping_classification: item.epingClassification,
    eping_score: item.epingScore,
    eping_query_type: item.queryType,
    eping_reason: item.epingReason,
    eping_matched_terms: item.epingMatchedTerms ?? [],
  }));
}

function sumWtoEpingRawAttemptCount(attempts: DetailSearchAttemptLog[]): number {
  return attempts.reduce((sum, attempt) => sum + (attempt.raw_count ?? attempt.item_count ?? 0), 0);
}

function buildWtoEpingRegulationType(item: WtoEpingNotification): string {
  const area = item.area.trim();
  const type = item.notificationType.trim();
  if (area && type && !type.toUpperCase().includes(area.toUpperCase())) {
    return `${area} ${type}`;
  }
  return type || area;
}

function resolveEpingMatchConfidence(item: WtoEpingNotification, hsCode: string): string {
  const hs6 = hsCode.replace(/\D/g, "").slice(0, 6);
  if (hs6.length >= 6) {
    const itemHsDigits = (item.hsCodeText || "").match(/\d{4,10}/g) || [];
    if (itemHsDigits.some((h) => h.slice(0, 6) === hs6)) return "high";
  }
  return "review_required";
}

function resolveEpingMatchedTokens(item: WtoEpingNotification, hsCode: string): string[] {
  const tokens: string[] = [];
  if (Array.isArray(item.epingMatchedTerms)) {
    tokens.push(...item.epingMatchedTerms.map((term) => asText(term)).filter(Boolean));
  }
  const hs6 = hsCode.replace(/\D/g, "").slice(0, 6);
  const hs4 = hsCode.replace(/\D/g, "").slice(0, 4);
  if (hs6.length >= 6) {
    const itemHsDigits = (item.hsCodeText || "").match(/\d{4,10}/g) || [];
    const matched = itemHsDigits.find((h) => h.slice(0, 6) === hs6);
    if (matched) tokens.push(`HS ${matched}`);
  }
  if (tokens.length === 0 && hs4.length >= 4) {
    const itemHsDigits = (item.hsCodeText || "").match(/\d{4,10}/g) || [];
    const matched = itemHsDigits.find((h) => h.length === 4 && h.slice(0, 4) === hs4);
    if (matched) tokens.push(`HS ${matched}`);
  }
  const productMatch = resolveEpingProductMatchedText(item);
  if (productMatch) tokens.push(productMatch);
  if (tokens.length === 0 && hsCode) tokens.push(hsCode);
  return tokens;
}

function resolveEpingHsMatchLevel(item: WtoEpingNotification, hsCode: string): string {
  const hs6 = hsCode.replace(/\D/g, "").slice(0, 6);
  if (hs6.length >= 6) {
    const itemHsDigits = (item.hsCodeText || "").match(/\d{4,10}/g) || [];
    if (itemHsDigits.some((h) => h.slice(0, 6) === hs6)) return "hs6_prefix";
    if (itemHsDigits.some((h) => h.slice(0, 4) === hs6.slice(0, 4))) return "hs4_prefix";
  }
  return "none";
}

function resolveEpingMatchBasisLabel(item: WtoEpingNotification, hsCode: string): string {
  const level = resolveEpingHsMatchLevel(item, hsCode);
  if (level === "hs6_prefix") return "HS 6자리 정밀 매칭";
  if (level === "hs4_prefix") return "HS 4자리 검토 매칭";
  if (resolveEpingProductMatchedText(item)) return "제품 키워드 매칭";
  return "관련성 필터 통과";
}

function resolveEpingProductMatchedText(item: WtoEpingNotification): string {
  if (
    (
      item.matchScope === "wto_eping_free_text_country" ||
      item.matchScope === "wto_eping_exact_product_country" ||
      item.matchScope === "wto_eping_product_family_country"
    ) && item.matchText
  ) {
    return `제품 키워드 ${item.matchText}`;
  }
  return "";
}

function buildRegulationSummary(item: KotraImportRegulationItem): string {
  const parts = [
    item.CMDLT_NAME ? `품목: ${item.CMDLT_NAME.trim()}` : "",
    item.REGL_CN ? ` 젣: ${item.REGL_CN}` : "",
    item.PROBE_TGT_NAT_NAME ? `대상국가: ${item.PROBE_TGT_NAT_NAME}` : "",
    item.HQURT_NAME ? `지정 본부: ${item.HQURT_NAME}` : "",
    item.HSCD ? `HS: ${item.HSCD}` : "",
  ].filter(Boolean);

  return truncate(parts.join(" | "), 500);
}

function mapKsureRiskLevel(evalGrd: string): string {
  const grade = Number(evalGrd);
  if (!Number.isFinite(grade)) return "info";
  if (grade >= 6) return "high";
  if (grade >= 4) return "caution";
  return "info";
}

function buildKsureSummary(item: KsureCountryGradeItem): string {
  const parts = [
    `Country: ${item.ctryNm || item.ctryCd || "N/A"}`,
    `Grade: ${item.evalGrd || "N/A"}`,
  ];

  const evalDate = parseKsureEvalDate(item.evalDd);
  if (evalDate) parts.push(`Evaluated: ${evalDate}`);
  else if (item.evalDd) parts.push(`Evaluated(raw): ${item.evalDd}`);

  return truncate(parts.join(" | "), 500);
}

function parseKsureEvalDate(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;

  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  return null;
}

function mapKsureIndustryRiskLevel(riskIdx: number | null): string {
  if (riskIdx == null || !Number.isFinite(riskIdx)) return "info";
  if (riskIdx >= 4) return "high";
  if (riskIdx >= 3) return "caution";
  return "info";
}

function buildKsureIndustrySourceSummary(result: KsureIndustryRiskResult, countryCode: string): string {
  if (!result.ok) return toApiErrorMessage(result.message);
  if (result.items.length > 0) return buildKsureIndustrySummary(result.items[0]);
  return buildKsureIndustryEmptySummary(result, countryCode);
}

function buildKsureIndustryEmptySummary(result: KsureIndustryRiskResult, countryCode: string): string {
  if (result.industryMatchFailed) {
    const inputCode = result.inputIndustryCode || "N/A";
    const mapped = result.mappedIndustryCodes.length > 0 ? result.mappedIndustryCodes.join(", ") : "N/A";
  return `입력 업종 매칭 실패 (input=${inputCode}, mapped=${mapped}, country_rows=${result.countryItemCount})`;
  }
  return `No K-SURE industry risk rows matched '${countryCode}'.`;
}

function buildKsureIndustrySummary(item: KsureIndustryRiskItem): string {
  const parts = [
    `Country: ${item.ctryNm || item.ctryCd || "N/A"}`,
    `Industry: ${item.biztypNm || item.biztypCd || "N/A"}`,
    `Risk Index: ${formatRiskIndex(item.riskIdx)}`,
  ];
  return truncate(parts.join(" | "), 500);
}

function formatRiskIndex(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function parseImportRegulationDate(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;

  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }

  if (/^\d{11,13}$/.test(raw)) {
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return null;
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  return null;
}

function normalizeRegEpoch(item: KotraImportRegulationItem): number {
  const date = parseImportRegulationDate(item.REGL_STR_DE) || parseImportRegulationDate(item.REG_DT);
  if (!date) return 0;
  const t = Date.parse(date);
  return Number.isFinite(t) ? t : 0;
}

function extractDetailProductTokens(
  productName: string,
  productDescription: string,
  productTags: string[],
): string[] {
  const baseTokens = extractRecommendationTokens(productName, productDescription, productTags);
  const strongTokens = baseTokens.filter((token) => !isWeakProductRelevanceToken(token));
  return strongTokens.length > 0 ? strongTokens : baseTokens;
}

function parseDateEpoch(value: string): number {
  const normalized = parseImportRegulationDate(value);
  if (!normalized) return 0;
  const epoch = Date.parse(normalized);
  return Number.isFinite(epoch) ? epoch : 0;
}

function inferCertificationRequired(item: KotraCertItem): boolean | null {
  const text = `${item.crtfcTyVal} ${item.arcvCn} ${item.systCn}`.toLowerCase();
  if (!text.trim()) return null;

  if (
    text.includes("필수") ||
    text.includes("의무") ||
    text.includes("강제") ||
    text.includes("mandatory")
  ) {
    return true;
  }

  if (text.includes("선택") || text.includes("임의") || text.includes("voluntary")) {
    return false;
  }

  return null;
}

function parseCertificationCost(item: KotraCertItem): number | null {
  const text = `${item.crtfcCostCn} ${item.testCostCn} ${item.aftfatMntCostCn}`.trim();
  if (!text) return null;

  const lower = text.toLowerCase();
  if (!lower.includes("won") && !lower.includes("krw")) return null;

  const n = parseFirstNumber(text);
  return n ?? null;
}

function parseLeadDays(text: string): number | null {
  const value = text.trim();
  if (!value) return null;

  const n = parseFirstNumber(value);
  if (n == null) return null;

  const lower = value.toLowerCase();
  if (lower.includes("개월") || lower.includes("month")) return n * 30;
  if (lower.includes("week")) return n * 7;
  return n;
}

function parseFirstNumber(text: string): number | null {
  const match = text.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? Math.round(n) : null;
}

async function fetchKotraMarketNews(
  context: { countryCode: string; countryName: string },
  key: string,
): Promise<KotraNewsResult> {
  if (!key) {
    return { ok: false, status: null, message: "KOTRA API key is missing", query: "", items: [] };
  }

  const queries = buildNewsQueries(context.countryCode, context.countryName);
  if (queries.length === 0) {
    return { ok: false, status: null, message: "No valid query", query: "", items: [] };
  }

  const allItems: KotraNewsItem[] = [];
  let lastOkStatus: number | null = null;
  let lastError: KotraNewsResult | null = null;

  for (const query of queries) {
    const result = await fetchKotraMarketNewsByQuery(query, key);
    if (!result.ok) {
      lastError = result;
      continue;
    }
    lastOkStatus = result.status;
    allItems.push(...result.items);
  }

  if (allItems.length > 0) {
    return {
      ok: true,
      status: lastOkStatus ?? 200,
      message: "NO ERROR",
      query: queries.join(", "),
      items: dedupeNewsItems(allItems),
    };
  }

  return (
    lastError ??
    {
      ok: true,
      status: lastOkStatus ?? 200,
      message: "NO ERROR",
      query: queries.join(", "),
      items: [],
    }
  );
}

async function fetchKotraMarketNewsByQuery(query: string, key: string): Promise<KotraNewsResult> {
  const url = new URL(KOTRA_MARKET_NEWS_ENDPOINT);
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("_type", "json");
  url.searchParams.set("numOfRows", "8");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("search1", query);
  url.searchParams.set("search8", "Y");

  const external = await fetchExternal(url.toString());
  if (!external.ok) {
    return { ok: false, status: null, message: external.message, query, items: [] };
  }
  const res = external.response;
  if (!res.ok) {
    return { ok: false, status: res.status, message: `HTTP ${res.status}`, query, items: [] };
  }

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, status: res.status, message: "Invalid JSON response", query, items: [] };
  }

  const response = asRecord(asRecord(parsed).response);
  const header = asRecord(response.header);
  const resultCode = asText(header.resultCode);
  const resultMsg = asText(header.resultMsg);

  if (resultCode && resultCode !== "00") {
    return {
      ok: false,
      status: res.status,
      message: `${resultCode}${resultMsg ? ` ${resultMsg}` : ""}`,
      query,
      items: [],
    };
  }

  const body = asRecord(response.body);
  const itemList = asRecord(body.itemList);
  const items = asArray(itemList.item)
    .map(normalizeNewsItem)
    .filter((item) => item.newsTitl || item.kotraNewsUrl || item.bbstxSn);

  return { ok: true, status: res.status, message: "NO ERROR", query, items };
}

function buildNewsQueries(countryCode: string, countryName: string): string[] {
  const set = new Set<string>();

  for (const alias of KOTRA_NEWS_QUERY_BY_CODE[countryCode] ?? []) {
    const cleaned = alias.trim();
    if (cleaned) set.add(cleaned);
  }

  const compactName = countryName.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  if (compactName) set.add(compactName);

  const primaryAlias = [...set].find((alias) => /[\uAC00-\uD7AF]/.test(alias)) ?? compactName;
  if (primaryAlias) {
    for (const term of EXPORT_ENVIRONMENT_QUERY_TERMS) {
      set.add(`${primaryAlias} ${term}`);
    }
  }

  for (const token of compactName.split(/[\s,/]+/g)) {
    const cleaned = token.trim();
    if (cleaned.length >= 2 && cleaned.length <= 30) set.add(cleaned);
  }

  return [...set];
}

function normalizeCertificationItem(value: unknown): KotraCertItem {
  const row = asRecord(value);
  return {
    testInsttCn: asText(row.testInsttCn),
    basisRegltnCn: asText(row.basisRegltnCn),
    eryyFctryJdgmtCn: asText(row.eryyFctryJdgmtCn),
    systName: asText(row.systName),
    systCn: asText(row.systCn),
    expansApplyCmdltCn: asText(row.expansApplyCmdltCn),
    applyTgtCmdltCn: asText(row.applyTgtCmdltCn),
    arcvCn: asText(row.arcvCn),
    cmdltDfnCn: asText(row.cmdltDfnCn),
    crtfcProsCn: asText(row.crtfcProsCn),
    crtfcCostCn: asText(row.crtfcCostCn),
    crtfcGbnVal: asText(row.crtfcGbnVal),
    atnotiCn: asText(row.atnotiCn),
    testStdrCn: asText(row.testStdrCn),
    etcCn: asText(row.etcCn),
    hscd: asText(row.hscd),
    nat: asText(row.nat),
    nttSj: asText(row.nttSj),
    testRqrmnPdCn: asText(row.testRqrmnPdCn),
    crtfcInsttCn: asText(row.crtfcInsttCn),
    aftfatMntCostCn: asText(row.aftfatMntCostCn),
    indcEraCn: asText(row.indcEraCn),
    needPapersCn: asText(row.needPapersCn),
    testCostCn: asText(row.testCostCn),
    regn: asText(row.regn),
    regDt: asText(row.regDt),
    crtfcTyVal: asText(row.crtfcTyVal),
    ovrofInfo: asText(row.ovrofInfo),
    othbcDt: asText(row.othbcDt),
    crtfcInfoAtnotiCn: asText(row.crtfcInfoAtnotiCn),
    crtfcRqrmnPdCn: asText(row.crtfcRqrmnPdCn),
    crtfcValidPdCn: asText(row.crtfcValidPdCn),
  };
}

function normalizeNewsItem(value: unknown): KotraNewsItem {
  const row = asRecord(value);
  return {
    newsTitl: cleanText(asText(row.newsTitl)),
    kotraNewsUrl: asText(row.kotraNewsUrl),
    cntntSumar: cleanText(asText(row.cntntSumar)),
    kwrd: cleanText(asText(row.kwrd)),
    othbcDt: asText(row.othbcDt),
    natn: cleanText(asText(row.natn)),
    newsWrterNm: cleanText(asText(row.newsWrterNm)),
    infoCl: cleanText(asText(row.infoCl)),
    regn: cleanText(asText(row.regn)),
    newsBdt: asText(row.newsBdt),
    bbstxSn: asText(row.bbstxSn),
  };
}

function toPublicNewsUrl(rawUrl: string, articleId: string): string {
  const direct = normalizeNewsUrl(rawUrl);
  if (direct) return direct;

  const id = asText(articleId);
  if (id) {
    return `https://dream.kotra.or.kr/user/extra/kotranews/bbs/linkView/jsp/Page.do?dataIdx=${encodeURIComponent(id)}`;
  }
  return "";
}

function normalizeNewsUrl(url: string): string {
  const value = asText(url);
  if (!value) return "";
  if (!/^https?:\/\//i.test(value)) return "";

  const lower = value.toLowerCase();
  if (lower.includes("apis.data.go.kr/")) return "";
  if (lower.includes("www.data.go.kr/")) return "";
  if (lower.includes("dream.kotra.or.kr/kotranews/index.do")) return "";
  if (lower.includes("dream.kotra.or.kr/kotranews/cms/com/index.do")) return "";
  return value;
}

function normalizePublishedDate(value: string): string | null {
  const date = parseImportRegulationDate(value);
  return date || null;
}

function buildNewsSummary(item: KotraNewsItem): string {
  const datePrefix = item.othbcDt ? `[${item.othbcDt}] ` : "";
  const headline = cleanText(item.newsTitl || "제목 없음");
  const summaryRaw = item.cntntSumar || item.kwrd || stripHtml(item.newsBdt);
  const summary = cleanText(summaryRaw);
  const merged = `${datePrefix}${headline}${summary ? ` - ${summary}` : ""}`;
  return truncate(merged, 500);
}

function classifyNewsRiskLevel(category: NewsCategory): "info" | "caution" {
  return category === "geopolitical_risk" ? "caution" : "info";
}

function classifyAndSelectNewsEvidence(input: {
  items: KotraNewsItem[];
  countryCode: string;
  productName: string;
  hsCode: string;
  relevanceTokens: string[];
}): NewsEvidenceCandidate[] {
  const candidates: NewsEvidenceCandidate[] = [];
  const normalizedCountryCode = input.countryCode.toUpperCase();
  const baseItems = dedupeNewsItems(input.items);

  for (const item of baseItems) {
    const relevanceText = buildNewsRelevanceText({
      title: item.newsTitl,
      summary: item.cntntSumar,
      keywords: item.kwrd,
      body: item.newsBdt,
    });
    const relevance = assessNewsRelevance({
      text: relevanceText,
      tokens: input.relevanceTokens,
      hsCode: input.hsCode,
      productName: input.productName,
    });

    const isProductDirect = relevance.isDirectEvidence;

    const metadataCodes = detectCountryCodesFromText([item.natn, item.regn].join(" "));
    const countryMatched = metadataCodes.length === 0 || metadataCodes.includes(normalizedCountryCode);
    if (!countryMatched) continue;

    const recencyTier = classifyNewsRecency(item.othbcDt);
    const ruleCategory = classifyNewsCategory({
      title: item.newsTitl,
      summary: item.cntntSumar,
      keywords: item.kwrd,
      recencyTier,
      isProductDirect,
      relevance,
    });
    const aiAssessment = classifyNewsForProductContext({
      productName: input.productName,
      hsCode: input.hsCode,
      title: item.newsTitl,
      summary: item.cntntSumar,
      keywords: item.kwrd,
      body: item.newsBdt,
      tokens: input.relevanceTokens,
    });
    const aiNewsCategory = newsCategoryFromAiAssessment(aiAssessment, ruleCategory);
    if (!aiNewsCategory) continue;
    const newsCategory = aiNewsCategory === "product_direct" && !isProductDirect
      ? "industry_trend"
      : aiNewsCategory;

    if (!hasDefensibleProductExportFit({
      productName: input.productName,
      hsCode: input.hsCode,
      text: relevanceText,
      relevance,
      aiAssessment,
      recencyTier,
      newsCategory,
    })) continue;
    const selectionReason = buildNewsSelectionReason(recencyTier, newsCategory, relevance, relevanceText);
    const impactSummary = buildExportImpactSummary({
      title: item.newsTitl,
      summary: item.cntntSumar,
      productName: input.productName,
      category: newsCategory,
    });

    const type: "product_evidence" | "country_background" = newsCategory === "product_direct"
      ? "product_evidence"
      : "country_background";
    candidates.push({
      item,
      type,
      recencyTier,
      newsCategory,
      selectionReason,
      impactSummary,
      publishedAt: normalizePublishedDate(item.othbcDt),
      scoreRelevant: type === "product_evidence" && recencyTier !== "archive",
    });
  }

  const selected = selectNewsEvidence({
    items: candidates,
    perCategoryLimit: 3,
  });
  return [
    ...selected.productDirect,
    ...selected.geopoliticalRisk,
    ...selected.industryTrend,
    ...selected.archiveReference,
  ];
}

function isNewsCategory(value: string): value is NewsCategory {
  return value === "product_direct" ||
    value === "geopolitical_risk" ||
    value === "industry_trend" ||
    value === "archive_reference";
}

function isNewsRecencyTier(value: string): value is NewsRecencyTier {
  return value === "recent" || value === "supplementary" || value === "archive";
}

function normalizeRationaleSources(input: unknown): Array<{
  type?: string;
  title: string;
  url: string;
  country?: string;
  published_at?: string;
  summary?: string;
  keywords?: string[];
  score_relevant?: boolean;
  news_category?: NewsCategory;
  recency_tier?: NewsRecencyTier;
  selection_reason?: string;
  impact_summary?: string;
}> {
  const sources: Array<{
    type?: string;
    title: string;
    url: string;
    country?: string;
    published_at?: string;
    summary?: string;
    keywords?: string[];
    score_relevant?: boolean;
    news_category?: NewsCategory;
    recency_tier?: NewsRecencyTier;
    selection_reason?: string;
    impact_summary?: string;
  }> = [];
  const arr = asArray(input);

  for (const value of arr) {
    const row = asRecord(value);
    const title = cleanText(asText(row.title) || asText(row.api) || " ");
    const rawUrl = asText(row.url) || asText(row.endpoint);
    const url = normalizeSourceUrl(rawUrl);
    if (!url && !title) continue;
    const type = asText(row.type);
    const country = cleanText(asText(row.country));
    const publishedAt = normalizePublishedDate(asText(row.published_at) || asText(row.publishedAt));
    const summary = cleanText(asText(row.summary));
    const keywords = normalizeKeywordList(row.keywords);
    const scoreRelevant = asBoolean(row.score_relevant);
    const newsCategory = asText(row.news_category) as NewsCategory;
    const recencyTier = asText(row.recency_tier) as NewsRecencyTier;
    const selectionReason = cleanText(asText(row.selection_reason));
    const impactSummary = cleanText(asText(row.impact_summary));

    sources.push({
      type: type || undefined,
      title,
      url,
      country: country || undefined,
      published_at: publishedAt || undefined,
      summary: summary || undefined,
      keywords: keywords.length ? keywords : undefined,
      score_relevant: scoreRelevant,
      news_category: isNewsCategory(newsCategory) ? newsCategory : undefined,
      recency_tier: isNewsRecencyTier(recencyTier) ? recencyTier : undefined,
      selection_reason: selectionReason || undefined,
      impact_summary: impactSummary || undefined,
    });
  }

  return sources;
}

function normalizeSourceUrl(url: string): string {
  const value = asText(url);
  if (!value) return "";
  if (!/^https?:\/\//i.test(value)) return "";

  const lower = value.toLowerCase();
  if (lower.includes("apis.data.go.kr/b410001/kotra_nationalinformation")) {
    return KOTRA_COUNTRY_INFO_PAGE;
  }
  if (lower.includes("apis.data.go.kr/b410001/kotra_overseasmarketnews")) {
    return KOTRA_MARKET_NEWS_PAGE;
  }
  if (lower.includes("apis.data.go.kr/b410001/overseasauthinfo")) {
    return KOTRA_OVERSEAS_AUTH_PAGE;
  }
  if (
    lower.includes("apis.data.go.kr/b410001/ds00000128") ||
    lower.includes("apis.data.go.kr/b410001/ds0000128")
  ) {
    return KOTRA_IMPORT_REGULATION_PAGE;
  }
  if (
    lower.includes("apis.data.go.kr/b552696/countrygrade/credit-grade") ||
    lower.includes("data.go.kr/data/15140201/openapi.do")
  ) {
    return KSURE_COUNTRY_GRADE_PAGE;
  }
  if (
    lower.includes("apis.data.go.kr/b552696/ksight/riskindex") ||
    lower.includes("data.go.kr/data/15132755/openapi.do")
  ) {
    return KSURE_INDUSTRY_RISK_PAGE;
  }
  if (
    lower.includes("apis.data.go.kr/b552696/exportpayment/getpaymentinfo") ||
    lower.includes("data.go.kr/data/15144259/openapi.do")
  ) {
    return KSURE_EXPORT_PAYMENT_PAGE;
  }
  if (lower.includes("apis.data.go.kr/")) {
    return "";
  }
  return value;
}

function resolveDetailState(ok: boolean, itemCount: number): DetailState {
  if (!ok) return "error";
  return itemCount > 0 ? "success" : "empty";
}

function resolveCombinedRegulationDetailState(
  kotraState: DetailState,
  wtoState: DetailState,
): DetailState {
  if (kotraState === "success" || wtoState === "success") return "success";
  if (kotraState === "error" && wtoState === "error") return "error";
  if (kotraState === "stale" && wtoState !== "success") return "stale";
  return kotraState;
}

function countSuccessfulDetailRows(rows: Array<Record<string, unknown>>): number {
  let count = 0;
  for (const row of rows) {
    const raw = asRecord(row.raw);
    const detailState = asText(raw.detail_state).toLowerCase();
    if (detailState === "success") count += 1;
  }
  return count;
}

function replaceDetailMatchedSources(
  sources: Array<{
    type?: string;
    title: string;
    url: string;
    country?: string;
    published_at?: string;
    summary?: string;
    keywords?: string[];
    score_relevant?: boolean;
    news_category?: NewsCategory;
    recency_tier?: NewsRecencyTier;
    selection_reason?: string;
    impact_summary?: string;
  }>,
  params: {
    countryName: string;
    certification: { count: number; state: DetailState; url: string };
    regulation: { count: number; state: DetailState; url: string };
  },
): Array<{
  type?: string;
  title: string;
  url: string;
  country?: string;
  published_at?: string;
  summary?: string;
  keywords?: string[];
  score_relevant?: boolean;
  news_category?: NewsCategory;
  recency_tier?: NewsRecencyTier;
  selection_reason?: string;
  impact_summary?: string;
}> {
  const filtered = sources.filter((source) => {
    const sourceType = asText(source.type).toLowerCase();
    if (sourceType === "cert_data" || sourceType === "regulation_data") return false;
    return !isLegacyMatchedSourceTitle(source.title);
  });

  filtered.push(
    createDetailMatchedSource(
      "cert_data",
      " ",
      params.certification.count,
      params.certification.state,
      params.certification.url,
      params.countryName,
    ),
  );

  filtered.push(
    createDetailMatchedSource(
      "regulation_data",
      "  젣",
      params.regulation.count,
      params.regulation.state,
      params.regulation.url,
      params.countryName,
    ),
  );

  return filtered;
}

function createDetailMatchedSource(
  type: "cert_data" | "regulation_data",
  label: string,
  count: number,
  state: DetailState,
  url: string,
  countryName: string,
): {
  type: "cert_data" | "regulation_data";
  title: string;
  url: string;
  country: string;
} {
  return {
    type,
    title: buildDetailMatchedTitle(label, count, state),
    url,
    country: countryName,
  };
}

function buildDetailMatchedTitle(label: string, count: number, state: DetailState): string {
  if (state === "error") return `${label} matched 0 (api error)`;
  if (state === "stale") return `${label} matched 0 (stale cache)`;
  if (state === "empty") return `${label} matched 0 (no query results)`;
  const normalizedCount = Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0;
  return `${label} matched ${normalizedCount}`;
}

function isLegacyMatchedSourceTitle(title: string): boolean {
  const normalized = asText(title).toLowerCase();
  return (
    normalized.includes("certification matched") ||
    normalized.includes("import regulation matched") ||
    normalized.includes("인증 매칭") ||
    normalized.includes("수입규제 매칭")
  );
}

function dedupeSources(sources: Array<{
  type?: string;
  title: string;
  url: string;
  country?: string;
  published_at?: string;
  summary?: string;
  keywords?: string[];
  score_relevant?: boolean;
  news_category?: NewsCategory;
  recency_tier?: NewsRecencyTier;
  selection_reason?: string;
  impact_summary?: string;
}>): Array<{
  type?: string;
  title: string;
  url: string;
  country?: string;
  published_at?: string;
  summary?: string;
  keywords?: string[];
  score_relevant?: boolean;
  news_category?: NewsCategory;
  recency_tier?: NewsRecencyTier;
  selection_reason?: string;
  impact_summary?: string;
}> {
  const seen = new Set<string>();
  const out: Array<{
    type?: string;
    title: string;
    url: string;
    country?: string;
    published_at?: string;
    summary?: string;
    keywords?: string[];
    score_relevant?: boolean;
    news_category?: NewsCategory;
    recency_tier?: NewsRecencyTier;
    selection_reason?: string;
    impact_summary?: string;
  }> = [];

  for (const source of sources) {
    const key = `${source.type || ""}|${source.title}|${source.country || ""}|${source.published_at || ""}|${source.url}`;
    if (!source.title || seen.has(key)) continue;
    seen.add(key);
    out.push(source);
  }

  return out;
}

function dedupeNewsItems(items: KotraNewsItem[]): KotraNewsItem[] {
  const seen = new Set<string>();
  const out: KotraNewsItem[] = [];
  for (const item of items) {
    const key = `${item.bbstxSn}|${item.newsTitl}|${item.othbcDt}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, " "));
}

function cleanText(value: string): string {
  return decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
}

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: "\"",
  apos: "'",
  nbsp: " ",
  middot: "·",
  rsquo: "'",
  lsquo: "'",
  rdquo: "\"",
  ldquo: "\"",
};

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entityRaw: string) => {
    const entity = entityRaw.toLowerCase();
    if (entity.startsWith("#x")) {
      const codePoint = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (entity.startsWith("#")) {
      const codePoint = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return HTML_ENTITY_MAP[entity] ?? match;
  });
}

function buildNewsSourceSummary(item: KotraNewsItem): string {
  const summary = cleanText(item.cntntSumar || stripHtml(item.newsBdt));
  if (!summary) return "";
  return truncate(summary, 240);
}

function parseKeywordList(value: string): string[] {
  return normalizeKeywordList(value);
}

function normalizeKeywordList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.map((entry) => cleanText(asText(entry))).filter(Boolean))].slice(0, 12);
  }
  const text = cleanText(asText(value));
  if (!text) return [];
  const parts = text.split(/[,\n/|]+/g).map((entry) => cleanText(entry)).filter(Boolean);
  return [...new Set(parts)].slice(0, 12);
}

async function fetchKotraNationalInfo(
  countryCode: string,
  key: string,
): Promise<KotraNationalInfoResult> {
  if (!key) {
    return { ok: false, status: null, message: "KOTRA API key is missing", item: null };
  }

  const url = new URL(KOTRA_NATIONAL_INFO_ENDPOINT);
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("type", "json");
  url.searchParams.set("isoWd2CntCd", countryCode);

  const external = await fetchExternal(url.toString());
  if (!external.ok) {
    return { ok: false, status: null, message: external.message, item: null };
  }
  const res = external.response;
  if (!res.ok) {
    return { ok: false, status: res.status, message: `HTTP ${res.status}`, item: null };
  }

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, status: res.status, message: "Invalid JSON response", item: null };
  }

  const response = asRecord(asRecord(parsed).response);
  const header = asRecord(response.header);
  const resultCode = asText(header.resultCode);
  const resultMsg = asText(header.resultMsg);

  if (resultCode && resultCode !== "00") {
    return { ok: false, status: res.status, message: `${resultCode}${resultMsg ? ` ${resultMsg}` : ""}`, item: null };
  }

  const body = asRecord(response.body);
  const item = asRecord(asRecord(body.itemList).item);
  if (Object.keys(item).length === 0) {
    return { ok: false, status: res.status, message: "Empty item", item: null };
  }

  return { ok: true, status: res.status, message: "NO ERROR", item };
}

type ExternalFetchResult =
  | { ok: true; response: Response }
  | { ok: false; message: string };

async function fetchExternal(url: string, init: RequestInit = {}): Promise<ExternalFetchResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EXTERNAL_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return { ok: true, response };
  } catch (error) {
    return { ok: false, message: toExternalFetchMessage(error) };
  } finally {
    clearTimeout(timeoutId);
  }
}

function toExternalFetchMessage(error: unknown): string {
  const raw = asText((error as { message?: unknown } | null | undefined)?.message);
  const normalized = raw.toLowerCase();
  if (
    normalized.includes("abort") ||
    normalized.includes("timed out") ||
    normalized.includes("timeout")
  ) {
    return `External API timeout after ${EXTERNAL_FETCH_TIMEOUT_MS}ms`;
  }
  if (!raw) return "External API request failed";
  return `External API request failed: ${truncate(raw, 160)}`;
}

function truncate(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  return `${value.slice(0, maxLen - 1)}...`;
}

function normalizeHsCode(value: string): string {
  const digits = normalizeHsOrHsk(value);
  if (!digits) return "";
  return digits.slice(0, 6);
}

function normalizeHskCode(value: string): string {
  const digits = normalizeHsOrHsk(value);
  if (!digits) return "";
  return digits.slice(0, 10);
}

function normalizeHsOrHsk(value: string): string {
  return value.replace(/\D/g, "");
}

function normalizeIndustryCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
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

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "y" || normalized === "yes" || normalized === "1") return true;
    if (normalized === "false" || normalized === "n" || normalized === "no" || normalized === "0") return false;
  }
  return undefined;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}




