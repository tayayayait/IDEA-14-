import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runNewsEvidenceGenerationBatch } from "@/pages/Step3Countries";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("step3 news enrichment UI", () => {
  it("invokes the separate news evidence function for every Top 3 country in one action", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/Step3Countries.tsx"), "utf8");

    expect(source).toContain("invoke<");
    expect(source).toContain('"recommend-country-news"');
    expect(source).toContain("const targets = top3.slice(0, 3);");
    expect(source).toContain("const TOP3_NEWS_GENERATION_CONCURRENCY = 2;");
    expect(source).toContain("runNewsEvidenceGenerationBatch(targets");
    expect(source).toContain("project_id: id");
    expect(source).toContain("country_code: country.country_code");
    expect(source).toContain("상위 3개국 뉴스 근거");
  });

  it("runs Top 3 news generation with concurrency 2 and reports each settled country", async () => {
    const targets = [
      { country_code: "DE", country_name: "Germany" },
      { country_code: "VN", country_name: "Vietnam" },
      { country_code: "CN", country_name: "China" },
    ];
    const pending = targets.map(() => deferred<{ ok: boolean; state?: string }>());
    const started: string[] = [];
    const settled: string[] = [];

    const batch = runNewsEvidenceGenerationBatch(targets, {
      concurrency: 2,
      runCountry: (country) => {
        started.push(country.country_code);
        return pending[targets.findIndex((target) => target.country_code === country.country_code)].promise;
      },
      onCountrySettled: (country) => {
        settled.push(country.country_code);
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started).toEqual(["DE", "VN"]);

    pending[0].resolve({ ok: true, state: "success" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toEqual(["DE"]);
    expect(started).toEqual(["DE", "VN", "CN"]);

    pending[1].resolve({ ok: true, state: "empty" });
    pending[2].resolve({ ok: false });
    const summary = await batch;

    expect(summary.successCount).toBe(2);
    expect(summary.emptyCount).toBe(1);
    expect(summary.failedCountries).toEqual(["China"]);
  });

  it("caps displayed direct and background evidence separately", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/Step3Countries.tsx"), "utf8");

    expect(source).toContain("const PRODUCT_DIRECT_NEWS_DISPLAY_LIMIT = 4;");
    expect(source).toContain("const BACKGROUND_NEWS_DISPLAY_LIMIT = 4;");
    expect(source).toContain("선택 국가 직접 뉴스");
    expect(source).toContain("선택국 수출환경 뉴스");
    expect(source).toContain("선택국 산업 배경뉴스");
    expect(source).toContain("공급망/경쟁국 참고뉴스");
  });

  it("renders AI review reasons and excludes unrelated AI news evidence", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/Step3Countries.tsx"), "utf8");

    expect(source).toContain("ai_category");
    expect(source).toContain("ai_reason");
    expect(source).toContain('source.ai_category === "unrelated"');
    expect(source).toContain("AI 판정");
  });

  it("passes Step 3 article body fields into the Step 6 report evidence bundle", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/Step6Report.tsx"), "utf8");

    expect(source).toContain("article_body?: string | null;");
    expect(source).toContain("article_body_truncated?: boolean | null;");
    expect(source).toContain("article_body_original_length?: number | null;");
    expect(source).toContain("articleBody: normalizeReportText(source.article_body)");
    expect(source).toContain("articleBodyTruncated: source.article_body_truncated === true");
    expect(source).toContain("articleBodyOriginalLength: source.article_body_original_length");
  });

  it("persists customs export evidence against freshly loaded rationale so saved news is not dropped", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/Step3Countries.tsx"), "utf8");

    expect(source).toContain('select("country_code,rationale,updated_at")');
    expect(source).toContain("const currentRationaleByCountry =");
    expect(source).toContain("currentRationaleByCountry.get(row.country_code) ?? { rationale: row.rationale, updatedAt: null }");
    expect(source).toContain('.eq("updated_at", snapshot.updatedAt)');
    expect(source).toContain("persistCustomsExportEvidenceRow(");
  });

  it("allows enough client timeout for Gemini article-body report generation", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/Step6Report.tsx"), "utf8");

    expect(source).toContain("{ timeoutMs: 120000, retryOn429: false, retryOn500: true, retry500DelayMs: 800 }");
  });
});
