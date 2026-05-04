export interface TradeOfficeSummaryInput {
  title?: string | null;
  officeName?: string | null;
  office_name?: string | null;
  summary?: string | null;
  summarySource?: string | null;
  summary_source?: string | null;
  officeAddress?: string | null;
  office_address?: string | null;
  airportRouteText?: string | null;
  airport_route_text?: string | null;
}

export function buildTradeOfficeSummary(input: TradeOfficeSummaryInput): string {
  const officeName = normalizeOfficeName(input.officeName ?? input.office_name ?? input.title);
  const officeAddress = normalizeTradeOfficeText(input.officeAddress ?? input.office_address ?? "");
  const airportRouteText = normalizeTradeOfficeText(input.airportRouteText ?? input.airport_route_text ?? "");
  const summary = normalizeTradeOfficeText(input.summary ?? "");
  const summarySource = normalizeTradeOfficeText(input.summarySource ?? input.summary_source ?? "").toLowerCase();
  if (summarySource === "ai" && summary) {
    const aiSummary = sanitizeAiTradeOfficeSummary(summary);
    if (aiSummary) return aiSummary;
  }

  const body = normalizeTradeOfficeText([officeAddress, airportRouteText, summary].filter(Boolean).join(" "));

  const address = extractAddress({ officeName, officeAddress, summary, body });
  const airportSentence = buildAirportSentence(airportRouteText || summary || body, {
    preferOriginal: Boolean(airportRouteText && airportRouteText.length > 120),
  });

  return composeRuleTradeOfficeSummary({ officeName, address, airportSentence });
}

function composeRuleTradeOfficeSummary({
  officeName,
  address,
  airportSentence,
}: {
  officeName: string;
  address: string;
  airportSentence: string;
}): string {
  const sentences: string[] = [];
  const route = normalizeTradeOfficeText(airportSentence);
  if (address) sentences.push(`${officeName}은 ${address}에 있습니다.`);
  if (route && route !== "공항 이동 정보 없음.") {
    sentences.push(address ? route : addOfficeContextToRouteSentence(officeName, route));
  } else if (address) {
    sentences.push("공항 이동 정보 없음.");
  }

  return sentences.join(" ") || `${officeName} 방문 안내 정보 없음.`;
}

function addOfficeContextToRouteSentence(officeName: string, sentence: string): string {
  const text = sentence.trim();
  if (text.startsWith("공항 이동 안내:")) return `${officeName} ${text}`;
  if (text.startsWith("공항 접근") || text.startsWith("이동수단")) return `${officeName}의 ${text}`;
  return `${officeName} ${text}`;
}

function sanitizeAiTradeOfficeSummary(value: string): string {
  const text = cleanContactFields(value)
    .replace(/^Trade office contact\s*:\s*/i, "")
    .replace(/^무역관\s*연락\s*:\s*/i, "")
    .replace(/^현지\s*지원\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return removeTrailingIncompleteSentence(text);
}

function normalizeOfficeName(value: string | null | undefined): string {
  const text = normalizeTradeOfficeText(value ?? "")
    .replace(/^Trade office contact\s*:\s*/i, "")
    .replace(/^무역관\s*연락\s*:\s*/i, "")
    .replace(/^현지\s*지원\s*:\s*/i, "")
    .replace(/^KOTRA\s*/i, "")
    .trim();
  return stripTrailingPunctuation(text) || "무역관";
}

function extractAddress({
  officeName,
  officeAddress,
  summary,
  body,
}: {
  officeName: string;
  officeAddress: string;
  summary: string;
  body: string;
}): string {
  const candidates = [
    extractLabeledSection(officeAddress, ["무역관주소", "주소", "위치"]),
    extractLabeledSection(summary, ["무역관주소", "주소", "위치"]),
    extractLabeledSection(body, ["무역관주소", "주소", "위치"]),
    officeAddress,
    extractBeforeAirportSection(summary),
    extractBeforeAirportSection(body),
  ];

  for (const candidate of candidates) {
    const cleaned = cleanAddress(candidate, officeName);
    if (cleaned) return cleaned;
  }
  return "";
}

function cleanAddress(value: string, officeName: string): string {
  let text = normalizeTradeOfficeText(value);
  if (!text) return "";
  if (/위치\s*정보\s*없음|위치정보\s*없음/i.test(text)) return "";

  text = text
    .replace(/^Trade office contact\s*:\s*/i, "")
    .replace(new RegExp(`^(?:${escapeRegExp(officeName)}\\s*[:：-]\\s*)+`, "i"), "")
    .replace(/^(?:ㅇ\s*)?(?:무역관명|무역관주소|주소|위치)\s*[:：-]\s*/i, "")
    .replace(/\s+(?:ㅇ\s*)?(?:전화번호|전화|FAX|팩스|이메일|홈페이지|웹사이트|URL)\s*[:：].*$/i, "")
    .replace(/\s*(?:공항\s*접근|공항무역관이동|공항\s*무역관\s*이동)\s*[:：].*$/i, "")
    .replace(/\s*https?:\/\/\S+/gi, "")
    .replace(/\s*에\s+(?:있습니다|위치합니다)$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  text = removeRepeatedPrefix(text, officeName);
  return stripTrailingPunctuation(text);
}

function buildAirportSentence(value: string, options: { preferOriginal?: boolean } = {}): string {
  const text = normalizeTradeOfficeText(value);
  if (!text) return "공항 이동 정보 없음.";
  if (options.preferOriginal) {
    const fallback = buildRouteFallbackSentence(text);
    if (fallback) return fallback;
  }

  const distance = normalizeMeasure(extractFirst(text, /(?:약\s*)?\d+(?:\.\d+)?\s*(?:km|킬로미터|마일)/i));
  const duration = normalizeMeasure(extractFirst(text, /(?:약|대략)?\s*\d+\s*시간(?:\s*\d+\s*분)?|(?:약|대략)?\s*\d+\s*분(?:\s*내외)?/));
  const airportName = extractAirportName(text);
  const modes = extractTransportModes(text);
  const priceHints = extractPriceHints(text);
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

  const transportSentence = buildTransportSentence(modes, priceHints, hasLaxIt);
  if (transportSentence) sentences.push(transportSentence);
  if (hasVisitNotice) sentences.push("방문 전 일정 확인이 권장됩니다.");

  return sentences.join(" ") || "공항 이동 정보 없음.";
}

function buildRouteFallbackSentence(value: string): string {
  const text = stripTrailingPunctuation(cleanRouteText(value));
  if (!text) return "";
  return `공항 이동 안내: ${text}.`;
}

function cleanRouteText(value: string): string {
  return cleanContactFields(value)
    .replace(/방문\s*전\s*(?:이메일|유선|전화)[^.。]*(?:협의|권장)[^.。]*(?:[.。]|$)/g, "방문 전 일정 확인이 권장됩니다.")
    .replace(/^(?:ㅇ\s*)?(?:공항무역관이동|공항\s*무역관\s*이동|공항\s*접근)\s*[:：]\s*/i, "")
    .replace(/\s*ㅇ\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanContactFields(value: string): string {
  return normalizeTradeOfficeText(value)
    .replace(/\s*(?:전화번호|전화|FAX|팩스|이메일|홈페이지|웹사이트|URL)\s*[:：]\s*[^.。]*(?:[.。]|$)/gi, " ")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMeasure(value: string): string {
  const text = stripTrailingPunctuation(normalizeTradeOfficeText(value));
  if (!text) return "";
  return /^(약|대략)\s*/.test(text) ? text : `약 ${text}`;
}

function extractAirportName(value: string): string {
  const patterns = [
    /(?:나리타|하네다|成田|羽田)\s*(?:국제)?공항/i,
    /\b(?:JFK|LAX)\s*(?:국제)?공항/i,
    /(?:LA|로스앤젤레스|베이징|광저우|푸동|푸둥|홍차오|수완나품|창이|히드로|샤를드골)\s*(?:국제)?공항/i,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern)?.[0];
    if (match) return normalizeTradeOfficeText(match);
  }
  return "";
}

function extractTransportModes(value: string): string[] {
  const modes: string[] = [];
  const add = (mode: string) => {
    if (!modes.includes(mode)) modes.push(mode);
  };

  const moveSection = extractLabeledSection(value, ["이동수단"]);
  const source = moveSection || value;
  if (/택시|Yellow Cab|콜택시/i.test(source)) add("택시");
  if (/Uber|Lyft|라이드셰어/i.test(source)) add("Uber/Lyft");
  if (/셔틀버스|Express Bus/i.test(source)) add("공항 셔틀");
  if (/Air\s*Train|AirTrain|지하철|Metro/i.test(source)) add("AirTrain/지하철");
  if (/렌트카|렌터카|프리웨이|405번|10번/.test(source)) add("렌터카");
  if (/공항버스|버스/.test(source) && !modes.includes("공항 셔틀")) add("버스");
  return modes.slice(0, 4);
}

function buildTransportSentence(modes: string[], priceHints: string[], hasLaxIt: boolean): string {
  if (modes.length === 0 && priceHints.length === 0 && !hasLaxIt) return "";

  let sentence = modes.length > 0 ? `이동수단은 ${formatList(modes)}` : "비용 단서가 있습니다";
  const details: string[] = [];
  if (priceHints.length > 0) details.push(`비용 단서는 ${formatList(priceHints)}입니다`);
  if (hasLaxIt) details.push("LAX-it 이동 안내가 있습니다");

  if (details.length === 0) return `${sentence}입니다.`;
  if (modes.length === 0) return `${formatList(details)}.`;
  sentence += `이며 ${formatList(details)}.`;
  return sentence;
}

function extractPriceHints(value: string): string[] {
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

function extractLabeledSection(value: string, labels: string[]): string {
  const text = normalizeTradeOfficeText(value);
  for (const label of labels) {
    const match = new RegExp(`(?:^|\\s)(?:ㅇ\\s*)?${escapeRegExp(label)}\\s*[:：]\\s*`, "i").exec(text);
    if (!match || match.index == null) continue;
    const start = match.index + match[0].length;
    const rest = text.slice(start);
    const next = rest.search(
      /\s+ㅇ\s+|\s+(?:무역관명|무역관주소|공항무역관이동|공항\s*무역관\s*이동|공항\s*접근|주소|위치|전화번호|전화|FAX|팩스|이메일|홈페이지|웹사이트|URL|이동수단)\s*[:：]/i,
    );
    return next >= 0 ? rest.slice(0, next) : rest;
  }
  return "";
}

function extractBeforeAirportSection(value: string): string {
  const text = normalizeTradeOfficeText(value);
  const airportIndex = text.search(/(?:공항\s*접근|공항무역관이동|공항\s*무역관\s*이동)\s*[:：]/i);
  return airportIndex >= 0 ? text.slice(0, airportIndex) : "";
}

function extractFirst(value: string, pattern: RegExp): string {
  return normalizeTradeOfficeText(value.match(pattern)?.[0] ?? "");
}

function normalizeTradeOfficeText(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\bwww\.\S+/gi, "")
    .replace(/\s*\/\s*원문 링크 없음\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function removeRepeatedPrefix(value: string, prefix: string): string {
  let out = value.trim();
  const pattern = new RegExp(`^(?:${escapeRegExp(prefix)}\\s*[:：-]\\s*)+`, "i");
  while (pattern.test(out)) {
    out = out.replace(pattern, "").trim();
  }
  return out;
}

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[.。]+$/g, "").trim();
}

function removeTrailingIncompleteSentence(value: string): string {
  const text = normalizeTradeOfficeText(value);
  if (!/(?:\.\.\.|…)$/.test(text)) return text;

  const withoutEllipsis = text.replace(/\s*(?:\.\.\.|…)$/, "").trim();
  const boundary = findLastSentenceBoundary(withoutEllipsis);
  return boundary >= 0 ? withoutEllipsis.slice(0, boundary + 1).trim() : "";
}

function findLastSentenceBoundary(value: string): number {
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

function formatList(values: string[]): string {
  return values.join(", ");
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
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

  return String(value ?? "").replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entityRaw: string) => {
    const entity = entityRaw.toLowerCase();
    if (entity.startsWith("#x")) {
      const codePoint = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (entity.startsWith("#")) {
      const codePoint = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return named[entity] ?? match;
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
