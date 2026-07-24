const MAX_RESULT_LENGTH = 3_500;
const MAX_STRING_LENGTH = 500;
const MAX_ARRAY_ITEMS = 10;
const MAX_OBJECT_KEYS = 20;
const MAX_DEPTH = 4;

const RAW_DETAIL_KEYS = new Set([
  "applicable_items",
  "required_docs",
  "procedure",
  "validity_period",
  "hs_code",
  "test_institute",
  "certification_institute",
  "basis_regulation",
  "test_standard",
  "certification_type",
  "certification_group",
  "test_required_period",
  "certification_required_period",
  "cost_text",
  "notice",
  "published_at",
  "regulation_type",
  "effective_date",
  "regulation_end_date",
  "product_name",
  "hs_code_detail",
  "probe_target_country",
  "hq_region",
  "eval_grade",
  "eval_date",
  "biz_type_code",
  "biz_type_name",
  "risk_index",
  "scope",
  "confidence_level",
  "last_update_date",
  "latest_year",
  "late_payment_rate",
  "average_payment_period",
  "average_late_payment_period",
  "top_payment_term_code",
  "top_payment_term_name",
  "top_payment_term_share",
  "top_payment_term_count",
  "detail_message",
]);

const DETAIL_LABELS: Record<string, string> = {
  period: "기준기간",
  year: "기준연도",
  hs6: "HS6",
  hsk10: "HSK10",
  importMarketUsd: "목적국 전체 수입액(USD)",
  importsFromKoreaUsd: "한국산 수입액(USD)",
  koreaSharePct: "한국산 점유율(%)",
  simpleAveragePct: "평균 관세율(%)",
  minRatePct: "최저 관세율(%)",
  maxRatePct: "최고 관세율(%)",
  candidates: "세번 후보",
  additionalMeasures: "추가 관세 조치",
  specificationHint: "품목분류 확인 조건",
  overall: "LPI 종합",
  customs: "통관 효율",
  infrastructure: "물류 인프라",
  internationalShipments: "국제 운송",
  routeEstimates: "권역별 운송비",
  unit: "단위",
  container: "운송 기준",
  currencyUnit: "통화",
  dealBaseRateKrw: "매매기준율",
  krwPerCurrencyUnit: "통화 1단위당 원화",
  applicable_items: "적용 품목",
  required_docs: "필요 서류",
  procedure: "인증 절차",
  validity_period: "유효기간",
  test_institute: "시험기관",
  certification_institute: "인증기관",
  basis_regulation: "근거 규정",
  test_standard: "시험·안전 표준",
  certification_type: "인증 유형",
  certification_group: "인증 구분",
  test_required_period: "시험 소요기간",
  certification_required_period: "인증 소요기간",
  cost_text: "비용",
  notice: "주의사항",
  published_at: "공개일",
  regulation_type: "규제 유형",
  effective_date: "시행일",
  regulation_end_date: "종료일",
  product_name: "규제 품목",
  hs_code_detail: "규제 HS",
  probe_target_country: "조사 대상국",
  hq_region: "담당 지역본부",
  eval_grade: "국가신용등급",
  eval_date: "평가일",
  biz_type_code: "업종 코드",
  biz_type_name: "업종",
  risk_index: "위험지수",
  scope: "적용 범위",
  confidence_level: "신뢰 수준",
  last_update_date: "최종 갱신일",
  latest_year: "최신 연도",
  late_payment_rate: "결제 지연율(%)",
  average_payment_period: "평균 결제기간(일)",
  average_late_payment_period: "평균 지연기간(일)",
  top_payment_term_code: "주요 결제조건 코드",
  top_payment_term_name: "주요 결제조건",
  top_payment_term_share: "주요 결제조건 비중(%)",
  top_payment_term_count: "주요 결제조건 표본",
  detail_message: "상세 안내",
};

export function buildProgramEvidenceValue(input: unknown): string {
  const row = asRecord(input);
  const parts: string[] = [];
  const summary = text(row.summary);
  if (summary) parts.push(`요약: ${summary}`);

  const level = text(row.level);
  if (level) parts.push(`위험 수준: ${level}`);

  const structuredValue = formatValue(row.value, 0);
  if (structuredValue) parts.push(`구조화 상세: ${structuredValue}`);

  const rawDetails = selectRawDetails(row.raw);
  const rawValue = formatValue(rawDetails, 0);
  if (rawValue) parts.push(`공식 조회 상세: ${rawValue}`);

  const effectiveDate = text(row.effectiveDate ?? row.effective_date);
  if (effectiveDate && !hasOwn(rawDetails, "effective_date")) {
    parts.push(`시행일: ${effectiveDate}`);
  }

  const caveat = text(row.caveat);
  if (caveat) parts.push(`판단 한계: ${caveat}`);

  const nextAction = text(row.nextAction ?? row.next_action);
  if (nextAction) parts.push(`다음 확인: ${nextAction}`);

  return truncate(parts.join("\n"), MAX_RESULT_LENGTH);
}

function selectRawDetails(value: unknown): Record<string, unknown> {
  const raw = asRecord(value);
  return Object.fromEntries(
    Object.entries(raw).filter(([key, item]) => (
      RAW_DETAIL_KEYS.has(key) && hasMeaningfulValue(item)
    )),
  );
}

function formatValue(value: unknown, depth: number): string {
  if (value == null || depth > MAX_DEPTH) return "";
  if (typeof value === "string") return truncate(value.trim(), MAX_STRING_LENGTH);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS)
      .map((item) => formatValue(item, depth + 1))
      .filter(Boolean);
    if (!items.length) return "";
    const suffix = value.length > MAX_ARRAY_ITEMS ? `, 외 ${value.length - MAX_ARRAY_ITEMS}건` : "";
    return `[${items.join(" | ")}${suffix}]`;
  }

  const entries = Object.entries(asRecord(value))
    .filter(([, item]) => hasMeaningfulValue(item))
    .slice(0, MAX_OBJECT_KEYS)
    .map(([key, item]) => {
      const formatted = formatValue(item, depth + 1);
      return formatted ? `${DETAIL_LABELS[key] ?? key}=${formatted}` : "";
    })
    .filter(Boolean);
  return entries.length ? `{${entries.join("; ")}}` : "";
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value == null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(asRecord(value)).length > 0;
  return true;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}
