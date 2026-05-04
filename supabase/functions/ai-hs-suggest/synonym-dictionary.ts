/**
 * 유의어 사전 모듈 (Synonym Dictionary)
 *
 * 일상 용어 ↔ 관세청 공식 용어 간 불일치를 해소하고,
 * 동음이의어(시트=seat vs sheet 등)를 컨텍스트 기반으로 구분합니다.
 */

export type SynonymEntry = {
  /** 고유 식별자 */
  id: string;
  /** 관세청 표준 용어 (검색 시 확장 기준) */
  canonical: string;
  /** 이 의미를 나타내는 모든 동의어/유의어 */
  synonyms: string[];
  /** 이 의미가 맞을 때 자주 동반되는 컨텍스트 키워드 */
  context: string[];
  /** 이 컨텍스트가 있으면 이 의미가 아님 (감점 대상) */
  antiContext: string[];
};

const SYNONYM_ENTRIES: SynonymEntry[] = [
  // ────────────── 좌석 / 시트 ──────────────
  {
    id: "seat",
    canonical: "의자",
    synonyms: ["시트", "좌석", "의자", "seat", "seats", "시트백", "헤드레스트"],
    context: ["자동차", "차량", "승용", "항공", "비행기", "vehicle", "motor", "aircraft", "automotive", "car"],
    antiContext: ["변기", "화장실", "lavatory", "toilet", "고무", "rubber", "smoked", "sheet", "판", "필름", "film", "시트르산", "citric", "시트러스", "citrus"],
  },
  {
    id: "sheet-material",
    canonical: "판",
    synonyms: ["시트", "판", "sheet", "sheets", "박", "필름"],
    context: ["고무", "플라스틱", "rubber", "plastic", "금속", "metal", "종이", "paper", "smoked"],
    antiContext: ["좌석", "의자", "자동차", "차량", "seat", "vehicle", "automotive"],
  },

  // ────────────── 체결 부품 ──────────────
  {
    id: "bolt-fastener",
    canonical: "볼트",
    synonyms: ["볼트", "나사못", "bolt", "bolts"],
    context: ["체결", "너트", "nut", "fastener", "조임", "나사"],
    antiContext: ["전기", "electric", "번개", "lightning"],
  },
  {
    id: "nut-fastener",
    canonical: "너트",
    synonyms: ["너트", "nut", "nuts", "나사너트"],
    context: ["체결", "볼트", "bolt", "fastener", "조임"],
    antiContext: ["식품", "food", "견과", "땅콩", "peanut", "아몬드", "almond", "호두", "walnut"],
  },

  // ────────────── 밸브류 ──────────────
  {
    id: "valve",
    canonical: "밸브",
    synonyms: ["밸브", "벨브", "콕", "valve", "valves", "코크", "꼭지"],
    context: ["배관", "유체", "유압", "공압", "pipe", "fluid", "hydraulic", "pneumatic"],
    antiContext: [],
  },

  // ────────────── 배관류 ──────────────
  {
    id: "pipe",
    canonical: "관",
    synonyms: ["파이프", "관", "배관", "pipe", "pipes", "튜브", "tube", "tubes"],
    context: ["배관", "유체", "수도", "가스", "plumbing", "fluid"],
    antiContext: ["담배", "tobacco", "오르간", "organ", "악기"],
  },
  {
    id: "hose",
    canonical: "호스",
    synonyms: ["호스", "hose", "hoses", "유연관"],
    context: ["고무", "유압", "rubber", "hydraulic", "flexible"],
    antiContext: ["양말", "스타킹", "hosiery"],
  },

  // ────────────── 전자 부품 ──────────────
  {
    id: "board-pcb",
    canonical: "인쇄회로",
    synonyms: ["기판", "보드", "PCB", "board", "인쇄회로", "회로기판", "circuit board"],
    context: ["전자", "반도체", "electronic", "semiconductor", "회로", "circuit"],
    antiContext: ["나무", "wood", "목재", "합판", "plywood", "칠판", "blackboard"],
  },
  {
    id: "sensor",
    canonical: "센서",
    synonyms: ["센서", "감지기", "sensor", "sensors", "검출기", "detector"],
    context: ["전자", "계측", "electronic", "measurement"],
    antiContext: [],
  },

  // ────────────── 기계류 ──────────────
  {
    id: "motor",
    canonical: "전동기",
    synonyms: ["모터", "전동기", "motor", "motors", "전기모터"],
    context: ["전기", "electric", "구동", "drive", "회전"],
    antiContext: ["오토바이", "motorcycle", "보트", "motorboat"],
  },
  {
    id: "pump",
    canonical: "펌프",
    synonyms: ["펌프", "뻠프", "pump", "pumps"],
    context: ["유체", "fluid", "유압", "hydraulic", "양수", "급수"],
    antiContext: ["신발", "shoes", "구두"],
  },
  {
    id: "bearing",
    canonical: "베어링",
    synonyms: ["베어링", "bearing", "bearings", "축받이"],
    context: ["기계", "회전", "축", "mechanical", "rotating", "shaft"],
    antiContext: [],
  },
  {
    id: "gear",
    canonical: "기어",
    synonyms: ["기어", "톱니바퀴", "gear", "gears", "치차"],
    context: ["기계", "변속", "감속", "mechanical", "transmission"],
    antiContext: ["장비", "equipment", "의류", "clothing"],
  },

  // ────────────── 용기류 ──────────────
  {
    id: "tank-container",
    canonical: "탱크",
    synonyms: ["탱크", "저장조", "tank", "tanks"],
    context: ["저장", "용기", "storage", "container", "유체", "액체"],
    antiContext: ["군사", "military", "전차", "armored"],
  },
  {
    id: "container",
    canonical: "용기",
    synonyms: ["컨테이너", "용기", "container", "containers"],
    context: ["포장", "수송", "저장", "packaging", "transport", "storage"],
    antiContext: [],
  },

  // ────────────── 차량류 ──────────────
  {
    id: "truck",
    canonical: "화물자동차",
    synonyms: ["트럭", "화물차", "화물자동차", "truck", "trucks", "lorry"],
    context: ["운송", "화물", "transport", "freight", "cargo"],
    antiContext: [],
  },

  // ────────────── 조명류 ──────────────
  {
    id: "led",
    canonical: "발광다이오드",
    synonyms: ["LED", "led", "엘이디", "발광다이오드"],
    context: ["조명", "lighting", "디스플레이", "display", "전자", "electronic"],
    antiContext: [],
  },

  // ────────────── 필터류 ──────────────
  {
    id: "filter",
    canonical: "여과기",
    synonyms: ["필터", "여과기", "filter", "filters", "거름장치"],
    context: ["공기", "오일", "air", "oil", "정수", "water"],
    antiContext: ["담배", "cigarette"],
  },

  // ────────────── 케이블/전선류 ──────────────
  {
    id: "cable-wire",
    canonical: "전선",
    synonyms: ["케이블", "전선", "cable", "cables", "wire", "wires", "배선"],
    context: ["전기", "electric", "통신", "communication"],
    antiContext: ["케이블카", "ropeway"],
  },

  // ────────────── 스프링류 ──────────────
  {
    id: "spring",
    canonical: "스프링",
    synonyms: ["스프링", "용수철", "spring", "springs"],
    context: ["기계", "탄성", "mechanical", "elastic", "완충"],
    antiContext: ["봄", "계절", "season", "온천", "hot spring"],
  },

  // ────────────── 커넥터류 ──────────────
  {
    id: "connector",
    canonical: "커넥터",
    synonyms: ["커넥터", "접속자", "connector", "connectors", "단자"],
    context: ["전기", "전자", "electric", "electronic", "배선"],
    antiContext: [],
  },

  // ────────────── 렌즈류 ──────────────
  {
    id: "lens",
    canonical: "렌즈",
    synonyms: ["렌즈", "lens", "lenses", "렌스"],
    context: ["광학", "카메라", "optical", "camera"],
    antiContext: ["콘택트", "contact", "안경"],
  },
];

/**
 * 수집된 토큰을 유의어 사전으로 확장합니다.
 *
 * 입력 컨텍스트를 활용하여 동음이의어를 구분하고,
 * 매칭된 유의어 그룹의 모든 동의어를 추가 토큰으로 반환합니다.
 */
export function expandWithSynonyms(
  tokens: ReadonlyMap<string, number>,
  inputContext: string,
): Map<string, number> {
  const expanded = new Map<string, number>();
  const normalizedContext = inputContext.toLowerCase();

  for (const [token, weight] of tokens) {
    const normalizedToken = token.toLowerCase();
    const matched = findMatchingEntries(normalizedToken, normalizedContext);

    for (const entry of matched) {
      for (const synonym of entry.synonyms) {
        const normalizedSynonym = synonym.toLowerCase();
        if (normalizedSynonym === normalizedToken) continue;
        if (tokens.has(normalizedSynonym)) continue;

        const prev = expanded.get(normalizedSynonym) ?? 0;
        expanded.set(normalizedSynonym, Math.max(prev, weight * 0.85));
      }
      // 관세청 표준 용어(canonical)도 추가
      const canonicalLower = entry.canonical.toLowerCase();
      if (canonicalLower !== normalizedToken && !tokens.has(canonicalLower)) {
        const prev = expanded.get(canonicalLower) ?? 0;
        expanded.set(canonicalLower, Math.max(prev, weight * 0.9));
      }
    }
  }

  return expanded;
}

/**
 * 카탈로그 행이 특정 토큰에 대해 동음이의어 감점 대상인지 판별합니다.
 *
 * 입력 컨텍스트와 카탈로그 행의 텍스트를 비교하여,
 * antiContext에 해당하는 행에 감점을 적용합니다.
 */
export function computeDisambiguationPenalty(
  rowSearchText: string,
  inputContext: string,
  matchedTokens: string[],
): number {
  const normalizedContext = inputContext.toLowerCase();
  const normalizedRow = rowSearchText.toLowerCase();
  let totalPenalty = 0;

  for (const token of matchedTokens) {
    const normalizedToken = token.toLowerCase();
    const entries = findAllEntriesForToken(normalizedToken);
    if (entries.length < 2) continue; // 동음이의어가 아님

    // 입력 컨텍스트에 가장 잘 맞는 엔트리 찾기
    const bestEntry = pickBestEntry(entries, normalizedContext);
    if (!bestEntry) continue;

    // 카탈로그 행이 best entry의 antiContext에 해당하면 감점
    const antiHits = bestEntry.antiContext.filter(
      (anti) => normalizedRow.includes(anti.toLowerCase()),
    );
    if (antiHits.length > 0) {
      totalPenalty += Math.min(24, antiHits.length * 12);
    }

    // 카탈로그 행이 다른 동음이의어 엔트리의 context에만 매칭되면 추가 감점
    const otherEntries = entries.filter((e) => e.id !== bestEntry.id);
    for (const other of otherEntries) {
      const otherContextHits = other.context.filter(
        (ctx) => normalizedRow.includes(ctx.toLowerCase()),
      );
      const bestContextHits = bestEntry.context.filter(
        (ctx) => normalizedRow.includes(ctx.toLowerCase()),
      );
      if (otherContextHits.length > 0 && bestContextHits.length === 0) {
        totalPenalty += 8;
      }
    }
  }

  return totalPenalty;
}

/**
 * 주어진 토큰과 컨텍스트에 맞는 유의어 엔트리를 찾습니다.
 */
function findMatchingEntries(normalizedToken: string, normalizedContext: string): SynonymEntry[] {
  const candidates = findAllEntriesForToken(normalizedToken);
  if (candidates.length === 0) return [];
  if (candidates.length === 1) return candidates;

  // 동음이의어: 컨텍스트로 가장 적합한 것 선택
  const best = pickBestEntry(candidates, normalizedContext);
  return best ? [best] : candidates.slice(0, 1);
}

/**
 * 토큰이 포함된 모든 유의어 엔트리를 반환합니다.
 */
function findAllEntriesForToken(normalizedToken: string): SynonymEntry[] {
  return SYNONYM_ENTRIES.filter((entry) =>
    entry.synonyms.some((syn) => syn.toLowerCase() === normalizedToken),
  );
}

/**
 * 컨텍스트 점수가 가장 높은 엔트리를 선택합니다.
 */
function pickBestEntry(entries: SynonymEntry[], normalizedContext: string): SynonymEntry | null {
  if (entries.length === 0) return null;

  let bestEntry: SynonymEntry | null = null;
  let bestScore = -Infinity;

  for (const entry of entries) {
    let score = 0;
    for (const ctx of entry.context) {
      if (normalizedContext.includes(ctx.toLowerCase())) score += 2;
    }
    for (const anti of entry.antiContext) {
      if (normalizedContext.includes(anti.toLowerCase())) score -= 3;
    }
    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  }

  return bestEntry;
}

export { SYNONYM_ENTRIES };
