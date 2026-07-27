export type UsitcGuidanceCandidate = {
  htsCode: string;
  description: string;
};

export type UsitcGuidanceInput = {
  productName: string;
  hs6: string;
  candidates: UsitcGuidanceCandidate[];
};

export type UsitcClassificationGuidance = {
  specificationHint: string;
  nextAction: string;
};

export function buildUsitcClassificationGuidance(
  input: UsitcGuidanceInput,
): UsitcClassificationGuidance {
  const productName = cleanSingleLine(input.productName, 80);
  const hs6 = input.hs6.replace(/\D/g, "").slice(0, 6);
  const productLabel = productName || (hs6 ? `HS ${hs6} 제품` : "입력 제품");
  const descriptions = input.candidates
    .map((candidate) => cleanSingleLine(candidate.description, 300))
    .filter(Boolean)
    .join(" ");
  const criteria = classificationCriteria(descriptions);
  const candidateCodes = [...new Set(input.candidates
    .map((candidate) => cleanSingleLine(candidate.htsCode, 30))
    .filter(Boolean))];
  const candidateReference = candidateCodes.length === 1
    ? `미국 HTS ${candidateCodes[0]} 후보`
    : candidateCodes.length > 1
      ? `미국 HTS 후보(${candidateCodes.slice(0, 3).join(", ")}${candidateCodes.length > 3 ? " 외" : ""})`
      : hs6
        ? `HS ${hs6}의 미국 HTS 후보`
        : "미국 HTS 후보";

  return {
    specificationHint:
      `${productLabel}의 ${criteria} 정보를 기준으로 ${candidateReference}가 실제 제품에 부합하는지 확인해야 합니다.`,
    nextAction:
      `${productLabel}의 ${criteria} 정보를 준비한 뒤 USITC 원문에서 ${candidateReference}와 적용 세율·추가 관세를 최종 확인하세요.`,
  };
}

function classificationCriteria(descriptions: string): string {
  const criteria: string[] = [];
  if (/\b(parts?|accessor(?:y|ies)|for use|used (?:in|with|for)|designed for)\b|\bof (?:machines?|apparatus|vehicles?)\b/i.test(descriptions)) {
    criteria.push("용도·적용 대상");
  }
  if (/\b(radial|bias(?:-ply)?|construction|structure|woven|nonwoven|layers?)\b/i.test(descriptions)) {
    criteria.push("구조");
  }
  if (/\b(material|steel|iron|alumin(?:um|ium)|plastic|rubber|glass|ceramic|wood|cotton|wool|leather|containing)\b/i.test(descriptions)) {
    criteria.push("재질·구성 성분");
  }
  if (/\b(rim|diameter|length|width|thickness|size|weight|capacity|volume|voltage|watt|power)\b|\b(?:mm|cm|kg|inch(?:es)?)\b/i.test(descriptions)) {
    criteria.push("규격·치수");
  }
  return criteria.length ? criteria.join("·") : "용도·재질·기능·규격";
}

function cleanSingleLine(value: string, maxLength: number): string {
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}
