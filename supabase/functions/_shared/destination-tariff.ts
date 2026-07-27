export type DestinationTariffDataMode = "live_api" | "official_snapshot" | "aggregate_fallback";

export type DestinationTariffCandidate = {
  tariffCode: string;
  statisticalSuffix: string;
  description: string;
  hierarchyDescription: string;
  indent: number | null;
  units: string[];
  footnotes: string[];
  generalRate: string;
  mfnRate: string;
  koreaPreferentialRate: string;
  otherRate: string;
  otherRateLabel: string;
  measures: string[];
  conditions: string[];
  rateInheritedFrom: string | null;
  declarable: boolean;
  effectiveDate: string | null;
};

export type DestinationTariffContext = {
  countryCode: string;
  countryName: string;
  productName: string;
  hs6: string;
  hsk10: string;
};

export type DestinationTariffCredentials = {
  ukClientId?: string;
  ukClientSecret?: string;
};

type ProviderState = "success" | "empty" | "error" | "not_run";

export type DestinationTariffProviderResult = {
  status: {
    key: string;
    label: string;
    state: ProviderState;
    itemCount: number;
    message: string;
    fetchedAt: string;
  };
  facts: Array<{
    factKey: string;
    category: "tariff_fta";
    status: "needs_verification";
    severity: "caution";
    summary: string;
    value: unknown;
    scope: "hs6";
    sourceName: string;
    sourceUrl: string;
    referenceDate: string | null;
    caveat: string;
    nextAction: string;
    fetchedAt: string;
    expiresAt: string;
  }>;
};

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const UK_API_BASE = "https://www.trade-tariff.service.gov.uk/uk/api";
const UK_TARIFF_PAGE = "https://www.trade-tariff.service.gov.uk/";
const UK_TOKEN_ENDPOINT = "https://auth.id.trade-tariff.service.gov.uk/oauth2/token";
const JAPAN_TARIFF_INDEX = "https://www.customs.go.jp/english/tariff/";
const EXTERNAL_TIMEOUT_MS = 10_000;
const MAX_UK_CANDIDATES = 8;

let cachedUkToken: { value: string; expiresAtMs: number } | null = null;

export async function fetchUkTradeTariff(
  context: DestinationTariffContext,
  credentials: DestinationTariffCredentials = {},
  fetchImpl: FetchLike = fetch,
): Promise<DestinationTariffProviderResult> {
  const fetchedAt = new Date().toISOString();
  if (context.countryCode !== "GB") {
    return emptyProvider("uk_trade_tariff", "영국 Trade Tariff", "not_run", "영국 선택 시에만 조회합니다.", fetchedAt);
  }
  if (!/^\d{6}$/.test(context.hs6)) {
    return emptyProvider("uk_trade_tariff", "영국 Trade Tariff", "not_run", "HS6 코드가 없어 영국 관세표를 조회하지 못했습니다.", fetchedAt);
  }

  try {
    const headers = await buildUkRequestHeaders(credentials, fetchImpl);
    const search = asRecord(await fetchJson(`${UK_API_BASE}/search?q=${encodeURIComponent(context.hs6)}`, headers, fetchImpl));
    const entry = asRecord(asRecord(asRecord(search.data).attributes).entry);
    const endpoint = text(entry.endpoint);
    const entryId = text(entry.id);
    if (!endpoint || !entryId) {
      return emptyProvider("uk_trade_tariff", "영국 Trade Tariff", "empty", "HS6 하위 영국 세번을 찾지 못했습니다.", fetchedAt);
    }

    const commodityCodes = endpoint === "commodities"
      ? [entryId.replace(/\D/g, "")]
      : await fetchUkCommodityCodes(endpoint, entryId, context.hs6, headers, fetchImpl);
    const uniqueCodes = [...new Set(commodityCodes.filter((code) => /^\d{10}$/.test(code)))].slice(0, MAX_UK_CANDIDATES);
    const documents = await Promise.all(uniqueCodes.map((code) => (
      fetchJson(`${UK_API_BASE}/commodities/${code}`, headers, fetchImpl).catch(() => null)
    )));
    const candidates = documents
      .map(normalizeUkCommodityDocument)
      .filter((candidate): candidate is DestinationTariffCandidate => candidate != null);

    if (!candidates.length) {
      return emptyProvider("uk_trade_tariff", "영국 Trade Tariff", "empty", "영국 10자리 세번의 상세 세율을 찾지 못했습니다.", fetchedAt);
    }

    return successfulProvider({
      key: "uk_trade_tariff",
      label: "영국 Trade Tariff",
      context,
      dataMode: "live_api",
      nomenclature: "UK Trade Tariff",
      finalCodeDigits: 10,
      candidates,
      sourceName: "HMRC UK Trade Tariff",
      sourceUrl: `${UK_TARIFF_PAGE}commodities/${candidates[0].tariffCode}`,
      referenceDate: latestDate(candidates.map((candidate) => candidate.effectiveDate)) ?? fetchedAt.slice(0, 10),
      caveat: "한국산 특혜세율은 원산지 기준 충족과 증빙을 전제로 하며, 관세할당·추가코드·용도 조건에 따라 실제 적용세율이 달라질 수 있습니다.",
      nextAction: `${context.productName || "해당 제품"}의 재질·기능·용도와 원산지 증빙을 준비해 영국 ${candidates.map((candidate) => candidate.tariffCode).join(", ")} 후보를 최종 확인하세요.`,
      fetchedAt,
    });
  } catch (error) {
    return emptyProvider("uk_trade_tariff", "영국 Trade Tariff", "error", safeErrorMessage(error), fetchedAt);
  }
}

export async function fetchJapanCustomsTariff(
  context: DestinationTariffContext,
  fetchImpl: FetchLike = fetch,
): Promise<DestinationTariffProviderResult> {
  const fetchedAt = new Date().toISOString();
  if (context.countryCode !== "JP") {
    return emptyProvider("japan_customs_tariff", "일본 세관 관세표", "not_run", "일본 선택 시에만 조회합니다.", fetchedAt);
  }
  if (!/^\d{6}$/.test(context.hs6)) {
    return emptyProvider("japan_customs_tariff", "일본 세관 관세표", "not_run", "HS6 코드가 없어 일본 관세표를 조회하지 못했습니다.", fetchedAt);
  }

  try {
    const indexHtml = await fetchText(JAPAN_TARIFF_INDEX, {}, fetchImpl);
    const version = latestJapanTariffVersion(indexHtml);
    if (!version) throw new Error("일본 세관의 최신 관세표 기준일을 확인하지 못했습니다.");
    const chapter = context.hs6.slice(0, 2);
    const chapterUrl = `${JAPAN_TARIFF_INDEX}${version}/data/e_${chapter}.htm`;
    const chapterHtml = await fetchText(chapterUrl, {}, fetchImpl);
    const candidates = parseJapanTariffScheduleHtml(chapterHtml, context.hs6)
      .map((candidate) => ({ ...candidate, effectiveDate: version.replaceAll("_", "-") }));

    if (!candidates.length) {
      return emptyProvider("japan_customs_tariff", "일본 세관 관세표", "empty", "HS6와 일치하는 일본 9자리 통계품목을 찾지 못했습니다.", fetchedAt);
    }

    return successfulProvider({
      key: "japan_customs_tariff",
      label: "일본 세관 관세표",
      context,
      dataMode: "official_snapshot",
      nomenclature: "Japan Customs Statistical Code for Import",
      finalCodeDigits: 9,
      candidates,
      sourceName: "Japan Customs Tariff Schedule",
      sourceUrl: chapterUrl,
      referenceDate: version.replaceAll("_", "-"),
      caveat: "영문 관세표는 참고용입니다. 실제 신고 전 일본어 법령 원문과 한일 RCEP 원산지 기준 및 증빙 요건을 최종 확인해야 합니다.",
      nextAction: `${context.productName || "해당 제품"}의 상세 사양과 원산지 증빙을 준비해 일본 ${candidates.map((candidate) => candidate.tariffCode).join(", ")} 후보를 최종 확인하세요.`,
      fetchedAt,
    });
  } catch (error) {
    return emptyProvider("japan_customs_tariff", "일본 세관 관세표", "error", safeErrorMessage(error), fetchedAt);
  }
}

export function normalizeUkCommodityDocument(raw: unknown): DestinationTariffCandidate | null {
  const document = asRecord(raw);
  const data = asRecord(document.data);
  const attributes = asRecord(data.attributes);
  const tariffCode = text(attributes.goods_nomenclature_item_id).replace(/\D/g, "");
  if (!/^\d{10}$/.test(tariffCode)) return null;

  const included = asArray(document.included).map(asRecord);
  const related = new Map(included.map((item) => [`${text(item.type)}:${text(item.id)}`, item]));
  const measureIds = relationshipData(data, "import_measures").map((item) => text(item.id));
  const measures = measureIds
    .map((id) => related.get(`measure:${id}`))
    .filter((item): item is Record<string, unknown> => item != null);
  const normalizedMeasures = measures.map((measure) => normalizeUkMeasure(measure, related));
  const general = normalizedMeasures.find((measure) => measure.measureTypeId === "103" && measure.geographicalAreaId === "1011")
    ?? normalizedMeasures.find((measure) => /third country duty/i.test(measure.measureTypeDescription));
  const korea = normalizedMeasures.find((measure) => measure.measureTypeId === "142" && measure.geographicalAreaId === "KR")
    ?? normalizedMeasures.find((measure) => /tariff preference/i.test(measure.measureTypeDescription) && /korea/i.test(measure.geographicalAreaDescription));
  const vat = normalizedMeasures.find((measure) => measure.measureTypeId === "305" || /value added tax/i.test(measure.measureTypeDescription));
  const relevantMeasures = normalizedMeasures.filter((measure) => (
    measure === general ||
    measure === korea ||
    measure === vat ||
    (measure.geographicalAreaId === "1011" && !/third country duty/i.test(measure.measureTypeDescription))
  ));
  const heading = included.find((item) => text(item.type) === "heading");
  const headingDescription = descriptionOf(heading);
  const description = descriptionOf(data) || descriptionOf({ attributes });
  const hierarchyDescription = [headingDescription, description]
    .filter(Boolean)
    .filter((value, index, values) => index === 0 || value !== values[index - 1])
    .join(" > ");
  const footnoteIds = relationshipData(data, "footnotes").map((item) => text(item.id));
  const footnotes = footnoteIds.flatMap((id) => {
    const footnote = related.get(`footnote:${id}`);
    const value = descriptionOf(footnote) || text(asRecord(footnote?.attributes).code);
    return value ? [value] : [];
  });

  return {
    tariffCode,
    statisticalSuffix: text(attributes.producline_suffix),
    description,
    hierarchyDescription,
    indent: integerOrNull(attributes.number_indents),
    units: [],
    footnotes,
    generalRate: general?.duty || "-",
    mfnRate: general?.duty || "-",
    koreaPreferentialRate: korea?.duty || "-",
    otherRate: vat?.duty || "-",
    otherRateLabel: vat ? "VAT" : "기타",
    measures: uniqueStrings(relevantMeasures.map((measure) => (
      `${measure.measureTypeDescription}${measure.duty ? `: ${measure.duty}` : ""}`
    ))),
    conditions: uniqueStrings(relevantMeasures.flatMap((measure) => measure.conditions)),
    rateInheritedFrom: null,
    declarable: attributes.declarable !== false,
    effectiveDate: latestDate(relevantMeasures.map((measure) => measure.effectiveDate))
      ?? isoDate(attributes.validity_start_date),
  };
}

export function parseJapanTariffScheduleHtml(html: string, hs6: string): DestinationTariffCandidate[] {
  if (!/^\d{6}$/.test(hs6)) return [];
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => {
    const rowHtml = match[1];
    const cells = [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => ({
      html: cell[0],
      text: cleanHtmlText(cell[1]),
    }));
    return { rowHtml, cells };
  }).filter((row) => row.cells.length >= 3);

  const headingDescription = rows
    .filter((row) => {
      const digits = row.cells[0].text.replace(/\D/g, "");
      return digits.length === 4 && hs6.startsWith(digits);
    })
    .map((row) => row.cells[2].text)
    .filter(Boolean)
    .at(-1) ?? "";

  return rows.flatMap((row) => {
    const codeDigits = row.cells[0]?.text.replace(/\D/g, "") ?? "";
    const statisticalSuffix = row.cells[1]?.text.replace(/\D/g, "") ?? "";
    if (codeDigits !== hs6 || !/^\d{3}$/.test(statisticalSuffix)) return [];
    const description = row.cells[2]?.text ?? "";
    const units = uniqueStrings([row.cells[30]?.text ?? "", row.cells[31]?.text ?? ""]);
    const generalRate = row.cells[3]?.text || "-";
    const wtoRate = row.cells[5]?.text || "-";
    const koreaRate = row.cells[28]?.text || "-";
    return [{
      tariffCode: `${codeDigits}${statisticalSuffix}`,
      statisticalSuffix,
      description,
      hierarchyDescription: [headingDescription, description].filter(Boolean).join(" > "),
      indent: parseJapanIndent(row.cells[2]?.html ?? row.rowHtml),
      units,
      footnotes: [],
      generalRate,
      mfnRate: wtoRate,
      koreaPreferentialRate: koreaRate,
      otherRate: wtoRate,
      otherRateLabel: "WTO",
      measures: [],
      conditions: [],
      rateInheritedFrom: null,
      declarable: true,
      effectiveDate: null,
    } satisfies DestinationTariffCandidate];
  });
}

function successfulProvider(params: {
  key: string;
  label: string;
  context: DestinationTariffContext;
  dataMode: DestinationTariffDataMode;
  nomenclature: string;
  finalCodeDigits: number;
  candidates: DestinationTariffCandidate[];
  sourceName: string;
  sourceUrl: string;
  referenceDate: string | null;
  caveat: string;
  nextAction: string;
  fetchedAt: string;
}): DestinationTariffProviderResult {
  const itemCount = params.candidates.length;
  return {
    status: {
      key: params.key,
      label: params.label,
      state: "success",
      itemCount,
      message: `${params.context.countryName} 목적국 세번 후보 ${itemCount}건을 확인했습니다.`,
      fetchedAt: params.fetchedAt,
    },
    facts: [{
      factKey: "tariff_fta:national_tariff_candidates",
      category: "tariff_fta",
      status: "needs_verification",
      severity: "caution",
      summary: `${params.context.countryName} 공식 관세표에서 ${itemCount}개의 목적국 세번 후보와 세율을 확인했습니다.`,
      value: {
        countryCode: params.context.countryCode,
        countryName: params.context.countryName,
        nomenclature: params.nomenclature,
        dataMode: params.dataMode,
        finalCodeDigits: params.finalCodeDigits,
        hs6: params.context.hs6,
        candidates: params.candidates,
        additionalMeasures: [],
        specificationHint: `${params.context.productName || "제품"}의 재질·기능·용도·규격과 원산지 요건을 확인하세요.`,
      },
      scope: "hs6",
      sourceName: params.sourceName,
      sourceUrl: params.sourceUrl,
      referenceDate: params.referenceDate,
      caveat: params.caveat,
      nextAction: params.nextAction,
      fetchedAt: params.fetchedAt,
      expiresAt: new Date(Date.parse(params.fetchedAt) + 24 * 60 * 60 * 1_000).toISOString(),
    }],
  };
}

function emptyProvider(
  key: string,
  label: string,
  state: ProviderState,
  message: string,
  fetchedAt: string,
): DestinationTariffProviderResult {
  return {
    status: { key, label, state, itemCount: 0, message, fetchedAt },
    facts: [],
  };
}

async function fetchUkCommodityCodes(
  endpoint: string,
  entryId: string,
  hs6: string,
  headers: HeadersInit,
  fetchImpl: FetchLike,
): Promise<string[]> {
  const document = asRecord(await fetchJson(`${UK_API_BASE}/${encodeURIComponent(endpoint)}/${encodeURIComponent(entryId)}`, headers, fetchImpl));
  const included = asArray(document.included).map(asRecord);
  const fromIncluded = included
    .filter((item) => text(item.type) === "commodity")
    .filter((item) => {
      const attributes = asRecord(item.attributes);
      return attributes.declarable !== false && attributes.leaf !== false;
    })
    .map((item) => text(asRecord(item.attributes).goods_nomenclature_item_id).replace(/\D/g, ""))
    .filter((code) => code.startsWith(hs6));
  if (fromIncluded.length) return fromIncluded;
  const dataCode = text(asRecord(asRecord(document.data).attributes).goods_nomenclature_item_id).replace(/\D/g, "");
  return dataCode.length === 10 && dataCode.startsWith(hs6) ? [dataCode] : [];
}

async function buildUkRequestHeaders(
  credentials: DestinationTariffCredentials,
  fetchImpl: FetchLike,
): Promise<HeadersInit> {
  const headers: Record<string, string> = { Accept: "application/vnd.hmrc.2.0+json" };
  if (!credentials.ukClientId || !credentials.ukClientSecret) return headers;
  const accessToken = await getUkAccessToken(credentials.ukClientId, credentials.ukClientSecret, fetchImpl);
  headers.Authorization = `Bearer ${accessToken}`;
  return headers;
}

async function getUkAccessToken(clientId: string, clientSecret: string, fetchImpl: FetchLike): Promise<string> {
  if (cachedUkToken && cachedUkToken.expiresAtMs > Date.now() + 30_000) return cachedUkToken.value;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });
  const response = await fetchWithTimeout(UK_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  }, fetchImpl);
  if (!response.ok) throw new Error(`영국 Trade Tariff OAuth HTTP ${response.status}`);
  const payload = asRecord(await response.json());
  const accessToken = text(payload.access_token);
  if (!accessToken) throw new Error("영국 Trade Tariff OAuth 토큰이 비어 있습니다.");
  const expiresIn = positiveNumber(payload.expires_in) ?? 3600;
  cachedUkToken = { value: accessToken, expiresAtMs: Date.now() + expiresIn * 1_000 };
  return accessToken;
}

async function fetchJson(url: string, headers: HeadersInit, fetchImpl: FetchLike): Promise<unknown> {
  const response = await fetchWithTimeout(url, { headers }, fetchImpl);
  if (!response.ok) throw new Error(`목적국 관세 API HTTP ${response.status}`);
  return await response.json();
}

async function fetchText(url: string, headers: HeadersInit, fetchImpl: FetchLike): Promise<string> {
  const response = await fetchWithTimeout(url, { headers }, fetchImpl);
  if (!response.ok) throw new Error(`목적국 관세표 HTTP ${response.status}`);
  return await response.text();
}

async function fetchWithTimeout(url: string, init: RequestInit, fetchImpl: FetchLike): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeUkMeasure(
  measure: Record<string, unknown>,
  related: Map<string, Record<string, unknown>>,
) {
  const attributes = asRecord(measure.attributes);
  const measureTypeRef = relationshipOne(measure, "measure_type");
  const geographicalAreaRef = relationshipOne(measure, "geographical_area");
  const dutyExpressionRef = relationshipOne(measure, "duty_expression");
  const measureType = related.get(`measure_type:${text(measureTypeRef.id)}`);
  const geographicalArea = related.get(`geographical_area:${text(geographicalAreaRef.id)}`);
  const dutyExpression = related.get(`duty_expression:${text(dutyExpressionRef.id)}`);
  const conditionIds = relationshipData(measure, "measure_conditions").map((item) => text(item.id));
  const conditions = conditionIds.flatMap((id) => {
    const condition = related.get(`measure_condition:${id}`);
    const conditionAttributes = asRecord(condition?.attributes);
    const value = text(conditionAttributes.requirement)
      || text(conditionAttributes.action)
      || text(conditionAttributes.condition_code)
      || descriptionOf(condition);
    return value ? [value] : [];
  });
  const dutyAttributes = asRecord(dutyExpression?.attributes);
  return {
    measureTypeId: text(measureTypeRef.id),
    measureTypeDescription: descriptionOf(measureType) || "수입 조치",
    geographicalAreaId: text(geographicalAreaRef.id),
    geographicalAreaDescription: descriptionOf(geographicalArea),
    duty: text(dutyAttributes.verbose_duty)
      || cleanHtmlText(text(dutyAttributes.formatted_base))
      || text(dutyAttributes.base)
      || text(attributes.resolved_duty_expression),
    conditions,
    effectiveDate: isoDate(attributes.effective_start_date),
  };
}

function relationshipOne(record: Record<string, unknown>, name: string): Record<string, unknown> {
  const relationships = asRecord(record.relationships);
  return asRecord(asRecord(relationships[name]).data);
}

function relationshipData(record: Record<string, unknown>, name: string): Record<string, unknown>[] {
  const relationships = asRecord(record.relationships);
  const data = asRecord(relationships[name]).data;
  return Array.isArray(data) ? data.map(asRecord) : data ? [asRecord(data)] : [];
}

function descriptionOf(record: unknown): string {
  const attributes = asRecord(asRecord(record).attributes);
  return cleanHtmlText(
    text(attributes.description_plain)
      || text(attributes.description)
      || text(attributes.formatted_description),
  );
}

function latestJapanTariffVersion(html: string): string | null {
  const versions = [...html.matchAll(/href=["'][^"']*(\d{4}_\d{2}_\d{2})\/index\.htm["']/gi)]
    .map((match) => match[1])
    .sort()
    .reverse();
  return versions[0] ?? null;
}

function parseJapanIndent(html: string): number | null {
  const match = html.match(/padding-left\s*:\s*([\d.]+)em/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}

function cleanHtmlText(value: string): string {
  return decodeHtml(value
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => named[String(name).toLowerCase()] ?? match);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function integerOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function positiveNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isoDate(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function latestDate(values: Array<string | null>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") return "목적국 관세 조회 시간이 초과되었습니다.";
  return error instanceof Error ? error.message : String(error);
}
