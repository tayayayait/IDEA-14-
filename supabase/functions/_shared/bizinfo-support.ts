export const BIZINFO_SUPPORT_API_URL =
  "https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do";

export type BizinfoApplicationStatus =
  | "open"
  | "upcoming"
  | "closed"
  | "check_required";

export interface BizinfoProgram {
  id: string;
  title: string;
  ministry: string;
  agency: string;
  category: string;
  target: string;
  summary: string;
  applicationMethod: string;
  applicationUrl: string;
  detailUrl: string;
  applicationPeriod: string;
  updatedAt: string;
  hashtags: string;
}

export interface BizinfoMatchContext {
  productName: string;
  countryName: string;
  companyAddress: string;
  industryCode?: string;
  verdictSignals: BizinfoVerdictSignal[];
}

export interface BizinfoVerdictSignal {
  source: "action" | "risk" | "summary";
  text: string;
}

export interface MatchedBizinfoProgram extends BizinfoProgram {
  applicationStatus: BizinfoApplicationStatus;
  applicationStatusLabel: string;
  matchReasons: string[];
  verdictEvidence: string[];
  eligibilityNotes: string[];
  programEvidence?: string[];
  aiEligibility?: "likely" | "check_required";
}

export interface BizinfoAiSelectionContext {
  productName: string;
  productDescription: string;
  hsCode: string;
  hskCode: string;
  countryName: string;
  industryCode: string;
  verdictSignals: BizinfoVerdictSignal[];
}

type RawRecord = Record<string, unknown>;

const SUPPORT_THEMES = [
  {
    reason: "해외규격·인증 지원",
    context: ["인증", "규격", "시험", "성적서", "품질"],
    program: ["해외규격", "해외인증", "규격인증", "인증획득", "시험비", "인증비"],
  },
  {
    reason: "무역보험·대금회수 지원",
    context: ["보험", "신용조사", "대금", "결제", "미수금"],
    program: ["수출보험", "무역보험", "수출신용보증", "수출보증", "신용조사", "대금회수"],
  },
  {
    reason: "FTA·통관·수출통제 지원",
    context: [
      "fta",
      "원산지",
      "관세",
      "통관",
      "전략물자",
      "수출통제",
      "수출허가",
      "hs코드",
      "품목분류",
    ],
    program: [
      "fta",
      "원산지",
      "관세",
      "통관",
      "전략물자",
      "수출통제",
      "수출허가",
      "품목분류",
    ],
  },
  {
    reason: "해외시장·바이어 발굴 지원",
    context: ["바이어 발굴", "바이어 상담", "시장진출", "전시", "마케팅", "수출상담"],
    program: ["바이어", "무역사절단", "전시회", "해외마케팅", "수출상담"],
  },
  {
    reason: "수출바우처·사업화 지원",
    context: ["바우처", "사업화", "수출 준비", "해외진출"],
    program: ["수출바우처", "해외진출", "사업화", "수출지원"],
  },
  {
    reason: "물류·운송 지원",
    context: ["물류", "운송", "선적", "창고", "배송"],
    program: ["물류", "운송", "선적", "창고", "배송"],
  },
  {
    reason: "수출금융 지원",
    context: ["금융", "융자", "생산자금", "운전자금", "시설자금", "자금조달"],
    program: ["수출금융", "융자", "정책자금", "금융지원", "운전자금", "시설자금"],
  },
  {
    reason: "법률·지식재산권 지원",
    context: [
      "계약 분쟁",
      "법률",
      "지식재산",
      "지재권",
      "특허",
      "상표",
      "디자인권",
    ],
    program: [
      "법률",
      "법률상담",
      "지식재산",
      "지재권",
      "특허",
      "상표",
      "디자인권",
      "수출계약",
    ],
  },
] as const;

const SIGNAL_WEIGHTS: Record<BizinfoVerdictSignal["source"], number> = {
  action: 4,
  risk: 3,
  summary: 2,
};
const MIN_RELEVANCE_SCORE = 5;
export const BIZINFO_AI_MODEL = "gemini-3.5-flash";

const BIZINFO_AI_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    selections: {
      type: "array",
      maxItems: 15,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          programId: { type: "string" },
          priority: { type: "integer", minimum: 1, maximum: 20 },
          eligibility: {
            type: "string",
            enum: ["likely", "check_required", "ineligible"],
          },
          matchReasons: {
            type: "array",
            maxItems: 2,
            items: { type: "string" },
          },
          signalIds: {
            type: "array",
            maxItems: 2,
            items: { type: "string" },
          },
          programEvidence: {
            type: "array",
            maxItems: 2,
            items: { type: "string" },
          },
          eligibilityNotes: {
            type: "array",
            maxItems: 4,
            items: { type: "string" },
          },
        },
        required: [
          "programId",
          "priority",
          "eligibility",
          "matchReasons",
          "signalIds",
          "programEvidence",
          "eligibilityNotes",
        ],
      },
    },
  },
  required: ["selections"],
} as const;

export async function fetchBizinfoPrograms(
  apiKey: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<BizinfoProgram[]> {
  if (!apiKey.trim()) throw new Error("기업마당 API 인증키가 없습니다");

  const url = new URL(BIZINFO_SUPPORT_API_URL);
  url.search = new URLSearchParams({
    crtfcKey: apiKey,
    dataType: "json",
    searchCnt: "0",
    searchLclasId: "04",
  }).toString();

  const response = await fetcher(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    throw new Error(`기업마당 API 호출 실패 (${response.status})`);
  }

  return parseBizinfoResponse(await response.json());
}

export function parseBizinfoResponse(payload: unknown): BizinfoProgram[] {
  const root = asRecord(payload);
  const jsonArray = root.jsonArray;
  const rows = Array.isArray(jsonArray)
    ? jsonArray
    : asArray(asRecord(jsonArray).item);

  return rows
    .map((value) => normalizeProgram(asRecord(value)))
    .filter((value): value is BizinfoProgram => Boolean(value));
}

export function getBizinfoApplicationStatus(
  applicationPeriod: string,
  today: string,
): BizinfoApplicationStatus {
  const dates = extractDateKeys(applicationPeriod);
  if (dates.length >= 2) {
    if (today < dates[0]) return "upcoming";
    if (today > dates[1]) return "closed";
    return "open";
  }

  if (
    /(예산\s*소진|모집\s*(완료|마감)|선착순|상시|별도\s*공지|접수\s*마감)/.test(
      applicationPeriod,
    )
  ) {
    return "check_required";
  }

  return "check_required";
}

export function selectRelevantBizinfoPrograms(
  programs: BizinfoProgram[],
  context: BizinfoMatchContext,
  today: string,
  limit = 3,
): MatchedBizinfoProgram[] {
  const signals = context.verdictSignals
    .map((signal) => ({
      source: signal.source,
      text: signal.text.trim(),
      normalizedText: normalizeText(signal.text),
    }))
    .filter((signal) => signal.text && signal.normalizedText);
  const activeThemes = SUPPORT_THEMES.map((theme) => ({
    theme,
    evidence: signals.filter((signal) =>
      theme.context.some((keyword) => signal.normalizedText.includes(keyword))
    ),
  })).filter((item) => item.evidence.length > 0);

  if (activeThemes.length === 0) return [];

  return programs
    .map((item) => {
      const applicationStatus = getBizinfoApplicationStatus(
        item.applicationPeriod,
        today,
      );
      if (applicationStatus === "closed" || applicationStatus === "upcoming") {
        return null;
      }
      if (!isOfficialBizinfoUrl(item.detailUrl)) return null;
      if (hasProductRestrictionMismatch(item.summary, context)) return null;

      const title = normalizeText(item.title);
      const programText = normalizeText(
        [item.title, item.summary, item.hashtags].join(" "),
      );
      const matchReasons: string[] = [];
      const verdictEvidence: string[] = [];
      let score = 0;

      for (const activeTheme of activeThemes) {
        const matchedKeywords = activeTheme.theme.program.filter((keyword) =>
          programText.includes(keyword),
        );
        if (matchedKeywords.length === 0) continue;
        matchReasons.push(activeTheme.theme.reason);

        const orderedEvidence = [...activeTheme.evidence].sort(
          (a, b) => SIGNAL_WEIGHTS[b.source] - SIGNAL_WEIGHTS[a.source],
        );
        score += SIGNAL_WEIGHTS[orderedEvidence[0].source];
        if (orderedEvidence.length > 1) score += 1;
        score += matchedKeywords.some((keyword) => title.includes(keyword))
          ? 2
          : 1;
        verdictEvidence.push(...orderedEvidence.map((signal) => signal.text));
      }

      if (matchReasons.length === 0 || score < MIN_RELEVANCE_SCORE) return null;

      const productTokens = tokenize(context.productName);
      if (productTokens.some((token) => programText.includes(token))) score += 1;
      if (context.countryName && programText.includes(context.countryName)) score += 1;

      const eligibilityNotes: string[] = [];
      if (item.target.includes("중소기업")) {
        eligibilityNotes.push("중소기업 해당 여부 확인");
      }
      if (applicationStatus === "check_required") {
        eligibilityNotes.push("예산·접수 마감 여부를 공식 페이지에서 확인");
      }

      return {
        ...item,
        applicationStatus,
        applicationStatusLabel: applicationStatus === "open"
          ? "모집 중"
          : "접수 여부 확인",
        matchReasons: unique(matchReasons),
        verdictEvidence: unique(verdictEvidence).slice(0, 2),
        eligibilityNotes,
        score,
      };
    })
    .filter((item): item is MatchedBizinfoProgram & { score: number } =>
      Boolean(item)
    )
    .sort((a, b) =>
      b.score - a.score ||
      b.updatedAt.localeCompare(a.updatedAt) ||
      a.id.localeCompare(b.id)
    )
    .slice(0, Math.max(0, limit))
    .map(({ score: _score, ...item }) => item);
}

export function buildBizinfoAiSelectionPrompt(
  candidates: MatchedBizinfoProgram[],
  context: BizinfoAiSelectionContext,
): string {
  const signals = context.verdictSignals.map((signal, index) => ({
    id: `S${index + 1}`,
    source: signal.source,
    text: signal.text,
  }));
  const programs = candidates.map((program) => ({
    id: program.id,
    title: program.title,
    ministry: program.ministry,
    agency: program.agency,
    target: program.target,
    summary: program.summary,
    applicationMethod: program.applicationMethod,
    applicationPeriod: program.applicationPeriod,
    hashtags: program.hashtags,
  }));

  return [
    "기업마당 공식 API에서 조회한 후보 중 현재 수출 업무에 실질적으로 도움이 되는 사업만 선택하십시오.",
    "후보에 없는 사업을 생성하지 마십시오. 최대 3개만 선택하며 적합한 사업이 없으면 빈 배열을 반환하십시오.",
    "제품명, HS·HSK 코드, 대상국, 주요 위험, 대응 솔루션, 권장 실행 방향을 모두 비교하십시오.",
    "공고가 특정 업종·제품군·기업 유형으로 신청 대상을 제한하고 현재 제품·업종과 다르면 선택하지 마십시오.",
    "통관·물류·인증처럼 일반적인 단어만 같다는 이유로 업종이 다른 사업을 선택하지 마십시오.",
    "지역 사업은 전국 조회 정책에 따라 제외하지 말고 지역 자격을 eligibilityNotes에 기록하십시오.",
    "programEvidence에는 제공된 공고문에 실제로 존재하는 짧은 원문만 복사하십시오.",
    "signalIds에는 해당 사업과 직접 연결되는 AI 판단 신호 ID만 넣으십시오.",
    "eligibility는 likely, check_required, ineligible 중 하나만 사용하십시오.",
    "",
    "수출 업무 정보:",
    JSON.stringify({
      productName: context.productName,
      productDescription: context.productDescription,
      hsCode: context.hsCode,
      hskCode: context.hskCode,
      countryName: context.countryName,
      industryCode: context.industryCode,
      signals,
    }),
    "",
    "공식 지원사업 후보:",
    JSON.stringify(programs),
  ].join("\n");
}

export async function selectBizinfoProgramsWithAi(
  candidates: MatchedBizinfoProgram[],
  context: BizinfoAiSelectionContext,
  apiKey: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<MatchedBizinfoProgram[]> {
  if (candidates.length === 0) return [];
  if (!apiKey.trim()) throw new Error("GEMINI_API_KEY missing");

  const response = await fetcher(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(BIZINFO_AI_MODEL)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text:
              "공식 기업마당 공고 후보만 심사하는 한국 수출지원사업 분석가입니다. 제공되지 않은 사업이나 사실을 만들지 마십시오.",
          }],
        },
        contents: [{
          role: "user",
          parts: [{
            text: buildBizinfoAiSelectionPrompt(candidates, context),
          }],
        }],
        generationConfig: {
          temperature: 0.1,
          responseFormat: {
            text: {
              mimeType: "application/json",
              schema: BIZINFO_AI_RESPONSE_SCHEMA,
            },
          },
        },
      }),
      signal,
    },
  );

  if (!response.ok) {
    throw new Error(`지원사업 AI 선별 실패 (${response.status})`);
  }

  const payload = asRecord(await response.json());
  const firstCandidate = asRecord(asArray(payload.candidates)[0]);
  const content = asRecord(firstCandidate.content);
  const firstPart = asRecord(asArray(content.parts)[0]);
  const responseText = asText(firstPart.text);
  if (!responseText) throw new Error("지원사업 AI 선별 응답이 비어 있습니다");

  return applyBizinfoAiSelection(candidates, responseText, context);
}

export function applyBizinfoAiSelection(
  candidates: MatchedBizinfoProgram[],
  response: unknown,
  context: BizinfoAiSelectionContext,
  limit = 3,
): MatchedBizinfoProgram[] {
  const parsed = parseAiResponse(response);
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const signalById = new Map(
    context.verdictSignals.map((signal, index) => [`S${index + 1}`, signal.text]),
  );
  const selectedIds = new Set<string>();

  return asArray(asRecord(parsed).selections)
    .map((value, index) => {
      const row = asRecord(value);
      const priority = Number(row.priority);
      return {
        row,
        priority: Number.isFinite(priority) ? priority : index + 1,
      };
    })
    .sort((a, b) => a.priority - b.priority)
    .map(({ row }) => {
      const programId = asText(row.programId);
      const candidate = candidateById.get(programId);
      const eligibility = asText(row.eligibility);
      if (
        !candidate ||
        selectedIds.has(programId) ||
        (eligibility !== "likely" && eligibility !== "check_required")
      ) {
        return null;
      }

      const verdictEvidence = unique(
        asArray(row.signalIds)
          .map(asText)
          .map((signalId) => signalById.get(signalId) ?? "")
          .filter(Boolean),
      ).slice(0, 2);
      if (verdictEvidence.length === 0) return null;

      const officialText = normalizeText([
        candidate.title,
        candidate.target,
        candidate.summary,
        candidate.applicationMethod,
        candidate.hashtags,
      ].join(" "));
      const programEvidence = unique(
        asArray(row.programEvidence)
          .map(asText)
          .filter((evidence) => {
            const normalizedEvidence = normalizeText(evidence);
            return normalizedEvidence.length >= 4 &&
              officialText.includes(normalizedEvidence);
          }),
      ).slice(0, 2);
      if (programEvidence.length === 0) return null;

      const matchReasons = unique(
        asArray(row.matchReasons)
          .map(asText)
          .filter(Boolean)
          .map((reason) => reason.slice(0, 120)),
      ).slice(0, 2);
      if (matchReasons.length === 0) return null;

      selectedIds.add(programId);
      return {
        ...candidate,
        matchReasons,
        verdictEvidence,
        programEvidence,
        aiEligibility: eligibility,
        eligibilityNotes: unique([
          ...candidate.eligibilityNotes,
          ...asArray(row.eligibilityNotes)
            .map(asText)
            .filter(Boolean)
            .map((note) => note.slice(0, 160)),
        ]).slice(0, 4),
      } satisfies MatchedBizinfoProgram;
    })
    .filter((item): item is MatchedBizinfoProgram => Boolean(item))
    .slice(0, Math.max(0, limit));
}

function normalizeProgram(row: RawRecord): BizinfoProgram | null {
  const id = asText(row.pblancId ?? row.seq);
  const title = stripHtml(asText(row.pblancNm ?? row.title));
  const detailUrl = asText(row.pblancUrl ?? row.link);
  if (!id || !title || !detailUrl) return null;

  return {
    id,
    title,
    ministry: stripHtml(asText(row.jrsdInsttNm ?? row.author)),
    agency: stripHtml(asText(row.excInsttNm)),
    category: stripHtml(asText(row.pldirSportRealmLclasCodeNm ?? row.lcategory)),
    target: stripHtml(asText(row.trgetNm)),
    summary: stripHtml(asText(row.bsnsSumryCn ?? row.description)),
    applicationMethod: stripHtml(asText(row.reqstMthPapersCn)),
    applicationUrl: asText(row.rceptEngnHmpgUrl),
    detailUrl,
    applicationPeriod: stripHtml(asText(row.reqstBeginEndDe ?? row.reqstDt)),
    updatedAt: asText(row.updtPnttm ?? row.pubDate),
    hashtags: stripHtml(asText(row.hashtags ?? row.hashTags)),
  };
}

function parseAiResponse(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(
      value
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim(),
    );
  } catch {
    return {};
  }
}

function hasProductRestrictionMismatch(
  summary: string,
  context: BizinfoMatchContext,
): boolean {
  const normalizedSummary = normalizeText(summary);
  const productContext = normalizeText(
    [context.productName, context.industryCode ?? ""].join(" "),
  );
  const restrictionPatterns = [
    /([가-힣a-z0-9\s,ㆍ·/]+?)을\s*수출\s*희망하는\s*기업/i,
    /([가-힣a-z0-9\s,ㆍ·/]+?)분야의?\s*(?:중소)?기업/i,
  ];

  for (const pattern of restrictionPatterns) {
    const match = normalizedSummary.match(pattern);
    if (!match?.[1]) continue;
    const restrictedProducts = match[1]
      .split(/,|ㆍ|·|\/|\s및\s/)
      .map((value) =>
        value
          .replace(/(?:국내\s*소재|중소기업|기업|제품|품목|관련|수출|희망|대상)/g, "")
          .trim()
      )
      .filter((value) => value.length >= 2)
      .slice(-12);

    if (
      restrictedProducts.length >= 2 &&
      !restrictedProducts.some((product) =>
        productContext.includes(product) || product.includes(productContext)
      )
    ) {
      return true;
    }
  }

  return false;
}

function extractDateKeys(value: string): string[] {
  const separated = Array.from(
    value.matchAll(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/g),
  ).map((match) =>
    `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`
  );
  if (separated.length > 0) return separated;

  return Array.from(value.matchAll(/\b(\d{4})(\d{2})(\d{2})\b/g)).map(
    (match) => `${match[1]}-${match[2]}-${match[3]}`,
  );
}

function stripHtml(value: string): string {
  return normalizeText(
    value
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, " ")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code))),
  );
}

function isOfficialBizinfoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "bizinfo.go.kr" || url.hostname.endsWith(".bizinfo.go.kr"));
  } catch {
    return false;
  }
}

function tokenize(value: string): string[] {
  return unique(
    normalizeText(value)
      .split(/[^가-힣a-z0-9]+/i)
      .filter((token) => token.length >= 2),
  );
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function asRecord(value: unknown): RawRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as RawRecord
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function asText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
