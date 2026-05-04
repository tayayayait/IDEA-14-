export type KotraEntryStrategyStatus = "available" | "empty" | "failed" | "pdf_failed";

export interface KotraEntryStrategyEvidence {
  status: KotraEntryStrategyStatus;
  title: string | null;
  publishedDate: string | null;
  tradeOffice: string | null;
  sourceUrl: string | null;
  attachmentName: string | null;
  attachmentUrl: string | null;
  usedPdf: boolean;
  basisSummary: string;
  limitations: string[];
}

export interface KotraEntryStrategyCandidate {
  title: string | null;
  publishedDate: string | null;
  tradeOffice?: string | null;
  sourceUrl?: string | null;
  attachmentName?: string | null;
  attachmentUrl?: string | null;
  basisSummary?: string | null;
  limitations: string[];
}

const UNKNOWN_TEXT = "확실한 정보 없음";

const COUNTRY_SEARCH_TERMS: Record<string, string> = {
  US: "미국",
  USA: "미국",
  VN: "베트남",
  VNM: "베트남",
  CN: "중국",
  CHN: "중국",
  JP: "일본",
  JPN: "일본",
  DE: "독일",
  DEU: "독일",
  IN: "인도",
  IND: "인도",
  ID: "인도네시아",
  IDN: "인도네시아",
  TH: "태국",
  THA: "태국",
  MY: "말레이시아",
  MYS: "말레이시아",
  SG: "싱가포르",
  SGP: "싱가포르",
  MX: "멕시코",
  MEX: "멕시코",
  CA: "캐나다",
  CAN: "캐나다",
  TW: "대만",
  TWN: "대만",
};

const COUNTRY_NAME_TERMS = [
  "미국",
  "베트남",
  "중국",
  "일본",
  "독일",
  "인도네시아",
  "인도",
  "태국",
  "말레이시아",
  "싱가포르",
  "멕시코",
  "캐나다",
  "대만",
  "프랑스",
  "영국",
  "이탈리아",
  "스페인",
  "브라질",
  "호주",
];

export function resolveEntryStrategySearchTerm(countryCode: string | null | undefined, countryName: string | null | undefined): string {
  const code = String(countryCode ?? "").trim().toUpperCase();
  if (code && COUNTRY_SEARCH_TERMS[code]) return COUNTRY_SEARCH_TERMS[code];

  const name = stripParentheses(String(countryName ?? "").trim());
  const direct = COUNTRY_NAME_TERMS.find((term) => name.includes(term));
  if (direct) return direct;

  return name
    .replace(/사회주의\s*공화국/g, "")
    .replace(/인민\s*공화국/g, "")
    .replace(/연방\s*공화국/g, "")
    .replace(/공화국/g, "")
    .replace(/왕국/g, "")
    .replace(/\s+/g, " ")
    .trim() || String(countryName ?? "").trim();
}

export function normalizeEntryStrategyItems(input: unknown): KotraEntryStrategyCandidate[] {
  const response = asRecord(asRecord(input).response);
  const body = asRecord(response.body);
  const itemList = asRecord(body.itemList);
  const rawItems = asArrayOrSingle(itemList.item);

  return rawItems
    .map(asRecord)
    .map((item) => {
      const file = selectAttachment(item.realAtfileInfoList);
      return {
        title: textOrNull(item.newsTitl),
        publishedDate: textOrNull(item.othbcDt),
        tradeOffice: textOrNull(item.ovrofInfo),
        sourceUrl: textOrNull(item.kotraNewsUrl),
        attachmentName: file.name,
        attachmentUrl: file.url,
        basisSummary: "",
        limitations: [],
      };
    })
    .filter((item) => Boolean(item.title || item.sourceUrl || item.attachmentUrl));
}

export function selectLatestEntryStrategy(
  items: KotraEntryStrategyCandidate[],
  searchTerm?: string | null,
): KotraEntryStrategyCandidate | null {
  const term = String(searchTerm ?? "").trim();
  const candidates = term
    ? items.filter((item) => titleMatchesSearchTerm(item.title, term))
    : items;
  const sorted = [...candidates].sort((a, b) => dateRank(b.publishedDate) - dateRank(a.publishedDate));
  return sorted.find((item) => (item.title ?? "").includes("진출전략")) ?? sorted[0] ?? null;
}

export function buildAvailableEntryStrategy(
  item: KotraEntryStrategyCandidate,
  _pdfSummary: string | null,
): KotraEntryStrategyEvidence {
  return {
    status: "available",
    title: item.title ?? null,
    publishedDate: item.publishedDate ?? null,
    tradeOffice: item.tradeOffice ?? null,
    sourceUrl: item.sourceUrl ?? null,
    attachmentName: item.attachmentName ?? null,
    attachmentUrl: item.attachmentUrl ?? null,
    usedPdf: false,
    basisSummary: "",
    limitations: uniqueStrings(item.limitations ?? []),
  };
}

export function buildEmptyEntryStrategy(): KotraEntryStrategyEvidence {
  return {
    status: "empty",
    title: null,
    publishedDate: null,
    tradeOffice: null,
    sourceUrl: null,
    attachmentName: null,
    attachmentUrl: null,
    usedPdf: false,
    basisSummary: UNKNOWN_TEXT,
    limitations: ["해당 국가 진출전략 결과 없음"],
  };
}

export function buildFailedEntryStrategy(message: string): KotraEntryStrategyEvidence {
  return {
    status: "failed",
    title: null,
    publishedDate: null,
    tradeOffice: null,
    sourceUrl: null,
    attachmentName: null,
    attachmentUrl: null,
    usedPdf: false,
    basisSummary: UNKNOWN_TEXT,
    limitations: uniqueStrings(["진출전략 API 조회 실패", message].filter(Boolean)),
  };
}

export function cleanHtmlText(value: string): string {
  return cleanPlainText(value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "));
}

function cleanPlainText(value: string): string {
  return decodeBasicEntities(value)
    .replace(/\s+/g, " ")
    .trim();
}

function selectAttachment(value: unknown): { name: string | null; url: string | null } {
  const list = asArrayOrSingle(asRecord(value).realAtfileInfo).map(asRecord);
  const selected = list.find((item) => textOrNull(item.realAtfileUrl) || textOrNull(item.realAtfileName)) ?? {};
  return {
    name: textOrNull((selected as Record<string, unknown>).realAtfileName),
    url: textOrNull((selected as Record<string, unknown>).realAtfileUrl),
  };
}

function stripParentheses(value: string): string {
  return value.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}

function dateRank(value: string | null | undefined): number {
  const text = String(value ?? "").trim();
  if (!text) return 0;
  const time = Date.parse(text.replace(/\./g, "-"));
  return Number.isFinite(time) ? time : 0;
}

function titleMatchesSearchTerm(title: string | null | undefined, searchTerm: string): boolean {
  const text = String(title ?? "").trim();
  const term = searchTerm.trim();
  if (!text || !term) return false;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|[^0-9A-Za-z가-힣])${escaped}([^0-9A-Za-z가-힣]|$)`, "i");
  return pattern.test(text);
}

function decodeBasicEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&middot;/g, "·")
    .replace(/&hellip;/g, "...");
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function textOrNull(value: unknown): string | null {
  if (typeof value === "string") {
    const text = value.trim();
    return text || null;
  }
  if (typeof value === "number") return String(value);
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArrayOrSingle(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}
