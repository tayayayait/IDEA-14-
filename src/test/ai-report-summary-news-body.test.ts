import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("ai report summary news body analysis", () => {
  it("uses Gemini-only article body analysis instead of title listing or Lovable fallback", () => {
    const source = read("supabase/functions/ai-report-summary/index.ts");

    expect(source).toContain("articleBody");
    expect(source).toContain("article_body");
    expect(source).toContain("목록 금지");
    expect(source).toContain("종합 판단문");
    expect(source).toContain("핵심 판단:");
    expect(source).toContain("영향 근거:");
    expect(source).toContain("실행 대응:");
    expect(source).toContain("핵심 판단은 2문장");
    expect(source).toContain("영향 근거는 3~5문장");
    expect(source).toContain("실행 대응은 4~6개 구체 조치");
    expect(source).toContain("제품 라인업, 가격대, 채널, 마케팅 메시지, 물류, CS, 바이어 신용, 결제조건");
    expect(source).toContain("시장 기회");
    expect(source).toContain("예상 리스크");
    expect(source).toContain("소비·산업·정책 변화");
    expect(source).toContain("실질적인 대응 방향");
    expect(source).toContain("Gemini 뉴스 본문 분석 미생성");
    expect(source).toContain("countryCautionAnalyses");
    expect(source).toContain("Late rate");
    expect(source).toContain("Risk Index");
    expect(source).toContain("Top term");
    expect(source).toContain("위험 없음 금지");
    expect(source).toContain("Always generate countryCautionAnalysisStatus='generated'");
    expect(source).toContain("확인 가능한 데이터가 부족하므로 추가 검증 필요");
    expect(source).toContain("countryCautionAnalysisStatus='not_generated'");
    expect(source).toContain("temperature: 0.2");
    expect(source).not.toContain("LOVABLE_API_KEY");
    expect(source).not.toContain("관련 뉴스·이슈 ${sources.length}건 확인");
  });

  it("sends a compact Gemini prompt input with enough timeout budget for article-body analysis", () => {
    const source = read("supabase/functions/ai-report-summary/index.ts");

    expect(source).toContain("const AI_TIMEOUT_MS = 110000;");
    expect(source).toContain("const GEMINI_NEWS_ARTICLE_BODY_MAX_CHARS = 12000;");
    expect(source).toContain("buildGeminiReportPromptInput(evidenceBundle, evidence)");
    expect(source).toContain("compactNewsEvidenceSource(source)");
    expect(source).toContain("articleBody: limitText(");
    expect(source).not.toContain("callAiJson(systemPrompt, JSON.stringify({ ...evidenceBundle, evidence }))");
  });
});
