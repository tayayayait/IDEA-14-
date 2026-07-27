import { z } from "npm:zod@3.25.76";
import { buildUsitcClassificationGuidance } from "./usitc-classification-guidance.ts";

export type EvidenceStatus =
  | "confirmed"
  | "estimated"
  | "needs_verification"
  | "not_run"
  | "unavailable";

export type DecisionCategory =
  | "tariff_fta"
  | "certification"
  | "import_regulation"
  | "customs_requirement"
  | "customs_documents"
  | "payment_risk"
  | "cost"
  | "market"
  | "sanctions"
  | "strategic_goods";

export type DecisionScope = "hsk10" | "hs6" | "product_name" | "country";
export type DecisionSeverity = "info" | "caution" | "blocker";
export type ProviderState = "success" | "empty" | "error" | "not_run";

export type DecisionFactInput = {
  factKey: string;
  category: DecisionCategory;
  status: EvidenceStatus;
  severity: DecisionSeverity;
  summary: string;
  value: unknown;
  scope: DecisionScope;
  sourceName: string;
  sourceUrl: string | null;
  referenceDate: string | null;
  caveat: string | null;
  nextAction: string | null;
  fetchedAt: string;
  expiresAt: string | null;
};

export type ProviderStatus = {
  key: string;
  label: string;
  state: ProviderState;
  itemCount: number;
  message: string;
  fetchedAt: string;
};

export type DecisionProviderResult = {
  status: ProviderStatus;
  facts: DecisionFactInput[];
};

export type CountryDecisionContext = {
  countryCode: string;
  countryName: string;
  productName: string;
  hs6: string;
  hsk10: string;
};

const CUSTOMS_CONFIRM_ENDPOINT =
  "https://apis.data.go.kr/1220000/retrieveCcctLworCd/getRetrieveCcctLworCd";
const CUSTOMS_CONFIRM_PAGE = "https://www.data.go.kr/data/15101589/openapi.do";
const COMTRADE_ENDPOINT = "https://comtradeapi.un.org/data/v1/get/C/A/HS";
const COMTRADE_PAGE = "https://comtradeplus.un.org/";
const WITS_TARIFF_ENDPOINT =
  "https://wits.worldbank.org/API/V1/SDMX/V21/datasource/TRN";
const WITS_TARIFF_PAGE = "https://wits.worldbank.org/witsapiintro.aspx?lang=en";
const WORLD_BANK_LPI_ENDPOINT = "https://api.worldbank.org/v2/country";
const WORLD_BANK_LPI_PAGE = "https://data.worldbank.org/indicator/LP.LPI.OVRL.XQ";
const USITC_HTS_ENDPOINT = "https://hts.usitc.gov/reststop/search";
const USITC_HTS_PAGE = "https://hts.usitc.gov/";
const KOREA_EXIM_ENDPOINT = "https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON";
const KOREA_EXIM_PAGE = "https://www.koreaexim.go.kr/ir/HPHKIR019M01";
const KOSTI_HSK_DATA_PAGE = "https://www.data.go.kr/data/15034135/fileData.do";
const KOSTI_HSK_ENDPOINT =
  "https://api.odcloud.kr/api/15034135/v1/uddi:80b756b5-9d5f-4369-8a38-ad5ac43534e5";
const SEA_EXPORT_COST_PAGE = "https://www.data.go.kr/data/15116850/fileData.do";
const SEA_EXPORT_COST_ENDPOINT =
  "https://api.odcloud.kr/api/15116850/v1/uddi:f0096eca-d283-4771-9b3f-8ea73697bf0f";
const EXTERNAL_TIMEOUT_MS = 10_000;

const iso2ToM49: Record<string, string> = {
  AE: "784",
  BR: "076",
  CN: "156",
  DE: "276",
  ID: "360",
  IN: "356",
  JP: "392",
  MX: "484",
  MY: "458",
  PL: "616",
  TH: "764",
  TR: "792",
  // UN Comtrade uses its legacy area code for the United States.
  US: "842",
  VN: "704",
};

const iso2ToWitsReporter: Record<string, string> = {
  ...iso2ToM49,
  US: "840",
};

const countryCurrency: Record<string, string> = {
  AE: "AED",
  BR: "BRL",
  CN: "CNH",
  DE: "EUR",
  ID: "IDR(100)",
  IN: "INR",
  JP: "JPY(100)",
  MX: "MXN",
  MY: "MYR",
  PL: "PLN",
  TH: "THB",
  TR: "TRY",
  US: "USD",
  VN: "VND(100)",
};

const seaExportRoutesByCountry: Record<string, string[]> = {
  CN: ["중국"],
  DE: ["유럽연합"],
  JP: ["일본"],
  PL: ["유럽연합"],
  US: ["미국서부", "미국동부"],
  VN: ["베트남"],
};

const customsItemSchema = z.object({
  aplyStrtDt: z.string().default(""),
  bfhnAffcRtmTpcd: z.string().default(""),
  dcerCfrmLworCd: z.string().default(""),
  dcerCfrmLworNm: z.string().default(""),
  hsSgn: z.string().default(""),
  reqApreIttCd: z.string().default(""),
  reqApreIttNm: z.string().default(""),
  reqCfrmIstmNm: z.string().default(""),
});

const comtradeRowSchema = z.object({
  period: z.coerce.string(),
  reporterCode: z.coerce.number().optional(),
  partnerCode: z.coerce.number().optional(),
  cmdCode: z.coerce.string().optional(),
  primaryValue: z.coerce.number().finite().nonnegative().default(0),
  netWgt: z.coerce.number().finite().nullable().optional(),
  isReported: z.boolean().nullable().optional(),
  isAggregate: z.boolean().nullable().optional(),
}).passthrough();

const comtradeResponseSchema = z.object({
  data: z.array(comtradeRowSchema).default([]),
  error: z.unknown().optional(),
}).passthrough();

const witsCodeValueSchema = z.object({
  id: z.coerce.string(),
  name: z.coerce.string().optional(),
}).passthrough();

const witsObservationSchema = z.array(z.union([
  z.number(),
  z.string(),
  z.null(),
]));

const witsResponseSchema = z.object({
  dataSets: z.array(z.object({
    series: z.record(z.object({
      observations: z.record(witsObservationSchema),
    }).passthrough()),
  }).passthrough()).default([]),
  structure: z.object({
    dimensions: z.object({
      observation: z.array(z.object({
        id: z.string(),
        values: z.array(witsCodeValueSchema).default([]),
      }).passthrough()).default([]),
    }).passthrough(),
    attributes: z.object({
      observation: z.array(z.object({
        id: z.string(),
        values: z.array(witsCodeValueSchema).default([]),
      }).passthrough()).default([]),
    }).passthrough(),
  }).passthrough(),
}).passthrough();

const exchangeRowSchema = z.object({
  result: z.coerce.number().optional(),
  cur_unit: z.string(),
  cur_nm: z.string().default(""),
  ttb: z.string().default(""),
  tts: z.string().default(""),
  deal_bas_r: z.string().default(""),
  bkpr: z.string().default(""),
  yy_efee_r: z.string().default(""),
  ten_dd_efee_r: z.string().default(""),
  kftc_bkpr: z.string().default(""),
  kftc_deal_bas_r: z.string().default(""),
});

const odcloudResponseSchema = z.object({
  currentCount: z.coerce.number().int().nonnegative().optional(),
  matchCount: z.coerce.number().int().nonnegative().optional(),
  totalCount: z.coerce.number().int().nonnegative().optional(),
  data: z.array(z.record(z.unknown())).default([]),
}).passthrough();

const WORLD_BANK_LPI_INDICATORS = {
  overall: "LP.LPI.OVRL.XQ",
  customs: "LP.LPI.CUST.XQ",
  infrastructure: "LP.LPI.INFR.XQ",
  internationalShipments: "LP.LPI.ITRN.XQ",
} as const;

export async function fetchCustomsHeadConfirmation(
  context: CountryDecisionContext,
  apiKey: string,
): Promise<DecisionProviderResult> {
  const fetchedAt = new Date().toISOString();
  if (!/^\d{10}$/.test(context.hsk10)) {
    return providerResult("customs_confirmation", "관세청 세관장확인", "not_run", 0,
      "HSK10이 없어 조회하지 않았습니다.", fetchedAt, []);
  }
  if (!apiKey) {
    return providerResult("customs_confirmation", "관세청 세관장확인", "error", 0,
      "공공데이터포털 인증키가 설정되지 않았습니다.", fetchedAt, []);
  }

  try {
    const url = new URL(CUSTOMS_CONFIRM_ENDPOINT);
    url.searchParams.set("serviceKey", apiKey);
    url.searchParams.set("hsSgn", context.hsk10);
    url.searchParams.set("imexTpcd", "1");
    const response = await fetchWithRetry(url.toString());
    if (!response.ok) {
      return providerResult("customs_confirmation", "관세청 세관장확인", "error", 0,
        `HTTP ${response.status}`, fetchedAt, []);
    }

    const xml = await response.text();
    const resultCode = tagValue(xml, "resultCode");
    const resultMsg = tagValue(xml, "resultMsg");
    if (resultCode && resultCode !== "00") {
      return providerResult("customs_confirmation", "관세청 세관장확인", "error", 0,
        `${resultCode} ${resultMsg}`.trim(), fetchedAt, []);
    }

    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
      .map((match) => ({
        aplyStrtDt: tagValue(match[1], "aplyStrtDt"),
        bfhnAffcRtmTpcd: tagValue(match[1], "bfhnAffcRtmTpcd"),
        dcerCfrmLworCd: tagValue(match[1], "dcerCfrmLworCd"),
        dcerCfrmLworNm: tagValue(match[1], "dcerCfrmLworNm"),
        hsSgn: tagValue(match[1], "hsSgn"),
        reqApreIttCd: tagValue(match[1], "reqApreIttCd"),
        reqApreIttNm: tagValue(match[1], "reqApreIttNm"),
        reqCfrmIstmNm: tagValue(match[1], "reqCfrmIstmNm"),
      }))
      .flatMap((item) => {
        const parsed = customsItemSchema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      });

    if (items.length === 0) {
      const fact = factInput({
        factKey: "customs_confirmation:no_direct_match",
        category: "customs_requirement",
        status: "needs_verification",
        severity: "caution",
        summary: "HSK10 기준 세관장확인대상 직접 일치 결과가 없습니다.",
        value: { hsk10: context.hsk10, resultCount: 0, importExportType: "수출" },
        scope: "hsk10",
        sourceName: "관세청 세관장확인대상물품",
        sourceUrl: CUSTOMS_CONFIRM_PAGE,
        referenceDate: null,
        caveat: "0건은 수출 관련 법령·인증 요건이 없다는 의미가 아닙니다.",
        nextAction: "제품 용도와 기술사양을 기준으로 관세사 또는 관계기관에 최종 확인하세요.",
        fetchedAt,
        expiresAt: plusHours(fetchedAt, 24),
      });
      return providerResult("customs_confirmation", "관세청 세관장확인", "empty", 0,
        resultMsg || "직접 일치 결과 0건", fetchedAt, [fact]);
    }

    const facts = items.map((item, index) => factInput({
      factKey: `customs_confirmation:${item.dcerCfrmLworCd || index}:${item.reqApreIttCd || index}`,
      category: "customs_requirement",
      status: "confirmed",
      severity: "caution",
      summary: `${item.dcerCfrmLworNm || "관련 법령"} — ${item.reqApreIttNm || "요건승인기관"} 확인 필요`,
      value: {
        hsk10: item.hsSgn || context.hsk10,
        lawCode: item.dcerCfrmLworCd,
        lawName: item.dcerCfrmLworNm,
        agencyCode: item.reqApreIttCd,
        agencyName: item.reqApreIttNm,
        requiredItem: item.reqCfrmIstmNm,
        applicationStartDate: item.aplyStrtDt,
        approvalTimingCode: item.bfhnAffcRtmTpcd,
        approvalTiming: approvalTimingLabel(item.bfhnAffcRtmTpcd),
      },
      scope: "hsk10",
      sourceName: "관세청 세관장확인대상물품",
      sourceUrl: CUSTOMS_CONFIRM_PAGE,
      referenceDate: item.aplyStrtDt || null,
      caveat: "조회 결과는 법령별 확인 대상이며 실제 승인·허가 필요 여부는 물품의 세부 사양에 따라 달라질 수 있습니다.",
      nextAction: `${item.reqApreIttNm || "요건승인기관"}에 ${item.reqCfrmIstmNm || "구비요건"}을 확인하세요.`,
      fetchedAt,
      expiresAt: plusHours(fetchedAt, 24),
    }));
    return providerResult("customs_confirmation", "관세청 세관장확인", "success", facts.length,
      resultMsg || "정상 조회", fetchedAt, facts);
  } catch (error) {
    return providerResult("customs_confirmation", "관세청 세관장확인", "error", 0,
      safeErrorMessage(error), fetchedAt, []);
  }
}

export async function fetchUnComtradeMarket(
  context: CountryDecisionContext,
  apiKey: string,
): Promise<DecisionProviderResult> {
  const fetchedAt = new Date().toISOString();
  const reporterCode = iso2ToM49[context.countryCode];
  if (!/^\d{6}$/.test(context.hs6) || !reporterCode) {
    return providerResult("un_comtrade", "UN Comtrade", "not_run", 0,
      "지원 국가코드 또는 HS6이 없어 조회하지 않았습니다.", fetchedAt, []);
  }
  if (!apiKey) {
    return providerResult("un_comtrade", "UN Comtrade", "error", 0,
      "UN Comtrade API 키가 설정되지 않았습니다.", fetchedAt, []);
  }

  try {
    const currentYear = new Date().getUTCFullYear();
    for (let offset = 1; offset <= 3; offset += 1) {
      const period = String(currentYear - offset);
      const worldRows = await fetchComtradeRows({
        reporterCode,
        partnerCode: "0",
        period,
        hs6: context.hs6,
        apiKey,
      });
      // Free subscriptions are throttled to roughly one request per second.
      await delay(1_100);
      const koreaRows = await fetchComtradeRows({
        reporterCode,
        partnerCode: "410",
        period,
        hs6: context.hs6,
        apiKey,
      });
      const worldValue = sumPrimaryValue(worldRows);
      const koreaValue = sumPrimaryValue(koreaRows);
      if (worldRows.length === 0 && koreaRows.length === 0) continue;

      const share = worldValue > 0 ? (koreaValue / worldValue) * 100 : null;
      const fact = factInput({
        factKey: "market:un_comtrade",
        category: "market",
        status: worldValue > 0 ? "confirmed" : "estimated",
        severity: "info",
        summary: worldValue > 0
          ? `${period}년 ${context.countryName}의 HS ${context.hs6} 수입시장과 한국산 실적을 확인했습니다.`
          : `${period}년 한국산 HS ${context.hs6} 수입실적은 확인했지만 전체 시장값은 확인이 필요합니다.`,
        value: {
          period,
          hs6: context.hs6,
          reporterCode,
          importMarketUsd: worldValue,
          importsFromKoreaUsd: koreaValue,
          koreaSharePct: share,
          netWeightKgFromKorea: sumNetWeight(koreaRows),
          isReported: koreaRows.some((row) => row.isReported === true),
          isAggregate: koreaRows.some((row) => row.isAggregate === true),
        },
        scope: "hs6",
        sourceName: "UN Comtrade",
        sourceUrl: COMTRADE_PAGE,
        referenceDate: period,
        caveat: "HS6 연간 무역통계이며 최신 연도·신고 여부·추정 중량을 함께 확인해야 합니다.",
        nextAction: "경쟁국 구성과 연도별 추이는 UN Comtrade 원문에서 추가 확인하세요.",
        fetchedAt,
        expiresAt: plusHours(fetchedAt, 24 * 30),
      });
      return providerResult("un_comtrade", "UN Comtrade", "success", worldRows.length + koreaRows.length,
        `${period}년 통계 조회`, fetchedAt, [fact]);
    }

    return providerResult("un_comtrade", "UN Comtrade", "empty", 0,
      "최근 3개년 HS6 직접 일치 통계가 없습니다.", fetchedAt, [
        factInput({
          factKey: "market:un_comtrade_empty",
          category: "market",
          status: "needs_verification",
          severity: "caution",
          summary: "최근 3개년 HS6 직접 일치 무역통계가 확인되지 않았습니다.",
          value: { hs6: context.hs6, reporterCode, checkedYears: 3 },
          scope: "hs6",
          sourceName: "UN Comtrade",
          sourceUrl: COMTRADE_PAGE,
          referenceDate: null,
          caveat: "0건은 시장 수요가 없다는 의미가 아니며 품목 분류연도 차이일 수 있습니다.",
          nextAction: "목적국 세부 품목코드와 HS 개정연도를 확인하세요.",
          fetchedAt,
          expiresAt: plusHours(fetchedAt, 24 * 30),
        }),
      ]);
  } catch (error) {
    return providerResult("un_comtrade", "UN Comtrade", "error", 0,
      safeErrorMessage(error), fetchedAt, []);
  }
}

export async function fetchWitsTariff(
  context: CountryDecisionContext,
): Promise<DecisionProviderResult> {
  const fetchedAt = new Date().toISOString();
  const reporterCode = iso2ToWitsReporter[context.countryCode];
  if (!reporterCode || !/^\d{6}$/.test(context.hs6)) {
    return providerResult("wits_tariff", "WITS 관세", "not_run", 0,
      "지원 국가코드 또는 HS6이 없어 조회하지 않았습니다.", fetchedAt, []);
  }

  try {
    const url =
      WITS_TARIFF_ENDPOINT +
      "/reporter/" + reporterCode +
      "/partner/000/product/" + context.hs6 +
      "/year/all/datatype/reported?format=JSON";
    const response = await fetchWithRetry(url, {}, 35_000);
    if (!response.ok) {
      return providerResult("wits_tariff", "WITS 관세", "error", 0,
        "HTTP " + response.status, fetchedAt, []);
    }
    const responseBody = witsResponseSchema.safeParse(await response.json());
    if (!responseBody.success) {
      return providerResult("wits_tariff", "World Bank WITS", "error", 0,
        "WITS SDMX response validation failed.", fetchedAt, []);
    }
    const candidates = extractWitsSdmxTariffRows(responseBody.data);
    const parsed = z.array(z.object({
      year: z.string(),
      tariffType: z.string(),
      simpleAverage: z.number().finite().nullable(),
      minRate: z.number().finite().nullable(),
      maxRate: z.number().finite().nullable(),
      nomenclature: z.string(),
    })).safeParse(candidates);
    if (!parsed.success) {
      return providerResult("wits_tariff", "WITS 관세", "error", 0,
        "WITS 응답 형식이 올바르지 않습니다.", fetchedAt, []);
    }
    const rows = parsed.data
      .filter((row) => row.simpleAverage != null || row.minRate != null || row.maxRate != null)
      .sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
    if (rows.length === 0) {
      return providerResult("wits_tariff", "WITS 관세", "empty", 0,
        "HS6 직접 일치 관세 범위를 확인하지 못했습니다.", fetchedAt, [
          factInput({
            factKey: "tariff_fta:wits_empty",
            category: "tariff_fta",
            status: "needs_verification",
            severity: "caution",
            summary: "WITS에서 목적국 HS6 관세 직접 일치 결과를 확인하지 못했습니다.",
            value: { hs6: context.hs6, reporterCode },
            scope: "hs6",
            sourceName: "World Bank WITS / UNCTAD TRAINS",
            sourceUrl: WITS_TARIFF_PAGE,
            referenceDate: null,
            caveat: "0건은 무관세를 의미하지 않으며 HS 개정연도 또는 목적국 세부코드 차이일 수 있습니다.",
            nextAction: "목적국 관세 사이트에서 8·10자리 세부코드와 적용세율을 확인하세요.",
            fetchedAt,
            expiresAt: plusHours(fetchedAt, 24 * 7),
          }),
        ]);
    }

    const latestYear = rows[0].year;
    const latestRows = rows.filter((row) => row.year === latestYear);
    const minRates = latestRows.map((row) => row.minRate).filter((value): value is number => value != null);
    const maxRates = latestRows.map((row) => row.maxRate).filter((value): value is number => value != null);
    const averages = latestRows.map((row) => row.simpleAverage).filter((value): value is number => value != null);
    const minRate = minRates.length ? Math.min(...minRates) : null;
    const maxRate = maxRates.length ? Math.max(...maxRates) : null;
    const simpleAverage = averages.length
      ? averages.reduce((sum, value) => sum + value, 0) / averages.length
      : null;
    const tariffTypes = [...new Set(latestRows.map((row) => row.tariffType).filter(Boolean))];
    const fact = factInput({
      factKey: "tariff_fta:wits_hs6_range",
      category: "tariff_fta",
      status: "estimated",
      severity: "caution",
      summary:
        latestYear + "년 " + context.countryName + "의 HS " + context.hs6 +
        " 관세율 범위를 확인했습니다.",
      value: {
        hs6: context.hs6,
        reporterCode,
        tariffType: tariffTypes,
        simpleAveragePct: simpleAverage,
        minRatePct: minRate,
        maxRatePct: maxRate,
        nomenclature: latestRows[0].nomenclature || null,
        destinationTariffCode: null,
      },
      scope: "hs6",
      sourceName: "World Bank WITS / UNCTAD TRAINS",
      sourceUrl: WITS_TARIFF_PAGE,
      referenceDate: latestYear || null,
      caveat: "HS6 하위 국가 세번의 단순평균·최저·최고 범위이며 실제 MFN 또는 특혜관세 확정값이 아닙니다.",
      nextAction: "목적국 8·10자리 세부코드와 원산지결정기준을 확인하세요.",
      fetchedAt,
      expiresAt: plusHours(fetchedAt, 24 * 30),
    });
    return providerResult("wits_tariff", "WITS 관세", "success", latestRows.length,
      "HS6 관세 범위를 확인했습니다.", fetchedAt, [fact]);
  } catch (error) {
    return providerResult("wits_tariff", "WITS 관세", "error", 0,
      safeErrorMessage(error), fetchedAt, []);
  }
}

export async function fetchWorldBankLpi(
  context: CountryDecisionContext,
): Promise<DecisionProviderResult> {
  const fetchedAt = new Date().toISOString();
  if (!/^[A-Z]{2}$/.test(context.countryCode)) {
    return providerResult("world_bank_lpi", "World Bank 물류성과지수", "not_run", 0,
      "국가 코드가 없어 LPI를 조회하지 않았습니다.", fetchedAt, []);
  }

  const indicatorResults = await Promise.all(
    Object.entries(WORLD_BANK_LPI_INDICATORS).map(async ([key, indicator]) => ({
      key,
      result: await fetchWorldBankIndicator(context.countryCode, indicator),
    })),
  );
  const values = Object.fromEntries(
    indicatorResults.map(({ key, result }) => [key, result?.value ?? null]),
  ) as Record<keyof typeof WORLD_BANK_LPI_INDICATORS, number | null>;
  const firstResult = indicatorResults.find((entry) => entry.result);
  const availableCount = indicatorResults.filter((entry) => entry.result).length;

  if (!availableCount) {
    return providerResult("world_bank_lpi", "World Bank 물류성과지수", "empty", 0,
      "World Bank LPI 기준연도 데이터를 확인하지 못했습니다.", fetchedAt, []);
  }

  const year = firstResult?.result?.year ?? null;
  const fact = factInput({
    factKey: "logistics:world_bank_lpi",
    category: "cost",
    status: "confirmed",
    severity: "info",
    summary: `${year}년 World Bank 물류성과지수 ${values.overall ?? "-"}/5를 확인했습니다.`,
    value: {
      overall: values.overall,
      customs: values.customs,
      infrastructure: values.infrastructure,
      internationalShipments: values.internationalShipments,
      year,
      scale: 5,
      indicatorCount: availableCount,
    },
    scope: "country",
    sourceName: "World Bank Logistics Performance Index",
    sourceUrl: WORLD_BANK_LPI_PAGE,
    referenceDate: year,
    caveat: "국가 단위 물류환경 참고지표이며 제품별 운송비나 실제 통관 소요기간을 보장하지 않습니다.",
    nextAction: "실제 출하 전 운송사 견적과 현지 통관사의 예상 소요기간을 함께 확인하세요.",
    fetchedAt,
    expiresAt: plusHours(fetchedAt, 24 * 30),
  });

  return providerResult("world_bank_lpi", "World Bank 물류성과지수", "success", availableCount,
    `${year}년 LPI 지표 ${availableCount}개를 확인했습니다.`, fetchedAt, [fact]);
}

export async function fetchUsitcHts(
  context: CountryDecisionContext,
): Promise<DecisionProviderResult> {
  const fetchedAt = new Date().toISOString();
  if (context.countryCode !== "US") {
    return providerResult("usitc_hts", "미국 USITC HTS", "not_run", 0,
      "미국 선택 시에만 USITC HTS를 조회합니다.", fetchedAt, []);
  }
  if (!/^\d{6}$/.test(context.hs6)) {
    return providerResult("usitc_hts", "미국 USITC HTS", "not_run", 0,
      "HS6 코드가 없어 미국 HTS를 조회하지 않았습니다.", fetchedAt, []);
  }

  try {
    const url = new URL(USITC_HTS_ENDPOINT);
    url.searchParams.set("keyword", context.hs6);
    const response = await fetchWithRetry(url.toString());
    if (!response.ok) {
      return providerResult("usitc_hts", "미국 USITC HTS", "error", 0,
        `USITC HTS HTTP ${response.status}`, fetchedAt, []);
    }

    const rows = collectUsitcRows(await response.json());
    const targetHsDigits = context.hs6;
    const additionalMeasures = rows
      .filter((row) => row.htsCode.startsWith("9903"))
      .sort(compareUsitcRows);
    const matchingRows = rows
      .filter((row) => !row.htsCode.startsWith("99"))
      .filter((row) => digitsOnly(row.htsCode).startsWith(targetHsDigits));
    const selectedCandidates = hydrateUsitcCandidateRates(matchingRows, rows)
      .sort(compareUsitcRows);

    if (!selectedCandidates.length) {
      return providerResult("usitc_hts", "미국 USITC HTS", "empty", 0,
        "미국 HTS 후보를 확인하지 못했습니다.", fetchedAt, []);
    }

    const guidance = buildUsitcClassificationGuidance({
      productName: context.productName,
      hs6: context.hs6,
      candidates: selectedCandidates,
    });

    const fact = factInput({
      factKey: "tariff_fta:usitc_hts_candidates",
      category: "tariff_fta",
      status: "needs_verification",
      severity: "caution",
      summary: `미국 USITC HTS에서 ${selectedCandidates.length}개의 세번 후보와 추가 관세 조치를 확인했습니다.`,
      value: {
        hs6: context.hs6,
        candidates: selectedCandidates,
        additionalMeasures,
        specificationHint: guidance.specificationHint,
      },
      scope: "hs6",
      sourceName: "USITC Harmonized Tariff Schedule",
      sourceUrl: USITC_HTS_PAGE,
      referenceDate: new Date().getUTCFullYear().toString(),
      caveat: "한국 HSK와 미국 HTS는 1:1로 확정되지 않습니다. General/Special 세율은 제품 사양과 원산지 조건을 최종 확인해야 합니다.",
      nextAction: guidance.nextAction,
      fetchedAt,
      expiresAt: plusHours(fetchedAt, 24 * 7),
    });
    return providerResult("usitc_hts", "미국 USITC HTS", "success", selectedCandidates.length,
      `미국 HTS 후보 ${selectedCandidates.length}건을 확인했습니다.`, fetchedAt, [fact]);
  } catch (error) {
    return providerResult("usitc_hts", "미국 USITC HTS", "error", 0,
      safeErrorMessage(error), fetchedAt, []);
  }
}

export async function fetchKoreaEximExchange(
  context: CountryDecisionContext,
  apiKey: string,
): Promise<DecisionProviderResult> {
  const fetchedAt = new Date().toISOString();
  const targetCurrency = countryCurrency[context.countryCode];
  if (!targetCurrency) {
    return providerResult("korea_exim_fx", "한국수출입은행 환율", "not_run", 0,
      "목적국 통화 매핑이 없어 조회하지 않았습니다.", fetchedAt, []);
  }
  if (!apiKey) {
    return providerResult("korea_exim_fx", "한국수출입은행 환율", "error", 0,
      "한국수출입은행 인증키가 설정되지 않았습니다.", fetchedAt, []);
  }

  try {
    for (let daysAgo = 0; daysAgo < 7; daysAgo += 1) {
      const searchDate = seoulDate(daysAgo);
      const url = new URL(KOREA_EXIM_ENDPOINT);
      url.searchParams.set("authkey", apiKey);
      url.searchParams.set("searchdate", searchDate);
      url.searchParams.set("data", "AP01");
      const response = await fetchWithRetry(url.toString());
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const raw = await response.json();
      const parsed = z.array(exchangeRowSchema).safeParse(raw);
      if (!parsed.success) throw new Error("환율 API 응답 형식이 올바르지 않습니다.");
      if (parsed.data.length === 0) continue;

      const row = parsed.data.find((item) => item.cur_unit === targetCurrency);
      if (!row) continue;
      const baseRate = parseRate(row.deal_bas_r);
      const unit = targetCurrency.includes("(100)") ? 100 : 1;
      const fact = factInput({
        factKey: "cost:exchange_rate",
        category: "cost",
        status: baseRate != null ? "confirmed" : "needs_verification",
        severity: "info",
        summary: `${searchDate} 기준 ${row.cur_unit} 환율을 확인했습니다.`,
        value: {
          currencyUnit: row.cur_unit,
          currencyName: row.cur_nm,
          dealBaseRateKrw: baseRate,
          currencyAmountUnit: unit,
          krwPerCurrencyUnit: baseRate == null ? null : baseRate / unit,
          telegraphicBuyingRate: parseRate(row.ttb),
          telegraphicSellingRate: parseRate(row.tts),
          searchDate,
        },
        scope: "country",
        sourceName: "한국수출입은행 현재환율 API",
        sourceUrl: KOREA_EXIM_PAGE,
        referenceDate: searchDate,
        caveat: "고시환율 참고값이며 실제 결제환율·은행 수수료와 다를 수 있습니다.",
        nextAction: "견적 통화와 결제 예정일 기준으로 실제 적용환율을 다시 확인하세요.",
        fetchedAt,
        expiresAt: plusHours(fetchedAt, 24),
      });
      return providerResult("korea_exim_fx", "한국수출입은행 환율", "success", 1,
        `${searchDate} 영업일 환율`, fetchedAt, [fact]);
    }

    return providerResult("korea_exim_fx", "한국수출입은행 환율", "empty", 0,
      "최근 7일 이내 고시환율이 없습니다.", fetchedAt, []);
  } catch (error) {
    return providerResult("korea_exim_fx", "한국수출입은행 환율", "error", 0,
      safeErrorMessage(error), fetchedAt, []);
  }
}

export async function fetchKostiStrategicHsk(
  context: CountryDecisionContext,
  apiKey: string,
): Promise<DecisionProviderResult> {
  const fetchedAt = new Date().toISOString();
  if (!/^\d{10}$/.test(context.hsk10)) {
    return providerResult("kosti_hsk", "KOSTI HSK 연계표", "not_run", 0,
      "HSK10이 없어 조회하지 않았습니다.", fetchedAt, []);
  }
  if (!apiKey) {
    return providerResult("kosti_hsk", "KOSTI HSK 연계표", "error", 0,
      "공공데이터포털 인증키가 설정되지 않았습니다.", fetchedAt, []);
  }

  try {
    const url = new URL(KOSTI_HSK_ENDPOINT);
    url.searchParams.set("page", "1");
    url.searchParams.set("perPage", "3000");
    url.searchParams.set("serviceKey", apiKey);
    const response = await fetchWithRetry(url.toString());
    if (!response.ok) {
      const message = response.status === 401 || response.status === 403
        ? `해당 공공데이터 활용신청이 필요합니다. (HTTP ${response.status})`
        : `HTTP ${response.status}`;
      return providerResult("kosti_hsk", "KOSTI HSK 연계표", "error", 0,
        message, fetchedAt, []);
    }
    const parsed = odcloudResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      return providerResult("kosti_hsk", "KOSTI HSK 연계표", "error", 0,
        "KOSTI 응답 형식이 올바르지 않습니다.", fetchedAt, []);
    }
    const matches = parsed.data.data.filter((row) =>
      digitsOnly(recordText(row, ["HSKCD", "HSK 품목번호", "HSK품목번호", "품목번호"])) === context.hsk10
    );
    if (matches.length === 0) {
      return providerResult("kosti_hsk", "KOSTI HSK 연계표", "empty", 0,
        "HSK10 직접 일치 결과가 없습니다.", fetchedAt, [
          factInput({
            factKey: "strategic_goods:kosti_no_direct_match",
            category: "strategic_goods",
            status: "needs_verification",
            severity: "caution",
            summary: "최신 KOSTI HSK 연계표에서 직접 일치 통제번호를 확인하지 못했습니다.",
            value: { hsk10: context.hsk10, resultCount: 0, datasetRowCount: parsed.data.totalCount ?? parsed.data.data.length },
            scope: "hsk10",
            sourceName: "무역안보관리원 HSK 연계표",
            sourceUrl: KOSTI_HSK_DATA_PAGE,
            referenceDate: "2026-05-22",
            caveat: "0건은 전략물자가 아니라는 최종판정이 아닙니다.",
            nextAction: "제품 사양서를 기준으로 Yestrade 자가판정 또는 전문판정을 진행하세요.",
            fetchedAt,
            expiresAt: plusHours(fetchedAt, 24 * 30),
          }),
        ]);
    }

    const candidates = matches.map((row) => ({
      hsk10: digitsOnly(recordText(row, ["HSKCD", "HSK 품목번호", "HSK품목번호", "품목번호"])),
      koreanName: recordText(row, ["HSKNM", "품명(국문)", "품명국문"]),
      englishName: recordText(row, ["HSENM", "품명(영문)", "품명영문"]),
      controlNumber: recordText(row, ["CNTRLNO", "통제번호"]),
    }));
    return providerResult("kosti_hsk", "KOSTI HSK 연계표", "success", candidates.length,
      `HSK10 연계 후보 ${candidates.length}건`, fetchedAt, [
        factInput({
          factKey: "strategic_goods:kosti_hsk_match",
          category: "strategic_goods",
          status: "needs_verification",
          severity: "caution",
          summary: `KOSTI HSK 연계표에서 전략물자 통제번호 후보 ${candidates.length}건을 확인했습니다.`,
          value: { hsk10: context.hsk10, candidates, finalClassification: null },
          scope: "hsk10",
          sourceName: "무역안보관리원 HSK 연계표",
          sourceUrl: KOSTI_HSK_DATA_PAGE,
          referenceDate: "2026-05-22",
          caveat: "HSK 연계는 통제 가능성 후보이며 전략물자 최종판정이 아닙니다.",
          nextAction: "연계 통제번호와 제품 기술사양을 대조한 뒤 Yestrade 판정을 진행하세요.",
          fetchedAt,
          expiresAt: plusHours(fetchedAt, 24 * 30),
        }),
      ]);
  } catch (error) {
    return providerResult("kosti_hsk", "KOSTI HSK 연계표", "error", 0,
      safeErrorMessage(error), fetchedAt, []);
  }
}

export async function fetchSeaExportFreight(
  context: CountryDecisionContext,
  apiKey: string,
): Promise<DecisionProviderResult> {
  const fetchedAt = new Date().toISOString();
  const routeNames = seaExportRoutesByCountry[context.countryCode];
  if (!routeNames) {
    return providerResult("sea_export_freight", "관세청 해상수출 운송비", "not_run", 0,
      "목적국에 대응하는 공개 운송 권역이 없습니다.", fetchedAt, []);
  }
  if (!apiKey) {
    return providerResult("sea_export_freight", "관세청 해상수출 운송비", "error", 0,
      "공공데이터포털 인증키가 설정되지 않았습니다.", fetchedAt, []);
  }

  try {
    const url = new URL(SEA_EXPORT_COST_ENDPOINT);
    url.searchParams.set("page", "1");
    url.searchParams.set("perPage", "200");
    url.searchParams.set("serviceKey", apiKey);
    const response = await fetchWithRetry(url.toString());
    if (!response.ok) {
      const message = response.status === 401 || response.status === 403
        ? `해당 공공데이터 활용신청이 필요합니다. (HTTP ${response.status})`
        : `HTTP ${response.status}`;
      return providerResult("sea_export_freight", "관세청 해상수출 운송비", "error", 0,
        message, fetchedAt, []);
    }
    const parsed = odcloudResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      return providerResult("sea_export_freight", "관세청 해상수출 운송비", "error", 0,
        "운송비 응답 형식이 올바르지 않습니다.", fetchedAt, []);
    }
    const rows = parsed.data.data
      .map((row) => ({ row, period: recordText(row, ["기간", "기준연월", "PRIOD"]) }))
      .filter((entry) => /^\d{4}-\d{2}$/.test(entry.period))
      .sort((a, b) => b.period.localeCompare(a.period));
    const latest = rows.find((entry) =>
      routeNames.some((route) => recordNumber(entry.row, [route]) != null)
    );
    const routeEstimates = latest
      ? routeNames.flatMap((route) => {
          const cost = recordNumber(latest.row, [route]);
          return cost == null ? [] : [{ route, costThousandKrw: cost }];
        })
      : [];
    if (!latest || routeEstimates.length === 0) {
      return providerResult("sea_export_freight", "관세청 해상수출 운송비", "empty", 0,
        "목적 권역 운송비 직접 일치 결과가 없습니다.", fetchedAt, [
          factInput({
            factKey: "cost:sea_export_freight_empty",
            category: "cost",
            status: "needs_verification",
            severity: "info",
            summary: "목적 권역의 해상수출 운송비 참고값을 확인하지 못했습니다.",
            value: { countryCode: context.countryCode, routeNames },
            scope: "country",
            sourceName: "관세청 해상수출 운송비용",
            sourceUrl: SEA_EXPORT_COST_PAGE,
            referenceDate: null,
            caveat: "공개 통계가 없는 국가는 실제 포워더 견적이 필요합니다.",
            nextAction: "중량·부피·출발항·도착항·Incoterms를 준비해 포워더 견적을 받으세요.",
            fetchedAt,
            expiresAt: plusHours(fetchedAt, 24 * 30),
          }),
        ]);
    }

    return providerResult("sea_export_freight", "관세청 해상수출 운송비", "success", routeEstimates.length,
      `${latest.period} 권역별 운송비 확인`, fetchedAt, [
        factInput({
          factKey: "cost:sea_export_freight",
          category: "cost",
          status: "estimated",
          severity: "info",
          summary: `${latest.period} ${routeNames.join("·")} 40ft FCL 평균 해상수출 운송비 참고값입니다.`,
          value: {
            period: latest.period,
            routeEstimates,
            unit: "천원/2TEU",
            container: "40ft FCL 일반화물(GP)",
            totalLandedCost: null,
          },
          scope: "country",
          sourceName: "관세청 해상수출 운송비용",
          sourceUrl: SEA_EXPORT_COST_PAGE,
          referenceDate: latest.period,
          caveat: "CIF·CFR 수출신고 통계의 권역 평균이며 실시간 포워더 견적이나 총 landed cost가 아닙니다.",
          nextAction: "가격·수량·중량·부피·항구·Incoterms를 입력한 뒤 실제 견적을 비교하세요.",
          fetchedAt,
          expiresAt: plusHours(fetchedAt, 24 * 30),
        }),
      ]);
  } catch (error) {
    return providerResult("sea_export_freight", "관세청 해상수출 운송비", "error", 0,
      safeErrorMessage(error), fetchedAt, []);
  }
}

export function buildBaselineDecisionFacts(_context: CountryDecisionContext): DecisionFactInput[] {
  return [];
}

async function fetchWorldBankIndicator(
  countryCode: string,
  indicator: string,
): Promise<{ year: string | null; value: number } | null> {
  try {
    const url = new URL(`${WORLD_BANK_LPI_ENDPOINT}/${countryCode}/indicator/${indicator}`);
    url.searchParams.set("format", "json");
    url.searchParams.set("date", "2018:2026");
    url.searchParams.set("per_page", "10");
    url.searchParams.set("MRV", "1");
    const response = await fetchWithRetry(url.toString());
    if (!response.ok) return null;
    const raw = await response.json() as unknown;
    if (!Array.isArray(raw) || !Array.isArray(raw[1])) return null;
    const row = raw[1].find((item) => {
      if (!item || typeof item !== "object") return false;
      const value = (item as Record<string, unknown>).value;
      return value != null && Number.isFinite(Number(value));
    }) as Record<string, unknown> | undefined;
    if (!row) return null;
    const value = Number(row.value);
    const year = typeof row.date === "string" ? row.date : null;
    return Number.isFinite(value) ? { year, value } : null;
  } catch {
    return null;
  }
}

type UsitcHtsRow = {
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
};

function hydrateUsitcCandidateRates(candidateRows: UsitcHtsRow[], allRows: UsitcHtsRow[]): UsitcHtsRow[] {
  return candidateRows.map((row) => {
    if (hasUsitcRate(row)) return row;
    const rowDigits = digitsOnly(row.htsCode);
    const ancestors = allRows
      .filter((parent) => {
        const parentDigits = digitsOnly(parent.htsCode);
        return parentDigits.length < rowDigits.length && rowDigits.startsWith(parentDigits) && hasUsitcRate(parent);
      })
      .sort((left, right) => digitsOnly(left.htsCode).length - digitsOnly(right.htsCode).length);
    const inherited = ancestors[ancestors.length - 1];
    return inherited ? {
      ...row,
      generalRate: row.generalRate || inherited.generalRate,
      specialRate: row.specialRate || inherited.specialRate,
      otherRate: row.otherRate || inherited.otherRate,
      rateInheritedFrom: inherited.htsCode,
    } : row;
  });
}

function hasUsitcRate(row: UsitcHtsRow): boolean {
  return Boolean(row.generalRate || row.specialRate || row.otherRate);
}

function compareUsitcRows(left: UsitcHtsRow, right: UsitcHtsRow): number {
  const leftLevel = digitsOnly(left.htsCode).length;
  const rightLevel = digitsOnly(right.htsCode).length;
  if (leftLevel !== rightLevel) return leftLevel - rightLevel;
  return left.htsCode.localeCompare(right.htsCode, undefined, { numeric: true });
}

function collectUsitcRows(raw: unknown): UsitcHtsRow[] {
  const rows: UsitcHtsRow[] = [];
  const seenObjects = new Set<object>();
  const seenCodes = new Set<string>();

  const visit = (value: unknown, depth = 0): void => {
    if (depth > 5 || value == null) return;
    if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry, depth + 1));
      return;
    }
    if (typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (seenObjects.has(record)) return;
    seenObjects.add(record);
    const row = normalizeUsitcRow(record);
    if (row && !seenCodes.has(row.htsCode)) {
      seenCodes.add(row.htsCode);
      rows.push(row);
    }
    Object.values(record).forEach((entry) => visit(entry, depth + 1));
  };

  visit(raw);
  return rows;
}

function normalizeUsitcRow(record: Record<string, unknown>): UsitcHtsRow | null {
  const htsRaw = findUsitcField(record, /hts|tariff.?number|item.?number/i);
  if (!htsRaw) return null;
  const digits = digitsOnly(htsRaw);
  const htsCode = htsRaw.includes(".")
    ? htsRaw.replace(/\s+/g, "").replace(/-+/g, ".")
    : digits.length >= 4
      ? formatUsitcCode(digits)
      : "";
  if (!/^\d{4}\.\d{2}/.test(htsCode)) return null;
  return {
    htsCode,
    statisticalSuffix: findUsitcField(record, /statistical.?suffix|stat.?suffix/i),
    description: findUsitcField(record, /description|commodity|article/i),
    indent: parseUsitcIndent(findUsitcField(record, /^indent$/i)),
    units: findUsitcArray(record, /^units?$/i),
    footnotes: findUsitcFootnotes(record),
    generalRate: findUsitcField(record, /general|column.?1|rate.?1/i),
    specialRate: findUsitcField(record, /special/i),
    otherRate: findUsitcField(record, /other|column.?2|rate.?2/i),
    rateInheritedFrom: null,
  };
}

function findUsitcField(record: Record<string, unknown>, pattern: RegExp): string {
  const entry = Object.entries(record).find(([key, value]) => pattern.test(key) && scalarText(value));
  return entry ? scalarText(entry[1]) : "";
}

function findUsitcArray(record: Record<string, unknown>, pattern: RegExp): string[] {
  const entry = Object.entries(record).find(([key, value]) => pattern.test(key) && Array.isArray(value));
  if (!entry || !Array.isArray(entry[1])) return [];
  return entry[1].flatMap((value) => scalarText(value));
}

function findUsitcFootnotes(record: Record<string, unknown>): string[] {
  const entry = Object.entries(record).find(([key, value]) => /footnotes?/i.test(key) && Array.isArray(value));
  if (!entry || !Array.isArray(entry[1])) return [];
  return entry[1].flatMap((value) => {
    if (typeof value === "string" || typeof value === "number") return [String(value).trim()];
    if (!value || typeof value !== "object") return [];
    const footnote = value as Record<string, unknown>;
    const marker = scalarText(footnote.marker);
    const note = scalarText(footnote.value);
    const text = [marker, note].filter(Boolean).join(" ").trim();
    return text ? [text] : [];
  });
}

function parseUsitcIndent(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function scalarText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  return "";
}

function formatUsitcCode(digits: string): string {
  if (digits.length >= 10) return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}.${digits.slice(8, 10)}`;
  if (digits.length >= 8) return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`;
  if (digits.length >= 6) return `${digits.slice(0, 4)}.${digits.slice(4, 6)}`;
  return digits;
}

async function fetchComtradeRows(params: {
  reporterCode: string;
  partnerCode: string;
  period: string;
  hs6: string;
  apiKey: string;
}): Promise<Array<z.infer<typeof comtradeRowSchema>>> {
  const url = new URL(COMTRADE_ENDPOINT);
  url.searchParams.set("reporterCode", params.reporterCode);
  url.searchParams.set("period", params.period);
  url.searchParams.set("flowCode", "M");
  url.searchParams.set("partnerCode", params.partnerCode);
  url.searchParams.set("partner2Code", "0");
  url.searchParams.set("cmdCode", params.hs6);
  url.searchParams.set("breakdownMode", "classic");
  url.searchParams.set("includeDesc", "true");
  url.searchParams.set("subscription-key", params.apiKey);
  const response = await fetchWithRetry(url.toString());
  if (!response.ok) throw new Error(`UN Comtrade HTTP ${response.status}`);
  const parsed = comtradeResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("UN Comtrade 응답 형식이 올바르지 않습니다.");
  return parsed.data.data;
}

function extractWitsSdmxTariffRows(value: z.infer<typeof witsResponseSchema>) {
  const rows: Array<{
    year: string;
    tariffType: string;
    simpleAverage: number | null;
    minRate: number | null;
    maxRate: number | null;
    nomenclature: string;
  }> = [];
  const timeDimension = value.structure.dimensions.observation
    .find((dimension) => dimension.id === "TIME_PERIOD");
  const attributes = value.structure.attributes.observation;

  for (const dataSet of value.dataSets) {
    for (const series of Object.values(dataSet.series)) {
      for (const [observationIndex, observation] of Object.entries(series.observations)) {
        const year = timeDimension?.values[Number(observationIndex)]?.id ?? "";
        const attributeValue = (attributeId: string) => {
          const attributeIndex = attributes.findIndex((attribute) => attribute.id === attributeId);
          if (attributeIndex < 0) return null;
          const valueIndex = looseNumber(observation[attributeIndex + 1]);
          if (valueIndex == null) return null;
          return attributes[attributeIndex].values[valueIndex] ?? null;
        };
        const tariffTypeValue = attributeValue("TARIFFTYPE");
        const nomenclatureValue = attributeValue("NOMENCODE");
        const simpleAverage = looseNumber(observation[0]);
        const minRateValue = attributeValue("MIN_RATE");
        const maxRateValue = attributeValue("MAX_RATE");
        const minRate = looseNumber(minRateValue?.id ?? minRateValue?.name);
        const maxRate = looseNumber(maxRateValue?.id ?? maxRateValue?.name);
        if (simpleAverage == null && minRate == null && maxRate == null) continue;
        rows.push({
          year,
          tariffType: tariffTypeValue?.name ?? tariffTypeValue?.id ?? "",
          simpleAverage,
          minRate,
          maxRate,
          nomenclature: nomenclatureValue?.name ?? nomenclatureValue?.id ?? "",
        });
      }
    }
  }

  return rows;
}

function recordText(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" || typeof value === "number") {
      const text = String(value).trim();
      if (text) return text;
    }
  }
  return "";
}

function recordNumber(record: Record<string, unknown>, keys: string[]): number | null {
  const text = recordText(record, keys).replace(/,/g, "");
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function looseNumber(value: unknown): number | null {
  if (value == null) return null;
  const raw = typeof value === "string" ? value.replace(/,/g, "").trim() : value;
  if (raw === "") return null;
  const parsed = typeof value === "number"
    ? value
    : Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function looseText(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  timeoutMs = EXTERNAL_TIMEOUT_MS,
): Promise<Response> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if ((response.status === 429 || response.status >= 500) && attempt === 0) {
        await delay(250);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      break;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("외부 API 요청 실패");
}

function providerResult(
  key: string,
  label: string,
  state: ProviderState,
  itemCount: number,
  message: string,
  fetchedAt: string,
  facts: DecisionFactInput[],
): DecisionProviderResult {
  return {
    status: { key, label, state, itemCount, message: truncate(message, 300), fetchedAt },
    facts,
  };
}

function factInput(input: DecisionFactInput): DecisionFactInput {
  return input;
}

function tagValue(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return match ? decodeXml(match[1]).trim() : "";
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function approvalTimingLabel(code: string): string {
  if (code === "1") return "사후 확인";
  if (code === "2") return "사전 승인";
  if (code === "3") return "실시간 확인";
  return "기관 확인 필요";
}

function sumPrimaryValue(rows: Array<z.infer<typeof comtradeRowSchema>>): number {
  return rows.reduce((sum, row) => sum + row.primaryValue, 0);
}

function sumNetWeight(rows: Array<z.infer<typeof comtradeRowSchema>>): number | null {
  const values = rows.map((row) => row.netWgt).filter((value): value is number => typeof value === "number");
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null;
}

function parseRate(value: string): number | null {
  const parsed = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function seoulDate(daysAgo: number): string {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1_000);
  now.setUTCDate(now.getUTCDate() - daysAgo);
  return [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
  ].join("");
}

function plusHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 60 * 60 * 1_000).toISOString();
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return `외부 API가 ${EXTERNAL_TIMEOUT_MS / 1_000}초 안에 응답하지 않았습니다.`;
  }
  const raw = error instanceof Error ? error.message : String(error ?? "");
  return truncate(raw || "외부 API 요청 실패", 300);
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
