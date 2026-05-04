export const KOTRA_PUBLIC_SOURCE_URLS = {
  countryInfo: "https://dream.kotra.or.kr/kotranews/cms/com/index.do?MENU_ID=30",
  marketNews: "https://dream.kotra.or.kr/kotranews/index.do",
  overseasCertification: "https://dream.kotra.or.kr/dream/cms/com/index.do?MENU_ID=4030",
  importRegulation: "https://dream.kotra.or.kr/dream/cms/com/index.do?MENU_ID=3700",
} as const;

export const KSURE_PUBLIC_SOURCE_URLS = {
  countryGrade: "https://ksight.ksure.or.kr/rsrch/nation/nationView",
  industryRiskIndex: "https://ksight.ksure.or.kr/risk-index",
  exportPayment: "https://ksight.ksure.or.kr/analysis/risk-advisor/payment",
} as const;

export const TRADE_SECURITY_PUBLIC_SOURCE_URL = "https://www.yestrade.go.kr/";
export const SAFETYKOREA_PUBLIC_SOURCE_URL = "https://www.safetykorea.kr/release/openapi";
export const SAFETYKOREA_RECALL_LIST_URL = "https://www.safetykorea.kr/recall/recallList";
export const WTO_EPING_PUBLIC_SOURCE_URL = "https://eping.wto.org/en/Search/Index";
export type SafetyKoreaRecallScope = "domestic" | "foreign";

type KotraImportRegCountryParams = {
  pRegnCd: string;
  pNatCd: string;
};

type KotraRegDetailUrlOptions = {
  countryCodeIso2?: string | null;
};

const KOTRA_IMPORT_REG_COUNTRY_PARAM_MAP: Record<string, KotraImportRegCountryParams> = {
  AE: { pRegnCd: "02", pNatCd: "784" },
  BR: { pRegnCd: "05", pNatCd: "76" },
  CN: { pRegnCd: "01", pNatCd: "156" },
  DE: { pRegnCd: "03", pNatCd: "276" },
  ID: { pRegnCd: "01", pNatCd: "360" },
  IN: { pRegnCd: "01", pNatCd: "699" },
  JP: { pRegnCd: "01", pNatCd: "392" },
  MX: { pRegnCd: "05", pNatCd: "484" },
  MY: { pRegnCd: "01", pNatCd: "458" },
  PL: { pRegnCd: "03", pNatCd: "616" },
  TH: { pRegnCd: "01", pNatCd: "764" },
  TR: { pRegnCd: "03", pNatCd: "792" },
  US: { pRegnCd: "04", pNatCd: "842" },
  VN: { pRegnCd: "01", pNatCd: "704" },
};

export function toPublicSourceUrl(url: string | null | undefined): string | null {
  const value = url?.trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) return null;

  const lower = value.toLowerCase();
  if (lower.includes("apis.data.go.kr/b410001/kotra_nationalinformation")) {
    return KOTRA_PUBLIC_SOURCE_URLS.countryInfo;
  }
  if (lower.includes("apis.data.go.kr/b410001/kotra_overseasmarketnews")) {
    return KOTRA_PUBLIC_SOURCE_URLS.marketNews;
  }
  if (lower.includes("apis.data.go.kr/b410001/overseasauthinfo")) {
    return KOTRA_PUBLIC_SOURCE_URLS.overseasCertification;
  }
  if (
    lower.includes("apis.data.go.kr/b410001/ds00000128") ||
    lower.includes("apis.data.go.kr/b410001/ds0000128")
  ) {
    return KOTRA_PUBLIC_SOURCE_URLS.importRegulation;
  }
  if (
    lower.includes("apis.data.go.kr/b552696/countrygrade/credit-grade") ||
    lower.includes("data.go.kr/data/15140201/openapi.do")
  ) {
    return KSURE_PUBLIC_SOURCE_URLS.countryGrade;
  }
  if (
    lower.includes("apis.data.go.kr/b552696/ksight/riskindex") ||
    lower.includes("data.go.kr/data/15132755/openapi.do")
  ) {
    return KSURE_PUBLIC_SOURCE_URLS.industryRiskIndex;
  }
  if (
    lower.includes("apis.data.go.kr/b552696/exportpayment/getpaymentinfo") ||
    lower.includes("data.go.kr/data/15144259/openapi.do")
  ) {
    return KSURE_PUBLIC_SOURCE_URLS.exportPayment;
  }
  if (lower.includes("yestrade.go.kr/openapi")) {
    return TRADE_SECURITY_PUBLIC_SOURCE_URL;
  }
  if (lower.includes("yestrade.go.kr")) {
    return TRADE_SECURITY_PUBLIC_SOURCE_URL;
  }
  if (lower.includes("safetykorea.kr/openapi/api/cert/")) {
    return SAFETYKOREA_PUBLIC_SOURCE_URL;
  }
  const safetyKoreaRecallDetailUrl = resolveSafetyKoreaRecallDetailUrl(
    value,
    null,
    lower.includes("/frecallinfo") || lower.includes("/ajax/frecallboard") ? "foreign" : "domestic",
  );
  if (safetyKoreaRecallDetailUrl) {
    return safetyKoreaRecallDetailUrl;
  }
  if (lower.includes("safetykorea.kr/openapi/api/recall/")) {
    return SAFETYKOREA_RECALL_LIST_URL;
  }
  if (lower.includes("safetykorea.kr/release/recall")) {
    return SAFETYKOREA_RECALL_LIST_URL;
  }
  if (lower.includes("api.wto.org/eping") || lower.includes("eping.wto.org")) {
    return WTO_EPING_PUBLIC_SOURCE_URL;
  }

  return value;
}

export function buildSafetyKoreaRecallDetailUrl(
  recordId: string | null | undefined,
  scope: SafetyKoreaRecallScope,
): string | null {
  const id = normalizeSafetyKoreaRecallId(recordId);
  if (!id) return null;

  const path = scope === "foreign" ? "fRecallBoard" : "recallBoard";
  return `https://www.safetykorea.kr/recall/ajax/${path}?recallUid=${encodeURIComponent(id)}`;
}

export function resolveSafetyKoreaRecallDetailUrl(
  sourceUrl: string | null | undefined,
  recordId: string | null | undefined,
  scope: SafetyKoreaRecallScope,
): string | null {
  const fallbackDetailUrl = buildSafetyKoreaRecallDetailUrl(recordId, scope);
  const text = sourceUrl?.trim();
  if (!text) return fallbackDetailUrl;
  if (!/^https?:\/\//i.test(text)) return fallbackDetailUrl;

  try {
    const parsed = new URL(text);
    if (!isSafetyKoreaHost(parsed.hostname)) return text;

    const pathname = parsed.pathname.toLowerCase();
    const urlRecordId =
      parsed.searchParams.get("recallUid") ??
      parsed.searchParams.get("fRecallUid") ??
      recordId;

    if (pathname === "/recall/ajax/recallboard") {
      return buildSafetyKoreaRecallDetailUrl(urlRecordId, "domestic") ?? fallbackDetailUrl;
    }

    if (pathname === "/recall/ajax/frecallboard") {
      return buildSafetyKoreaRecallDetailUrl(urlRecordId, "foreign") ?? fallbackDetailUrl;
    }

    if (pathname === "/recall/recallinfo") {
      return buildSafetyKoreaRecallDetailUrl(urlRecordId, "domestic") ?? fallbackDetailUrl;
    }

    if (pathname === "/recall/frecallinfo") {
      return buildSafetyKoreaRecallDetailUrl(urlRecordId, "foreign") ?? fallbackDetailUrl;
    }

    if (
      pathname === "/release/recall" ||
      pathname === "/recall/recalllist" ||
      pathname.startsWith("/openapi/api/recall/")
    ) {
      return fallbackDetailUrl ?? SAFETYKOREA_RECALL_LIST_URL;
    }

    return text;
  } catch {
    return fallbackDetailUrl;
  }
}

function normalizeSafetyKoreaRecallId(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function isSafetyKoreaHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "safetykorea.kr" || host.endsWith(".safetykorea.kr");
}

export function buildKotraCertDetailUrl(raw: Record<string, unknown> | null | undefined): string {
  const base = KOTRA_PUBLIC_SOURCE_URLS.overseasCertification;
  if (!raw) return base;

  const keyword = typeof raw.subject === "string" && raw.subject.trim()
    ? raw.subject.trim()
    : typeof raw.country === "string" && raw.country.trim()
    ? raw.country.trim()
    : "";

  if (keyword) {
    return `${base}&sSearchVal=${encodeURIComponent(keyword)}`;
  }
  return base;
}

export function buildKotraRegDetailUrl(
  raw: Record<string, unknown> | null | undefined,
  options?: KotraRegDetailUrlOptions,
): string {
  const base = KOTRA_PUBLIC_SOURCE_URLS.importRegulation;

  const iso2 = resolveIso2CountryCode(raw, options?.countryCodeIso2);
  if (!iso2) return base;

  const countryParams = KOTRA_IMPORT_REG_COUNTRY_PARAM_MAP[iso2];
  if (!countryParams) return base;

  return `${base}&pRegnCd=${countryParams.pRegnCd}&pNatCd=${countryParams.pNatCd}`;
}

function resolveIso2CountryCode(
  raw: Record<string, unknown> | null | undefined,
  preferredIso2: string | null | undefined,
): string | null {
  const candidates = [
    preferredIso2,
    raw?.country_code_iso2,
    raw?.country_code,
    raw?.iso_wd2_nat_cd,
    raw?.ISO_WD2_NAT_CD,
    raw?.country_iso2,
  ];

  for (const value of candidates) {
    if (typeof value !== "string") continue;
    const code = value.trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(code)) return code;
  }

  return null;
}
