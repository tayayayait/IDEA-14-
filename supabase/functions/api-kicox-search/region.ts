const REGION_SYNONYM_GROUPS = [
  ["서울특별시", "서울"],
  ["부산광역시", "부산"],
  ["대구광역시", "대구"],
  ["인천광역시", "인천"],
  ["광주광역시", "광주"],
  ["대전광역시", "대전"],
  ["울산광역시", "울산"],
  ["세종특별자치시", "세종"],
  ["경기도", "경기"],
  ["강원특별자치도", "강원도", "강원"],
  ["충청북도", "충북"],
  ["충청남도", "충남"],
  ["전북특별자치도", "전라북도", "전북"],
  ["전라남도", "전남"],
  ["경상북도", "경북"],
  ["경상남도", "경남"],
  ["제주특별자치도", "제주도", "제주"],
] as const;

const NORMALIZED_REGION_GROUPS = REGION_SYNONYM_GROUPS.map((group) =>
  group.map((value) => normalizeRegionToken(value)),
);

const NORMALIZED_TO_PREFERRED_REGION = new Map<string, string>();
for (let i = 0; i < REGION_SYNONYM_GROUPS.length; i += 1) {
  const preferredRegion = REGION_SYNONYM_GROUPS[i][0];
  for (const token of NORMALIZED_REGION_GROUPS[i]) {
    NORMALIZED_TO_PREFERRED_REGION.set(token, preferredRegion);
  }
}

export function toApiRegionParam(region: string): string {
  const normalized = normalizeRegionToken(region);
  if (!normalized) return "";
  return NORMALIZED_TO_PREFERRED_REGION.get(normalized) ?? region.trim();
}

export function getRegionSearchTokens(region: string): string[] {
  const normalized = normalizeRegionToken(region);
  if (!normalized) return [];

  for (const group of NORMALIZED_REGION_GROUPS) {
    if (group.includes(normalized)) {
      return group;
    }
  }

  return [normalized];
}

export function matchesRegionFilter(region: string, address: string, itemRegion: string): boolean {
  const tokens = getRegionSearchTokens(region);
  if (tokens.length === 0) return true;

  const normalizedAddress = normalizeRegionToken(address);
  const normalizedItemRegion = normalizeRegionToken(itemRegion);

  return tokens.some((token) => normalizedAddress.includes(token) || normalizedItemRegion.includes(token));
}

function normalizeRegionToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}
