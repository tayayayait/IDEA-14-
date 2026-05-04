export type SafetySearchBasis = {
  basisLabel: string;
  confidenceLabel: "높음" | "보통" | "낮음" | "확실한 정보 없음";
  confidenceDetail: string;
  badgeLabel: string;
  recommendation: string;
};

export type SafetySearchLike = {
  productName?: string;
  modelName?: string;
  brandName?: string;
  certNum?: string;
  barcodeNum?: string;
};

export const SAFETY_RESULT_DISPLAY_LIMIT = 10;

export function getSafetySearchBasis(search: SafetySearchLike | null | undefined): SafetySearchBasis {
  const certNum = normalizeText(search?.certNum);
  if (certNum) {
    return {
      basisLabel: "KC 인증번호 기준",
      confidenceLabel: "높음",
      confidenceDetail: "인증번호가 있으면 동일 인증 기록 확인에 가장 유리합니다.",
      badgeLabel: "KC번호 일치",
      recommendation: "인증 상세와 최신 인증상태를 확인하세요.",
    };
  }

  const barcodeNum = normalizeText(search?.barcodeNum);
  if (barcodeNum) {
    return {
      basisLabel: "바코드 기준",
      confidenceLabel: "높음",
      confidenceDetail: "바코드는 리콜 대상 식별 정확도를 높입니다.",
      badgeLabel: "바코드 일치",
      recommendation: "리콜 모델·로트와 바코드 일치 여부를 확인하세요.",
    };
  }

  const modelName = normalizeText(search?.modelName);
  if (modelName) {
    return {
      basisLabel: "모델명 기준",
      confidenceLabel: "높음",
      confidenceDetail: "모델명 기준 후보입니다. 브랜드나 KC번호가 있으면 추가 확인이 가능합니다.",
      badgeLabel: "모델명 일치",
      recommendation: "표시된 후보의 모델명·파생모델명을 실제 판매 모델과 대조하세요.",
    };
  }

  const brandName = normalizeText(search?.brandName);
  if (brandName) {
    return {
      basisLabel: "브랜드 기준",
      confidenceLabel: "보통",
      confidenceDetail: "브랜드만으로는 동일 제품 확정이 어렵습니다.",
      badgeLabel: "브랜드 보조 일치",
      recommendation: "모델명, KC 인증번호, 바코드를 추가해 재조회하세요.",
    };
  }

  const productName = normalizeText(search?.productName);
  if (productName) {
    return {
      basisLabel: "제품명 기준",
      confidenceLabel: "낮음",
      confidenceDetail: "제품명만 입력한 결과는 동일 제품 확정이 아닌 제품군 후보입니다.",
      badgeLabel: "제품명 후보",
      recommendation: "실제 모델명, KC 인증번호, 바코드를 우선 입력해 재조회하세요.",
    };
  }

  return {
    basisLabel: "조회 조건 없음",
    confidenceLabel: "확실한 정보 없음",
    confidenceDetail: "SafetyKorea 조회 조건이 없습니다.",
    badgeLabel: "조회 조건 없음",
    recommendation: "제품명, 모델명, KC 인증번호, 바코드 중 하나를 입력하세요.",
  };
}

export function formatSafetyResultCount(totalCount: number | null | undefined, visibleCount: number): string {
  const total = normalizeCount(totalCount, visibleCount);
  const visible = Math.min(Math.max(visibleCount, 0), SAFETY_RESULT_DISPLAY_LIMIT);
  if (total === 0) return "전체 0건";
  if (total <= visible) return `전체 ${formatCount(total)}건`;
  return `상위 ${formatCount(visible)}건 표시 / 전체 ${formatCount(total)}건`;
}

export function normalizeSafetyMatchBasis(values: string[], fallback: string): string[] {
  const labels = values.map(toSafetyMatchLabel).filter(Boolean);
  const out = labels.length > 0 ? labels : [fallback];
  return [...new Set(out)];
}

export function summarizeSafetyText(value: string, maxLength = 110): string {
  const normalized = normalizeText(value);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function toSafetyMatchLabel(value: string): string {
  const text = normalizeText(value);
  if (!text) return "";
  const lower = text.toLowerCase();
  if (lower.includes("kc") || text.includes("인증번호")) return "KC번호 일치";
  if (text.includes("바코드")) return "바코드 일치";
  if (text.includes("모델")) return "모델명 일치";
  if (text.includes("브랜드")) return "브랜드 보조 일치";
  if (text.includes("제품")) return "제품명 후보";
  return text;
}

function normalizeCount(totalCount: number | null | undefined, visibleCount: number): number {
  if (typeof totalCount === "number" && Number.isFinite(totalCount) && totalCount >= 0) return totalCount;
  return Math.max(visibleCount, 0);
}

function formatCount(value: number): string {
  return value.toLocaleString("ko-KR");
}

function normalizeText(value: unknown): string {
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}
