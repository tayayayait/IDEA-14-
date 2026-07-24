const HIDDEN_KEYS = new Set([
  "countryProgramReference",
  "unConsolidatedListReference",
  "reporterCode",
]);

const PAYMENT_FIELDS = [
  "late_payment_rate",
  "average_payment_period",
  "average_late_payment_period",
  "top_payment_term_name",
  "top_payment_term_share",
] as const;

export function flattenDecisionFactValue(value: unknown): Array<[string, string]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const priority = new Map([
    "importMarketUsd", "importsFromKoreaUsd", "koreaSharePct", "period",
    "mfnRate", "preferentialRate", "destinationTariffCode", "agreementCandidate",
    "simpleAveragePct", "minRatePct", "maxRatePct", "tariffType", "nomenclature",
    "countryGrade", "late_payment_rate", "average_payment_period",
    "average_late_payment_period", "top_payment_term_name", "top_payment_term_share",
    "dealBaseRateKrw", "currencyUnit", "krwPerCurrencyUnit",
    "routeEstimates", "unit", "container",
    "resultCount", "systems", "candidates", "hsk10", "hs6",
    "overall", "customs", "infrastructure", "internationalShipments",
    "year", "htsCode", "description", "generalRate", "specialRate", "otherRate",
    "additionalMeasures", "specificationHint",
  ].map((key, index) => [key, index]));
  const entries = Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => {
    if (HIDDEN_KEYS.has(key) || item == null || item === "") return [];
    if (key === "payment" && typeof item === "object" && !Array.isArray(item)) {
      const payment = item as Record<string, unknown>;
      return PAYMENT_FIELDS.flatMap((paymentKey) => {
        const paymentValue = payment[paymentKey];
        return paymentValue == null || paymentValue === ""
          ? []
          : [[paymentKey, formatValueForKey(paymentKey, paymentValue)] as [string, string]];
      });
    }
    if (Array.isArray(item)) {
      const formatted = item.flatMap((entry) => {
        if (entry == null || entry === "") return [];
        if (typeof entry !== "object") return [formatValueForKey(key, entry)];
        const record = entry as Record<string, unknown>;
        if (
          key === "routeEstimates" &&
          typeof record.route === "string" &&
          typeof record.costThousandKrw === "number" &&
          Number.isFinite(record.costThousandKrw)
        ) {
          return [record.route + " " + formatPrimitive(record.costThousandKrw) + "천원"];
        }
        const preferredKeys = [
          "name", "title", "systemName", "controlNumber", "strategicItemNumber",
          "hsCode", "htsCode", "institution", "route", "region",
          "generalRate", "specialRate", "otherRate",
        ];
        const parts = preferredKeys
          .map((candidate) => record[candidate])
          .filter((candidate) => typeof candidate === "string" || typeof candidate === "number")
          .map(String)
          .filter(Boolean)
          .slice(0, 4);
        if (parts.length) return [parts.join(" · ")];
        const fallback = Object.values(record)
          .filter((candidate) => typeof candidate === "string" || typeof candidate === "number")
          .map(String)
          .filter(Boolean)
          .slice(0, 2);
        return fallback.length ? [fallback.join(" · ")] : [];
      });
      return formatted.length ? [[key, formatted.join(" / ")] as [string, string]] : [];
    }
    if (typeof item === "object") return [];
    return [[key, formatValueForKey(key, item)] as [string, string]];
  });
  return entries.sort(([left], [right]) =>
    (priority.get(left) ?? Number.MAX_SAFE_INTEGER) -
    (priority.get(right) ?? Number.MAX_SAFE_INTEGER));
}

function formatValueForKey(key: string, value: unknown): string {
  if (key === "matchStrategy") {
    const strategies: Record<string, string> = {
      country_hs_product: "국가·HS·제품명 모두 일치",
      country_hs: "국가·HS 일치",
      country_product: "국가·제품명 일치",
      product_only: "제품명 참고",
    };
    return strategies[String(value)] || formatPrimitive(value);
  }
  if (key === "paymentScope") {
    return value === "country" ? "국가별 통계" : value === "global" ? "전체 국가 참고" : formatPrimitive(value);
  }
  if (key === "tariffType" && String(value).includes("Most Favoured Nation")) return "최혜국(MFN) 관세";
  if (key === "nomenclature" && value === "H6") return "HS 2017(H6)";
  if (["late_payment_rate", "top_payment_term_share", "koreaSharePct", "simpleAveragePct", "minRatePct", "maxRatePct"].includes(key)) return formatPrimitive(value) + "%";
  if (key === "average_payment_period" || key === "average_late_payment_period") return formatPrimitive(value) + "일";
  return formatPrimitive(value);
}

function formatPrimitive(value: unknown): string {
  if (typeof value === "boolean") return value ? "예" : "아니오";
  if (typeof value === "number") {
    return Math.abs(value) >= 1000
      ? value.toLocaleString("ko-KR")
      : String(Math.round(value * 100) / 100);
  }
  return String(value);
}

export function decisionValueLabel(key: string): string {
  const labels: Record<string, string> = {
    hsk10: "HSK10",
    hs6: "HS6",
    resultCount: "조회 결과",
    datasetRowCount: "연계표 전체 행",
    items: "규제 일치 항목",
    importExportType: "구분",
    lawName: "관련 법령",
    agencyName: "확인기관",
    requiredItem: "필요 요건",
    approvalTiming: "승인 시점",
    applicationStartDate: "적용 시작일",
    period: "기준연도·월",
    importMarketUsd: "목적국 전체 수입시장(USD)",
    importsFromKoreaUsd: "한국산 수입액(USD)",
    koreaSharePct: "한국산 점유율",
    netWeightKgFromKorea: "한국산 순중량(kg)",
    isReported: "한국산 실적 신고값",
    isAggregate: "한국산 실적 집계값",
    currencyUnit: "통화",
    krwPerCurrencyUnit: "통화 1단위당 원화",
    dealBaseRateKrw: "매매기준율",
    searchDate: "환율 기준일",
    currencyName: "통화명",
    currencyAmountUnit: "환율 기준 단위",
    telegraphicBuyingRate: "전신환 매입률",
    telegraphicSellingRate: "전신환 매도률",
    agreementCandidate: "협정 후보",
    mfnRate: "MFN 관세율",
    preferentialRate: "특혜관세율",
    destinationTariffCode: "미국 세부 품목코드",
    simpleAveragePct: "MFN 단순평균",
    minRatePct: "MFN 최저",
    maxRatePct: "MFN 최고",
    tariffType: "관세 기준",
    nomenclature: "HS 분류 기준",
    overall: "물류 종합점수",
    customs: "통관 효율",
    infrastructure: "물류 인프라",
    internationalShipments: "국제 운송",
    year: "LPI 기준연도",
    htsCode: "미국 HTS 후보",
    description: "품목 설명",
    generalRate: "일반세율",
    specialRate: "특혜세율",
    otherRate: "기타 세율",
    additionalMeasures: "추가 관세 조치",
    specificationHint: "추가 확인 사양",
    systems: "인증 후보",
    candidates: "통제번호 후보",
    basicDocuments: "공통 기본서류",
    conditionalDocuments: "조건부 추가서류",
    finalClassification: "최종 판정",
    buyerProvided: "구매자 정보 확보",
    countryCode: "국가 코드",
    routeEstimates: "권역별 평균 운송비",
    unit: "비용 단위",
    container: "운송 기준",
    matchStrategy: "조회 일치 기준",
    reviewCount: "추가 검토 후보",
    confirmedCount: "직접 일치",
    countryGrade: "국가신용등급",
    paymentScope: "결제통계 범위",
    countryGradeDate: "국가등급 평가일",
    late_payment_rate: "결제 지연율",
    average_payment_period: "평균 결제기간",
    average_late_payment_period: "평균 지연기간",
    top_payment_term_name: "주요 결제조건",
    top_payment_term_share: "주요 결제조건 비중",
  };
  return labels[key] || key.replace(/([A-Z])/g, " $1").trim();
}
