/**
 * 관세청_품목별 국가별 수출입실적(GW) API 호출 모듈
 *
 * Base URL: http://apis.data.go.kr/1220000/nitemtrade/getNitemtradeList
 * 응답: XML (JSON 미지원)
 * 인증: serviceKey (URL Encode)
 * 제약: 조회 기간 최대 1년 이내
 *
 * @see https://www.data.go.kr/tcs/dss/selectApiDataDetailView.do?publicDataPk=15096822
 */

const CUSTOMS_TRADE_BASE_URL =
  "http://apis.data.go.kr/1220000/nitemtrade/getNitemtradeList";
const CUSTOMS_FETCH_TIMEOUT_MS = 8_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CustomsTradeParams = {
  strtYymm: string; // "202501"
  endYymm: string; // "202512"
  hsSgn?: string; // HS코드 (2/4/6/10자리)
  cntyCd: string; // ISO Alpha-2 국가코드 "US"
};

export type CustomsTradeItem = {
  year: string; // "2025.01"
  statCdCntnKor1: string; // 국가명 "미국"
  statCd: string; // 국가코드 "US"
  statKor: string; // 품목명
  hsCd: string; // HS코드
  expWgt: number; // 수출중량(kg)
  expDlr: number; // 수출금액(달러)
  impWgt: number; // 수입중량(kg)
  impDlr: number; // 수입금액(달러)
  balPayments: number; // 무역수지(달러)
};

export type CustomsTradeResult = {
  ok: boolean;
  status: number | null;
  message: string;
  items: CustomsTradeItem[];
  totalExpDlr: number; // 조회기간 수출 합계
  totalImpDlr: number; // 조회기간 수입 합계
};

export type FetchCustomsTradeSummaryOptions = {
  concurrency?: number;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * 특정 국가에 대한 품목별 수출입실적을 조회합니다.
 */
export async function fetchCustomsTradeByCountry(
  params: CustomsTradeParams,
  apiKey: string,
): Promise<CustomsTradeResult> {
  try {
    const url = new URL(CUSTOMS_TRADE_BASE_URL);
    url.searchParams.set("serviceKey", apiKey);
    url.searchParams.set("strtYymm", params.strtYymm);
    url.searchParams.set("endYymm", params.endYymm);
    url.searchParams.set("cntyCd", params.cntyCd);
    if (params.hsSgn) {
      url.searchParams.set("hsSgn", params.hsSgn);
    }

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      CUSTOMS_FETCH_TIMEOUT_MS,
    );

    const res = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        message: `HTTP ${res.status}`,
        items: [],
        totalExpDlr: 0,
        totalImpDlr: 0,
      };
    }

    const xml = await res.text();
    const resultCode = getTagValue(xml, "resultCode");
    const resultMsg = getTagValue(xml, "resultMsg");

    if (resultCode && resultCode !== "00") {
      return {
        ok: false,
        status: res.status,
        message: `${resultCode}: ${resultMsg}`,
        items: [],
        totalExpDlr: 0,
        totalImpDlr: 0,
      };
    }

    const items = parseCustomsTradeItems(xml);
    // 합계 행(year="합계", statCd="-")은 제외하고 개별 항목만 반환
    const dataItems = items.filter(
      (item) => item.statCd !== "-" && item.year !== "합계",
    );
    const summaryRow = items.find(
      (item) => item.year === "합계" || item.statCd === "-",
    );

    const totalExpDlr = summaryRow?.expDlr ??
      dataItems.reduce((sum, item) => sum + item.expDlr, 0);
    const totalImpDlr = summaryRow?.impDlr ??
      dataItems.reduce((sum, item) => sum + item.impDlr, 0);

    return {
      ok: true,
      status: res.status,
      message: resultMsg || "정상처리",
      items: dataItems,
      totalExpDlr,
      totalImpDlr,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const isAbort = error instanceof DOMException && error.name === "AbortError";
    return {
      ok: false,
      status: null,
      message: isAbort ? "customs_trade_timeout" : message,
      items: [],
      totalExpDlr: 0,
      totalImpDlr: 0,
    };
  }
}

/**
 * 여러 국가에 대해 병렬로 수출입 실적을 조회하고 결과를 Map으로 반환합니다.
 *
 * 품목코드 전략: 10자리 HSK 우선 → 결과 0건이면 6자리 → 4자리 fallback
 */
export async function fetchCustomsTradeSummary(
  hsCode: string,
  countryCodes: string[],
  apiKey: string,
  options: FetchCustomsTradeSummaryOptions = {},
): Promise<Map<string, CustomsTradeResult>> {
  const now = new Date();
  const endYymm = formatYymm(now);
  const startDate = new Date(now);
  startDate.setMonth(startDate.getMonth() - 11); // 최근 12개월
  const strtYymm = formatYymm(startDate);

  // HS코드에서 숫자만 추출
  const cleaned = String(hsCode ?? "").replace(/\D+/g, "");
  
  // 방어 로직: 숫자가 4자리 미만이면 빈 결과를 반환 (전체 조회를 방지)
  if (cleaned.length < 4) {
    return new Map();
  }

  const hsCandidates = buildHsSgnCandidates(cleaned);
  const concurrency = clampConcurrency(options.concurrency, countryCodes.length);

  const results = await mapWithConcurrency(
    countryCodes,
    concurrency,
    async (code): Promise<[string, CustomsTradeResult]> => {
      let lastResult: CustomsTradeResult | null = null;
      for (const targetHs of hsCandidates) {
        const result = await fetchCustomsTradeByCountry(
          { strtYymm, endYymm, hsSgn: targetHs, cntyCd: code },
          apiKey,
        );
        lastResult = result;
        if (!result.ok) break;
        if (result.items.length > 0 || result.totalExpDlr > 0 || result.totalImpDlr > 0) break;
      }

      return [code, lastResult ?? emptyCustomsTradeResult()];
    },
  );

  return new Map(results);
}

function buildHsSgnCandidates(cleaned: string): string[] {
  const candidates = [
    cleaned.length >= 10 ? cleaned.slice(0, 10) : "",
    cleaned.length >= 6 ? cleaned.slice(0, 6) : "",
    cleaned.slice(0, 4),
  ].filter(Boolean);
  return [...new Set(candidates)];
}

function emptyCustomsTradeResult(): CustomsTradeResult {
  return {
    ok: true,
    status: null,
    message: "customs_trade_empty",
    items: [],
    totalExpDlr: 0,
    totalImpDlr: 0,
  };
}

/**
 * 관세청 수출 금액 기반 시장성 점수 부스트를 계산합니다.
 * 최대 +8점 (market 점수 30점 만점 중)
 */
export function deriveCustomsTradeBoost(
  result: CustomsTradeResult | null,
): number {
  if (!result?.ok || result.totalExpDlr <= 0) return 0;
  const expMillion = result.totalExpDlr / 1_000_000;
  if (expMillion >= 100) return 8; // 1억불 이상
  if (expMillion >= 10) return 6; // 1천만불 이상
  if (expMillion >= 1) return 4; // 100만불 이상
  if (expMillion >= 0.1) return 2; // 10만불 이상
  return 1; // 수출 실적 존재
}

/**
 * 수출 금액을 사람이 읽기 쉬운 형태로 포맷합니다.
 */
export function formatTradeAmount(dlr: number): string {
  if (dlr >= 1_000_000_000) {
    return `${(dlr / 1_000_000_000).toFixed(1)}B`;
  }
  if (dlr >= 1_000_000) {
    return `${(dlr / 1_000_000).toFixed(1)}M`;
  }
  if (dlr >= 1_000) {
    return `${(dlr / 1_000).toFixed(0)}K`;
  }
  return String(dlr);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseCustomsTradeItems(xml: string): CustomsTradeItem[] {
  const blocks = [
    ...xml.matchAll(/<item>([\s\S]*?)<\/item>/g),
  ].map((m) => m[1]);

  return blocks.map((block) => ({
    year: getTagValue(block, "year"),
    statCdCntnKor1: getTagValue(block, "statCdCntnKor1"),
    statCd: getTagValue(block, "statCd"),
    statKor: getTagValue(block, "statKor"),
    hsCd: getTagValue(block, "hsCd"),
    expWgt: toNum(getTagValue(block, "expWgt")),
    expDlr: toNum(getTagValue(block, "expDlr")),
    impWgt: toNum(getTagValue(block, "impWgt")),
    impDlr: toNum(getTagValue(block, "impDlr")),
    balPayments: toNum(getTagValue(block, "balPayments")),
  }));
}

function getTagValue(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  if (!match) return "";
  return decodeXml(match[1]).trim();
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function toNum(value: string): number {
  const cleaned = value.replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function normalizeHsDigits(hsCode: string, digits: number): string {
  const cleaned = String(hsCode ?? "").replace(/\D+/g, "");
  return cleaned.length >= digits ? cleaned.slice(0, digits) : "";
}

function formatYymm(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}${m}`;
}

function clampConcurrency(value: number | undefined, itemCount: number): number {
  if (itemCount <= 0) return 1;
  const normalized = Number.isFinite(value) ? Math.round(Number(value)) : 2;
  return Math.max(1, Math.min(normalized, itemCount));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limit = clampConcurrency(concurrency, items.length);
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
