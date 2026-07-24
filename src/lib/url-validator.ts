/**
 * 외부 URL 유효성 검증 및 보정 유틸리티
 */

/**
 * 올바른 외부 HTTP/HTTPS URL인지 검증합니다.
 * 'N/A', 'none', 'undefined', 상대 경로, 빈 값 등은 false로 판단합니다.
 */
export function isValidExternalUrl(url?: string | null): boolean {
  if (!url || typeof url !== "string") return false;

  const trimmed = url.trim().toLowerCase();
  if (
    !trimmed ||
    trimmed === "n/a" ||
    trimmed === "none" ||
    trimmed === "undefined" ||
    trimmed === "null" ||
    trimmed === "#"
  ) {
    return false;
  }

  try {
    const parsed = new URL(normalizeExternalUrl(url) || "");
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * 외부 URL을 보정합니다.
 * 'www.example.com' 형태는 'https://www.example.com'으로 변경합니다.
 * 유효하지 않거나 'N/A'인 경우 null을 반환합니다.
 */
export function normalizeExternalUrl(url?: string | null): string | null {
  if (!url || typeof url !== "string") return null;

  let trimmed = url.trim();
  const lower = trimmed.toLowerCase();

  if (
    !lower ||
    lower === "n/a" ||
    lower === "none" ||
    lower === "undefined" ||
    lower === "null" ||
    lower === "#"
  ) {
    return null;
  }

  // 프로토콜이 없는데 www. 등으로 시작하는 경우 https:// 보정
  if (!/^https?:\/\//i.test(trimmed)) {
    // 만약 상대경로나 일반 텍스트인 경우 (예: 'countries/N/A', 'N/A')
    if (trimmed.includes("/") && !trimmed.includes(".")) {
      return null;
    }
    trimmed = `https://${trimmed}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      // 호스트명에 도트(.)가 없으면 유효한 FQDN/도메인이 아닐 가능성이 높음 (예: https://n/a)
      if (!parsed.hostname.includes(".")) {
        return null;
      }
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 기관명 또는 출처 이름을 기반으로 기본 공식 웹사이트 URL을 반환합니다.
 */
export function resolveFallbackSourceUrl(sourceName?: string | null, rawUrl?: string | null): string | null {
  const norm = normalizeExternalUrl(rawUrl);
  if (norm) return norm;

  if (!sourceName || typeof sourceName !== "string") return null;

  const s = sourceName.toLowerCase().trim();

  if (s.includes("nhtsa") || s.includes("도로교통안전국")) return "https://www.nhtsa.gov";
  if (s.includes("usitc") || s.includes("국제무역위원회")) return "https://www.usitc.gov";
  if (s.includes("cbp") || s.includes("관세국경보호청")) return "https://www.cbp.gov";
  if (s.includes("ustr") || s.includes("무역대표부")) return "https://ustr.gov";
  if (s.includes("dot") || s.includes("교통부")) return "https://www.transportation.gov";
  if (s.includes("commerce") || s.includes("상무부")) return "https://www.commerce.gov";
  if (s.includes("kotra") || s.includes("코트라") || s.includes("program evidence")) return "https://dream.kotra.or.kr";
  if (s.includes("ksure") || s.includes("무역보험공사")) return "https://www.ksure.or.kr";
  if (s.includes("kicox") || s.includes("산업단지공단")) return "https://www.kicox.or.kr";

  return null;
}

