import type { DecisionFact } from "@/lib/country-decision";
import { evidenceStatusLabel } from "@/lib/country-decision";

export function prepareDecisionFactsForDisplay(facts: DecisionFact[]): DecisionFact[] {
  const hasKostiCandidate = facts.some((fact) =>
    fact.category === "strategic_goods" &&
    (fact.factKey === "strategic_goods:kosti_hsk" ||
      fact.sourceName.includes("HSK 연계표") ||
      hasArrayValue(fact.value, "candidates")),
  );

  return facts.flatMap((fact) => {
    if (
      hasKostiCandidate &&
      fact.category === "strategic_goods" &&
      (fact.factKey === "strategic_goods:classification" ||
        fact.sourceName === "무역안보관리원 전략물자관리시스템")
    ) {
      return [];
    }

    if (fact.factKey === "customs_documents:baseline" ||
        (fact.category === "customs_documents" && fact.sourceName.includes("수출통관 안내"))) {
      return [{
        ...fact,
        status: "estimated" as const,
        summary: "수출에 공통으로 필요한 기본서류와 조건부 증빙 목록입니다.",
      }];
    }

    if (fact.factKey === "tariff_fta:baseline" ||
        (fact.category === "tariff_fta" && fact.sourceName === "관세청 FTA 포털" && !fact.referenceDate)) {
      return [{
        ...fact,
        summary: fact.summary.replace("적용 가능성이 있으나", "협정 후보가 있으나 실제 적용 여부는"),
        sourceName: "국가별 FTA 협정 후보 안내",
      }];
    }

    if (fact.category === "market" && fact.nextAction?.includes("최근 3개년 추이")) {
      return [{
        ...fact,
        nextAction: "경쟁국 구성과 연도별 추이는 UN Comtrade 공식 화면에서 추가 확인하세요.",
      }];
    }

    return [fact];
  });
}

export function selectKeyDecisionFacts(facts: DecisionFact[]): DecisionFact[] {
  const selected: DecisionFact[] = [];
  const add = (fact: DecisionFact | undefined) => {
    if (fact && !selected.some((item) => item.id === fact.id)) selected.push(fact);
  };

  add(facts.find((fact) => fact.category === "market" && fact.status === "confirmed"));
  add(facts.find((fact) =>
    fact.category === "tariff_fta" &&
    (fact.factKey === "tariff_fta:wits_hs6_range" || fact.status === "estimated"),
  ));
  add(facts.find((fact) => fact.status === "needs_verification" && fact.category === "strategic_goods"));

  for (const fact of facts) {
    if (selected.length >= 3) break;
    if (selected.some((item) => item.category === fact.category)) continue;
    add(fact);
  }

  return selected.slice(0, 3);
}

export function decisionEvidenceLabel(fact: DecisionFact): string {
  if (fact.category === "certification" && fact.status === "confirmed") return "후보 발견";
  if (fact.category === "customs_documents" && (fact.status === "confirmed" || fact.status === "estimated")) return "기본 안내";
  if (fact.category === "payment_risk" && fact.status === "confirmed") return "국가 통계";
  if (fact.category === "market" && fact.status === "confirmed") return "시장 확인";
  if (fact.category === "cost" && fact.status === "confirmed") return "환율 확인";
  return evidenceStatusLabel(fact.status);
}

export function toUserFacingDecisionSummary(summary: string, countryName = "해당 국가"): string {
  if (!summary.startsWith("Scope:")) return summary;

  const lateRate = capture(summary, /Late rate:\s*([^|]+)/);
  const paymentPeriod = capture(summary, /Avg payment period:\s*([\d.]+)d/);
  const latePeriod = capture(summary, /Avg late period:\s*([\d.]+)d/);
  const topTerm = summary.match(/Top term:\s*(.+)\s+\(([\d.]+%)\)\s*$/);
  const displayCountry = readableCountryName(countryName);
  const scope = summary.includes("country-specific") ? displayCountry + " 거래" : "전체 국가 참고 통계";

  const first = [
    lateRate ? scope + "의 결제 지연율은 " + lateRate : "",
    paymentPeriod ? "평균 결제기간은 " + paymentPeriod + "일입니다." : "",
  ].filter(Boolean).join(", ");
  const second = [
    latePeriod ? "평균 지연기간은 " + latePeriod + "일이며" : "",
    topTerm ? "가장 많이 사용된 결제조건은 " + topTerm[1].trim() + "(" + topTerm[2] + ")입니다." : "",
  ].filter(Boolean).join(", ");

  return [first, second].filter(Boolean).join(" ") || summary;
}

export function providerMessageLabel(message: string): string {
  const normalized = message.trim().toUpperCase();
  if (normalized === "NO ERROR" || normalized === "NORMAL SERVICE." || normalized === "정상서비스.") {
    return "정상적으로 조회했습니다.";
  }
  if (message === "cache_filter_match_0") {
    return "국가·HS·제품명 직접 일치 결과가 없습니다.";
  }
  return message;
}

function readableCountryName(countryName: string): string {
  if (countryName.includes("United States")) return "미국";
  return countryName.split("(")[0].trim() || countryName;
}

function capture(value: string, pattern: RegExp): string {
  return value.match(pattern)?.[1]?.trim() ?? "";
}

function hasArrayValue(value: unknown, key: string): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = (value as Record<string, unknown>)[key];
  return Array.isArray(candidate) && candidate.length > 0;
}
