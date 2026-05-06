import { useEffect, useMemo, useState, Suspense, lazy } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useApiCall } from "@/hooks/useApiCall";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RiskBadge } from "@/components/RiskBadge";
import { ApiStateChip } from "@/components/ApiStateChip";
import { Loader2, Sparkles, ArrowRight, Trophy, Newspaper } from "lucide-react";
import { sanitize, sanitizeNullable, type RiskLabel } from "@/lib/scoring";
import { toast } from "@/components/ui/sonner";
import {
  canonicalizeTargetMarkets,
  COUNTRY_NAME_BY_CODE,
  isWeakProductRelevanceToken,
} from "../../supabase/functions/_shared/recommendation";
import {
  buildProductAnalysisCode,
  getSelectionSourceLabel,
  getSelectionStatusDetail,
  getSelectionStatusLabel,
  type ProductAnalysisCode,
} from "@/lib/analysis-code";
import { saveLastSelectedCountry } from "@/lib/project-step";
import { PROCEED_REVIEW_REQUIRED_LABEL, REQUIRE_PRODUCT_CONFIRMATION_FOR_STEP3 } from "@/lib/step3-entry-policy";
import { normalizeExecutionState, toApiChipState, type ExecutionState } from "@/lib/execution-state";
import { useRunningProgress } from "@/hooks/useRunningProgress";
import { mergeCustomsExportEvidenceIntoRationale } from "@/lib/customs-export-evidence";

const WorldMapChart = lazy(() => import("@/components/WorldMapChart"));

const PRODUCT_DIRECT_NEWS_DISPLAY_LIMIT = 4;
const BACKGROUND_NEWS_DISPLAY_LIMIT = 4;
const RECOMMEND_COUNTRIES_TIMEOUT_MS = 120000;
export const TOP3_NEWS_GENERATION_CONCURRENCY = 2;

type AiNewsCategory = "direct_product" | "adjacent_value_chain" | "broad_macro_export_env" | "unrelated";
type CustomsLookupState = "idle" | "loading" | "done" | "error";
type NewsScope =
  | "selected_country_direct"
  | "selected_country_export_env"
  | "selected_country_industry"
  | "supply_chain_reference"
  | "archive_reference";

type RationaleSource = {
  type?: string | null;
  title?: string | null;
  url?: string | null;
  country?: string | null;
  published_at?: string | null;
  publishedAt?: string | null;
  summary?: string | null;
  article_body?: string | null;
  article_body_truncated?: boolean | null;
  article_body_original_length?: number | null;
  keywords?: string[] | string | null;
  score_relevant?: boolean | null;
  news_category?: string | null;
  recency_tier?: string | null;
  selection_reason?: string | null;
  impact_summary?: string | null;
  country_match_type?: string | null;
  news_scope?: string | null;
  ai_category?: AiNewsCategory | string | null;
  ai_product_relevance_score?: number | null;
  ai_country_relevance_score?: number | null;
  ai_export_impact_score?: number | null;
  ai_reason?: string | null;
};

type RationaleMarket = {
  code?: string | null;
  name?: string | null;
};

type CountryRationale = {
  summary?: string;
  sources?: RationaleSource[];
  target_markets?: RationaleMarket[];
  target_market_matched?: boolean | null;
  inclusion_reason?: string | null;
  recommendation_reason?: string | null;
  low_recommendation_reason?: string | null;
  alternative_markets?: RationaleMarket[];
  candidate_signals?: string[];
} | null;

export interface CountryRow {
  country_code: string;
  country_name: string;
  market_score: number | null;
  cert_score: number | null;
  regulation_score: number | null;
  payment_score: number | null;
  safety_score: number | null;
  total_score: number | null;
  label: RiskLabel;
  rank: number | null;
  rationale: CountryRationale;
  _customsExpDlr?: number | null;
}

export type TargetMarket = { code: string; name: string };

export type TargetMarketInsight = {
  target: TargetMarket;
  country: CountryRow | null;
  inclusionReason: string;
  recommendationReason: string;
  lowRecommendationReason: string;
  alternatives: TargetMarket[];
};

export type NewsEvidence = {
  title: string;
  country: string;
  publishedAt: string;
  url: string;
  summary: string;
  keywords: string[];
  label: string;
  scoreRelevant: boolean;
  newsCategory: "product_direct" | "geopolitical_risk" | "industry_trend" | "archive_reference";
  newsScope: NewsScope;
  recencyTier: "recent" | "supplementary" | "archive";
  selectionReason: string;
  impactSummary: string;
  aiCategory?: AiNewsCategory;
  aiProductRelevanceScore?: number;
  aiCountryRelevanceScore?: number;
  aiExportImpactScore?: number;
  aiReason?: string;
};

type NewsEvidenceBatchTarget = Pick<CountryRow, "country_code" | "country_name">;
type NewsEvidenceRunResult = { ok: boolean; state?: string };
export type NewsEvidenceBatchSummary = {
  successCount: number;
  emptyCount: number;
  failedCountries: string[];
};

export async function runNewsEvidenceGenerationBatch<T extends NewsEvidenceBatchTarget>(
  targets: T[],
  options: {
    concurrency: number;
    runCountry: (country: T) => Promise<NewsEvidenceRunResult>;
    onCountryStart?: (country: T) => void;
    onCountrySettled?: (country: T, result: NewsEvidenceRunResult) => void;
  },
): Promise<NewsEvidenceBatchSummary> {
  const concurrency = Math.max(1, Math.min(Math.floor(options.concurrency) || 1, targets.length || 1));
  let nextIndex = 0;
  let successCount = 0;
  let emptyCount = 0;
  const failedCountries: string[] = [];

  const worker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= targets.length) return;

      const country = targets[index];
      options.onCountryStart?.(country);
      let result: NewsEvidenceRunResult;
      try {
        result = await options.runCountry(country);
      } catch {
        result = { ok: false };
      }

      if (!result.ok) {
        failedCountries.push(country.country_name);
      } else {
        successCount += 1;
        if (result.state === "empty") emptyCount += 1;
      }
      options.onCountrySettled?.(country, result);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return { successCount, emptyCount, failedCountries };
}

export default function Step3Countries() {
  useAuthGuard();
  const { invoke, retryInSec, isRetrying } = useApiCall();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [rows, setRows] = useState<CountryRow[]>([]);
  const [state, setState] = useState<ExecutionState>("idle");
  const [customsLookupState, setCustomsLookupState] = useState<CustomsLookupState>("idle");
  const [selectedCountryCode, setSelectedCountryCode] = useState<string>("");
  const [newsRunningCountryCode, setNewsRunningCountryCode] = useState<string>("");
  const [analysisCode, setAnalysisCode] = useState(() => buildProductAnalysisCode(null));
  const running = state === "running";
  const runningElapsedSec = useRunningProgress(running);
  const runningDelayed = running && runningElapsedSec >= 45;
  const runningMessage = resolveStep3RunningMessage(runningElapsedSec);
  const stateForChip: ExecutionState = runningDelayed ? "stale" : state;

  const fetchCustomsData = async (currentRows: CountryRow[], productCode: string) => {
    if (!id || !currentRows.length || !productCode) {
      setCustomsLookupState("idle");
      return;
    }
    const countryCodes = currentRows.map((r) => r.country_code);
    setCustomsLookupState("loading");
    const res = await invoke<{ data?: Record<string, any> }>("api-customs-trade", {
      hsCode: productCode,
      countryCodes,
    }, { timeoutMs: 30000 });
    
    if (res.ok && res.data?.data) {
      const data = res.data.data;
      const nextRows = applyCustomsExportScores(currentRows, data);

      setRows((prevRows) => {
        const nextByCountry = new Map(nextRows.map((row) => [row.country_code, row]));
        return rankCountryRows(prevRows.map((row) => nextByCountry.get(row.country_code) ?? row));
      });
      try {
        await persistCustomsExportEvidence(id, nextRows);
      } catch (error) {
        const message = error instanceof Error ? error.message : "알 수 없는 오류";
        toast.warning(`최근 12개월 수출액 근거 저장 실패: ${message}`);
      }
      setCustomsLookupState("done");
      return;
    }
    setCustomsLookupState("error");
  };

  const load = async (options: { refreshCustoms?: boolean } = {}): Promise<CountryRow[]> => {
    if (!id) return [];
    const [{ data: countryData }, { data: productData }] = await Promise.all([
      supabase
        .from("project_countries")
        .select("*")
        .eq("project_id", id)
        .order("rank", { ascending: true }),
      supabase
        .from("project_products")
        .select("name,hs_code,hsk_code,components,confirmed")
        .eq("project_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (REQUIRE_PRODUCT_CONFIRMATION_FOR_STEP3 && !Boolean(productData?.confirmed)) {
      toast.warning("2단계에서 확정 체크를 완료해야 3단계로 이동할 수 있습니다.");
      navigate(`/projects/${id}/product`);
      return [];
    }

    const nextRows = ((countryData as unknown as CountryRow[]) ?? []).map(sanitizeCountryRow);
    setRows(nextRows);
    const codeInfo = buildProductAnalysisCode(productData);
    setAnalysisCode(codeInfo);
    
    const refreshCustoms = options.refreshCustoms ?? true;
    const customsProductCode = resolveCustomsProductCode(codeInfo);
    if (refreshCustoms && customsProductCode) {
      void fetchCustomsData(nextRows, customsProductCode);
    } else if (refreshCustoms) {
      setCustomsLookupState("idle");
    }
    
    return nextRows;
  };

  useEffect(() => {
    void load();
  }, [id]);

  const recommend = async () => {
    if (!id) return;
    setState("running");

    const result = await invoke<{
      state?: string;
      message?: string;
      ai_used?: boolean;
      fallback_used?: boolean;
    }>("recommend-countries", { project_id: id, require_ai: true }, { timeoutMs: RECOMMEND_COUNTRIES_TIMEOUT_MS, retryOn500: false });

    if (!result.ok) {
      const nextState = normalizeExecutionState(result.state, "error");
      setState(nextState);
      const message = result.message ?? "후보국 추천 결과 갱신에 실패했습니다.";
      if (nextState === "partial_success" || nextState === "stale") toast.warning(message);
      else toast.error(message);
      return;
    }

    const nextState = normalizeExecutionState(result.data?.state ?? "success", "success");
    setState(nextState);
    const reloadedRows = await load();
    const nextTopCountry = reloadedRows[0]?.country_code;
    if (nextTopCountry) {
      setSelectedCountryCode(nextTopCountry);
      saveLastSelectedCountry(id, nextTopCountry);
    }

    const message = sanitizeNullable(result.data?.message);
    if (nextState === "partial_success") toast.warning(message ?? "부분 산출 결과로 후보국을 갱신했습니다.");
    else if (nextState === "stale") toast.warning(message ?? "추천 결과를 반영했지만 일부 응답이 지연되었습니다.");
    else toast.success(message ?? "추천 결과를 갱신했습니다.");
  };

  const top3 = rows.slice(0, 3);

  useEffect(() => {
    if (top3.length === 0) {
      if (selectedCountryCode) setSelectedCountryCode("");
      return;
    }
    if (!top3.find((row) => row.country_code === selectedCountryCode)) {
      setSelectedCountryCode(top3[0].country_code);
    }
  }, [top3, selectedCountryCode]);

  useEffect(() => {
    if (!id || !selectedCountryCode) return;
    saveLastSelectedCountry(id, selectedCountryCode);
  }, [id, selectedCountryCode]);

  const selectedTop3 = useMemo(
    () => top3.find((row) => row.country_code === selectedCountryCode) ?? top3[0] ?? null,
    [top3, selectedCountryCode],
  );
  const evidenceRows = selectedTop3 ? extractEvidence(selectedTop3) : [];
  const selectedCountryDirectNewsRows = evidenceRows.filter((item) => item.newsScope === "selected_country_direct");
  const selectedCountryExportEnvRows = evidenceRows.filter((item) => item.newsScope === "selected_country_export_env");
  const selectedCountryIndustryRows = evidenceRows.filter((item) => item.newsScope === "selected_country_industry");
  const supplyChainReferenceRows = evidenceRows.filter((item) => item.newsScope === "supply_chain_reference");
  const archiveReferenceRows = evidenceRows.filter((item) => item.newsScope === "archive_reference");
  const hasDirectEvidence = selectedCountryDirectNewsRows.length > 0;
  const targetMarketInsights = buildTargetMarketInsights(rows);

  const generateNewsEvidence = async () => {
    if (!id || top3.length === 0 || newsRunningCountryCode) return;

    const targets = top3.slice(0, 3);
    setNewsRunningCountryCode("batch");

    const summary = await runNewsEvidenceGenerationBatch(targets, {
      concurrency: TOP3_NEWS_GENERATION_CONCURRENCY,
      onCountryStart: (country) => {
        setNewsRunningCountryCode(country.country_code);
      },
      onCountrySettled: () => {
        void load({ refreshCustoms: false });
      },
      runCountry: async (country) => {
        const result = await invoke<{
          state?: string;
          message?: string;
          source_count?: number;
        }>("recommend-country-news", {
          project_id: id,
          country_code: country.country_code,
        }, { timeoutMs: 90000, retryOn500: false });

        return { ok: result.ok, state: result.data?.state };
      },
    });

    try {
      await load({ refreshCustoms: false });
    } finally {
      setNewsRunningCountryCode("");
    }

    if (summary.successCount === 0) {
      toast.error(
        summary.failedCountries.length > 0
          ? `상위 3개국 뉴스 근거 생성에 실패했습니다. 실패: ${summary.failedCountries.join(", ")}`
          : "상위 3개국 뉴스 근거 생성에 실패했습니다.",
      );
      return;
    }

    if (summary.failedCountries.length > 0) {
      toast.warning(`상위 3개국 중 ${summary.successCount}개국 뉴스 근거를 생성했습니다. 실패: ${summary.failedCountries.join(", ")}`);
      return;
    }

    if (summary.emptyCount > 0) {
      toast.warning(`상위 3개국 뉴스 근거를 생성했습니다. 직접 매칭 기사가 없는 국가가 ${summary.emptyCount}개 있습니다.`);
      return;
    }

    toast.success("상위 3개국 뉴스 근거를 생성했습니다.");
  };

  const openCountryDetail = (countryCode: string) => {
    if (!id) return;
    saveLastSelectedCountry(id, countryCode);
    navigate(`/projects/${id}/countries/${countryCode}`);
  };

  return (
    <AppShell
      currentStep={3}
      evidence={
        <div className="space-y-3 text-sm">
          <h3 className="font-display font-semibold">근거 상태</h3>
          <p className="text-muted-foreground">
            후보군으로 편입한 국가만 점수화해 순위를 계산합니다.
          </p>
          <div className="rounded-md border border-border p-3">
            <p className="font-medium">기준 코드</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              HS {analysisCode.hsCode || "-"} · HSK {analysisCode.hskCode || "-"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              적용 방식: {getSelectionSourceLabel(analysisCode.selectionSource)}
              {analysisCode.selectionScore !== null ? ` (${analysisCode.selectionScore}점)` : ""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              상태: {getSelectionStatusLabel(analysisCode.selectionStatus)} · {getSelectionStatusDetail(analysisCode.selectionStatus)}
            </p>
            {analysisCode.reviewRequired ? (
              <p className="mt-1 text-xs text-risk-reviewable">
                {PROCEED_REVIEW_REQUIRED_LABEL}: 다음 단계로 진행할 수 있지만 최종 확정 전 HS 코드 재검증이 필요합니다.
              </p>
            ) : null}
          </div>
          <div className="rounded-md bg-muted p-3">
            <p className="font-medium">현재 상태</p>
            <ApiStateChip state={toApiChipState(stateForChip)} className="mt-1" />
            {running ? (
              <p className="mt-2 text-xs text-muted-foreground">{runningMessage}</p>
            ) : null}
            {runningDelayed ? (
              <p className="mt-1 text-xs text-risk-reviewable">
                45초 이상 응답이 지연 중입니다. 실패가 아니면 완료 후 자동 반영됩니다.
              </p>
            ) : null}
          </div>
        </div>
      }
      actionBar={
        <>
          <Button variant="ghost" onClick={() => navigate(`/projects/${id}/product`)}>
            이전
          </Button>
          <Button onClick={() => navigate(`/projects/${id}/report`)} disabled={top3.length === 0 || running} className="text-[0]">
            <span className="text-sm">리포트로</span>
            안전 점검<ArrowRight className="h-4 w-4" />
          </Button>
        </>
      }
    >
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold">3. 후보국 추천 상위 3개국</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            후보국을 먼저 추출하고 후보군 내에서만 점수와 순위를 계산합니다.
          </p>
          {isRetrying && retryInSec > 0 ? (
            <p className="mt-2 text-xs text-risk-reviewable">
              요청 한도 초과로 자동 재시도 대기 중입니다. {retryInSec}초 후 다시 호출합니다.
            </p>
          ) : null}
          {running ? (
            <p className="mt-2 text-xs text-muted-foreground">{runningMessage}</p>
          ) : null}
        </div>
        <Button onClick={recommend} disabled={running} className="min-h-11">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {running ? "실행 중..." : "추천 실행"}
        </Button>
      </div>

      {top3.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="font-medium">아직 추천 결과가 없습니다.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              실행을 눌러 HS 코드, 제품 정보, 메모 신호로 후보국을 생성하세요.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {top3.map((row, index) => (
              <button
                type="button"
                key={row.country_code}
                onClick={() => openCountryDetail(row.country_code)}
                aria-label={`${index + 1}순위 ${row.country_name} 상세 보기`}
                className="rounded-lg border border-border bg-surface p-5 text-left shadow-card transition hover:border-brand/40 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <Trophy className={index === 0 ? "h-4 w-4 text-accent" : "h-4 w-4"} />
                    순위 {index + 1}
                  </span>
                  <RiskBadge label={row.label} size="sm" />
                </div>

                <p className="font-display text-lg font-semibold">{row.country_name}</p>
                <p className="text-xs text-muted-foreground">{row.country_code}</p>
                {customsLookupState !== "idle" ? (
                  <p className="mt-2 text-xs font-medium text-brand">
                    {formatCustomsExportStatus(row._customsExpDlr, customsLookupState)}
                  </p>
                ) : null}

                {formatTargetMarkets(row.rationale?.target_markets).length > 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    입력 시장: {formatTargetMarkets(row.rationale?.target_markets).join(", ")}
                  </p>
                ) : null}
                {row.rationale?.recommendation_reason ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    근거: {row.rationale.recommendation_reason}
                  </p>
                ) : null}
                {row.rationale?.low_recommendation_reason ? (
                  <p className="mt-1 text-xs text-risk-reviewable">
                    낮은 점수 사유: {row.rationale.low_recommendation_reason}
                  </p>
                ) : null}
                <p className="mt-3 text-xs text-brand" aria-hidden="true">상세 보기</p>
              </button>
            ))}
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">후보국 세계 지도</CardTitle>
              <CardDescription>추천된 전체 후보국의 점수 분포 및 수출 실적(있는 경우)을 확인합니다.</CardDescription>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<div className="flex h-[300px] items-center justify-center rounded-md border border-dashed bg-muted/40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
                <WorldMapChart
                  countries={rows.map((row) => ({
                    country_code: row.country_code,
                    country_name: row.country_name,
                    total_score: row.total_score,
                    label: row.label,
                    rank: row.rank,
                    customsExpDlr: row._customsExpDlr ?? null
                  }))}
                  customsLookupState={customsLookupState}
                  selectedCountryCode={selectedCountryCode}
                  onCountryClick={setSelectedCountryCode}
                />
              </Suspense>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">입력 시장 평가</CardTitle>
              <CardDescription>
                메모와 비교한 목표시장 편입 신호이며, 순위를 강제하지 않습니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {targetMarketInsights.length === 0 ? (
                <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                  메모에서 목표시장을 찾지 못했습니다.
                </p>
              ) : (
                <>
                  {!hasDirectEvidence ? (
                    <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                      직접 근거 없음(확실한 정보 없음)
                    </p>
                  ) : null}
                {targetMarketInsights.map((insight) => (
                  <div key={insight.target.code} className="rounded-md border border-border p-3">
                    <p className="font-medium">
                      {insight.target.name} <span className="font-mono text-xs text-muted-foreground">{insight.target.code}</span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">편입 사유: {insight.inclusionReason}</p>
                    {insight.country ? (
                      <>
                        <p className="mt-1 text-xs text-muted-foreground">
                          최종 점수/순위: {insight.country.total_score ?? "-"} / 순위 {insight.country.rank ?? "-"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">근거: {insight.recommendationReason}</p>
                        {insight.lowRecommendationReason ? (
                          <p className="mt-1 text-xs text-risk-reviewable">
                            낮은 점수 사유: {insight.lowRecommendationReason}
                          </p>
                        ) : null}
                        {insight.alternatives.length > 0 ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            대체 시장: {insight.alternatives.map((v) => `${v.name}(${v.code})`).join(", ")}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <p className="mt-1 text-xs text-risk-reviewable">
                        해당 국가는 비교 대상으로 포함되었지만 현재 순위 결과에는 없습니다.
                      </p>
                    )}
                  </div>
                ))}
                </>
              )}
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">뉴스 근거(상위 3개국)</CardTitle>
              <CardDescription>제품 직접 뉴스, 산업 동향, 거시경제/수출환경 뉴스를 구분합니다.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_280px_auto] md:items-center">
                <p className="text-xs text-muted-foreground">
                  선택 국가: <span className="font-medium text-foreground">{selectedTop3?.country_name ?? "데이터 없음"}</span>
                </p>
                <Select value={selectedTop3?.country_code ?? ""} onValueChange={setSelectedCountryCode}>
                  <SelectTrigger aria-label="국가 선택">
                    <SelectValue placeholder="국가 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {top3.map((country, idx) => (
                      <SelectItem key={country.country_code} value={country.country_code}>
                        {`${idx + 1}순위 - ${country.country_name}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={generateNewsEvidence}
                  disabled={top3.length === 0 || Boolean(newsRunningCountryCode)}
                  className="min-h-10"
                >
                  {newsRunningCountryCode ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Newspaper className="h-4 w-4" />
                  )}
                  {newsRunningCountryCode ? "생성 중..." : "상위 3개국 뉴스 근거 생성"}
                </Button>
              </div>

              {evidenceRows.length === 0 ? (
                <p className="rounded-md border border-border bg-muted/40 p-4 text-center text-sm text-muted-foreground">
                  선택한 국가에 분류된 뉴스 근거가 없습니다.
                </p>
              ) : (
                <div className="space-y-6">
                  {/* Product direct news */}
                  {selectedCountryDirectNewsRows.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold flex items-center gap-1.5"><span className="text-lg">*</span> 선택 국가 직접 뉴스</h4>
                      <div className="flex flex-col gap-2">
                        {selectedCountryDirectNewsRows.map((evidence, idx) => (
                          <div key={idx} className="p-3 border rounded-md text-sm">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-medium">{evidence.title}</p>
                              {evidence.url ? (
                                <a href={evidence.url} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-brand hover:underline">원문 열기</a>
                              ) : null}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1.5 items-center">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] ${evidence.recencyTier === "recent" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                                {evidence.recencyTier === "recent" ? "최근" : "보조 근거"}
                              </span>
                              <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                {evidence.selectionReason}
                              </span>
                              <span className="text-[11px] text-muted-foreground ml-auto">{evidence.publishedAt}</span>
                            </div>
                            {evidence.summary && <p className="mt-2 text-xs text-muted-foreground">{evidence.summary}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Macro export environment news */}
                  {selectedCountryExportEnvRows.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold flex items-center gap-1.5 text-amber-700"><span className="text-lg">*</span> 선택국 수출환경 뉴스</h4>
                      <div className="flex flex-col gap-2">
                        {selectedCountryExportEnvRows.map((evidence, idx) => {
                          const exportEnvironmentKeywords = resolveExportEnvironmentKeywordText(evidence);
                          return (
                            <div key={idx} className="p-3 border border-amber-200 bg-amber-50/40 rounded-md text-sm">
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-medium text-amber-800">{evidence.title}</p>
                                {evidence.url && <a href={evidence.url} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-brand hover:underline">원문 열기</a>}
                              </div>
                              {exportEnvironmentKeywords ? (
                                <p className="mt-1.5 text-xs text-amber-800">
                                  수출환경 키워드: {exportEnvironmentKeywords}
                                </p>
                              ) : null}
                              {evidence.impactSummary && (
                                <p className="mt-1.5 text-xs font-semibold text-amber-900 bg-white p-1.5 rounded border border-amber-100">
                                  {evidence.impactSummary}
                                </p>
                              )}
                              <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] ${evidence.recencyTier === "recent" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                                  {evidence.recencyTier === "recent" ? "최근" : "보조 근거"}
                                </span>
                                <span className="text-[11px] text-muted-foreground bg-white/70 px-1.5 py-0.5 rounded">
                                  {evidence.selectionReason}
                                </span>
                                <span className="text-[11px] text-muted-foreground ml-auto">{evidence.publishedAt}</span>
                              </div>
                              {evidence.summary && <p className="mt-2 text-xs text-muted-foreground">{evidence.summary}</p>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Industry trend reference news */}
                  {selectedCountryIndustryRows.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold flex items-center gap-1.5"><span className="text-lg">*</span> 선택국 산업 배경뉴스</h4>
                      <div className="flex flex-col gap-2">
                        {selectedCountryIndustryRows.map((evidence, idx) => (
                          <div key={idx} className="p-3 border rounded-md text-sm bg-muted/20">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-medium text-muted-foreground">{evidence.title}</p>
                              {evidence.url && <a href={evidence.url} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-brand hover:underline">원문 열기</a>}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1.5 items-center">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] ${evidence.recencyTier === "recent" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                                {evidence.recencyTier === "recent" ? "최근" : "보조 근거"}
                              </span>
                              <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                {evidence.selectionReason}
                              </span>
                              <span className="text-[11px] text-muted-foreground ml-auto">{evidence.publishedAt}</span>
                            </div>
                            {evidence.summary && <p className="mt-2 text-xs text-muted-foreground">{evidence.summary}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Supply-chain and competitor country references */}
                  {supplyChainReferenceRows.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold flex items-center gap-1.5 text-sky-700"><span className="text-lg">*</span> 공급망/경쟁국 참고뉴스</h4>
                      <div className="flex flex-col gap-2">
                        {supplyChainReferenceRows.map((evidence, idx) => (
                          <div key={idx} className="p-3 border border-sky-200 bg-sky-50/40 rounded-md text-sm">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-medium text-sky-800">{evidence.title}</p>
                              {evidence.url && <a href={evidence.url} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-brand hover:underline">원문 열기</a>}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1.5 items-center">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] ${evidence.recencyTier === "recent" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                                {evidence.recencyTier === "recent" ? "최근" : "보조 근거"}
                              </span>
                              <span className="text-[11px] text-muted-foreground bg-white/70 px-1.5 py-0.5 rounded">
                                {evidence.selectionReason}
                              </span>
                              <span className="text-[11px] text-muted-foreground ml-auto">{evidence.publishedAt}</span>
                            </div>
                            {evidence.summary && <p className="mt-2 text-xs text-muted-foreground">{evidence.summary}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Past archive references */}
                  {archiveReferenceRows.length > 0 && (
                    <details className="group border rounded-md p-3 text-sm">
                      <summary className="font-semibold cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1.5">
                        <span className="text-lg">*</span> 과거 참고 근거(5년 초과)
                        <span className="text-xs bg-muted px-2 py-0.5 rounded-full ml-1 text-muted-foreground">
                          {archiveReferenceRows.length}건
                        </span>
                      </summary>
                      <div className="mt-3 flex flex-col gap-2">
                        {archiveReferenceRows.map((evidence, idx) => (
                          <div key={idx} className="p-2 border-t text-xs">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-muted-foreground">{evidence.title}</p>
                              {evidence.url && <a href={evidence.url} target="_blank" rel="noreferrer" className="shrink-0 text-brand hover:underline">원문 열기</a>}
                            </div>
                            <p className="mt-1 text-[11px] text-muted-foreground/70">
                              발행일: {evidence.publishedAt} | {evidence.selectionReason}
                            </p>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">전체 후보국 점수</CardTitle>
              <CardDescription>점수화된 모든 국가의 비교표입니다.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm" aria-label="국가 순위표">
                <thead className="bg-muted/60 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">국가</th>
                    <th className="px-3 py-2 text-right">시장성</th>
                    <th className="px-3 py-2 text-right">인증</th>
                    <th className="px-3 py-2 text-right">규제</th>
                    <th className="px-3 py-2 text-right">결제</th>
                    <th className="px-3 py-2 text-right">안전성</th>
                    <th className="px-3 py-2 text-right">총점</th>
                    <th className="px-3 py-2 text-left">등급</th>
                    <th className="px-3 py-2 text-right">상세</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => (
                    <tr key={row.country_code} className="hover:bg-muted/30">
                      <td className="px-3 py-3 font-medium">
                        {row.country_name} <span className="font-mono text-xs text-muted-foreground">{row.country_code}</span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{row.market_score ?? "-"}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{row.cert_score ?? "-"}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{row.regulation_score ?? "-"}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{row.payment_score ?? "-"}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{row.safety_score ?? "-"}</td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums">{row.total_score ?? "-"}</td>
                      <td className="px-3 py-3">
                        <RiskBadge label={row.label} size="sm" />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="min-h-11"
                          onClick={() => openCountryDetail(row.country_code)}
                          aria-label={`${row.country_name} 상세 보기`}
                        >
                          열기
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </AppShell>
  );
}

export function resolveStep3RunningMessage(elapsedSec: number): string {
  if (elapsedSec >= 45) return `추천 분석 응답이 지연 중입니다. (${elapsedSec}초 경과)`;
  if (elapsedSec >= 20) return `근거 데이터를 점수화 중입니다. (${elapsedSec}초 경과)`;
  if (elapsedSec > 0) return `후보국 데이터를 수집 중입니다. (${elapsedSec}초 경과)`;
  return "추천 분석을 시작했습니다.";
}

function sanitizeCountryRow(row: CountryRow): CountryRow {
  if (!row.rationale) return row;
  return {
    ...row,
    rationale: {
      ...row.rationale,
      summary: sanitizeNullable(row.rationale.summary) ?? undefined,
      target_markets: sanitizeMarkets(row.rationale.target_markets),
      target_market_matched: Boolean(row.rationale.target_market_matched),
      inclusion_reason: normalizeStoredRationaleText(row.rationale.inclusion_reason),
      recommendation_reason: normalizeStoredRationaleText(row.rationale.recommendation_reason),
      low_recommendation_reason: normalizeStoredRationaleText(row.rationale.low_recommendation_reason),
      alternative_markets: sanitizeMarkets(row.rationale.alternative_markets),
      candidate_signals: Array.isArray(row.rationale.candidate_signals)
        ? row.rationale.candidate_signals.map((signal) => normalizeSignalLabel(signal)).filter(Boolean)
        : [],
      sources: row.rationale.sources?.map((source) => ({
        ...source,
        type: sanitizeNullable(source.type) ?? undefined,
        title: decodeSanitized(source.title ?? "제목 없음"),
        url: normalizeEvidenceUrl(source.url ?? ""),
        country: decodeSanitizedNullable(source.country) ?? undefined,
        published_at: decodeSanitizedNullable(source.published_at) ?? undefined,
        publishedAt: decodeSanitizedNullable(source.publishedAt) ?? undefined,
        summary: decodeSanitizedNullable(source.summary) ?? undefined,
        article_body: decodeSanitizedNullable(source.article_body) ?? undefined,
        article_body_truncated: typeof source.article_body_truncated === "boolean" ? source.article_body_truncated : undefined,
        article_body_original_length: normalizeOptionalLength(source.article_body_original_length),
        keywords: normalizeSourceKeywords(source.keywords),
        score_relevant: typeof source.score_relevant === "boolean" ? source.score_relevant : undefined,
        news_category: decodeSanitizedNullable(source.news_category) ?? undefined,
        recency_tier: decodeSanitizedNullable(source.recency_tier) ?? undefined,
        selection_reason: decodeSanitizedNullable(source.selection_reason) ?? undefined,
        impact_summary: decodeSanitizedNullable(source.impact_summary) ?? undefined,
        country_match_type: decodeSanitizedNullable(source.country_match_type) ?? undefined,
        news_scope: decodeSanitizedNullable(source.news_scope) ?? undefined,
        ai_category: normalizeAiNewsCategory(source.ai_category) ?? undefined,
        ai_product_relevance_score: normalizeOptionalScore(source.ai_product_relevance_score),
        ai_country_relevance_score: normalizeOptionalScore(source.ai_country_relevance_score),
        ai_export_impact_score: normalizeOptionalScore(source.ai_export_impact_score),
        ai_reason: decodeSanitizedNullable(source.ai_reason) ?? undefined,
      })),
    },
  };
}

function sanitizeMarkets(markets: RationaleMarket[] | undefined): RationaleMarket[] {
  const canonical = canonicalizeTargetMarkets(Array.isArray(markets) ? markets : []);
  return canonical.map((market) => ({
    code: market.code,
    name: market.name,
  }));
}

function normalizeEvidenceUrl(url: string): string {
  const trimmed = decodeSanitized(url).trim();
  if (!trimmed) return "";
  if (!/^https?:\/\//i.test(trimmed)) return "";
  if (trimmed.includes("apis.data.go.kr/")) return "";
  return trimmed;
}

export function extractEvidence(row: CountryRow): NewsEvidence[] {
  const sourceRows = row.rationale?.sources ?? [];
  const rows = sourceRows
    .filter((source) => {
      if (source.ai_category === "unrelated") return false;
      if (normalizeAiNewsCategory(source.ai_category) === "unrelated") return false;
      if (isEmptyDirectEvidencePlaceholder(source)) return false;
      const type = (source.type ?? "").toLowerCase();
      return type === "product_evidence" || type === "news" || type === "country_background";
    })
    .map((source) => {
      const scoreRelevant = resolveScoreRelevant(source);
      const category = toNewsCategory(
        source.news_category,
        source.type === "product_evidence" ? "product_direct" : "industry_trend",
      );
      const recency = toNewsRecencyTier(source.recency_tier, "supplementary");
      const reason = sanitize(source.selection_reason || "");
      const impact = sanitize(source.impact_summary || "");
      const aiCategory = normalizeAiNewsCategory(source.ai_category);
      const aiReason = sanitize(source.ai_reason || "");
      const countryMatchType = decodeSanitizedNullable(source.country_match_type);
      const newsScope = resolveNewsScope(source.news_scope, category, source.type, countryMatchType);
      const selectionReason = normalizeEvidenceSelectionReason(reason || buildFallbackSelectionReason(recency, category));

      return {
        title: decodeSanitized(source.title || "제목 없음"),
        country: decodeSanitized(source.country || row.country_name),
        publishedAt: decodeSanitized(source.published_at || source.publishedAt || "날짜 정보 없음"),
        url: normalizeEvidenceUrl(source.url || ""),
        summary: decodeSanitized(source.summary || ""),
        keywords: normalizeSourceKeywords(source.keywords),
        label: formatNewsScopeLabel(newsScope),
        scoreRelevant,
        newsCategory: category,
        newsScope,
        recencyTier: recency,
        selectionReason: appendAiSelectionReason(selectionReason, aiReason),
        impactSummary: normalizeEvidenceImpactSummary(impact),
        aiCategory,
        aiProductRelevanceScore: normalizeOptionalScore(source.ai_product_relevance_score),
        aiCountryRelevanceScore: normalizeOptionalScore(source.ai_country_relevance_score),
        aiExportImpactScore: normalizeOptionalScore(source.ai_export_impact_score),
        aiReason,
      };
    });

  const seen = new Set<string>();
  const out: NewsEvidence[] = [];
  for (const rowItem of rows) {
    const key = `${rowItem.title}|${rowItem.country}|${rowItem.publishedAt}|${rowItem.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(rowItem);
  }

  const sorted = out.sort(compareEvidenceByPolicy);
  const selected = applyEvidenceDisplayPolicy(sorted);
  return [
    ...selected.productDirect,
    ...selected.geopoliticalRisk,
    ...selected.industryTrend,
    ...selected.supplyChainReference,
    ...selected.archiveReference,
  ];
}

function isEmptyDirectEvidencePlaceholder(source: RationaleSource): boolean {
  if ((source.type ?? "").toLowerCase() !== "product_evidence") return false;
  const category = toNewsCategory(
    source.news_category,
    source.type === "country_background" ? "industry_trend" : "product_direct",
  );
  if (category !== "product_direct") return false;
  if (source.score_relevant === true) return false;
  if (normalizeEvidenceUrl(source.url || "")) return false;
  if (decodeSanitizedNullable(source.published_at) || decodeSanitizedNullable(source.publishedAt)) return false;
  if (decodeSanitizedNullable(source.summary)) return false;
  if (normalizeSourceKeywords(source.keywords).length > 0) return false;
  return true;
}

export function applyEvidenceDisplayPolicy(
  rows: NewsEvidence[],
): {
  productDirect: NewsEvidence[];
  geopoliticalRisk: NewsEvidence[];
  industryTrend: NewsEvidence[];
  supplyChainReference: NewsEvidence[];
  archiveReference: NewsEvidence[];
} {
  const byScope = (scope: NewsEvidence["newsScope"]) =>
    rows.filter((row) => row.newsScope === scope);
  const pickPrimary = (items: NewsEvidence[], limit: number) => {
    const recent = items.filter((item) => item.recencyTier === "recent").sort(compareEvidenceByPolicy);
    const supplementary = items.filter((item) => item.recencyTier === "supplementary").sort(compareEvidenceByPolicy);
    return [...recent.slice(0, limit), ...supplementary.slice(0, Math.max(0, limit - recent.length))];
  };
  return {
    productDirect: pickPrimary(byScope("selected_country_direct"), PRODUCT_DIRECT_NEWS_DISPLAY_LIMIT),
    geopoliticalRisk: pickPrimary(byScope("selected_country_export_env"), BACKGROUND_NEWS_DISPLAY_LIMIT),
    industryTrend: pickPrimary(byScope("selected_country_industry"), BACKGROUND_NEWS_DISPLAY_LIMIT),
    supplyChainReference: pickPrimary(byScope("supply_chain_reference"), BACKGROUND_NEWS_DISPLAY_LIMIT),
    archiveReference: byScope("archive_reference").sort(compareEvidenceByPolicy),
  };
}

function compareEvidenceByPolicy(a: NewsEvidence, b: NewsEvidence): number {
  if (a.recencyTier !== b.recencyTier) {
    if (a.recencyTier === "recent") return -1;
    if (b.recencyTier === "recent") return 1;
    if (a.recencyTier === "supplementary") return -1;
    if (b.recencyTier === "supplementary") return 1;
  }
  return toSortableDate(b.publishedAt) - toSortableDate(a.publishedAt);
}

function toNewsCategory(value: string | null | undefined, fallback: NewsEvidence["newsCategory"]): NewsEvidence["newsCategory"] {
  if (value === "product_direct") return "product_direct";
  if (value === "geopolitical_risk") return "geopolitical_risk";
  if (value === "industry_trend") return "industry_trend";
  if (value === "archive_reference") return "archive_reference";
  return fallback;
}

function toNewsRecencyTier(value: string | null | undefined, fallback: NewsEvidence["recencyTier"]): NewsEvidence["recencyTier"] {
  if (value === "recent") return "recent";
  if (value === "supplementary") return "supplementary";
  if (value === "archive") return "archive";
  return fallback;
}

function normalizeNewsScope(value: string | null | undefined): NewsScope | undefined {
  if (value === "selected_country_direct") return "selected_country_direct";
  if (value === "selected_country_export_env") return "selected_country_export_env";
  if (value === "selected_country_industry") return "selected_country_industry";
  if (value === "supply_chain_reference") return "supply_chain_reference";
  if (value === "archive_reference") return "archive_reference";
  return undefined;
}

function resolveNewsScope(
  value: string | null | undefined,
  category: NewsEvidence["newsCategory"],
  type: string | null | undefined,
  countryMatchType: string | null | undefined,
): NewsScope {
  const normalized = normalizeNewsScope(value);
  if (normalized) return normalized;
  if (category === "archive_reference") return "archive_reference";
  if ((type ?? "").toLowerCase() === "product_evidence" && category === "product_direct") {
    return "selected_country_direct";
  }
  if (countryMatchType === "background_country") return "supply_chain_reference";
  if (category === "geopolitical_risk") return "selected_country_export_env";
  return "selected_country_industry";
}

function formatNewsScopeLabel(scope: NewsScope): string {
  if (scope === "selected_country_direct") return "선택 국가 직접 뉴스";
  if (scope === "selected_country_export_env") return "선택국 수출환경 뉴스";
  if (scope === "selected_country_industry") return "선택국 산업 배경뉴스";
  if (scope === "supply_chain_reference") return "공급망/경쟁국 참고뉴스";
  return "과거 참고뉴스";
}

function normalizeAiNewsCategory(value: string | null | undefined): AiNewsCategory | undefined {
  if (value === "direct_product") return "direct_product";
  if (value === "adjacent_value_chain" || value === "adjacent_industry") return "adjacent_value_chain";
  if (value === "broad_macro_export_env" || value === "macro_export_env") return "broad_macro_export_env";
  if (value === "unrelated") return "unrelated";
  return undefined;
}

function normalizeOptionalScore(value: number | null | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeOptionalLength(value: number | null | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.round(value));
}

function appendAiSelectionReason(selectionReason: string, aiReason: string): string {
  const reason = sanitize(aiReason);
  if (!reason) return selectionReason;
  const normalized = selectionReason || "";
  const aiLabel = `AI 판정: ${reason}`;
  return normalized ? `${normalized} | ${aiLabel}` : aiLabel;
}

function buildFallbackSelectionReason(
  recencyTier: NewsEvidence["recencyTier"],
  category: NewsEvidence["newsCategory"],
): string {
  const recencyLabel = recencyTier === "recent"
    ? "최근 1년 이내"
    : recencyTier === "supplementary"
    ? "보조 근거(5년 이내)"
    : "과거 참고(5년 초과)";
  return `${recencyLabel} | 분류:${formatNewsCategory(category)}`;
}

function normalizeEvidenceSelectionReason(value: string): string {
  const text = sanitize(value);
  if (!text) return "";

  return text
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === "recent<=1y") return "최근 1년 이내";
      if (lower === "supplementary<=5y") return "보조 근거(5년 이내)";
      if (lower === "archive>5y") return "과거 참고(5년 초과)";
      if (lower === "hs6") return "HS 6자리 일치";
      if (lower === "hs4") return "HS 4자리 일치";
      if (lower.startsWith("token:")) {
        const tokens = part
          .slice("token:".length)
          .split(",")
          .map((token) => token.trim())
          .filter(Boolean)
          .filter((token) => !isWeakProductRelevanceToken(token));
        return tokens.length > 0 ? `token:${tokens.join(",")}` : "";
      }
      if (lower.startsWith("export_env:")) {
        const keywords = part
          .slice("export_env:".length)
          .split(",")
          .map((keyword) => keyword.trim())
          .filter(Boolean);
        return keywords.length > 0 ? `수출환경 키워드:${keywords.join(", ")}` : "";
      }
      if (lower.startsWith("category:")) {
        const category = lower.slice("category:".length);
        return `분류:${formatNewsCategory(toNewsCategory(category, "product_direct"))}`;
      }
      return part;
    })
    .filter(Boolean)
    .join(" | ");
}

function formatExportImpactTarget(target: string): string {
  return target
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("·");
}

function normalizeEvidenceImpactSummary(value: string): string {
  const text = sanitize(value);
  if (!text) return "";
  return text
    .replace(/\[Export impact\]/gi, "[수출 영향]")
    .replace(
      /\[수출 영향\]\s*(.+?)\s+can affect\s+(.+?)\s+in cost, lead-time, or payment conditions\./gi,
      (_match, driver: string, target: string) =>
        `[수출 영향] ${driver.trim()} 변동은 ${formatExportImpactTarget(target)}의 원가, 납기, 결제 조건에 영향을 줄 수 있습니다.`,
    )
    .replace(
      /can affect target product in cost, lead-time, or payment conditions\./gi,
      "대상 제품의 원가, 납기, 결제 조건에 영향을 줄 수 있습니다.",
    )
    .replace(
      /can affect (.+?) in cost, lead-time, or payment conditions\./gi,
      (_match, target: string) =>
        `${formatExportImpactTarget(target)}의 원가, 납기, 결제 조건에 영향을 줄 수 있습니다.`,
    );
}

function formatNewsCategory(category: NewsEvidence["newsCategory"]): string {
  if (category === "product_direct") return "선택 국가 직접 뉴스";
  if (category === "geopolitical_risk") return "거시경제/수출환경 뉴스";
  if (category === "industry_trend") return "산업 동향";
  return "과거 참고";
}

function resolveExportEnvironmentKeywordText(evidence: NewsEvidence): string {
  const marker = "수출환경 키워드:";
  const fromReason = evidence.selectionReason
    .split("|")
    .map((part) => part.trim())
    .find((part) => part.startsWith(marker));
  if (fromReason) return fromReason.slice(marker.length).trim();
  return evidence.keywords.slice(0, 5).join(", ");
}

function normalizeSignalLabel(value: string | null | undefined): string {
  const text = sanitize(value ?? "");
  const key = text.toLowerCase();
  const direct: Record<string, string> = {
    "certification data exists": "인증 데이터 존재",
    "import regulation data exists": "수입규제 데이터 존재",
    "included by target market memo": "목표시장 메모 편입",
    "hs 6-digit exact match": "HS 6자리 일치",
    "hs 4-digit prefix match": "HS 4자리 접두 일치",
    "product keyword matched": "제품 키워드 일치",
    "market news matched": "시장 뉴스 일치",
    "fallback candidate included": "후보군 보강 편입",
  };
  return direct[key] ?? text;
}

function normalizeStoredRationaleText(value: string | null | undefined): string | null {
  const text = sanitizeNullable(value);
  if (!text) return text;

  return text
    .split(";")
    .map((part) => normalizeSignalLabel(part.trim()))
    .join("; ");
}

function resolveScoreRelevant(source: RationaleSource): boolean {
  const type = (source.type ?? "").toLowerCase();
  if (type === "product_evidence") return source.score_relevant !== false;
  return false;
}

function resolveEvidenceType(source: RationaleSource): "product_news" | "country_news" {
  const type = (source.type ?? "").toLowerCase();
  if (type === "product_evidence") return "product_news";
  return "country_news";
}

function normalizeSourceKeywords(value: string[] | string | null | undefined): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.map((entry) => decodeSanitized(entry)).filter(Boolean))].slice(0, 12);
  }
  const text = decodeSanitized(value ?? "");
  if (!text) return [];
  const tokens = text
    .split(/[,\n/|]+/g)
    .map((entry) => decodeSanitized(entry))
    .filter(Boolean);
  return [...new Set(tokens)].slice(0, 12);
}

const HTML_ENTITY_MAP: Record<string, string> = {
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
  hellip: "...",
};

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_match, entityRaw: string) => {
    const entity = entityRaw.toLowerCase();
    if (entity.startsWith("#x")) {
      const codePoint = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _match;
    }
    if (entity.startsWith("#")) {
      const codePoint = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _match;
    }
    return HTML_ENTITY_MAP[entity] ?? _match;
  });
}

function decodeSanitized(value: string | null | undefined): string {
  return decodeHtmlEntities(sanitize(value ?? ""));
}

function decodeSanitizedNullable(value: string | null | undefined): string | null {
  const normalized = sanitizeNullable(value);
  if (normalized == null) return null;
  return decodeHtmlEntities(normalized);
}

function toSortableDate(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function toTargetMarket(input: RationaleMarket): TargetMarket | null {
  const [canonical] = canonicalizeTargetMarkets([input]);
  if (canonical) return canonical;

  const code = sanitizeNullable(input.code)?.toUpperCase() ?? "";
  const name = sanitizeNullable(input.name) ?? "";
  if (!code && !name) return null;
  const fallbackCode = code || name.toUpperCase();
  const fallbackName = COUNTRY_NAME_BY_CODE[fallbackCode] || name || code;
  return { code: fallbackCode, name: fallbackName };
}

function normalizeCode(value: string): string {
  return sanitize(value).toUpperCase();
}

function formatTargetMarkets(markets: RationaleMarket[] | undefined): string[] {
  if (!Array.isArray(markets)) return [];
  return markets
    .map(toTargetMarket)
    .filter((market): market is TargetMarket => market !== null)
    .map((market) => `${market.name}(${market.code})`);
}

function resolveCustomsProductCode(codeInfo: ProductAnalysisCode): string {
  return codeInfo.hskCode || codeInfo.hsCode;
}

function applyCustomsExportScores(
  rows: CountryRow[],
  data: Record<string, { totalExpDlr?: number | null } | undefined>,
): CountryRow[] {
  return rankCountryRows(rows.map((row) => {
    const tradeInfo = data[row.country_code];
    const totalExpDlr = tradeInfo?.totalExpDlr || 0;
    const customsBoost = calculateCustomsExportBoost(totalExpDlr);
    return {
      ...row,
      total_score: Math.min(100, (row.total_score || 0) + customsBoost),
      market_score: Math.min(30, (row.market_score || 0) + customsBoost),
      _customsExpDlr: totalExpDlr > 0 ? totalExpDlr : null,
    };
  }));
}

function calculateCustomsExportBoost(totalExpDlr: number): number {
  if (totalExpDlr <= 0) return 0;
  const expMillion = totalExpDlr / 1_000_000;
  if (expMillion >= 100) return 8;
  if (expMillion >= 10) return 6;
  if (expMillion >= 1) return 4;
  if (expMillion >= 0.1) return 2;
  return 1;
}

function rankCountryRows(rows: CountryRow[]): CountryRow[] {
  const nextRows = [...rows].sort((a, b) => {
    const diff = (b.total_score || 0) - (a.total_score || 0);
    if (diff !== 0) return diff;
    return a.country_name.localeCompare(b.country_name);
  });

  return nextRows.map((row, index) => ({
    ...row,
    rank: index + 1,
  }));
}

async function persistCustomsExportEvidence(projectId: string, rows: CountryRow[]): Promise<void> {
  if (rows.length === 0) return;
  const countryCodes = rows.map((row) => row.country_code);
  const { data: currentRows, error: currentRowsError } = await supabase
    .from("project_countries")
    .select("country_code,rationale,updated_at")
    .eq("project_id", projectId)
    .in("country_code", countryCodes);
  if (currentRowsError) throw currentRowsError;

  const currentRationaleByCountry = new Map(
    ((currentRows as Array<{ country_code: string; rationale: unknown; updated_at: string | null }> | null) ?? [])
      .map((row) => [row.country_code, { rationale: row.rationale, updatedAt: row.updated_at ?? null }] as const),
  );

  await Promise.all(rows.map((row) => persistCustomsExportEvidenceRow(
    projectId,
    row,
    currentRationaleByCountry.get(row.country_code) ?? { rationale: row.rationale, updatedAt: null },
  )));
}

type CountryRationaleSnapshot = {
  rationale: unknown;
  updatedAt: string | null;
};

async function persistCustomsExportEvidenceRow(
  projectId: string,
  row: CountryRow,
  snapshot: CountryRationaleSnapshot,
  attempt = 0,
): Promise<void> {
  let request = supabase
    .from("project_countries")
    .update({
      market_score: row.market_score,
      total_score: row.total_score,
      rank: row.rank,
      rationale: mergeCustomsExportEvidenceIntoRationale(
        snapshot.rationale,
        row._customsExpDlr ?? null,
      ) as Json,
    })
    .eq("project_id", projectId)
    .eq("country_code", row.country_code);

  if (snapshot.updatedAt) {
    request = request.eq("updated_at", snapshot.updatedAt);
  }

  const { data, error } = await request.select("country_code").maybeSingle();
  if (error) throw error;
  if (data) return;

  if (snapshot.updatedAt && attempt < 2) {
    const latest = await fetchCurrentCountryRationale(projectId, row.country_code);
    if (!latest) return;
    await persistCustomsExportEvidenceRow(projectId, row, latest, attempt + 1);
    return;
  }

  if (snapshot.updatedAt) throw new Error("Concurrent country rationale update could not be merged");
}

async function fetchCurrentCountryRationale(
  projectId: string,
  countryCode: string,
): Promise<CountryRationaleSnapshot | null> {
  const { data, error } = await supabase
    .from("project_countries")
    .select("rationale,updated_at")
    .eq("project_id", projectId)
    .eq("country_code", countryCode)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    rationale: data.rationale,
    updatedAt: data.updated_at ?? null,
  };
}

export function formatCustomsExportAmount(amount: number | null | undefined): string {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return "-";
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount}`;
}

export function formatCustomsExportStatus(
  amount: number | null | undefined,
  state: CustomsLookupState,
): string {
  if (state === "loading") return "최근 12개월 HS/HSK 수출액 조회 중";
  if (state === "error") return "최근 12개월 HS/HSK 수출액 조회 실패";
  if (state === "done") {
    const formatted = formatCustomsExportAmount(amount);
    return formatted === "-"
      ? "최근 12개월 HS/HSK 수출액 조회 결과 없음"
      : `최근 12개월 HS/HSK 수출액 ${formatted}`;
  }
  return "";
}

export function collectTargetMarkets(rows: CountryRow[]): TargetMarket[] {
  const out: TargetMarket[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const markets = row.rationale?.target_markets ?? [];
    for (const market of markets) {
      const normalized = toTargetMarket(market);
      if (!normalized) continue;
      if (seen.has(normalized.code)) continue;
      seen.add(normalized.code);
      out.push(normalized);
    }
  }

  return out;
}

export function buildTargetMarketInsights(rows: CountryRow[]): TargetMarketInsight[] {
  const targets = collectTargetMarkets(rows);
  const topAlternatives = rows.slice(0, 3).map((row) => ({ code: row.country_code, name: row.country_name }));

  return targets.map((target) => {
    const matched = rows.find((row) => normalizeCode(row.country_code) === normalizeCode(target.code)) ?? null;
    const alternatives = matched?.rationale?.alternative_markets
      ?.map(toTargetMarket)
      .filter((market): market is TargetMarket => Boolean(market)) ??
      topAlternatives.filter((candidate) => normalizeCode(candidate.code) !== normalizeCode(target.code));

    return {
      target,
      country: matched,
      inclusionReason:
        matched?.rationale?.inclusion_reason ??
        "입력 메모에서 감지되어 비교 대상으로 포함되었습니다.",
      recommendationReason:
        matched?.rationale?.recommendation_reason ??
        "근거 정보가 부족합니다.",
      lowRecommendationReason: matched?.rationale?.low_recommendation_reason ?? "",
      alternatives: alternatives.slice(0, 3),
    };
  });
}



