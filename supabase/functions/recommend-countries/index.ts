import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { STRATEGIC_HSK_MAP } from "../safety-scan/strategic-hsk-map.ts";
import { fetchCountryScopedKsureExportPayment } from "../_shared/ksure-payment.ts";
import {
  addCountrySignal,
  buildInclusionReason,
  clampScoreParts,
  collectCandidatePool,
  combineMarketScore,
  canonicalizeTargetMarkets,
  computeResultState,
  COUNTRY_ALIAS_MAP,
  COUNTRY_NAME_BY_CODE,
  EXPORT_ENVIRONMENT_QUERY_TERMS,
  detectCountryCodesFromText,
  deriveApiMarketScore,
  deriveExportRegionRankMarketBoost,
  buildNewsRelevanceText,
  extractProductTokens,
  extractTargetMarketCodes,
  buildProductRelevanceTokens,
  fallbackScoreParts,
  labelFromScore,
  marketNewsSearchParam,
  normalizeHsCode,
  normalizeTargetMarkets,
  parseProductMeta,
  isCountryTextMatched,
  isWeakProductRelevanceToken,
  scoreKsurePaymentEvidence,
  scoreSafetyControlEvidence,
  assessBackgroundNewsRelevance,
  assessNewsRelevance,
  buildExportImpactSummary,
  buildNewsSelectionReason,
  signalLabel,
  classifyNewsCategory,
  classifyNewsRecency,
  selectNewsEvidence,
  totalScore,
  type CandidateSignal,
  type NewsCategory,
  type NewsRecencyTier,
  type ScoreParts,
  type SeedCountry,
  FALLBACK_COUNTRY_POOL,
  hasKeywordTokenMatch,
  isHs4PrefixMatch,
  isHs6ExactMatch,
} from "../_shared/recommendation.ts";
import {
  evaluateKotraImportRegulationCacheFreshness,
  KOTRA_IMPORT_REGULATION_CACHE_KEY,
  normalizeImportRegulationCacheStatus,
  toImportRegulationItemFromCacheRow,
} from "../_shared/kotra-import-regulation-cache.ts";

const GATEWAY_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";
const KOTRA_COUNTRY_INFO_ENDPOINT =
  "https://apis.data.go.kr/B410001/kotra_nationalInformation/natnInfo/natnInfo";
const KOTRA_MARKET_NEWS_ENDPOINT =
  "https://apis.data.go.kr/B410001/kotra_overseasMarketNews/ovseaMrktNews/ovseaMrktNews";
const KOTRA_CERT_ENDPOINT =
  "https://apis.data.go.kr/B410001/overseasAuthInfo/getOverseasAuthInfo";
const KOTRA_COUNTRY_INFO_PAGE = "https://dream.kotra.or.kr/kotranews/cms/com/index.do?MENU_ID=30";
const KOTRA_CERT_PAGE = "https://dream.kotra.or.kr/dream/cms/com/index.do?MENU_ID=4030";
const KOTRA_IMPORT_REG_PAGE = "https://dream.kotra.or.kr/dream/cms/com/index.do?MENU_ID=3700";
const KOTRA_TRADE_OFFICE_DATASET_PAGE =
  "https://www.data.go.kr/tcs/dss/selectDataSetList.do?keyword=%EB%8C%80%ED%95%9C%EB%AC%B4%EC%97%AD%ED%88%AC%EC%9E%90%EC%A7%84%ED%9D%A5%EA%B3%B5%EC%82%AC%20%EB%AC%B4%EC%97%AD%EA%B4%80%20%EC%A0%95%EB%B3%B4";
const KOTRA_EXPORT_REGION_RANK_DATASET_PAGE =
  "https://www.data.go.kr/tcs/dss/selectDataSetList.do?keyword=%EC%88%98%EC%B6%9C%20%EC%A7%80%EC%97%AD%20%EC%88%9C%EC%9C%84";
const KOTRA_NEWS_ARTICLE_PATH = "https://dream.kotra.or.kr/user/extra/kotranews/bbs/linkView/jsp/Page.do";
const KSURE_COUNTRY_GRADE_ENDPOINT =
  "https://apis.data.go.kr/B552696/countrygrade/credit-grade";
const KSURE_INDUSTRY_RISK_ENDPOINT =
  "https://apis.data.go.kr/B552696/ksight/riskindex";
const KSURE_EXPORT_PAYMENT_ENDPOINT =
  "https://apis.data.go.kr/B552696/exportPayment/getPaymentInfo";
const KSURE_COUNTRY_GRADE_PAGE = "https://ksight.ksure.or.kr/rsrch/nation/nationView";
const KSURE_INDUSTRY_RISK_PAGE = "https://ksight.ksure.or.kr/risk-index";
const KSURE_EXPORT_PAYMENT_PAGE = "https://ksight.ksure.or.kr/analysis/risk-advisor/payment";
const SAFETYKOREA_BASE_URL = "http://www.safetykorea.kr";
const SAFETYKOREA_OPENAPI_PAGE = "https://www.safetykorea.kr/release/openapi";
const SAFETYKOREA_CERT_LIST_URL = `${SAFETYKOREA_BASE_URL}/openapi/api/cert/certificationList.json`;
const SAFETYKOREA_RECALL_LIST_URL = `${SAFETYKOREA_BASE_URL}/openapi/api/recall/recallList.json`;
const SAFETYKOREA_FOREIGN_RECALL_LIST_URL = `${SAFETYKOREA_BASE_URL}/openapi/api/recall/fRecallList.json`;
const EXTERNAL_FETCH_TIMEOUT_MS = 8000;
const KOTRA_FETCH_TIMEOUT_MS = 6000;
const AI_FETCH_TIMEOUT_MS = 15000;
const CANDIDATE_ANALYSIS_CONCURRENCY = 1;
const KOTRA_QUERY_CONCURRENCY = 2;
const KSURE_DATASET_CONCURRENCY = 2;
const MAX_RECOMMENDATION_CANDIDATES = 4;
const MAX_IMPORT_REGULATION_CACHE_ROWS = 500;

const COUNTRY_NEWS_QUERY: Record<string, string[]> = {
  AE: ["United Arab Emirates", "UAE", "\uC544\uB78D\uC5D0\uBBF8\uB9AC\uD2B8"],
  BR: ["Brazil", "\uBE0C\uB77C\uC9C8"],
  CN: ["China", "\uC911\uAD6D"],
  DE: ["Germany", "Deutschland", "\uB3C5\uC77C"],
  ID: ["Indonesia", "\uC778\uB3C4\uB124\uC2DC\uC544"],
  IN: ["India", "\uC778\uB3C4"],
  JP: ["Japan", "\uC77C\uBCF8"],
  MX: ["Mexico", "\uBA55\uC2DC\uCF54"],
  MY: ["Malaysia", "\uB9D0\uB808\uC774\uC2DC\uC544"],
  PL: ["Poland", "\uD3F4\uB780\uB4DC"],
  TH: ["Thailand", "\uD0DC\uAD6D"],
  TR: ["Turkey", "Turkiye", "\uD280\uB974\uD0A4\uC608", "\uD130\uD0A4"],
  US: ["United States", "USA", "\uBBF8\uAD6D"],
  VN: ["Vietnam", "\uBCA0\uD2B8\uB0A8"],
};

type ProductContext = {
  name: string;
  description: string;
  hsCode: string;
  hskCode: string;
  hsDescription: string;
  targetMarketNote: string;
  targetMarkets: Array<{ code: string; name: string }>;
  tokens: string[];
  relevanceTokens: string[];
  tags: string[];
  modelName: string;
};

type CountrySignalStats = {
  certMatches: number;
  regulationMatches: number;
  newsMatches: number;
};

type ExportRegionRankEvidence = {
  source: "hs_match" | "all_products";
  rank: number;
  referenceYear: number | null;
  exportShare: number | null;
  hsCodeNormalized: string;
  hsMatched: boolean;
};

type TradeOfficeActionItem = {
  countryNameNormalized: string;
  officeName: string;
  officeAddress: string;
  airportRouteText: string;
  raw: Record<string, unknown>;
  summary?: string;
  summarySource?: "ai" | "rule";
};

type CountryApiResult = {
  country: SeedCountry;
  ok: boolean;
  status: number | null;
  message: string;
  item: Record<string, unknown> | null;
};

type KotraNewsItem = {
  newsTitl: string;
  kotraNewsUrl: string;
  cntntSumar: string;
  kwrd: string;
  newsBdt: string;
  othbcDt: string;
  natn: string;
  regn: string;
  bbstxSn: string;
};

type KotraNewsResult = {
  ok: boolean;
  status: number | null;
  message: string;
  query: string;
  items: KotraNewsItem[];
};

type KotraCertItem = {
  nttSj: string;
  systName: string;
  applyTgtCmdltCn: string;
  expansApplyCmdltCn: string;
  cmdltDfnCn: string;
  hscd: string;
  nat: string;
  regn: string;
  ovrofInfo: string;
  othbcDt: string;
};

type KotraCertResult = {
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
};

type KotraImportRegulationResult = {
  ok: boolean;
  status: number | null;
  message: string;
  detailState: "success" | "empty" | "stale" | "error";
  items: KotraImportRegulationItem[];
  cacheMeta?: {
    cache_status: string;
    cache_last_success_at: string | null;
    cache_active_batch_id: string | null;
    cache_stale_after_days: number;
    cache_age_days: number | null;
    cache_reason: string | null;
  };
};

type RiskEvidenceLevel = "info" | "caution" | "high" | "unavailable";

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

type KsureCountryGradeDataset = {
  ok: boolean;
  status: number | null;
  message: string;
  items: KsureCountryGradeItem[];
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
  countryItemCount: number;
  industryMatchFailed: boolean;
};

type KsureIndustryRiskDataset = {
  ok: boolean;
  status: number | null;
  message: string;
  items: KsureIndustryRiskItem[];
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

type SafetyEvidenceResult = {
  status: "success" | "empty" | "error" | "key_missing";
  message: string;
  httpStatus: number | null;
  certCount: number;
  domesticRecallCount: number;
  foreignRecallCount: number;
  query: string;
  errorCode: string | null;
};

type StrategicEvidenceResult = {
  status: "success" | "empty";
  severity: "warn" | "info";
  matchType: "exact_hsk" | "prefix6_candidate" | "none";
  summary: string;
  raw: Record<string, unknown>;
};

type AiCountryScore = {
  country_code: string;
  market_fit: number;
  cert_score: number;
  regulation_score: number;
  payment_score: number;
  safety_score: number;
  recommendation_reason: string;
  low_recommendation_reason: string;
};

type AiScoringResult = {
  ok: boolean;
  message: string;
  byCode: Map<string, AiCountryScore>;
};

type CandidateCountryAnalysis = {
  country: SeedCountry;
  signals: CandidateSignal[];
  stats: CountrySignalStats;
  exportRegionEvidence: ExportRegionRankEvidence | null;
  certItems: KotraCertItem[];
  regulationItems: KotraImportRegulationItem[];
  productNewsItems: KotraNewsItem[];
  tradeOfficeActions: TradeOfficeActionItem[];
  countryInfo: CountryApiResult;
  countryNews: KotraNewsResult;
  mergedNews: KotraNewsItem[];
  backgroundNews: KotraNewsItem[];
  countryName: string;
  apiMarketScore: number;
  ksureCountryGrade: KsureCountryGradeResult;
  ksureIndustryRisk: KsureIndustryRiskResult;
  ksurePayment: KsureExportPaymentResult;
  paymentEvidenceScore: number | null;
  safetyEvidenceScore: number | null;
  strategicEvidence: StrategicEvidenceResult;
  safetyEvidence: SafetyEvidenceResult;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = asRecord(await req.json().catch(() => ({})));
    const projectId = asText(body.project_id);
    if (!projectId) return json({ error: "project_id required" }, 400);
    const requireAi = body.require_ai === true;
    const startedAtMs = Date.now();

    const auth = req.headers.get("Authorization") ?? "";
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const adminSupa = createServiceRoleClient();

    const { data: userData } = await supa.auth.getUser();
    if (!userData.user) return json({ error: "unauthorized" }, 401);

    const { data: productRow } = await supa
      .from("project_products")
      .select("name,description,hs_code,hsk_code,hs_candidates,components")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const product = buildProductContext(productRow as Record<string, unknown> | null);
    const targetMarketCodes = product.targetMarkets.map((market) => market.code);
    const signalMap = new Map<string, Set<CandidateSignal>>();
    const statsByCountry = new Map<string, CountrySignalStats>();
    const certByCountry = new Map<string, KotraCertItem[]>();
    const regulationByCountry = new Map<string, KotraImportRegulationItem[]>();
    const productNewsByCountry = new Map<string, KotraNewsItem[]>();

    for (const code of targetMarketCodes) addCountrySignal(signalMap, code, "target_market_note");

    const kotraKey = resolveKotraKey();
    const safetyKoreaKey = resolveSafetyKoreaKey();
    const strategicEvidence = buildStrategicEvidence(product.hsCode, product.hskCode);
    const [
      certResult,
      regulationResult,
      productNewsResult,
      exportRegionRankMap,
      tradeOfficeActionsByCountry,
      safetyEvidence,
    ] = await Promise.all([
      kotraKey
        ? fetchCertificationDataset(product, kotraKey)
        : Promise.resolve({ ok: false, status: null, message: "KOTRA API key is missing", items: [] as KotraCertItem[] }),
      fetchImportRegulationDatasetFromCache(supa, product),
      kotraKey
        ? fetchProductNewsDataset(product, kotraKey)
        : Promise.resolve({ ok: false, status: null, message: "KOTRA API key is missing", query: "", items: [] as KotraNewsItem[] }),
      fetchExportRegionRankEvidenceMap(supa, product.hsCode),
      fetchTradeOfficeActionMap(supa),
      fetchSafetyKoreaEvidence(product, safetyKoreaKey),
    ]);
    const safetyEvidenceScore = scoreSafetyControlEvidence({
      strategicMatchType: strategicEvidence.matchType,
      recallCount: safetyEvidence.domesticRecallCount + safetyEvidence.foreignRecallCount,
      certCount: safetyEvidence.certCount,
      safetyStatus: safetyEvidence.status,
    });

    for (const item of certResult.items) {
      const rowText = [
        item.nttSj,
        item.systName,
        item.applyTgtCmdltCn,
        item.expansApplyCmdltCn,
        item.cmdltDfnCn,
      ].join(" ");
      const hs6 = isHs6ExactMatch(product.hsCode, item.hscd);
      const hs4 = !hs6 && isHs4PrefixMatch(product.hsCode, item.hscd);
      const keyword = hasKeywordTokenMatch(rowText, product.tokens);
      const hsMatched = hs6 || hs4;
      if (!hsMatched || !keyword) continue;

      const countryCodes = dedupeStrings([
        ...extractCountryCodeFromIso(""),
        ...detectCountryCodesFromText([item.nat, item.regn, item.ovrofInfo].join(" ")),
      ]);
      if (countryCodes.length === 0) continue;

      for (const code of countryCodes) {
        addCountrySignal(signalMap, code, "cert_data");
        if (hs6) addCountrySignal(signalMap, code, "hs6_exact");
        else if (hs4) addCountrySignal(signalMap, code, "hs4_prefix");
        if (keyword) addCountrySignal(signalMap, code, "product_keyword");

        bumpCountryStats(statsByCountry, code, "certMatches");
        pushCountryItem(certByCountry, code, item);
      }
    }

    for (const item of regulationResult.items) {
      const rowText = [item.CMDLT_NAME, item.HSCD_CN, item.REGL_CN].join(" ");
      const hs6 = isHs6ExactMatch(product.hsCode, item.HSCD);
      const hs4 = !hs6 && isHs4PrefixMatch(product.hsCode, item.HSCD);
      const keyword = hasKeywordTokenMatch(rowText, product.tokens);
      const hsMatched = hs6 || hs4;
      if (!hsMatched || !keyword) continue;

      const countryCodes = dedupeStrings([
        ...extractCountryCodeFromIso(item.ISO_WD2_NAT_CD),
        ...detectCountryCodesFromText([item.PROBE_TGT_NAT_NAME, item.HQURT_NAME].join(" ")),
      ]);
      if (countryCodes.length === 0) continue;

      for (const code of countryCodes) {
        addCountrySignal(signalMap, code, "regulation_data");
        if (hs6) addCountrySignal(signalMap, code, "hs6_exact");
        else if (hs4) addCountrySignal(signalMap, code, "hs4_prefix");
        if (keyword) addCountrySignal(signalMap, code, "product_keyword");

        bumpCountryStats(statsByCountry, code, "regulationMatches");
        pushCountryItem(regulationByCountry, code, item);
      }
    }

    for (const item of productNewsResult.items) {
      const rowText = buildNewsRelevanceText({
        title: item.newsTitl,
        summary: item.cntntSumar,
        keywords: item.kwrd,
        body: item.newsBdt,
      });
      const relevance = assessNewsRelevance({
        text: rowText,
        tokens: product.relevanceTokens,
        hsCode: product.hsCode,
        productName: product.name,
      });
      if (!relevance.isDirectEvidence) continue;

      const countryCodes = dedupeStrings([
        ...extractNewsMetadataCountryCodes(item),
        ...detectCountryCodesFromText(rowText),
      ]);
      if (countryCodes.length === 0) continue;

      for (const code of countryCodes) {
        addCountrySignal(signalMap, code, "news_match");
        addCountrySignal(signalMap, code, "product_keyword");
        bumpCountryStats(statsByCountry, code, "newsMatches");
        pushCountryItem(productNewsByCountry, code, item);
      }
    }

    let candidatePool = collectCandidatePool({
      signalMap,
      targetMarketCodes,
      minCount: 3,
      fallbackPool: FALLBACK_COUNTRY_POOL,
    });
    candidatePool = limitCandidatePool(candidatePool, targetMarketCodes, MAX_RECOMMENDATION_CANDIDATES);

    let analyses = await mapWithConcurrency(
      candidatePool.countries,
      CANDIDATE_ANALYSIS_CONCURRENCY,
      async (country): Promise<CandidateCountryAnalysis> => {
        const countryInfo = kotraKey
          ? await fetchKotraCountryInfo(country, kotraKey)
          : {
            country,
            ok: false,
            status: null,
            message: "KOTRA API key is missing",
            item: null,
          } satisfies CountryApiResult;

      const signals = candidatePool.signalByCountry.get(country.code) ?? [];
      const stats = statsByCountry.get(country.code) ?? {
        certMatches: 0,
        regulationMatches: 0,
        newsMatches: 0,
      };

      const productNewsItems = dedupeNewsItems(productNewsByCountry.get(country.code) ?? []);
      const filteredProductNewsItems = productNewsItems;

      const apiCountryName = countryInfo.item ? pickString(countryInfo.item, ["natnNm", "natnHdsttNm"]) : "";
      const countryName = apiCountryName || country.name;
      const filteredStats: CountrySignalStats = {
        ...stats,
      };
      const exportRegionEvidence = exportRegionRankMap.get(country.code) ?? null;
      const exportMarketBoost = deriveExportRegionRankMarketBoost({
        rank: exportRegionEvidence?.rank ?? null,
        exportShare: exportRegionEvidence?.exportShare ?? null,
        hsMatched: exportRegionEvidence?.hsMatched ?? false,
      });
      const apiMarketScore = clampInt(deriveApiMarketScore({
        hasCountryInfo: countryInfo.ok,
        hasNews: filteredProductNewsItems.length > 0,
        newsCount: filteredProductNewsItems.length,
        signalCount: signals.length,
      }) + exportMarketBoost, 0, 30);
      const countryNews: KotraNewsResult = {
        ok: false,
        status: null,
        message: "Deferred to country-detail",
        query: "",
        items: [],
      };
      const ksureCountryGrade: KsureCountryGradeResult = {
        ok: false,
        status: null,
        message: "Deferred to country-detail",
        item: null,
      };
      const ksureIndustryRisk: KsureIndustryRiskResult = {
        ok: false,
        status: null,
        message: "Deferred to country-detail",
        items: [],
        countryItemCount: 0,
        industryMatchFailed: false,
      };
      const ksurePayment: KsureExportPaymentResult = {
        ok: false,
        status: null,
        message: "Deferred to country-detail",
        item: null,
        scope: null,
      };
      const paymentEvidenceScore = null;

      return {
        country,
        signals,
        stats: filteredStats,
        exportRegionEvidence,
        certItems: certByCountry.get(country.code) ?? [],
        regulationItems: regulationByCountry.get(country.code) ?? [],
        productNewsItems: filteredProductNewsItems,
        tradeOfficeActions: tradeOfficeActionsByCountry.get(country.code) ?? [],
        countryInfo,
        countryNews,
        mergedNews: filteredProductNewsItems,
        backgroundNews: [],
        countryName,
        apiMarketScore,
        ksureCountryGrade,
        ksureIndustryRisk,
        ksurePayment,
        paymentEvidenceScore,
        safetyEvidenceScore,
        strategicEvidence,
        safetyEvidence,
      };
      },
    );
    analyses = await summarizeTradeOfficeActionsWithAi(analyses, adminSupa);

    const aiScoring = await scoreCountriesWithAi(analyses, product);
    const aiUsed = aiScoring.ok && aiScoring.byCode.size > 0;
    const aiMissingCountryCodes = analyses
      .map((analysis) => analysis.country.code)
      .filter((code) => !aiScoring.byCode.has(code));
    const aiComplete = aiScoring.ok && aiMissingCountryCodes.length === 0;
    if (requireAi && !aiComplete) {
      return json({
        state: "error",
        message: buildRequiredAiScoringMessage(aiScoring.message, aiMissingCountryCodes),
        count: 0,
        candidate_count: analyses.length,
        ai_used: false,
        fallback_used: true,
        missing_country_codes: aiMissingCountryCodes,
      });
    }
    const canonicalTargetMarkets = canonicalizeTargetMarkets(product.targetMarkets);

    const { data: existingCountryRows, error: existingCountryRowsError } = await supa
      .from("project_countries")
      .select("country_code,rationale")
      .eq("project_id", projectId);
    if (existingCountryRowsError) return json({ state: "error", error: existingCountryRowsError.message }, 500);

    const persistentNewsEvidenceByCountry = new Map<string, Array<Record<string, unknown>>>();
    for (const row of existingCountryRows ?? []) {
      const record = asRecord(row);
      const countryCode = asText(record.country_code).toUpperCase();
      const newsSources = extractPersistentNewsEvidenceSources(record.rationale);
      if (countryCode && newsSources.length > 0) persistentNewsEvidenceByCountry.set(countryCode, newsSources);
    }

    await supa.from("project_countries").delete().eq("project_id", projectId);

    const preRows = analyses.map((analysis) => {
      const aiScore = aiScoring.byCode.get(analysis.country.code);
      const targetMatched = analysis.signals.includes("target_market_note");
      const hasHs6 = analysis.signals.includes("hs6_exact");
      const hasHs4 = analysis.signals.includes("hs4_prefix");

      const fallbackScores = fallbackScoreParts({
        apiMarketScore: analysis.apiMarketScore,
        hasCountryInfo: analysis.countryInfo.ok,
        hasCountryNews: analysis.productNewsItems.length > 0,
        certSignalCount: analysis.stats.certMatches,
        regulationSignalCount: analysis.stats.regulationMatches,
        hasHs6,
        hasHs4,
        targetMatched,
        paymentEvidenceScore: analysis.paymentEvidenceScore,
        safetyEvidenceScore: analysis.safetyEvidenceScore,
      });

      const scores: ScoreParts = aiScore
        ? clampScoreParts({
          market: combineMarketScore(analysis.apiMarketScore, aiScore.market_fit),
          cert: aiScore.cert_score,
          regulation: aiScore.regulation_score,
          payment: analysis.paymentEvidenceScore ?? aiScore.payment_score,
          safety: analysis.safetyEvidenceScore ?? aiScore.safety_score,
        })
        : fallbackScores;

      const total = applyComplianceScoreAdjustment(totalScore(scores), scores);
      const recommendationReason = aiScore?.recommendation_reason || buildApiRecommendationReasonV2(analysis);
      const lowRecommendationReason = aiScore?.low_recommendation_reason ||
        buildLowRecommendationReason(total, analysis, scores);
      const inclusionReason = buildInclusionReason(analysis.signals);
      const signalLabels = analysis.signals.map(signalLabel);

      return {
        project_id: projectId,
        user_id: userData.user.id,
        country_code: analysis.country.code,
        country_name: analysis.countryName,
        market_score: scores.market,
        cert_score: scores.cert,
        regulation_score: scores.regulation,
        payment_score: scores.payment,
        safety_score: scores.safety,
        total_score: total,
        label: "unknown",
        rank: 0,
        rationale: {
          summary: buildSummary(analysis.countryName, recommendationReason, analysis),
          target_markets: canonicalTargetMarkets,
          target_market_matched: targetMatched,
          inclusion_reason: inclusionReason,
          recommendation_reason: recommendationReason,
          low_recommendation_reason: lowRecommendationReason || null,
          alternative_markets: [] as Array<{ code: string; name: string }>,
          candidate_signals: signalLabels,
          sources: mergePersistentNewsEvidenceSources(
            buildDeferredRecommendationSources(analysis),
            persistentNewsEvidenceByCountry.get(analysis.country.code) ?? [],
          ),
        },
        used_fallback: !aiScore,
      };
    });

    const fallbackUsed = preRows.some((row) => row.used_fallback);
    const detailEnrichmentDeferred = true;
    const safetyPartial = safetyEvidence.status === "error" || safetyEvidence.status === "key_missing";
    const apiPartial = !kotraKey ||
      !certResult.ok ||
      !regulationResult.ok ||
      regulationResult.detailState === "stale" ||
      !productNewsResult.ok ||
      analyses.some((analysis) => !analysis.countryInfo.ok) ||
      safetyPartial;

    const state = computeResultState({
      apiPartial,
      fallbackUsed,
    });

    const sortedRows = preRows
      .sort((a, b) => (b.total_score ?? 0) - (a.total_score ?? 0))
      .map((row, index) => ({
        ...row,
        rank: index + 1,
        label: labelFromScore(Number(row.total_score ?? 0), state === "partial_success"),
      }));

    const topAlternatives = sortedRows.slice(0, 5).map((row) => ({
      code: row.country_code,
      name: row.country_name,
    }));

    const rows = sortedRows.map((row) => ({
      ...row,
      rationale: {
        ...row.rationale,
        alternative_markets: topAlternatives.filter((candidate) => candidate.code !== row.country_code).slice(0, 3),
      },
    }));

    const insertRows = rows.map(({ used_fallback, ...persisted }) => persisted);
    await supa.from("project_countries").insert(insertRows);

    await supa
      .from("projects")
      .update({
        current_step: 4,
        partial_score: state === "partial_success",
        status: state === "partial_success" ? "review_required" : "ready",
      })
      .eq("id", projectId);

    const countryInfoAttempted = analyses.length;
    const countryInfoSuccessRows = analyses.filter((analysis) => analysis.countryInfo.ok);
    const countryInfoFailedRows = analyses.filter((analysis) => !analysis.countryInfo.ok);
    const countryInfoStatus = !kotraKey
      ? "error"
      : countryInfoSuccessRows.length > 0
        ? (countryInfoFailedRows.length > 0 ? "partial_success" : "success")
        : "partial_success";
    const countryInfoErrorCode = !kotraKey
      ? "kotra_api_key_missing"
      : countryInfoFailedRows.length > 0
        ? (countryInfoSuccessRows.length > 0 ? "kotra_country_info_partial" : "kotra_country_info_failed")
        : (countryInfoSuccessRows.length === 0 ? "kotra_country_info_empty" : null);
    const countryInfoHttpStatus =
      countryInfoFailedRows[0]?.countryInfo.status ??
      countryInfoSuccessRows[0]?.countryInfo.status ??
      null;
    const countryInfoMessage = !kotraKey
      ? "kotra_api_key_missing"
      : `attempted=${countryInfoAttempted}, success=${countryInfoSuccessRows.length}, failed=${countryInfoFailedRows.length}`;
    const safetyStatus = safetyEvidence.status === "success"
      ? "success"
      : safetyEvidence.status === "empty"
        ? "empty"
        : safetyEvidence.status === "key_missing"
          ? "idle"
          : "error";
    const kotraInputPartial = !kotraKey ||
      !certResult.ok ||
      !regulationResult.ok ||
      regulationResult.detailState === "stale" ||
      !productNewsResult.ok;

    await supa.from("api_call_logs").insert([
      {
        user_id: userData.user.id,
        project_id: projectId,
        api_key_name: "recommend_country_candidate_extraction",
        status: candidatePool.countries.length > 0 ? "success" : "partial_success",
        http_status: null,
        response_count: candidatePool.countries.length,
        error_code: null,
        detail: {
          fallback_added: candidatePool.fallbackCodes.length,
          target_markets: targetMarketCodes,
          max_candidate_count: MAX_RECOMMENDATION_CANDIDATES,
        },
        message:
          `candidate_count=${candidatePool.countries.length}, fallback_added=${candidatePool.fallbackCodes.length}, target_markets=${targetMarketCodes.join(",") || "none"}`,
      },
      {
        user_id: userData.user.id,
        project_id: projectId,
        api_key_name: "kotra_country_info",
        status: countryInfoStatus,
        http_status: countryInfoHttpStatus,
        response_count: countryInfoSuccessRows.length,
        error_code: countryInfoErrorCode,
        detail: {
          attempted_country_count: countryInfoAttempted,
          success_country_count: countryInfoSuccessRows.length,
          failed_country_count: countryInfoFailedRows.length,
          failed_countries: countryInfoFailedRows.slice(0, 10).map((analysis) => ({
            country_code: analysis.country.code,
            status: analysis.countryInfo.status,
            message: analysis.countryInfo.message,
          })),
        },
        message: countryInfoMessage,
      },
      {
        user_id: userData.user.id,
        project_id: projectId,
        api_key_name: "recommend_country_api_inputs",
        status: kotraInputPartial ? "partial_success" : "success",
        http_status: certResult.status ?? regulationResult.status ?? productNewsResult.status ?? null,
        response_count: certResult.items.length + regulationResult.items.length + productNewsResult.items.length,
        error_code: !kotraKey
          ? "kotra_api_key_missing"
          : (kotraInputPartial
            ? (regulationResult.detailState === "stale" ? "kotra_import_regulation_cache_stale" : "kotra_inputs_partial")
            : null),
        detail: {
          cert_count: certResult.items.length,
          regulation_count: regulationResult.items.length,
          product_news_count: productNewsResult.items.length,
          regulation_detail_state: regulationResult.detailState,
          regulation_cache_meta: regulationResult.cacheMeta ?? null,
        },
        message:
          `cert_ok=${certResult.ok}, cert_count=${certResult.items.length}, reg_ok=${regulationResult.ok}, reg_state=${regulationResult.detailState}, reg_count=${regulationResult.items.length}, product_news_ok=${productNewsResult.ok}, product_news_count=${productNewsResult.items.length}`,
      },
      {
        user_id: userData.user.id,
        project_id: projectId,
        api_key_name: "recommend_country_detail_enrichment",
        status: "idle",
        http_status: null,
        response_count: 0,
        error_code: null,
        detail: {
          deferred_to_function: "country-detail",
          deferred_country_count: analyses.length,
          includes: ["country_market_news", "ksure_country_grade", "ksure_industry_risk", "ksure_export_payment"],
        },
        message:
          `country-level KOTRA news and K-SURE detail deferred to country-detail for ${analyses.length} countries`,
      },
      {
        user_id: userData.user.id,
        project_id: projectId,
        api_key_name: "recommend_country_safety_direct",
        status: safetyStatus,
        http_status: safetyEvidence.httpStatus,
        response_count: safetyEvidence.certCount + safetyEvidence.domesticRecallCount + safetyEvidence.foreignRecallCount,
        error_code: safetyEvidence.errorCode,
        detail: {
          strategic_status: strategicEvidence.status,
          strategic_match_type: strategicEvidence.matchType,
          safety_status: safetyEvidence.status,
          query: safetyEvidence.query || null,
          cert_count: safetyEvidence.certCount,
          domestic_recall_count: safetyEvidence.domesticRecallCount,
          foreign_recall_count: safetyEvidence.foreignRecallCount,
          direct_safety_score: safetyEvidenceScore,
        },
        message:
          `strategic=${strategicEvidence.matchType}, safety=${safetyEvidence.status}, direct_safety_score=${safetyEvidenceScore ?? "none"}`,
      },
      {
        user_id: userData.user.id,
        project_id: projectId,
        api_key_name: "recommend_country_ai_scoring",
        status: aiComplete ? "success" : "partial_success",
        http_status: null,
        response_count: aiScoring.byCode.size,
        error_code: aiComplete ? null : (aiUsed ? "ai_scoring_incomplete" : "ai_scoring_unavailable"),
        detail: {
          ai_used: aiUsed,
          ai_complete: aiComplete,
          missing_country_codes: aiMissingCountryCodes,
          reason: aiScoring.message,
        },
        message: aiComplete
          ? `ai_used=true, scored_country_count=${aiScoring.byCode.size}`
          : `ai_complete=false, scored_country_count=${aiScoring.byCode.size}, missing=${aiMissingCountryCodes.join(",") || "none"}, reason=${aiScoring.message}`,
      },
    ]);

    const elapsedMs = Date.now() - startedAtMs;
    const elapsedSec = Math.max(0, Math.round(elapsedMs / 1000));
    const messageParts: string[] = [];
    messageParts.push(`분석 완료(${elapsedSec}초 소요, 상태=${state}).`);
    if (!kotraKey) {
      messageParts.push("KOTRA API key is missing. Signal extraction used memo/fallback only.");
    }
    if (!aiUsed) {
      messageParts.push(`AI scoring unavailable. API-only fallback scoring used. (${aiScoring.message})`);
    }
    if (candidatePool.fallbackCodes.length > 0) {
      messageParts.push(`Candidate count was below 3, fallback countries added: ${candidatePool.fallbackCodes.join(", ")}`);
    }
    if (state === "partial_success") {
    messageParts.push("일부 근거가 비어 있거나 지연되어 부분 산출 상태입니다.");
    }

    return json({
      state,
      message: messageParts.join(" "),
      count: rows.length,
      candidate_count: candidatePool.countries.length,
      fallback_candidates: candidatePool.fallbackCodes,
      target_market_codes: targetMarketCodes,
      ai_used: aiUsed,
      fallback_used: fallbackUsed,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "unknown" }, 500);
  }
});

function buildProductContext(raw: Record<string, unknown> | null): ProductContext {
  const productName = asText(raw?.name);
  const productDescription = asText(raw?.description);
  const hsCode = normalizeHsCode(asText(raw?.hs_code));
  const hskCode = normalizeHsCode(asText(raw?.hsk_code));
  const hsDescription = extractHsDescriptionFromCandidates(raw?.hs_candidates, hsCode, hskCode);
  const componentsRaw = asText(raw?.components);
  const meta = parseProductMeta(componentsRaw);
  const targetMarketNote = meta.targetMarketNote ?? "";
  const targetMarketCodes = extractTargetMarketCodes(targetMarketNote);
  const targetMarkets = canonicalizeTargetMarkets(normalizeTargetMarkets(targetMarketCodes));
  const baseTokens = extractProductTokens(productName, productDescription, meta.tags);
  const hsDescriptionTokens = hsDescription
    ? extractProductTokens(hsDescription).filter((t) => !isWeakProductRelevanceToken(t))
    : [];
  const relevanceTokens = buildProductRelevanceTokens(productName, hsCode, [...baseTokens, ...hsDescriptionTokens]);

  return {
    name: productName || "N/A",
    description: productDescription || "N/A",
    hsCode,
    hskCode,
    hsDescription,
    targetMarketNote,
    targetMarkets,
    tokens: baseTokens,
    relevanceTokens,
    tags: meta.tags,
    modelName: parseProductModelName(componentsRaw),
  };
}

function extractHsDescriptionFromCandidates(
  candidates: unknown,
  hsCode: string,
  hskCode: string,
): string {
  const items = Array.isArray(candidates) ? candidates : [];
  for (const item of items) {
    const row = asRecord(item);
    const candidateHs = normalizeHsCode(asText(row.hs_code));
    const candidateHsk = normalizeHsCode(asText(row.hsk_code));
    if (
      (hskCode && candidateHsk === hskCode) ||
      (hsCode && candidateHs === hsCode)
    ) {
      const desc = asText(row.description);
      const officialKo = asText(row.official_name_ko);
      const officialEn = asText(row.official_name_en);
      return cleanText([desc, officialKo, officialEn].filter(Boolean).join(" "));
    }
  }
  return "";
}

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

function resolveSafetyKoreaKey(): string {
  return normalizeAuthKeyValue(
    Deno.env.get("SAFETYKOREA_API_KEY") ||
    Deno.env.get("SAFETYKOREA_AUTH_KEY") ||
    "",
  );
}

function createServiceRoleClient(): ReturnType<typeof createClient> | null {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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

function parseProductModelName(raw: string): string {
  if (!raw.trim().startsWith("{")) return "";
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return asText(parsed.modelName);
  } catch {
    return "";
  }
}

async function fetchKsureCountryGradeDataset(key: string): Promise<KsureCountryGradeDataset> {
  return callKsureCountryGradePage(1, 500, key);
}

function resolveKsureCountryGradeFromDataset(
  params: { countryCode: string; countryName: string },
  dataset: KsureCountryGradeDataset,
): KsureCountryGradeResult {
  if (!dataset.ok) return { ok: false, status: dataset.status, message: dataset.message, item: null };

  const exact = dataset.items.find((item) => item.ctryCd.toUpperCase() === params.countryCode);
  if (exact) return { ok: true, status: dataset.status, message: dataset.message, item: exact };

  const byName = dataset.items.find((item) => {
    return isCountryTextMatched(params.countryCode, params.countryName, item.ctryNm);
  });
  return { ok: true, status: dataset.status, message: dataset.message, item: byName ?? null };
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

  const result = await fetchJsonWithTimeout(url.toString());
  if (!result.ok) return { ok: false, status: result.status, message: result.message, items: [] };

  const response = asRecord(asRecord(result.data).response);
  const header = asRecord(response.header);
  const resultCode = asText(header.resultCode);
  const resultMsg = asText(header.resultMsg);
  if (resultCode && resultCode !== "0" && resultCode !== "00") {
    return { ok: false, status: result.status, message: `${resultCode}${resultMsg ? ` ${resultMsg}` : ""}`, items: [] };
  }

  const body = asRecord(response.body);
  const items = asArray(asRecord(body.items).item)
    .map(normalizeKsureCountryGradeItem)
    .filter((item) => item.ctryCd || item.ctryNm || item.evalGrd);
  return { ok: true, status: result.status, message: resultMsg || "NO ERROR", items };
}

async function fetchKsureIndustryRiskDataset(key: string): Promise<KsureIndustryRiskDataset> {
  const maxPages = 6;
  const pageSize = 200;
  const results = await mapWithConcurrency(
    Array.from({ length: maxPages }, (_, index) => index + 1),
    KSURE_DATASET_CONCURRENCY,
    (pageNo) => callKsureIndustryRiskPage(pageNo, pageSize, key),
  );
  const firstError = results.find((result) => !result.ok) ?? null;
  const okResults = results.filter((result) => result.ok);

  if (okResults.length === 0 && firstError) {
    return { ok: false, status: firstError.status, message: firstError.message, items: [] };
  }

  const items = okResults.flatMap((result) => result.items);
  return {
    ok: true,
    status: okResults[0]?.status ?? firstError?.status ?? 200,
    message: okResults[0]?.message ?? "NO ERROR",
    items,
  };
}

function resolveKsureIndustryRisksFromDataset(
  params: { countryCode: string; countryName: string; industryCode: string },
  dataset: KsureIndustryRiskDataset,
): KsureIndustryRiskResult {
  if (!dataset.ok) {
    return {
      ok: false,
      status: dataset.status,
      message: dataset.message,
      items: [],
      countryItemCount: 0,
      industryMatchFailed: false,
    };
  }

  const mappedIndustryCodes = buildIndustryCodeCandidates(params.industryCode);
  const countryMatched = filterKsureIndustryByCountry(dataset.items, params.countryCode, params.countryName);

  if (countryMatched.length === 0) {
    return {
      ok: true,
      status: dataset.status ?? 200,
      message: dataset.message || "NO ERROR",
      items: [],
      countryItemCount: 0,
      industryMatchFailed: false,
    };
  }

  if (mappedIndustryCodes.length === 0) {
    return {
      ok: true,
      status: dataset.status ?? 200,
      message: "No industry code for recommendation risk match",
      items: [],
      countryItemCount: countryMatched.length,
      industryMatchFailed: true,
    };
  }

  const industryMatched = countryMatched.filter((item) => isIndustryMatched(item, mappedIndustryCodes));
  return {
    ok: true,
    status: dataset.status ?? 200,
    message: industryMatched.length > 0 ? "NO ERROR" : "Industry rows not matched",
    items: rankKsureIndustryRisks(industryMatched),
    countryItemCount: countryMatched.length,
    industryMatchFailed: industryMatched.length === 0,
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

  const result = await fetchJsonWithTimeout(url.toString());
  if (!result.ok) {
    return { ok: false, status: result.status, message: result.message, items: [], countryItemCount: 0, industryMatchFailed: false };
  }

  const root = asRecord(result.data);
  const response = asRecord(root.response);
  const normalized = Object.keys(response).length > 0 ? response : root;
  const header = asRecord(normalized.header);
  const resultCode = asText(header.resultCode);
  const resultMsg = asText(header.resultMsg);
  if (resultCode && resultCode !== "0" && resultCode !== "00") {
    return {
      ok: false,
      status: result.status,
      message: `${resultCode}${resultMsg ? ` ${resultMsg}` : ""}`,
      items: [],
      countryItemCount: 0,
      industryMatchFailed: false,
    };
  }

  const body = asRecord(normalized.body);
  const items = asArray(asRecord(body.items).item)
    .map(normalizeKsureIndustryRiskItem)
    .filter((item) => item.ctryCd || item.ctryNm || item.biztypCd || item.biztypNm || item.riskIdx != null);
  return { ok: true, status: result.status, message: resultMsg || "NO ERROR", items, countryItemCount: 0, industryMatchFailed: false };
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
    if (v.trim()) url.searchParams.set(k, v.trim());
  }

  const result = await fetchJsonWithTimeout(url.toString());
  if (!result.ok) return { ok: false, status: result.status, message: result.message, item: null, scope: null };

  const root = asRecord(result.data);
  const response = asRecord(root.response);
  const normalized = Object.keys(response).length > 0 ? response : root;
  const header = asRecord(normalized.header);
  const resultCode = asText(header.resultCode);
  const resultMsg = asText(header.resultMsg);
  if (resultCode && resultCode !== "0" && resultCode !== "00") {
    if (resultCode === "3") return { ok: true, status: result.status, message: resultMsg || "No data", item: null, scope: null };
    return { ok: false, status: result.status, message: `${resultCode}${resultMsg ? ` ${resultMsg}` : ""}`, item: null, scope: null };
  }

  const body = asRecord(normalized.body);
  const firstItem = asArray(asRecord(body.items).item)[0];
  return {
    ok: true,
    status: result.status,
    message: resultMsg || "NO ERROR",
    item: firstItem ? normalizeKsureExportPaymentItem(firstItem) : null,
    scope: null,
  };
}

async function fetchSafetyKoreaEvidence(product: ProductContext, apiKey: string): Promise<SafetyEvidenceResult> {
  if (!apiKey) {
    return {
      status: "key_missing",
      message: "SafetyKorea API key is missing",
      httpStatus: null,
      certCount: 0,
      domesticRecallCount: 0,
      foreignRecallCount: 0,
      query: "",
      errorCode: "safetykorea_api_key_missing",
    };
  }

  const queries = buildSafetyQueries(product);
  if (queries.length === 0) {
    return {
      status: "empty",
      message: "No SafetyKorea query terms",
      httpStatus: 200,
      certCount: 0,
      domesticRecallCount: 0,
      foreignRecallCount: 0,
      query: "",
      errorCode: null,
    };
  }

  let certCount = 0;
  let domesticRecallCount = 0;
  let foreignRecallCount = 0;
  let successCount = 0;
  let failureCount = 0;
  let httpStatus: number | null = null;
  let errorCode: string | null = null;

  for (const query of queries) {
    for (const request of [
      { kind: "cert" as const, url: buildSafetyUrl(SAFETYKOREA_CERT_LIST_URL, "productName", query) },
      { kind: "domestic" as const, url: buildSafetyUrl(SAFETYKOREA_RECALL_LIST_URL, "recallProductName", query) },
      { kind: "foreign" as const, url: buildSafetyUrl(SAFETYKOREA_FOREIGN_RECALL_LIST_URL, "recallProductName", query) },
    ]) {
      const result = await requestSafetyKorea(apiKey, request.url);
      if (result.status != null) httpStatus = result.status;
      if (!result.ok) {
        failureCount += 1;
        if (!errorCode) errorCode = result.errorCode;
        continue;
      }
      successCount += 1;
      const count = asArray(result.data).length;
      if (request.kind === "cert") certCount += count;
      else if (request.kind === "domestic") domesticRecallCount += count;
      else foreignRecallCount += count;
    }
  }

  if (successCount === 0 && failureCount > 0) {
    return {
      status: "error",
      message: "SafetyKorea API calls failed",
      httpStatus,
      certCount,
      domesticRecallCount,
      foreignRecallCount,
      query: queries.join(", "),
      errorCode: errorCode ?? "safetykorea_api_failed",
    };
  }

  const status = certCount + domesticRecallCount + foreignRecallCount > 0 ? "success" : "empty";
  return {
    status,
    message: status === "success" ? "SafetyKorea evidence found" : "No SafetyKorea evidence matched",
    httpStatus: httpStatus ?? 200,
    certCount,
    domesticRecallCount,
    foreignRecallCount,
    query: queries.join(", "),
    errorCode,
  };
}

function buildStrategicEvidence(hsCodeRaw: string, hskCodeRaw: string): StrategicEvidenceResult {
  const hsCode = normalizeHsCode(hsCodeRaw);
  const hskCode = normalizeHsCode(hskCodeRaw);
  if (hskCode && STRATEGIC_HSK_MAP[hskCode]) {
    const entry = STRATEGIC_HSK_MAP[hskCode];
    return {
      status: "success",
      severity: "warn",
      matchType: "exact_hsk",
      summary: `Strategic item matched by exact HSK ${hskCode}`,
      raw: {
        hs_code: hsCode || null,
        hsk_code: hskCode,
        match_type: "exact_hsk",
        control_no_list: entry.controlNos,
        item_name_ko: entry.hskName || null,
        item_name_en: entry.hskNameEn || null,
      },
    };
  }

  const prefix6 = (hskCode || hsCode).slice(0, 6);
  if (prefix6.length === 6) {
    const matched = Object.entries(STRATEGIC_HSK_MAP)
      .filter(([hsk]) => hsk.startsWith(prefix6))
      .slice(0, 100);
    if (matched.length > 0) {
      const controlNos = dedupeStrings(matched.flatMap(([, item]) => item.controlNos));
      return {
        status: "success",
        severity: "warn",
        matchType: "prefix6_candidate",
        summary: `Strategic candidate matched by HS6 prefix ${prefix6} (${matched.length} candidates)`,
        raw: {
          hs_code: hsCode || null,
          hsk_code: hskCode || null,
          match_type: "prefix6_candidate",
          prefix6,
          candidate_count: matched.length,
          control_no_list: controlNos.slice(0, 20),
          candidate_hsk_list: matched.map(([hsk]) => hsk).slice(0, 20),
        },
      };
    }
  }

  return {
    status: "empty",
    severity: "info",
    matchType: "none",
    summary: "No strategic-item linkage match found for HS/HSK code.",
    raw: {
      hs_code: hsCode || null,
      hsk_code: hskCode || null,
      match_type: "none",
    },
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

function normalizeKsureIndustryRiskItem(value: unknown): KsureIndustryRiskItem {
  const row = asRecord(value);
  return {
    ctryCd: asText(row.ctryCd).toUpperCase(),
    ctryNm: asText(row.ctryNm),
    biztypCd: asText(row.biztypCd),
    biztypNm: asText(row.biztypNm),
    riskIdx: asFiniteNumber(row.riskIdx),
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
    VALUE: asFiniteNumber(row.VALUE),
    CNT: asFiniteNumber(row.CNT),
  };
}

function mapKsureCountryGradeLevel(item: KsureCountryGradeItem | null): RiskEvidenceLevel | null {
  if (!item) return null;
  const grade = Number(item.evalGrd);
  if (!Number.isFinite(grade)) return "info";
  if (grade >= 6) return "high";
  if (grade >= 4) return "caution";
  return "info";
}

function mapKsureIndustryRiskEvidenceLevel(item: KsureIndustryRiskItem | null): RiskEvidenceLevel | null {
  if (!item) return null;
  const risk = item.riskIdx;
  if (risk == null || !Number.isFinite(risk)) return "info";
  if (risk >= 4) return "high";
  if (risk >= 3) return "caution";
  return "info";
}

function mapKsurePaymentEvidenceLevel(
  item: KsureExportPaymentItem | null,
  scope: "country" | "global" | null,
): RiskEvidenceLevel | null {
  if (!item) return null;
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

function getLatestSeriesPoint(series: KsureSeriesValue[]): KsureSeriesValue | null {
  const rows = series.filter((row) => row.YEAR || row.VALUE != null || row.CNT != null);
  if (rows.length === 0) return null;
  return rows.reduce((best, row) => (parseYearScore(row.YEAR) > parseYearScore(best.YEAR) ? row : best), rows[0]);
}

function parseYearScore(year: string): number {
  const n = Number(year);
  return Number.isFinite(n) ? n : -1;
}

function filterKsureIndustryByCountry(
  items: KsureIndustryRiskItem[],
  countryCode: string,
  countryName: string,
): KsureIndustryRiskItem[] {
  return items.filter((item) => {
    if (item.ctryCd && item.ctryCd.toUpperCase() === countryCode) return true;
    return isCountryTextMatched(countryCode, countryName, item.ctryNm);
  });
}

function buildIndustryCodeCandidates(industryCode: string): string[] {
  const normalized = normalizeIndustryCode(industryCode);
  if (!normalized) return [];
  const out = new Set<string>();
  const digits = normalized.startsWith("C") ? normalized.slice(1) : normalized;
  out.add(normalized);
  if (!normalized.startsWith("C")) out.add(`C${normalized}`);
  if (/^\d+$/.test(digits)) {
    for (let len = Math.min(5, digits.length); len >= 2; len -= 1) {
      out.add(digits.slice(0, len));
      out.add(`C${digits.slice(0, len)}`);
    }
  }
  return [...out];
}

function isIndustryMatched(item: KsureIndustryRiskItem, mappedIndustryCodes: string[]): boolean {
  const itemCode = normalizeIndustryCode(item.biztypCd);
  const itemName = item.biztypNm.toLowerCase();
  const itemDigits = itemCode.startsWith("C") ? itemCode.slice(1) : itemCode;
  return mappedIndustryCodes.some((candidate) => {
    const normalized = normalizeIndustryCode(candidate);
    const candidateDigits = normalized.startsWith("C") ? normalized.slice(1) : normalized;
    return Boolean(
      itemCode.startsWith(normalized) ||
        (itemDigits && candidateDigits && itemDigits.startsWith(candidateDigits)) ||
        itemName.includes(normalized.toLowerCase()) ||
        (candidateDigits.length >= 3 && itemName.includes(candidateDigits)),
    );
  });
}

function rankKsureIndustryRisks(items: KsureIndustryRiskItem[]): KsureIndustryRiskItem[] {
  return dedupeByKey(
    [...items].sort((a, b) => {
      const aRisk = a.riskIdx ?? -1;
      const bRisk = b.riskIdx ?? -1;
      if (bRisk !== aRisk) return bRisk - aRisk;
      return a.biztypCd.localeCompare(b.biztypCd);
    }),
    (item) => `${item.ctryCd}|${item.biztypCd}|${item.biztypNm}`,
  );
}

function buildSafetyQueries(product: ProductContext): string[] {
  return dedupeByKey(
    [product.name, product.modelName, ...product.tags]
      .map((value) => value.replace(/\s+/g, " ").trim())
      .filter((value) => value.length >= 2 && value !== "N/A")
      .slice(0, 3),
    (value) => value.toLowerCase(),
  );
}

function buildSafetyUrl(endpoint: string, conditionKey: string, query: string): URL {
  const url = new URL(endpoint);
  url.searchParams.set("conditionKey", conditionKey);
  url.searchParams.set("conditionValue", query);
  return url;
}

async function requestSafetyKorea(
  apiKey: string,
  url: URL,
): Promise<
  | { ok: true; status: number; data: unknown }
  | { ok: false; status: number | null; errorCode: string; data: unknown }
> {
  const result = await fetchJsonWithTimeout(url.toString(), { AuthKey: apiKey });
  if (!result.ok) {
    return { ok: false, status: result.status, errorCode: normalizeSafetyErrorCode(result.message), data: null };
  }
  const envelope = asRecord(result.data);
  const code = asText(envelope.resultCode);
  if (code === "2000") return { ok: true, status: result.status, data: envelope.resultData };
  if (code === "2004") return { ok: true, status: result.status, data: [] };
  return { ok: false, status: result.status, errorCode: normalizeSafetyErrorCode(code || "provider_error"), data: envelope.resultData };
}

async function fetchJsonWithTimeout(
  url: string,
  headers?: HeadersInit,
  timeoutMs = EXTERNAL_FETCH_TIMEOUT_MS,
): Promise<
  | { ok: true; status: number; data: unknown }
  | { ok: false; status: number | null; message: string }
> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) return { ok: false, status: response.status, message: `HTTP ${response.status}` };
    const text = await response.text();
    try {
      return { ok: true, status: response.status, data: JSON.parse(text) };
    } catch {
      return { ok: false, status: response.status, message: "Invalid JSON response" };
    }
  } catch (error) {
    return { ok: false, status: null, message: error instanceof Error ? error.message : "External API request failed" };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchTextWithTimeout(
  url: string,
  headers?: HeadersInit,
  timeoutMs = EXTERNAL_FETCH_TIMEOUT_MS,
): Promise<
  | { ok: true; status: number; text: string }
  | { ok: false; status: number | null; message: string }
> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) return { ok: false, status: response.status, message: `HTTP ${response.status}` };
    return { ok: true, status: response.status, text: await response.text() };
  } catch (error) {
    return { ok: false, status: null, message: error instanceof Error ? error.message : "External API request failed" };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = EXTERNAL_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

type CandidatePool = ReturnType<typeof collectCandidatePool>;

function limitCandidatePool(
  pool: CandidatePool,
  requiredCountryCodes: string[],
  maxCount: number,
): CandidatePool {
  const limit = Math.max(1, Math.round(maxCount));
  if (pool.countries.length <= limit) return pool;

  const required = new Set(requiredCountryCodes.map((code) => code.toUpperCase()));
  const selected: SeedCountry[] = [];
  const selectedCodes = new Set<string>();
  const add = (country: SeedCountry) => {
    if (selected.length >= limit) return;
    if (selectedCodes.has(country.code)) return;
    selected.push(country);
    selectedCodes.add(country.code);
  };

  for (const country of pool.countries) {
    if (required.has(country.code)) add(country);
  }
  for (const country of pool.countries) add(country);

  return {
    countries: selected,
    signalByCountry: new Map(
      [...pool.signalByCountry.entries()].filter(([code]) => selectedCodes.has(code)),
    ),
    fallbackCodes: pool.fallbackCodes.filter((code) => selectedCodes.has(code)),
  };
}

function addCandidatePoolSignal(pool: CandidatePool, countryCode: string, signal: CandidateSignal): void {
  const code = countryCode.toUpperCase();
  if (!pool.countries.some((country) => country.code === code)) return;
  const signals = pool.signalByCountry.get(code) ?? [];
  if (signals.includes(signal)) return;
  pool.signalByCountry.set(code, [...signals, signal]);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limit = Math.max(1, Math.min(concurrency, items.length || 1));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex], currentIndex);
      }
    }),
  );

  return results;
}

function normalizeSafetyErrorCode(value: string): string {
  const code = value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return code ? `safetykorea_${code}` : "safetykorea_api_failed";
}

async function fetchCertificationDataset(product: ProductContext, key: string): Promise<KotraCertResult> {
  const hs6 = product.hsCode.length >= 6 ? product.hsCode.slice(0, 6) : "";
  const productName = product.name === "N/A" ? "" : product.name;
  const attempts: Array<Record<string, string>> = [];

  if (hs6 && productName) attempts.push({ search5: hs6, search1: productName });
  if (hs6) attempts.push({ search5: hs6 });
  if (productName) attempts.push({ search1: productName });

  if (attempts.length === 0) return { ok: true, status: 200, message: "No query terms", items: [] };

  const allItems: KotraCertItem[] = [];
  let firstError: KotraCertResult | null = null;
  let status: number | null = null;

  const results = await mapWithConcurrency(
    attempts,
    KOTRA_QUERY_CONCURRENCY,
    (filters) => callKotraCertEndpoint(filters, key),
  );
  for (const result of results) {
    status = result.status;
    if (!result.ok) {
      if (!firstError) firstError = result;
      continue;
    }
    allItems.push(...result.items);
  }

  if (allItems.length === 0 && firstError) return firstError;
  const deduped = dedupeByKey(allItems, (item) => [item.nttSj, item.systName, item.nat, item.hscd].join("|"));
  return { ok: true, status, message: "NO ERROR", items: deduped };
}

async function callKotraCertEndpoint(filters: Record<string, string>, key: string): Promise<KotraCertResult> {
  const url = new URL(KOTRA_CERT_ENDPOINT);
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("type", "json");
  url.searchParams.set("numOfRows", "200");
  url.searchParams.set("pageNo", "1");

  for (const [queryKey, queryValue] of Object.entries(filters)) {
    const value = queryValue.trim();
    if (!value) continue;
    url.searchParams.set(queryKey, value);
  }

  const result = await fetchTextWithTimeout(url.toString(), undefined, KOTRA_FETCH_TIMEOUT_MS);
  if (!result.ok) return { ok: false, status: result.status, message: result.message, items: [] };

  const text = result.text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, status: result.status, message: "Invalid JSON response", items: [] };
  }

  const root = asRecord(parsed).response;
  const responseRoot = asRecord(root);
  const header = asRecord(responseRoot.header);
  const resultCode = asText(header.resultCode);
  const resultMsg = asText(header.resultMsg);
  if (resultCode && resultCode !== "00") {
    return { ok: false, status: result.status, message: `${resultCode}${resultMsg ? ` ${resultMsg}` : ""}`, items: [] };
  }

  const body = asRecord(responseRoot.body);
  const itemList = asRecord(body.itemList);
  const items = asArray(itemList.item).map(normalizeCertItem).filter((item) => item.nttSj || item.systName);
  return { ok: true, status: result.status, message: resultMsg || "NO ERROR", items };
}

async function fetchImportRegulationDatasetFromCache(
  supa: ReturnType<typeof createClient>,
  product: ProductContext,
): Promise<KotraImportRegulationResult> {
  const cacheStatusResponse = await supa
    .from("api_cache_status")
    .select("cache_key,status,active_batch_id,total_count,fetched_count,upserted_count,last_attempt_at,last_success_at,last_error,stale_after_days")
    .eq("cache_key", KOTRA_IMPORT_REGULATION_CACHE_KEY)
    .maybeSingle();
  if (cacheStatusResponse.error) {
    return {
      ok: false,
      status: null,
      message: cacheStatusResponse.error.message,
      detailState: "error",
      items: [],
    };
  }

  const normalizedCacheStatus = normalizeImportRegulationCacheStatus(cacheStatusResponse.data);
  const freshness = evaluateKotraImportRegulationCacheFreshness(normalizedCacheStatus);
  const cacheMeta = {
    cache_status: normalizedCacheStatus?.status || "",
    cache_last_success_at: normalizedCacheStatus?.lastSuccessAt || null,
    cache_active_batch_id: normalizedCacheStatus?.activeBatchId || null,
    cache_stale_after_days: normalizedCacheStatus?.staleAfterDays || 30,
    cache_age_days: freshness.ageDays,
    cache_reason: freshness.reason,
  };

  if (freshness.stale || !normalizedCacheStatus?.activeBatchId) {
    return {
      ok: true,
      status: 200,
      message: formatImportRegulationCacheStaleMessage(cacheMeta.cache_reason, cacheMeta.cache_stale_after_days),
      detailState: "stale",
      items: [],
      cacheMeta,
    };
  }

  const importRegulationOrFilter = buildImportRegulationCacheFilters(product);
  if (!importRegulationOrFilter) {
    return {
      ok: true,
      status: 200,
      message: "cache_filter_match_0",
      detailState: "empty",
      items: [],
      cacheMeta,
    };
  }

  const cacheRowsResponse = await supa
    .from("kotra_import_regulation_cache")
    .select("id,batch_id,is_active,hqurt_name,cmdlt_name,hscd,hscd_cn,reg_dt,regl_cn,iso_wd2_nat_cd,regl_str_de,regl_end_de,probe_tgt_nat_name")
    .eq("batch_id", normalizedCacheStatus.activeBatchId)
    .eq("is_active", true)
    .or(importRegulationOrFilter)
    .order("id", { ascending: true })
    .limit(MAX_IMPORT_REGULATION_CACHE_ROWS);

  if (cacheRowsResponse.error) {
    return {
      ok: false,
      status: null,
      message: cacheRowsResponse.error.message,
      detailState: "error",
      items: [],
      cacheMeta,
    };
  }

  const allItems = asArray(cacheRowsResponse.data)
    .map(toImportRegulationItemFromCacheRow)
    .filter((item) => item.HSCD || item.CMDLT_NAME || item.REGL_CN);

  if (allItems.length === 0) {
    return {
      ok: true,
      status: 200,
      message: "cache_filter_match_0",
      detailState: "empty",
      items: [],
      cacheMeta,
    };
  }

  return {
    ok: true,
    status: 200,
    message: "cache_read_ok",
    detailState: "success",
    items: dedupeByKey(allItems, (item) =>
      [item.HSCD, item.REGL_CN, item.ISO_WD2_NAT_CD, item.PROBE_TGT_NAT_NAME, item.REG_DT].join("|")),
    cacheMeta,
  };
}

function buildImportRegulationCacheFilters(product: ProductContext): string {
  const hs = normalizeHsCode(product.hsCode || product.hskCode);
  const hs6 = hs.slice(0, 6);
  const hs4 = hs.slice(0, 4);
  const filters: string[] = [];
  const pushFilter = (value: string) => {
    if (!value) return;
    filters.push(`hscd.ilike.${value}%`);
    filters.push(`hscd_cn.ilike.%${value}%`);
  };

  if (hs6.length === 6) pushFilter(hs6);
  if (hs4.length === 4) pushFilter(hs4);
  return [...new Set(filters)].join(",");
}

function formatImportRegulationCacheStaleMessage(reason: string | null, staleAfterDays: number): string {
  if (reason === "missing_status") return "Import-regulation cache status is missing.";
  if (reason === "missing_active_batch") return "Import-regulation cache active batch is missing.";
  if (reason === "missing_last_success") return "Import-regulation cache has no successful refresh timestamp.";
  if (reason === "expired") return `Import-regulation cache is older than ${staleAfterDays} days.`;
  return "Import-regulation cache is stale or not synchronized.";
}

async function fetchExportRegionRankEvidenceMap(
  supa: ReturnType<typeof createClient>,
  productHsCode: string,
): Promise<Map<string, ExportRegionRankEvidence>> {
  const { data, error } = await supa
    .from("kotra_csv_export_region_rank_cache")
    .select("country_name,country_name_normalized,source_rank,reference_year,export_share,hs_code_normalized,is_active")
    .eq("is_active", true);
  if (error || !Array.isArray(data)) return new Map<string, ExportRegionRankEvidence>();

  const hs = normalizeHsCode(productHsCode);
  const hs6 = hs.slice(0, 6);
  const hs4 = hs.slice(0, 4);
  const bestByCode = new Map<string, ExportRegionRankEvidence>();

  for (const row of data) {
    const raw = asRecord(row);
    const countryCodes = detectCountryCodesFromText(
      `${asText(raw.country_name_normalized)} ${asText(raw.country_name)}`,
    );
    if (countryCodes.length === 0) continue;

    const rank = asFiniteNumber(raw.source_rank);
    if (rank == null || rank <= 0) continue;

    const hsCodeNormalized = asText(raw.hs_code_normalized);
    const hsMatched = Boolean(hsCodeNormalized) &&
      ((hs6.length >= 6 && hsCodeNormalized.includes(hs6)) || (hs4.length >= 4 && hsCodeNormalized.includes(hs4)));
    const source: ExportRegionRankEvidence["source"] = hsCodeNormalized ? (hsMatched ? "hs_match" : "all_products") : "all_products";

    const evidence: ExportRegionRankEvidence = {
      source,
      rank: Math.trunc(rank),
      referenceYear: asFiniteNumber(raw.reference_year),
      exportShare: asFiniteNumber(raw.export_share),
      hsCodeNormalized,
      hsMatched,
    };

    for (const countryCode of countryCodes) {
      const previous = bestByCode.get(countryCode);
      if (!previous) {
        bestByCode.set(countryCode, evidence);
        continue;
      }
      const previousPriority = previous.hsMatched ? 2 : previous.source === "all_products" ? 1 : 0;
      const nextPriority = evidence.hsMatched ? 2 : evidence.source === "all_products" ? 1 : 0;
      if (nextPriority > previousPriority || (nextPriority === previousPriority && evidence.rank < previous.rank)) {
        bestByCode.set(countryCode, evidence);
      }
    }
  }

  return bestByCode;
}

async function fetchTradeOfficeActionMap(
  supa: ReturnType<typeof createClient>,
): Promise<Map<string, TradeOfficeActionItem[]>> {
  const { data, error } = await supa
    .from("kotra_csv_trade_office_cache")
    .select("country_name,country_name_normalized,office_name,office_address,airport_route_text,raw,is_active")
    .eq("is_active", true);
  if (error || !Array.isArray(data)) return new Map<string, TradeOfficeActionItem[]>();

  const out = new Map<string, TradeOfficeActionItem[]>();
  for (const row of data) {
    const raw = asRecord(row);
    const countryCodes = detectCountryCodesFromText(
      `${asText(raw.country_name_normalized)} ${asText(raw.country_name)}`,
    );
    if (countryCodes.length === 0) continue;

    const action: TradeOfficeActionItem = {
      countryNameNormalized: asText(raw.country_name_normalized),
      officeName: asText(raw.office_name) || "무역관 정보",
      officeAddress: asText(raw.office_address),
      airportRouteText: asText(raw.airport_route_text),
      raw: asRecord(raw.raw),
    };

    for (const countryCode of countryCodes) {
      const list = out.get(countryCode) ?? [];
      if (list.some((item) => item.officeName === action.officeName)) continue;
      list.push(action);
      out.set(countryCode, list.slice(0, 3));
    }
  }

  return out;
}

async function fetchProductNewsDataset(product: ProductContext, key: string): Promise<KotraNewsResult> {
  const queries = buildProductNewsQueries(product);
  if (queries.length === 0) return { ok: true, status: 200, message: "No query terms", query: "", items: [] };

  const allItems: KotraNewsItem[] = [];
  let firstError: KotraNewsResult | null = null;

  const results = await mapWithConcurrency(
    queries,
    KOTRA_QUERY_CONCURRENCY,
    (query) => fetchKotraNewsByQuery(query, key, 30, marketNewsSearchParam("product")),
  );
  for (const result of results) {
    if (!result.ok) {
      if (!firstError) firstError = result;
      continue;
    }
    allItems.push(...result.items);
  }

  if (allItems.length === 0 && firstError) return firstError;
  return {
    ok: true,
    status: 200,
    message: "NO ERROR",
    query: queries.join(", "),
    items: dedupeNewsItems(allItems),
  };
}

function buildProductNewsQueries(product: ProductContext): string[] {
  const out: string[] = [];
  const pushQuery = (value: string) => {
    const cleaned = value.replace(/\s+/g, " ").trim();
    if (!cleaned) return;
    if (cleaned.length < 2) return;
    if (out.includes(cleaned)) return;
    out.push(cleaned);
  };

  const isKorean = (token: string) => /[\uAC00-\uD7AF]/.test(token);

  const directTerms = product.relevanceTokens
    .filter((token) => !isWeakProductRelevanceToken(token))
    .filter((token) => !/^\d{4,}$/.test(token))
    .filter((token) => token.length >= 3 || token.includes(" ") || (token.length === 2 && isKorean(token)));

  if (
    product.name &&
    product.name !== "N/A" &&
    directTerms.some((term) => hasKeywordTokenMatch(product.name, [term]))
  ) {
    pushQuery(product.name);
  }
  for (const token of directTerms.slice(0, 3)) pushQuery(token);

  if (product.hsDescription) {
    const descTokens = product.hsDescription
    .split(/[\s/·,()]+/g)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2 && !isWeakProductRelevanceToken(t) && !/^\d{4,}$/.test(t));
    for (const token of descTokens.slice(0, 3)) pushQuery(token);
  }

  if (product.hsCode.length >= 6) pushQuery(product.hsCode.slice(0, 6));
  return out.slice(0, 5);
}

async function fetchKotraCountryInfo(country: SeedCountry, key: string): Promise<CountryApiResult> {
  const url = new URL(KOTRA_COUNTRY_INFO_ENDPOINT);
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("_type", "json");
  url.searchParams.set("isoWd2CntCd", country.code);

  const result = await fetchTextWithTimeout(url.toString(), undefined, KOTRA_FETCH_TIMEOUT_MS);
  if (!result.ok) {
    return {
      country,
      ok: false,
      status: result.status,
      message: result.message,
      item: null,
    };
  }

  const text = result.text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      country,
      ok: false,
      status: result.status,
      message: "Invalid JSON response",
      item: null,
    };
  }

  const root = asRecord(parsed).response;
  const responseRoot = asRecord(root);
  const header = asRecord(responseRoot.header);
  const resultCode = asText(header.resultCode);
  const resultMsg = asText(header.resultMsg);
  if (resultCode && resultCode !== "00") {
    return {
      country,
      ok: false,
      status: result.status,
      message: `${resultCode}${resultMsg ? ` ${resultMsg}` : ""}`,
      item: null,
    };
  }

  const body = asRecord(responseRoot.body);
  const item = asRecord(asRecord(body.itemList).item);
  if (Object.keys(item).length === 0) {
    return {
      country,
      ok: false,
      status: result.status,
      message: "Empty item",
      item: null,
    };
  }

  return {
    country,
    ok: true,
    status: result.status,
    message: "NO ERROR",
    item,
  };
}

async function fetchCountryMarketNews(country: SeedCountry, key: string, product: ProductContext): Promise<KotraNewsResult> {
  const queries = buildCountryNewsQueries(country, product);
  if (queries.length === 0) return { ok: true, status: 200, message: "No query terms", query: "", items: [] };

  const allItems: KotraNewsItem[] = [];
  let lastOkStatus: number | null = null;
  let firstError: KotraNewsResult | null = null;

  const results = await mapWithConcurrency(
    queries,
    KOTRA_QUERY_CONCURRENCY,
    (query) => fetchKotraNewsByQuery(query, key, 10, marketNewsSearchParam("country")),
  );
  for (const result of results) {
    if (!result.ok) {
      if (!firstError) firstError = result;
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

  if (firstError) return firstError;
  return { ok: true, status: lastOkStatus ?? 200, message: "NO ERROR", query: queries.join(", "), items: [] };
}

function buildCountryNewsQueries(country: SeedCountry, product: ProductContext): string[] {
  const countryAliases: string[] = [];
  for (const alias of COUNTRY_ALIAS_MAP[country.code] ?? []) {
    const cleaned = alias.trim();
    if (cleaned) countryAliases.push(cleaned);
  }
  for (const query of COUNTRY_NEWS_QUERY[country.code] ?? []) {
    const cleaned = query.trim();
    if (cleaned && !countryAliases.includes(cleaned)) countryAliases.push(cleaned);
  }
  const compactName = country.name.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  if (compactName && !countryAliases.includes(compactName)) countryAliases.push(compactName);

  const koreanAlias = countryAliases.find((alias) => /[\uAC00-\uD7AF]/.test(alias)) ?? compactName;

  const productKeywords: string[] = [];
  if (product.name && product.name !== "N/A") productKeywords.push(product.name);
  if (product.hsDescription) {
    const descParts = product.hsDescription
    .split(/[\s/·,()]+/g)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2 && !isWeakProductRelevanceToken(t) && !/^\d{4,}$/.test(t));
    productKeywords.push(...descParts.slice(0, 2));
  }
  const strongTokens = product.relevanceTokens
    .filter((t) => !isWeakProductRelevanceToken(t) && !/^\d{4,}$/.test(t) && t.length >= 2)
    .slice(0, 3);
  for (const token of strongTokens) {
    if (!productKeywords.includes(token)) productKeywords.push(token);
  }

  const out: string[] = [];
  const pushQuery = (value: string) => {
    const cleaned = value.replace(/\s+/g, " ").trim();
    if (!cleaned || cleaned.length < 2 || out.includes(cleaned)) return;
    out.push(cleaned);
  };

  for (const keyword of productKeywords.slice(0, 3)) {
    pushQuery(`${koreanAlias} ${keyword}`);
  }

  if (product.hsCode.length >= 6) {
    pushQuery(`${koreanAlias} ${product.hsCode.slice(0, 6)}`);
  }

  pushQuery(koreanAlias);
  for (const term of EXPORT_ENVIRONMENT_QUERY_TERMS) {
    pushQuery(`${koreanAlias} ${term}`);
  }

  return out.slice(0, 4);
}

async function fetchKotraNewsByQuery(
  query: string,
  key: string,
  numOfRows: number,
  searchParam: "search1" | "search2",
): Promise<KotraNewsResult> {
  const url = new URL(KOTRA_MARKET_NEWS_ENDPOINT);
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("_type", "json");
  url.searchParams.set("numOfRows", String(numOfRows));
  url.searchParams.set("pageNo", "1");
  url.searchParams.set(searchParam, query);
  url.searchParams.set("search8", "Y");

  const result = await fetchTextWithTimeout(url.toString(), undefined, KOTRA_FETCH_TIMEOUT_MS);
  if (!result.ok) return { ok: false, status: result.status, message: result.message, query, items: [] };

  const text = result.text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, status: result.status, message: "Invalid JSON response", query, items: [] };
  }

  const root = asRecord(parsed).response;
  const responseRoot = asRecord(root);
  const header = asRecord(responseRoot.header);
  const resultCode = asText(header.resultCode);
  const resultMsg = asText(header.resultMsg);
  if (resultCode && resultCode !== "00") {
    return {
      ok: false,
      status: result.status,
      message: `${resultCode}${resultMsg ? ` ${resultMsg}` : ""}`,
      query,
      items: [],
    };
  }

  const body = asRecord(responseRoot.body);
  const itemList = asRecord(body.itemList);
  const items = asArray(itemList.item).map(normalizeNewsItem).filter((item) => item.newsTitl || item.bbstxSn);
  return { ok: true, status: result.status, message: resultMsg || "NO ERROR", query, items };
}

async function scoreCountriesWithAi(
  analyses: CandidateCountryAnalysis[],
  product: ProductContext,
): Promise<AiScoringResult> {
  const hasAiKey = Boolean(Deno.env.get("LOVABLE_API_KEY") || Deno.env.get("GEMINI_API_KEY"));
  if (!hasAiKey) {
    return {
      ok: false,
      message: "LOVABLE_API_KEY or GEMINI_API_KEY missing",
      byCode: new Map<string, AiCountryScore>(),
    };
  }

  const payload = analyses.map((analysis) => ({
    country_code: analysis.country.code,
    country_name: analysis.countryName,
    candidate_signals: analysis.signals.map(signalLabel),
    cert_match_count: analysis.stats.certMatches,
    regulation_match_count: analysis.stats.regulationMatches,
    news_match_count: analysis.stats.newsMatches,
    api_market_score: analysis.apiMarketScore,
    direct_payment_score: analysis.paymentEvidenceScore,
    ksure_country_grade_level: mapKsureCountryGradeLevel(analysis.ksureCountryGrade.item),
    ksure_industry_risk_level: mapKsureIndustryRiskEvidenceLevel(analysis.ksureIndustryRisk.items[0] ?? null),
    ksure_payment_risk_level: mapKsurePaymentEvidenceLevel(analysis.ksurePayment.item, analysis.ksurePayment.scope),
    ksure_payment_scope: analysis.ksurePayment.scope,
    direct_safety_score: analysis.safetyEvidenceScore,
    target_market_matched: analysis.signals.includes("target_market_note"),
    country_info_summary: pickString(analysis.countryInfo.item ?? {}, [
      "ecnmyTrendCntnt",
      "ecnmyPrsptCntnt",
      "mainInditArcv",
      "poltcCntnt",
    ]),
    top_news_titles: analysis.productNewsItems.slice(0, 3).map((item) => item.newsTitl).filter(Boolean),
  }));

  const systemPrompt = [
    "You are a trade-market evaluator.",
    "Return strict JSON only.",
    "Do not force rank by user memo.",
    "The memo country is only an inclusion signal, not a ranking override.",
    "Use API evidence and product context for scoring.",
    "Schema:",
    '{"countries":[{"country_code":"ISO2","market_fit":0,"cert_score":0,"regulation_score":0,"payment_score":0,"safety_score":0,"recommendation_reason":"...","low_recommendation_reason":"..."}]}',
    "Bounds:",
    "market_fit 0-30, cert_score 0-20, regulation_score 0-20, payment_score 0-20, safety_score 0-10.",
    "Reasons must be complete Korean sentences.",
    "Use 1-2 Korean sentences and 80-180 Korean characters per reason.",
    "Do not use ellipses, trailing fragments, or unfinished clauses.",
    "If evidence is insufficient, say 확실한 정보 없음 and still finish the sentence.",
  ].join(" ");

  const userPrompt = [
    `Product name: ${product.name}`,
    `Product description: ${product.description}`,
    `HS code: ${product.hsCode || "N/A"}`,
    `Target market memo: ${product.targetMarketNote || "N/A"}`,
    `Target markets: ${product.targetMarkets.map((market) => `${market.name}(${market.code})`).join(", ") || "None"}`,
    `Countries: ${JSON.stringify(payload)}`,
  ].join("\n");

  try {
    const aiText = await callAiJson(systemPrompt, userPrompt);
    const parsed = JSON.parse(aiText) as { countries?: unknown[] };
    const byCode = new Map<string, AiCountryScore>();

    for (const row of parsed.countries ?? []) {
      const record = asRecord(row);
      const code = asText(record.country_code).toUpperCase();
      if (!code) continue;
      const recommendationReason = asText(record.recommendation_reason);
      if (!recommendationReason) continue;
      byCode.set(code, {
        country_code: code,
        market_fit: clampInt(asNumber(record.market_fit), 0, 30),
        cert_score: clampInt(asNumber(record.cert_score), 0, 20),
        regulation_score: clampInt(asNumber(record.regulation_score), 0, 20),
        payment_score: clampInt(asNumber(record.payment_score), 0, 20),
        safety_score: clampInt(asNumber(record.safety_score), 0, 10),
        recommendation_reason: recommendationReason,
        low_recommendation_reason: asText(record.low_recommendation_reason),
      });
    }

    if (byCode.size === 0) {
      return { ok: false, message: "AI response did not include country scores", byCode };
    }

    return { ok: true, message: "ok", byCode };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "AI scoring failed",
      byCode: new Map<string, AiCountryScore>(),
    };
  }
}

async function callAiJson(systemPrompt: string, userPrompt: string): Promise<string> {
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  if (lovableApiKey) {
    const response = await fetchWithTimeout(GATEWAY_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    }, AI_FETCH_TIMEOUT_MS);

    if (!response.ok) throw new Error(`AI ${response.status}`);
    const data = await response.json();
    return asText(data.choices?.[0]?.message?.content) || "{}";
  }

  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiApiKey) throw new Error("LOVABLE_API_KEY or GEMINI_API_KEY missing");

  const geminiModel = Deno.env.get("GEMINI_MODEL") ?? "gemini-3-flash-preview";
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${geminiApiKey}`;

  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  }, AI_FETCH_TIMEOUT_MS);

  if (!response.ok) throw new Error(`Gemini ${response.status}`);
  const data = await response.json();
  return asText(data.candidates?.[0]?.content?.parts?.[0]?.text) || "{}";
}

function applyComplianceScoreAdjustment(total: number, scores: ScoreParts): number {
  if (scores.cert === 0 && scores.regulation === 0) {
    return Math.max(0, Math.min(total - 20, 55));
  }
  if (scores.cert === 0 || scores.regulation === 0) {
    return Math.max(0, Math.min(total - 8, 75));
  }
  return total;
}

function buildRequiredAiScoringMessage(reason: string, missingCountryCodes: string[]): string {
  const missingText = missingCountryCodes.length > 0
    ? ` 미생성 국가: ${missingCountryCodes.join(", ")}.`
    : "";
  const reasonText = reason ? ` 원인: ${reason}.` : "";
  return `AI 후보국 추천 해석이 완료되지 않아 3단계 화면을 열 수 없습니다.${missingText}${reasonText}`;
}

function buildApiRecommendationReasonV2(analysis: CandidateCountryAnalysis): string {
  const signals = analysis.signals.map(signalLabel).join(", ");
  const productEvidenceCount = analysis.productNewsItems.length;
  const backgroundCount = analysis.backgroundNews.length;
  const exportEvidence = analysis.exportRegionEvidence
    ? `수출물량 근거 Rank ${analysis.exportRegionEvidence.rank}` +
      (analysis.exportRegionEvidence.exportShare == null ? "" : `, 점유율 ${analysis.exportRegionEvidence.exportShare}%`) +
      (analysis.exportRegionEvidence.hsMatched ? ", HS 매칭" : ", 전체 항목")
    : "수출물량 근거 없음";
  const payment = analysis.paymentEvidenceScore == null
    ? "K-SURE 결제/국가위험 점수 없음"
    : `K-SURE 결제/국가위험 ${analysis.paymentEvidenceScore}/20`;
  const safety = analysis.safetyEvidenceScore == null
    ? "Safety/안전 점수 없음"
    : `Safety/안전 ${analysis.safetyEvidenceScore}/10`;
  return `후보 신호: ${signals}. 시장성 점수 ${analysis.apiMarketScore}/30. ${exportEvidence}. 직접 근거 ${productEvidenceCount}건, 국가 일반 배경 ${backgroundCount}건. ${payment}. ${safety}.`;
}

function buildApiRecommendationReason(analysis: CandidateCountryAnalysis): string {
  const signals = analysis.signals.map(signalLabel).join(", ");
  const productEvidenceCount = analysis.productNewsItems.length;
  const backgroundCount = analysis.backgroundNews.length;
  const exportEvidence = analysis.exportRegionEvidence
    ? `수출물량 근거 Rank ${analysis.exportRegionEvidence.rank}` +
      (analysis.exportRegionEvidence.exportShare == null ? "" : `, 점유율 ${analysis.exportRegionEvidence.exportShare}%`) +
      (analysis.exportRegionEvidence.hsMatched ? ", HS 매칭" : ", 전체 항목")
    : "수출물량 근거 없음";
  const payment = analysis.paymentEvidenceScore == null
    ? "K-SURE 결제/국가위험 점수 없음"
    : `K-SURE 결제/국가위험 ${analysis.paymentEvidenceScore}/20`;
  const safety = analysis.safetyEvidenceScore == null
    ? "Safety/안전 점수 없음"
    : `Safety/안전 ${analysis.safetyEvidenceScore}/10`;
  return `후보 신호: ${signals}. 시장성 점수 ${analysis.apiMarketScore}/30. 직접 근거 ${productEvidenceCount}건, 국가 일반 배경 ${backgroundCount}건. ${payment}. ${safety}.`;
}

function buildLowRecommendationReason(total: number, analysis: CandidateCountryAnalysis, scores: ScoreParts): string {
  if (scores.cert === 0 && scores.regulation === 0) {
    return "인증/수입규제 근거 점수가 0점이라 총점 상한을 적용했습니다.";
  }
  if (scores.cert === 0 || scores.regulation === 0) {
    return "인증 또는 수입규제 근거가 부족하여 리스크 가중치가 적용되었습니다.";
  }
  if (total >= 60) return "";
  if (!analysis.countryInfo.ok) return "국가 프로필 API 근거가 제한적이므로 추가 확인이 필요합니다.";
  if (analysis.stats.regulationMatches > analysis.stats.certMatches) {
    return "시장 준비 신호보다 수입규제 신호가 더 강하게 감지되었습니다.";
  }
  return "현재 API 신호 기준 총점이 기준치보다 낮습니다.";
}

function buildSummary(
  countryName: string,
  recommendationReason: string,
  analysis: CandidateCountryAnalysis,
): string {
  const trend = pickString(analysis.countryInfo.item ?? {}, ["ecnmyTrendCntnt", "ecnmyPrsptCntnt", "mainInditArcv"]);
  const trendPart = trend ? truncate(cleanText(trend), 120) : "No country trend summary";
  const productNewsTop = analysis.productNewsItems[0]?.newsTitl;
  const newsPart = productNewsTop ? `직접 근거: ${productNewsTop}` : "직접 근거 없음(확실한 정보 없음)";
  return truncate(`${countryName}: ${trendPart} | ${newsPart} | ${recommendationReason}`, 500);
}

function buildDeferredRecommendationSources(analysis: CandidateCountryAnalysis): Array<Record<string, unknown>> {
  const sources: Array<Record<string, unknown>> = [
    {
      type: "market_profile",
      title: `${analysis.countryName} country and market profile`,
      url: KOTRA_COUNTRY_INFO_PAGE,
      country: analysis.countryName,
      status: analysis.countryInfo.ok ? "success" : "partial",
      message: analysis.countryInfo.message,
    },
    {
      type: "detail_deferred",
      title: "Country-level news and K-SURE detail deferred to Step 4",
      url: "",
      country: analysis.countryName,
      score_relevant: false,
      summary: "Run country-detail from the country detail screen to collect detailed evidence.",
    },
  ];

  if (analysis.exportRegionEvidence) {
    const evidence = analysis.exportRegionEvidence;
    sources.push({
      type: "export_region_rank",
      title: `Export region rank ${evidence.rank}`,
      url: KOTRA_EXPORT_REGION_RANK_DATASET_PAGE,
      country: analysis.countryName,
      summary: evidence.hsMatched ? `HS matched ${evidence.hsCodeNormalized}` : "All-product rank",
      score_relevant: true,
    });
  }

  if (analysis.certItems.length > 0) {
    sources.push({
      type: "cert_data",
      title: `Certification candidate signals ${analysis.certItems.length}`,
      url: KOTRA_CERT_PAGE,
      country: analysis.countryName,
      score_relevant: true,
    });
  }

  if (analysis.regulationItems.length > 0) {
    sources.push({
      type: "regulation_data",
      title: `Import regulation candidate signals ${analysis.regulationItems.length}`,
      url: KOTRA_IMPORT_REG_PAGE,
      country: analysis.countryName,
      score_relevant: true,
    });
  }

  for (const office of analysis.tradeOfficeActions.slice(0, 2)) {
    sources.push({
      type: "trade_office_action",
      title: `Trade office contact: ${office.officeName}`,
      url: KOTRA_TRADE_OFFICE_DATASET_PAGE,
      country: analysis.countryName,
      summary: office.summary || buildTradeOfficeActionSummary(office),
      office_name: office.officeName,
      office_address: office.officeAddress,
      airport_route_text: office.airportRouteText,
      summary_source: office.summarySource ?? "rule",
      score_relevant: false,
    });
  }

  sources.push({
    type: "trade_security_hsk",
    title: `Strategic item ${analysis.strategicEvidence.matchType}`,
    url: "https://www.yestrade.go.kr/",
    country: analysis.countryName,
    score_relevant: analysis.safetyEvidenceScore != null,
  });

  sources.push({
    type: "safetykorea",
    title:
      `SafetyKorea cert ${analysis.safetyEvidence.certCount}, recall ${analysis.safetyEvidence.domesticRecallCount + analysis.safetyEvidence.foreignRecallCount}`,
    url: SAFETYKOREA_OPENAPI_PAGE,
    country: analysis.countryName,
    score_relevant: analysis.safetyEvidenceScore != null,
  });

  return dedupeByKey(sources, (source) =>
    [
      asText(source.type),
      asText(source.title),
      asText(source.country),
      asText(source.url),
    ].join("|"));
}

// ?? News recency & category classification ??????????????????????????????

type NewsEvidenceCandidate = {
  type: "product_evidence" | "country_background";
  item: KotraNewsItem;
  publishedAt: string | null;
  relevance: ReturnType<typeof assessNewsRelevance>;
  recencyTier: NewsRecencyTier;
  newsCategory: NewsCategory;
  selectionReason: string;
  impactSummary: string;
};

function extractPersistentNewsEvidenceSources(rationale: unknown): Array<Record<string, unknown>> {
  return dedupeSourceRecords(
    asArray(asRecord(rationale).sources)
      .map(asRecord)
      .filter(isPersistentNewsEvidenceSource),
  );
}

function mergePersistentNewsEvidenceSources(
  sources: Array<Record<string, unknown>>,
  persistentNewsSources: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  if (persistentNewsSources.length === 0) return sources;
  return dedupeSourceRecords([...sources, ...persistentNewsSources]);
}

function isPersistentNewsEvidenceSource(source: Record<string, unknown>): boolean {
  const type = asText(source.type).toLowerCase();
  if (type !== "product_evidence" && type !== "country_background" && type !== "news") return false;
  return Boolean(
    asText(source.url) ||
      asText(source.published_at) ||
      asText(source.publishedAt) ||
      asText(source.summary),
  );
}

function dedupeSourceRecords(sources: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return dedupeByKey(sources, (source) =>
    [
      asText(source.type).toLowerCase(),
      asText(source.title).toLowerCase(),
      asText(source.country).toLowerCase(),
      asText(source.published_at) || asText(source.publishedAt),
      asText(source.url),
    ].join("|"));
}

function buildEvidenceSources(analysis: CandidateCountryAnalysis, product?: ProductContext): Array<Record<string, unknown>> {
  const sources: Array<Record<string, unknown>> = [
    {
      type: "market_profile",
      title: `${analysis.countryName} country and market profile`,
      url: KOTRA_COUNTRY_INFO_PAGE,
      country: analysis.countryName,
      status: analysis.countryInfo.ok ? "success" : "partial",
      message: analysis.countryInfo.message,
    },
  ];

  if (analysis.exportRegionEvidence) {
    const evidence = analysis.exportRegionEvidence;
    const hsLabel = evidence.hsMatched
    ? `HS 매칭(${evidence.hsCodeNormalized || "N/A"})`
    : "전체 항목";
    const shareText = evidence.exportShare == null ? "N/A" : `${evidence.exportShare}%`;
    const yearText = evidence.referenceYear == null ? "N/A" : String(evidence.referenceYear);
    sources.push({
      type: "export_region_rank",
      title: `수출 지표 순위 Rank ${evidence.rank} / 점유율 ${shareText} (${yearText})`,
      url: KOTRA_EXPORT_REGION_RANK_DATASET_PAGE,
      country: analysis.countryName,
      summary: `물량 근거: ${hsLabel}`,
      score_relevant: true,
    });
  }

  if (analysis.certItems.length > 0) {
    sources.push({
      type: "cert_data",
      title: `Certification matches ${analysis.certItems.length}`,
      url: KOTRA_CERT_PAGE,
      country: analysis.countryName,
    });
  }
  if (analysis.regulationItems.length > 0) {
    sources.push({
      type: "regulation_data",
      title: `Import regulation matches ${analysis.regulationItems.length}`,
      url: KOTRA_IMPORT_REG_PAGE,
      country: analysis.countryName,
    });
  }

  for (const office of analysis.tradeOfficeActions.slice(0, 2)) {
    sources.push({
      type: "trade_office_action",
      title: `무역관 연락: ${office.officeName}`,
      url: KOTRA_TRADE_OFFICE_DATASET_PAGE,
      country: analysis.countryName,
      summary: office.summary || buildTradeOfficeActionSummary(office),
      office_name: office.officeName,
      office_address: office.officeAddress,
      airport_route_text: office.airportRouteText,
      summary_source: office.summarySource ?? "rule",
      score_relevant: false,
    });
  }

  sources.push({
    type: "ksure_country_grade",
    title: `K-SURE country grade ${analysis.ksureCountryGrade.item?.evalGrd || "N/A"}`,
    url: KSURE_COUNTRY_GRADE_PAGE,
    country: analysis.countryName,
    score_relevant: analysis.paymentEvidenceScore != null,
  });
  sources.push({
    type: "ksure_industry_risk",
    title: `K-SURE industry risk ${analysis.ksureIndustryRisk.items[0]?.riskIdx ?? "N/A"}`,
    url: KSURE_INDUSTRY_RISK_PAGE,
    country: analysis.countryName,
    score_relevant: analysis.paymentEvidenceScore != null,
  });
  sources.push({
    type: "ksure_payment",
    title: `K-SURE export payment ${analysis.ksurePayment.scope || "N/A"}`,
    url: KSURE_EXPORT_PAYMENT_PAGE,
    country: analysis.countryName,
    score_relevant: analysis.paymentEvidenceScore != null,
  });
  sources.push({
    type: "trade_security_hsk",
    title: `Strategic item ${analysis.strategicEvidence.matchType}`,
    url: "https://www.yestrade.go.kr/",
    country: analysis.countryName,
    score_relevant: analysis.safetyEvidenceScore != null,
  });
  sources.push({
    type: "safetykorea",
    title:
      `SafetyKorea cert ${analysis.safetyEvidence.certCount}, recall ${analysis.safetyEvidence.domesticRecallCount + analysis.safetyEvidence.foreignRecallCount}`,
    url: SAFETYKOREA_OPENAPI_PAGE,
    country: analysis.countryName,
    score_relevant: analysis.safetyEvidenceScore != null,
  });

  const productEvidence = dedupeNewsItems(analysis.productNewsItems);
  const backgroundEvidence = dedupeNewsItems(analysis.backgroundNews);
  const productName = product?.name ?? "";
  const newsCandidates: NewsEvidenceCandidate[] = [];

  for (const item of productEvidence) {
    const publishedAt = normalizePublishedDate(item.othbcDt);
    const relevanceText = buildNewsRelevanceText({
      title: item.newsTitl,
      summary: item.cntntSumar,
      keywords: item.kwrd,
      body: item.newsBdt,
    });
    const relevance = assessNewsRelevance({
      text: relevanceText,
      tokens: product?.relevanceTokens ?? [],
      hsCode: product?.hsCode,
      productName,
    });
    const recencyTier = classifyNewsRecency(item.othbcDt);
    const category = classifyNewsCategory({
      title: item.newsTitl,
      summary: item.cntntSumar,
      keywords: item.kwrd,
      recencyTier,
      isProductDirect: true,
      relevance,
    });
    const selectionReason = buildNewsSelectionReason(recencyTier, category, relevance, relevanceText);
    const impactSummary = buildExportImpactSummary({
      title: item.newsTitl,
      summary: item.cntntSumar,
      productName,
      category,
    });
    const type: "product_evidence" | "country_background" = category === "product_direct"
      ? "product_evidence"
      : "country_background";
    newsCandidates.push({
      type,
      item,
      publishedAt,
      relevance,
      recencyTier,
      newsCategory: category,
      selectionReason,
      impactSummary,
    });
  }

  for (const item of backgroundEvidence) {
    const publishedAt = normalizePublishedDate(item.othbcDt);
    const relevanceText = buildNewsRelevanceText({
      title: item.newsTitl,
      summary: item.cntntSumar,
      keywords: item.kwrd,
      body: item.newsBdt,
    });
    const relevance = assessNewsRelevance({
      text: relevanceText,
      tokens: product?.relevanceTokens ?? [],
      hsCode: product?.hsCode,
      productName,
    });
    const recencyTier = classifyNewsRecency(item.othbcDt);
    const category = classifyNewsCategory({
      title: item.newsTitl,
      summary: item.cntntSumar,
      keywords: item.kwrd,
      recencyTier,
      isProductDirect: relevance.isDirectEvidence,
      relevance,
    });
    const selectionReason = buildNewsSelectionReason(recencyTier, category, relevance, relevanceText);
    const impactSummary = buildExportImpactSummary({
      title: item.newsTitl,
      summary: item.cntntSumar,
      productName,
      category,
    });
    newsCandidates.push({
      type: category === "product_direct" ? "product_evidence" : "country_background",
      item,
      publishedAt,
      relevance,
      recencyTier,
      newsCategory: category,
      selectionReason,
      impactSummary,
    });
  }

  const selectedNews = selectNewsEvidence({
    items: newsCandidates,
    perCategoryLimit: 3,
  });

  const selectedEvidence = [
    ...selectedNews.productDirect,
    ...selectedNews.geopoliticalRisk,
    ...selectedNews.industryTrend,
    ...selectedNews.archiveReference,
  ];

  for (const candidate of selectedEvidence) {
    const item = candidate.item;
    const scoreRelevant = candidate.newsCategory === "product_direct" && candidate.recencyTier !== "archive";
    sources.push({
      type: candidate.type,
    title: item.newsTitl || "국가 일반 배경",
      url: toPublicNewsUrl(item.kotraNewsUrl, item.bbstxSn),
      country: analysis.countryName,
      published_at: candidate.publishedAt,
      summary: buildEvidenceSummary(item),
      keywords: parseKeywords(item.kwrd),
      score_relevant: scoreRelevant,
      news_category: candidate.newsCategory,
      recency_tier: candidate.recencyTier,
      selection_reason: candidate.selectionReason,
      impact_summary: candidate.impactSummary || undefined,
    });
  }

  return dedupeByKey(sources, (source) =>
    [
      asText(source.type),
      asText(source.title),
      asText(source.country),
      asText(source.published_at),
      asText(source.url),
    ].join("|"));
}

async function summarizeTradeOfficeActionsWithAi(
  analyses: CandidateCountryAnalysis[],
  adminSupa: ReturnType<typeof createClient> | null,
): Promise<CandidateCountryAnalysis[]> {
  const entries: Array<{
    id: string;
    countryCode: string;
    countryName: string;
    sourceHash: string;
    office: TradeOfficeActionItem;
  }> = [];

  for (const analysis of analyses) {
    analysis.tradeOfficeActions.slice(0, 2).forEach((office, index) => {
      entries.push({
        id: `${analysis.country.code}:${index}`,
        countryCode: analysis.country.code,
        countryName: analysis.countryName,
        sourceHash: buildTradeOfficeSourceHash(office),
        office,
      });
    });
  }

  if (entries.length === 0) return analyses;

  const fallbackById = new Map(entries.map((entry) => [entry.id, buildTradeOfficeActionSummary(entry.office)]));
  const summaryById = new Map<string, { summary: string; summarySource: "ai" | "rule" }>();

  const cachedById = await readTradeOfficeSummaryCache(adminSupa, entries);
  for (const [id, cached] of cachedById) summaryById.set(id, cached);

  const uncachedEntries = entries.filter((entry) => !summaryById.has(entry.id));
  if (uncachedEntries.length > 0 && (Deno.env.get("LOVABLE_API_KEY") || Deno.env.get("GEMINI_API_KEY"))) {
    const aiRows: Array<{
      entry: (typeof entries)[number];
      summary: string;
    }> = [];
    try {
      const raw = await callAiJson(
        "You summarize KOTRA trade office source CSV fields exactly as supplied. Use only supplied facts. Return JSON only.",
        JSON.stringify({
          instruction:
            "For each office, produce three to five Korean sentences under 800 Korean characters total. Keep every displayed summary sentence complete. Summarize address/location, airport names, access routes, travel times, fees, transfer/drop-off points, and visit scheduling notes when present. Do not include phone numbers, fax numbers, homepage URLs, or email addresses. Do not include raw CSV labels or unprovided facts. If a field is missing, omit it instead of guessing.",
          offices: uncachedEntries.map((entry) => ({
            id: entry.id,
            country_code: entry.countryCode,
            country_name: entry.countryName,
            office_name: entry.office.officeName,
            office_address: entry.office.officeAddress,
            airport_route_text: entry.office.airportRouteText,
            raw: entry.office.raw,
          })),
        }),
      );
      const parsed = JSON.parse(raw);
      for (const item of asArray(asRecord(parsed).summaries)) {
        const row = asRecord(item);
        const id = asText(row.id);
        const summary = normalizeAiTradeOfficeSummary(asText(row.summary));
        const entry = uncachedEntries.find((candidate) => candidate.id === id);
        if (entry && summary) {
          summaryById.set(id, { summary, summarySource: "ai" });
          aiRows.push({ entry, summary });
        }
      }
      await writeTradeOfficeSummaryCache(adminSupa, aiRows);
    } catch {
      for (const row of aiRows) summaryById.delete(row.entry.id);
    }
  }

  return analyses.map((analysis) => ({
    ...analysis,
    tradeOfficeActions: analysis.tradeOfficeActions.map((office, index) => {
      const id = `${analysis.country.code}:${index}`;
      const storedSummary = summaryById.get(id);
      if (storedSummary) {
        return {
          ...office,
          summary: storedSummary.summary,
          summarySource: storedSummary.summarySource,
        };
      }
      return {
        ...office,
        summary: fallbackById.get(id) || buildTradeOfficeActionSummary(office),
        summarySource: "rule",
      };
    }),
  }));
}

async function readTradeOfficeSummaryCache(
  supa: ReturnType<typeof createClient> | null,
  entries: Array<{ id: string; sourceHash: string; office: TradeOfficeActionItem }>,
): Promise<Map<string, { summary: string; summarySource: "ai" | "rule" }>> {
  const out = new Map<string, { summary: string; summarySource: "ai" | "rule" }>();
  if (!supa || entries.length === 0) return out;

  const sourceHashes = [...new Set(entries.map((entry) => entry.sourceHash).filter(Boolean))];
  const { data, error } = await supa
    .from("kotra_csv_trade_office_summary_cache")
    .select("country_name_normalized,office_name,source_hash,summary_ko,summary_source")
    .in("source_hash", sourceHashes);
  if (error || !Array.isArray(data)) return out;

  const entryByCacheKey = new Map(entries.map((entry) => [tradeOfficeSummaryCacheKey(entry.office, entry.sourceHash), entry]));
  for (const row of data) {
    const raw = asRecord(row);
    const key = [
      asText(raw.country_name_normalized),
      asText(raw.office_name),
      asText(raw.source_hash),
    ].join("|");
    const entry = entryByCacheKey.get(key);
    const summary = normalizeAiTradeOfficeSummary(asText(raw.summary_ko));
    const source = asText(raw.summary_source) === "rule" ? "rule" : "ai";
    if (entry && summary) out.set(entry.id, { summary, summarySource: source });
  }
  return out;
}

async function writeTradeOfficeSummaryCache(
  supa: ReturnType<typeof createClient> | null,
  rows: Array<{ entry: { sourceHash: string; office: TradeOfficeActionItem }; summary: string }>,
): Promise<void> {
  if (!supa || rows.length === 0) return;
  await supa
    .from("kotra_csv_trade_office_summary_cache")
    .upsert(
      rows.map(({ entry, summary }) => ({
        country_name_normalized: entry.office.countryNameNormalized,
        office_name: entry.office.officeName,
        source_hash: entry.sourceHash,
        summary_ko: summary,
        summary_source: "ai",
        model: resolveAiModelLabel(),
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "country_name_normalized,office_name,source_hash" },
    );
}

function tradeOfficeSummaryCacheKey(office: TradeOfficeActionItem, sourceHash: string): string {
  return [office.countryNameNormalized, office.officeName, sourceHash].join("|");
}

function buildTradeOfficeSourceHash(office: TradeOfficeActionItem): string {
  const source = JSON.stringify({
    country_name_normalized: office.countryNameNormalized,
    office_name: office.officeName,
    office_address: office.officeAddress,
    airport_route_text: office.airportRouteText,
  });
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function resolveAiModelLabel(): string {
  if (Deno.env.get("LOVABLE_API_KEY")) return "lovable:google/gemini-2.5-flash";
  if (Deno.env.get("GEMINI_API_KEY")) return `gemini:${Deno.env.get("GEMINI_MODEL") ?? "gemini-3-flash-preview"}`;
  return "";
}

function normalizeAiTradeOfficeSummary(value: string): string {
  const text = cleanTradeOfficeContactFields(value)
    .replace(/^Trade office contact\s*:\s*/i, "")
    .replace(/^무역관\s*연락\s*:\s*/i, "")
    .replace(/^현지\s*지원\s*:\s*/i, "")
    .trim();
  if (!text) return "";
  return limitTradeOfficeTextBySentence(text, 820);
}

function buildTradeOfficeActionSummary(office: TradeOfficeActionItem): string {
  const officeName = cleanText(office.officeName) || "무역관";
  const address = extractTradeOfficeAddress(office, officeName);
  const airportSentence = buildTradeOfficeAirportSentence(office.airportRouteText, {
    preferOriginal: office.airportRouteText.length > 120,
  });
  return limitTradeOfficeTextBySentence(composeTradeOfficeRuleSummary({
    officeName,
    address: address ? stripTradeOfficeTrailingPunctuation(address) : "",
    airportSentence,
  }), 820);
}

function composeTradeOfficeRuleSummary({
  officeName,
  address,
  airportSentence,
}: {
  officeName: string;
  address: string;
  airportSentence: string;
}): string {
  const sentences: string[] = [];
  const route = cleanText(airportSentence);
  if (address) sentences.push(`${officeName}은 ${address}에 있습니다.`);
  if (route && route !== "공항 이동 정보 없음.") {
    sentences.push(address ? route : addTradeOfficeContextToRouteSentence(officeName, route));
  } else if (address) {
    sentences.push("공항 이동 정보 없음.");
  }
  return sentences.join(" ") || `${officeName} 방문 안내 정보 없음.`;
}

function addTradeOfficeContextToRouteSentence(officeName: string, sentence: string): string {
  const text = sentence.trim();
  if (text.startsWith("공항 이동 안내:")) return `${officeName} ${text}`;
  if (text.startsWith("공항 접근") || text.startsWith("이동수단")) return `${officeName}의 ${text}`;
  return `${officeName} ${text}`;
}

function extractTradeOfficeAddress(office: TradeOfficeActionItem, officeName: string): string {
  const addressText = cleanText(office.officeAddress);
  const candidates = [
    extractTradeOfficeLabel(addressText, ["무역관주소", "주소", "위치"]),
    addressText,
  ];
    for (const candidate of candidates) {
      let text = cleanText(candidate)
        .replace(/^Trade office contact\s*:\s*/i, "")
        .replace(new RegExp(`^(?:${escapeTradeOfficeRegex(officeName)}\\s*[:：-]\\s*)+`, "i"), "")
        .replace(/^(?:ㅇ\s*)?(?:무역관명|무역관주소|주소|위치)\s*[:：-]\s*/i, "")
      .replace(/\s+(?:ㅇ\s*)?(?:전화번호|전화|FAX|팩스|이메일|홈페이지|웹사이트|URL)\s*[:：].*$/i, "")
        .replace(/\s*(?:공항\s*접근|공항무역관이동|공항\s*무역관\s*이동)\s*[:：].*$/i, "")
        .replace(/\s*에\s+(?:있습니다|위치합니다)$/i, "")
        .trim();
      if (/위치\s*정보\s*없음|위치정보\s*없음/i.test(text)) text = "";
      if (text) return text;
    }
  return "";
}

function buildTradeOfficeAirportSentence(value: string, options: { preferOriginal?: boolean } = {}): string {
  const text = cleanText(value);
  if (!text) return "공항 이동 정보 없음.";
  if (options.preferOriginal) {
    const fallback = buildTradeOfficeRouteFallbackSentence(text);
    if (fallback) return fallback;
  }
  const distance = normalizeTradeOfficeMeasure(
    text.match(/(?:약\s*)?\d+(?:\.\d+)?\s*(?:마일|킬로미터|km)/i)?.[0] ?? "",
  );
  const duration = normalizeTradeOfficeMeasure(
    text.match(/(?:약|대략)?\s*\d+\s*시간(?:\s*\d+\s*분)?|(?:약|대략)?\s*\d+\s*분(?:\s*내외)?/)?.[0] ?? "",
  );
  const airportName = extractTradeOfficeAirportName(text);
  const modes = extractTradeOfficeTransportModes(text);
  const priceHints = extractTradeOfficePriceHints(text);
  const hasLaxIt = /LAX-it/i.test(text);
  const hasVisitNotice = /방문\s*전|방문\s*일정|사전에\s*협의|일정.*협의|협의.*일정/.test(text);
  if (!airportName && !distance && !duration && modes.length === 0 && priceHints.length === 0 && !hasLaxIt && !hasVisitNotice) {
    return "공항 이동 정보 없음.";
  }
  const sentences: string[] = [];
  const facts = [distance ? `${distance} 거리` : "", duration ? `${duration} 소요` : ""].filter(Boolean);
  if (facts.length > 0) {
    sentences.push(
      airportName
        ? `공항 접근은 ${airportName} 기준으로 ${facts.join(", ")}입니다.`
        : `공항 접근은 ${facts.join(", ")} 기준입니다.`,
    );
  } else if (airportName) {
    sentences.push(`공항 접근 기준 공항은 ${airportName}입니다.`);
  }
  const transport = buildTradeOfficeTransportSentence(modes, priceHints, hasLaxIt);
  if (transport) sentences.push(transport);
  if (hasVisitNotice) sentences.push("방문 전 일정 확인이 권장됩니다.");
  return sentences.join(" ") || "공항 이동 정보 없음.";
}

function buildTradeOfficeRouteFallbackSentence(value: string): string {
  const text = stripTradeOfficeTrailingPunctuation(cleanTradeOfficeRouteText(value));
  if (!text) return "";
  const routeText = stripTradeOfficeTrailingPunctuation(limitTradeOfficeTextBySentence(text, 320));
  return `공항 이동 안내: ${routeText}.`;
}

function cleanTradeOfficeRouteText(value: string): string {
  return cleanTradeOfficeContactFields(value)
    .replace(/방문\s*전\s*(?:이메일|유선|전화)[^.。]*(?:협의|권장)[^.。]*(?:[.。]|$)/g, "방문 전 일정 확인이 권장됩니다.")
    .replace(/^(?:ㅇ\s*)?(?:공항무역관이동|공항\s*무역관\s*이동|공항\s*접근)\s*[:：]\s*/i, "")
    .replace(/\s*ㅇ\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTradeOfficeContactFields(value: string): string {
  return cleanText(value)
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\bwww\.\S+/gi, "")
    .replace(/\s*(?:전화번호|전화|FAX|팩스|이메일|홈페이지|웹사이트|URL)\s*[:：]\s*[^.。]*(?:[.。]|$)/gi, " ")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTradeOfficeMeasure(value: string): string {
  const text = stripTradeOfficeTrailingPunctuation(cleanText(value));
  if (!text) return "";
  return /^(약|대략)\s*/.test(text) ? text : `약 ${text}`;
}

function extractTradeOfficeAirportName(value: string): string {
  const patterns = [
    /(?:나리타|하네다|成田|羽田)\s*(?:국제)?공항/i,
    /\b(?:JFK|LAX)\s*(?:국제)?공항/i,
    /(?:LA|로스앤젤레스|베이징|광저우|푸동|푸둥|홍차오|수완나품|창이|히드로|샤를드골)\s*(?:국제)?공항/i,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern)?.[0];
    if (match) return cleanText(match);
  }
  return "";
}

function stripTradeOfficeTrailingPunctuation(value: string): string {
  return value.replace(/[.。]+$/g, "").trim();
}

function extractTradeOfficeTransportModes(value: string): string[] {
  const modes: string[] = [];
  const add = (mode: string) => {
    if (!modes.includes(mode)) modes.push(mode);
  };
  if (/택시|Yellow Cab|콜택시/i.test(value)) add("택시");
  if (/Uber|Lyft|라이드셰어/i.test(value)) add("Uber/Lyft");
  if (/셔틀버스|Express Bus/i.test(value)) add("공항 셔틀");
  if (/Air\s*Train|AirTrain|지하철|Metro/i.test(value)) add("AirTrain/지하철");
  if (/렌트카|렌터카|프리웨이|405번|10번/.test(value)) add("렌터카");
  if (/공항버스|버스/.test(value) && !modes.includes("공항 셔틀")) add("버스");
  return modes.slice(0, 4);
}

function buildTradeOfficeTransportSentence(modes: string[], priceHints: string[], hasLaxIt: boolean): string {
  if (modes.length === 0 && priceHints.length === 0 && !hasLaxIt) return "";
  let sentence = modes.length > 0 ? `이동수단은 ${modes.join(", ")}` : "비용 단서가 있습니다";
  const details: string[] = [];
  if (priceHints.length > 0) details.push(`비용 단서는 ${priceHints.join(", ")}입니다`);
  if (hasLaxIt) details.push("LAX-it 이동 안내가 있습니다");
  if (details.length === 0) return `${sentence}입니다.`;
  if (modes.length === 0) return `${details.join(", ")}.`;
  sentence += `이며 ${details.join(", ")}.`;
  return sentence;
}

function extractTradeOfficePriceHints(value: string): string[] {
  const out: string[] = [];
  const add = (price: string) => {
    const normalized = price.replace(/\$\s+/g, "$").replace(/\s+/g, " ").trim();
    if (normalized && !out.includes(normalized)) out.push(normalized);
  };
  for (const match of value.matchAll(/\$\s*\d+(?:\.\d+)?\+?/g)) {
    add(match[0]);
  }
  for (const match of value.matchAll(/\d+(?:\.\d+)?\s*~\s*\d+(?:\.\d+)?\s*달러|\d+(?:\.\d+)?\s*달러/g)) {
    add(match[0]);
  }
  return out.slice(0, 3);
}

function extractTradeOfficeLabel(value: string, labels: string[]): string {
  for (const label of labels) {
    const match = new RegExp(`(?:^|\\s)(?:ㅇ\\s*)?${escapeTradeOfficeRegex(label)}\\s*[:：]\\s*`, "i").exec(value);
    if (!match || match.index == null) continue;
    const start = match.index + match[0].length;
    const rest = value.slice(start);
    const next = rest.search(
      /\s+ㅇ\s+|\s+(?:무역관명|무역관주소|공항무역관이동|공항\s*무역관\s*이동|공항\s*접근|주소|위치|전화번호|전화|FAX|팩스|이메일|홈페이지|웹사이트|URL|이동수단)\s*[:：]/i,
    );
    return (next >= 0 ? rest.slice(0, next) : rest).replace(/^[\s:：-]+/, "").replace(/\s+/g, " ").trim();
  }
  return "";
}

function escapeTradeOfficeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeCertItem(value: unknown): KotraCertItem {
  const row = asRecord(value);
  return {
    nttSj: asText(row.nttSj),
    systName: asText(row.systName),
    applyTgtCmdltCn: asText(row.applyTgtCmdltCn),
    expansApplyCmdltCn: asText(row.expansApplyCmdltCn),
    cmdltDfnCn: asText(row.cmdltDfnCn),
    hscd: asText(row.hscd),
    nat: asText(row.nat),
    regn: asText(row.regn),
    ovrofInfo: asText(row.ovrofInfo),
    othbcDt: asText(row.othbcDt),
  };
}

function normalizeNewsItem(value: unknown): KotraNewsItem {
  const row = asRecord(value);
  return {
    newsTitl: asText(row.newsTitl),
    kotraNewsUrl: asText(row.kotraNewsUrl),
    cntntSumar: asText(row.cntntSumar),
    kwrd: asText(row.kwrd),
    newsBdt: asText(row.newsBdt),
    othbcDt: asText(row.othbcDt),
    natn: asText(row.natn),
    regn: asText(row.regn),
    bbstxSn: asText(row.bbstxSn),
  };
}

function bumpCountryStats(
  statsByCountry: Map<string, CountrySignalStats>,
  countryCode: string,
  key: keyof CountrySignalStats,
) {
  const code = countryCode.toUpperCase();
  const current = statsByCountry.get(code) ?? { certMatches: 0, regulationMatches: 0, newsMatches: 0 };
  current[key] += 1;
  statsByCountry.set(code, current);
}

function pushCountryItem<T>(bucket: Map<string, T[]>, countryCode: string, item: T) {
  const code = countryCode.toUpperCase();
  const list = bucket.get(code) ?? [];
  list.push(item);
  bucket.set(code, list);
}

function extractCountryCodeFromIso(value: string): string[] {
  const code = asText(value).toUpperCase();
  if (!code || code.length !== 2) return [];
  if (!COUNTRY_NAME_BY_CODE[code]) return [];
  return [code];
}

function dedupeNewsItems(items: KotraNewsItem[]): KotraNewsItem[] {
  return dedupeByKey(items, (item) => [item.bbstxSn, item.newsTitl, item.othbcDt].join("|"));
}

function newsKey(item: KotraNewsItem) {
  return [item.bbstxSn, item.newsTitl, item.othbcDt].join("|");
}

function extractNewsMetadataCountryCodes(item: KotraNewsItem): string[] {
  const metadataCodes = detectCountryCodesFromText([item.natn, item.regn].join(" "));
  return dedupeStrings(metadataCodes);
}

function isMetadataCountryMatchedNewsItem(item: KotraNewsItem, countryCode: string): boolean {
  const normalizedCountryCode = countryCode.toUpperCase();
  const metadataCodes = extractNewsMetadataCountryCodes(item);
  return metadataCodes.includes(normalizedCountryCode);
}

function normalizePublishedDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{8}$/.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  return "";
}

function toPublicNewsUrl(rawUrl: string, articleId: string): string {
  if (rawUrl && /^https?:\/\//i.test(rawUrl) && !rawUrl.includes("apis.data.go.kr/")) return rawUrl;
  if (!articleId) return "";
  const page = new URL(KOTRA_NEWS_ARTICLE_PATH);
  page.searchParams.set("dataIdx", articleId);
  return page.toString();
}

function dedupeByKey<T>(items: T[], keyFn: (item: T) => string): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function dedupeStrings(items: string[]): string[] {
  return [...new Set(items.map((item) => item.toUpperCase().trim()).filter(Boolean))];
}

function pickString(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = asText(obj[key]);
    if (value) return value;
  }
  return "";
}

function cleanText(value: string): string {
  return decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, " "));
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

function buildEvidenceSummary(item: KotraNewsItem): string {
  const text = cleanText(item.cntntSumar || stripHtml(item.newsBdt));
  if (!text) return "";
  return truncate(text, 240);
}

function parseKeywords(value: string): string[] {
  const parts = value
    .split(/[,\n/|]+/g)
    .map((token) => cleanText(token))
    .filter(Boolean);
  return [...new Set(parts)].slice(0, 12);
}

function limitTradeOfficeTextBySentence(value: string, maxLength: number): string {
  const text = cleanText(value);
  if (!text || text.length <= maxLength) return text;

  const candidate = text.slice(0, maxLength);
  const boundary = findTradeOfficeSentenceBoundary(candidate);
  return boundary >= 0 ? candidate.slice(0, boundary + 1).trim() : text;
}

function findTradeOfficeSentenceBoundary(value: string): number {
  const matches = [...value.matchAll(/[.。!?]/g)];
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const boundary = matches[index].index ?? -1;
    if (boundary < 0) continue;

    const previous = value.charAt(boundary - 1);
    if (!/[가-힣]/.test(previous)) continue;

    const next = value.slice(boundary + 1).trimStart().charAt(0);
    if (/^\d$/.test(next)) continue;
    return boundary;
  }
  return -1;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
}

function asText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return Number.NaN;
}

function asFiniteNumber(value: unknown): number | null {
  const n = asNumber(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeIndustryCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

