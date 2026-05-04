import { describe, expect, it } from "vitest";
import {
  composeFlagSummary,
  formatFlagTypeLabel,
  normalizeReportText,
  parseNewsImpactAnalysis,
  toSafePublicHref,
  toSafePublicUrl,
} from "@/lib/report-text";

describe("report text composition", () => {
  it("maps strategic and product_safety flag labels to Korean labels", () => {
    expect(formatFlagTypeLabel("strategic")).toBe("전략물자");
    expect(formatFlagTypeLabel("product_safety")).toBe("제품안전");
    expect(formatFlagTypeLabel("recall")).toBe("리콜");
  });

  it("composes flag summary with stable label prefix", () => {
    expect(composeFlagSummary("strategic", "HS6 기준 전략물자 후보가 없습니다.")).toBe(
      "전략물자: HS6 기준 전략물자 후보가 없습니다.",
    );
    expect(composeFlagSummary("product_safety", "SafetyKorea API 키 확인 필요")).toBe(
      "제품안전: SafetyKorea API 키 확인 필요",
    );
  });

  it("normalizes html entities and whitespace in report text", () => {
    expect(normalizeReportText("SafetyKorea&nbsp;상태: &amp; 확인  필요")).toBe("SafetyKorea 상태: & 확인 필요");
    expect(normalizeReportText("시장 뉴스&hellip; 추가 확인 필요")).toBe("시장 뉴스... 추가 확인 필요");
    expect(normalizeReportText("톈진항&middot;보세구 &#39;성장&#39; &rsquo;전략&rsquo;")).toBe(
      "톈진항·보세구 '성장' '전략'",
    );
    expect(normalizeReportText("")).toBe("");
  });

  it("redacts sensitive key assignments and strips URL query strings", () => {
    const input = "실패 URL: https://api.example.com/open?serviceKey=abcd1234&foo=bar, AuthKey=zzzz";
    const normalized = normalizeReportText(input);
    expect(normalized).toBe("실패 URL: https://api.example.com/open [REDACTED], AuthKey= [REDACTED]");
    expect(normalized).not.toContain("serviceKey=abcd1234");
    expect(normalized).not.toContain("&foo=bar");
    expect(normalized).not.toContain("AuthKey=zzzz");
  });

  it("normalizes public URL by removing query string and hash", () => {
    expect(toSafePublicUrl("https://www.safetykorea.kr/openapi/api/recall/recallList.json?conditionValue=센서#main")).toBe(
      "https://www.safetykorea.kr/openapi/api/recall/recallList.json",
    );
    expect(toSafePublicUrl("ftp://example.com/file")).toBeNull();
    expect(toSafePublicUrl(null)).toBeNull();
  });

  it("keeps non-sensitive query params for clickable public links", () => {
    expect(toSafePublicHref("https://www.safetykorea.kr/search/searchPop?certNum=HU071234-25001#main")).toBe(
      "https://www.safetykorea.kr/search/searchPop?certNum=HU071234-25001",
    );
    expect(toSafePublicHref("https://dream.kotra.or.kr/ajaxa/fileCpnt/fileDown.do?gbn=n01&amp;nttSn=237789&amp;atFileSn=114941&amp;pFrontYn=Y")).toBe(
      "https://dream.kotra.or.kr/ajaxa/fileCpnt/fileDown.do?gbn=n01&nttSn=237789&atFileSn=114941&pFrontYn=Y",
    );
    expect(toSafePublicHref("https://api.example.com/open?AuthKey=secret&certNum=HU071234-25001")).toBe(
      "https://api.example.com/open?certNum=HU071234-25001",
    );
    expect(toSafePublicHref("javascript:alert(1)")).toBeNull();
  });

  it("parses three-part news impact analysis labels for report rendering", () => {
    const parsed = parseNewsImpactAnalysis(
      "핵심 판단: 온라인 테스트 진입이 적합합니다. 영향 근거: 소비심리 위축과 보조금 효과 약화가 확인됩니다. 실행 대응: 프리미엄 라인과 가성비 라인을 분리하고 결제조건을 보수적으로 설정하세요.",
    );

    expect(parsed.state).toBe("structured");
    expect(parsed.sections).toEqual([
      { label: "핵심 판단", body: "온라인 테스트 진입이 적합합니다." },
      { label: "영향 근거", body: "소비심리 위축과 보조금 효과 약화가 확인됩니다." },
      { label: "실행 대응", body: "프리미엄 라인과 가성비 라인을 분리하고 결제조건을 보수적으로 설정하세요." },
    ]);
  });

  it("keeps pending and no-evidence news impact states distinct", () => {
    expect(parseNewsImpactAnalysis("Gemini 뉴스 본문 분석 미생성 — Step6에서 AI 요약 생성을 실행하세요.").state).toBe(
      "pending",
    );
    expect(parseNewsImpactAnalysis("대상국 일치 직접 뉴스 근거 없음 — 관련 뉴스 모니터링 필요").state).toBe(
      "no_evidence",
    );
    expect(parseNewsImpactAnalysis("기존 저장 리포트 문장입니다.").state).toBe("plain");
  });
});
