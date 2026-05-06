// Public data API registry
import {
  KOTRA_PUBLIC_SOURCE_URLS,
  KSURE_PUBLIC_SOURCE_URLS,
  SAFETYKOREA_PUBLIC_SOURCE_URL,
  TRADE_SECURITY_PUBLIC_SOURCE_URL,
} from "@/lib/source-url";

export interface ApiSpec {
  key: string;
  name: string;
  org: string;
  purpose: string;
  endpoint: string;
  sourceUrl?: string;
  secret: string; // env var name
  license: string;
}

export const API_REGISTRY: ApiSpec[] = [
  {
    key: "kicox_factory_production",
    name: "KICOX_Factory Production Info",
    org: "KICOX",
    purpose: "Factory registration and production information lookup",
    endpoint: "https://www.data.go.kr/data/15087611/openapi.do",
    secret: "KICOX_API_KEY",
    license: "Public Data Portal",
  },
  {
    key: "kotra_country_info",
    name: "KOTRA_Country Info",
    org: "KOTRA",
    purpose: "Country-level market baseline information",
    endpoint: "https://apis.data.go.kr/B410001/kotra_nationalInformation/natnInfo/natnInfo",
    sourceUrl: KOTRA_PUBLIC_SOURCE_URLS.countryInfo,
    secret: "KOTRA_API_KEY",
    license: "KOTRA",
  },
  {
    key: "kotra_market_news",
    name: "KOTRA_Overseas Market News",
    org: "KOTRA",
    purpose: "Collect overseas market news and trend signals",
    endpoint: "https://apis.data.go.kr/B410001/kotra_overseasMarketNews/ovseaMrktNews/ovseaMrktNews",
    sourceUrl: KOTRA_PUBLIC_SOURCE_URLS.marketNews,
    secret: "KOTRA_API_KEY",
    license: "KOTRA",
  },
  {
    key: "kotra_overseas_certification",
    name: "KOTRA_Overseas Certification Info",
    org: "KOTRA",
    purpose: "Check overseas certification requirements",
    endpoint: "https://apis.data.go.kr/B410001/overseasAuthInfo/getOverseasAuthInfo",
    sourceUrl: KOTRA_PUBLIC_SOURCE_URLS.overseasCertification,
    secret: "KOTRA_API_KEY",
    license: "KOTRA",
  },
  {
    key: "kotra_import_regulation",
    name: "KOTRA_Import Regulation Info",
    org: "KOTRA",
    purpose: "Review import regulations and non-tariff barriers",
    endpoint: "https://apis.data.go.kr/B410001/DS00000128/getDS00000128",
    sourceUrl: KOTRA_PUBLIC_SOURCE_URLS.importRegulation,
    secret: "KOTRA_API_KEY",
    license: "KOTRA",
  },
  {
    key: "ksure_country_risk",
    name: "K-SURE_Country Risk Grade",
    org: "K-SURE",
    purpose: "Check country credit/risk grade",
    endpoint: "https://apis.data.go.kr/B552696/countrygrade/credit-grade",
    sourceUrl: KSURE_PUBLIC_SOURCE_URLS.countryGrade,
    secret: "KSURE_API_KEY",
    license: "K-SURE",
  },
  {
    key: "ksure_industry_risk",
    name: "K-SURE_Industry Risk Index",
    org: "K-SURE",
    purpose: "Check industry-level risk index",
    endpoint: "https://apis.data.go.kr/B552696/ksight/riskindex",
    sourceUrl: KSURE_PUBLIC_SOURCE_URLS.industryRiskIndex,
    secret: "KSURE_API_KEY",
    license: "K-SURE",
  },
  {
    key: "ksure_export_payment",
    name: "K-SURE_Export Payment Info",
    org: "K-SURE",
    purpose: "Reference export payment terms and delay history",
    endpoint: "https://apis.data.go.kr/B552696/exportPayment/getPaymentInfo",
    sourceUrl: KSURE_PUBLIC_SOURCE_URLS.exportPayment,
    secret: "KSURE_API_KEY",
    license: "K-SURE",
  },
  {
    key: "trade_security_hsk_strategic",
    name: "Trade Security Institute_HSK Strategic Item Info",
    org: "Trade Security Institute",
    purpose: "Check strategic item status by HSK code",
    endpoint: TRADE_SECURITY_PUBLIC_SOURCE_URL,
    sourceUrl: TRADE_SECURITY_PUBLIC_SOURCE_URL,
    secret: "STRATEGIC_API_KEY",
    license: "Trade Security Institute",
  },
  {
    key: "safetykorea_recall",
    name: "KATS_SafetyKorea_Recall",
    org: "KATS",
    purpose: "Check product recall status",
    endpoint: "http://www.safetykorea.kr/openapi/api/recall/recallList.json",
    sourceUrl: SAFETYKOREA_PUBLIC_SOURCE_URL,
    secret: "SAFETYKOREA_API_KEY",
    license: "KATS",
  },
  {
    key: "customs_nitemtrade",
    name: "관세청_품목별 국가별 수출입실적(GW)",
    org: "관세청",
    purpose: "국가별 수출입 무역 통계 조회 및 점수 부스트 반영",
    endpoint: "http://apis.data.go.kr/1220000/nitemtrade/getNitemtradeList",
    sourceUrl: "https://www.data.go.kr/tcs/dss/selectApiDataDetailView.do?publicDataPk=15096822",
    secret: "PUBLIC_DATA_API_KEY",
    license: "관세청",
  },
];
