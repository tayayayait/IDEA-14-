import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useApiCall } from "@/hooks/useApiCall";
import { AppShell } from "@/components/AppShell";
import { ApiStateChip, type ApiState } from "@/components/ApiStateChip";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LABEL_KO, sanitize, type RiskLabel } from "@/lib/scoring";
import { API_REGISTRY } from "@/lib/api-registry";
import { isSourceReadyForCompletion, resolveSourceStatusView } from "@/lib/source-status";
import { Loader2, Download, Sparkles } from "lucide-react";
import { FeasibilityBadgePrint } from "@/components/FeasibilityBadge";
import { format } from "date-fns";
import { toast } from "@/components/ui/sonner";
import {
  buildProductAnalysisCode,
  getSelectionSourceLabel,
  getSelectionStatusDetail,
  getSelectionStatusLabel,
  type HsSelectionSource,
  type HsSelectionStatus,
} from "@/lib/analysis-code";
import {
  filterRowsByCurrentDetailContext,
  getSuccessfulDetailRows,
  isCertificationReviewRequired as isCertReviewRequired,
  isIndustryMatchFailed,
  isKsureCategory,
  isRegulationReviewRequired as isRegReviewRequired,
  pickPlaceholderState,
  resolveSectionState,
  type CurrentDetailContext,
} from "@/lib/step4-detail-consistency";
import { composeFlagSummary, formatFlagTypeLabel, normalizeReportText, parseNewsImpactAnalysis, toSafePublicHref } from "@/lib/report-text";
import {
  buildCountryExecutionActions,
  type CountryExecutionActions,
} from "@/lib/report-execution-actions";
import {
  buildReportEvidenceHash,
  buildReportDraftFallback,
  buildReportProgramEvidenceCatalog,
  normalizeReportDraft,
  type ReportGateInputs,
  type ReportDraft,
  type ReportEvidenceBundle,
} from "@/lib/report-draft";
import { extractCustomsExportEvidence, formatCustomsExportUsd } from "@/lib/customs-export-evidence";
import {
  isStoredReportFresh,
  isStoredReportUsable,
  normalizeStoredReport,
  type StoredReportSnapshot,
} from "@/lib/report-persistence";
import { buildPdfImagePlacements } from "@/lib/pdf-pagination";
import {
  parseDecisionActionRows,
  parseDecisionFactRows,
  type DecisionActionItem,
  type DecisionFact,
} from "@/lib/country-decision";
import {
  buildMarketEvidence,
  buildTariffRangeEvidence,
  buildLogisticsEvidence,
  buildUsitcHtsEvidence,
  type MarketEvidence,
  type TariffRangeEvidence,
  type LogisticsEvidence,
  type UsitcHtsEvidence,
} from "@/lib/country-decision-insights";
import {
  parseVerdictResponse,
  type AiFinalVerdict,
} from "@/lib/country-decision-verdict";
import { loadLastSelectedCountry } from "@/lib/project-step";

interface ReportDecisionFact extends DecisionFact {
  countryCode: string;
}

interface ReportDecisionAction extends DecisionActionItem {
  countryCode: string;
}

interface Bundle {
  project: { title: string; partial_score: boolean; updated_at: string; user_id: string } | null;
  company: { company_name: string; industrial_complex: string | null; address: string | null } | null;
  product: ReportProduct | null;
  countries: {
    country_code: string;
    country_name: string;
    total_score: number | null;
    label: RiskLabel;
    rationale: {
      summary?: string;
      sources?: Array<{
        type?: string | null;
        title?: string | null;
        url?: string | null;
        country?: string | null;
        summary?: string | null;
        article_body?: string | null;
        article_body_truncated?: boolean | null;
        article_body_original_length?: number | null;
        score_relevant?: boolean | null;
        news_category?: string | null;
        news_scope?: string | null;
        impact_summary?: string | null;
        country_match_type?: string | null;
        ai_category?: string | null;
        ai_country_relevance_score?: number | null;
        customsExport12mUsd?: number | null;
        customsExportStatus?: string | null;
      }>;
    } | null;
  }[];
  flags: { flag_type: string; severity: string | null; summary: string | null; raw?: Record<string, unknown> | null }[];
  certs: { country_code: string; scheme: string | null; source_org: string | null; raw?: unknown }[];
  regs: {
    country_code: string;
    topic: string | null;
    summary: string | null;
    effective_date: string | null;
    source_org: string | null;
    raw?: unknown;
  }[];
  risks: {
    country_code: string;
    category: string | null;
    level: string | null;
    summary: string | null;
    source_org: string | null;
    raw?: unknown;
  }[];
  logs: {
    api_key_name: string;
    status: string;
    called_at: string;
    http_status: number | null;
    response_count: number | null;
    error_code: string | null;
  }[];
  decisionFacts: ReportDecisionFact[];
  decisionActions: ReportDecisionAction[];
  countryVerdicts: Array<{
    countryCode: string;
    verdict: AiFinalVerdict;
    createdAt: string;
  }>;
  ai_summary?: string;
  ai_actions?: string[];
  ai_report_draft?: ReportDraft;
  saved_report?: StoredReportSnapshot | null;
}

interface ReportProduct {
  id: string | null;
  name: string;
  hs_code: string | null;
  hsk_code: string | null;
  hs_selection_source: HsSelectionSource | null;
  hs_selection_status: HsSelectionStatus | null;
  hs_selection_score: number | null;
  hs_review_required: boolean;
  hs_selected_candidate_key: string | null;
}

type ReportDecisionDbResult = {
  data: unknown;
  error: { message: string } | null;
};

type ReportDecisionDbQuery = PromiseLike<ReportDecisionDbResult> & {
  select(columns?: string): ReportDecisionDbQuery;
  eq(column: string, value: unknown): ReportDecisionDbQuery;
  order(column: string, options?: { ascending?: boolean }): ReportDecisionDbQuery;
};

const reportDecisionDb = supabase as unknown as {
  from(table: string): ReportDecisionDbQuery;
};

const DETAIL_REQUIRED_API_KEYS = [
  "kotra_overseas_certification",
  "kotra_import_regulation",
  "ksure_country_risk",
  "ksure_industry_risk",
  "ksure_export_payment",
] as const;

interface DetailCompletionSummary {
  incomplete: boolean;
  unresolvedItems: string[];
  reason: string;
}

interface ExecutiveBrief {
  top3: string[];
  keyRisks: string[];
  nextActions: string[];
}

type DetailEvidenceKind = "cert" | "reg" | "payment";
type DetailEvidenceState = "available" | "unknown" | "not_run";

const UNKNOWN_TEXT = "확실한 정보 없음";
const DETAIL_INCOMPLETE_TEXT = "상세 분석 미완료";
const DETAIL_NOT_RUN_TEXT = "상세 분석 미실행";
const REPORT_NON_API_FACT_KEYS = new Set([
  "tariff_fta:baseline",
  "customs_documents:baseline",
  "sanctions:entity_screening",
  "strategic_goods:classification",
]);
export default function Step6Report() {
  useAuthGuard();
  const { invoke, retryInSec, isRetrying } = useApiCall();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const reportRef = useRef<HTMLDivElement>(null);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [genAi, setGenAi] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [pdfEvidenceOpen, setPdfEvidenceOpen] = useState(false);
  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [
      { data: project },
      { data: company },
      { data: product },
      { data: countries },
      { data: flags },
      { data: certs },
      { data: regs },
      { data: risks },
      { data: logs },
      { data: savedReport },
      { data: decisionFactRows },
      { data: decisionActionRows },
      { data: countryVerdictRows },
    ] = await Promise.all([
      supabase.from("projects").select("title,partial_score,updated_at,user_id").eq("id", id).maybeSingle(),
      supabase.from("project_companies").select("company_name,industrial_complex,address").eq("project_id", id).maybeSingle(),
      supabase
        .from("project_products")
        .select("id,name,hs_code,hsk_code,components,confirmed")
        .eq("project_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      loadReportCountries(id, loadLastSelectedCountry(id)),
      supabase.from("project_safety_flags").select("flag_type,severity,summary,raw").eq("project_id", id),
      supabase.from("project_certifications").select("country_code,scheme,source_org,raw").eq("project_id", id),
      supabase.from("project_regulations").select("country_code,topic,summary,effective_date,source_org,raw").eq("project_id", id),
      supabase.from("project_risks").select("country_code,category,level,summary,source_org,raw").eq("project_id", id),
      supabase.from("api_call_logs").select("api_key_name,status,called_at,http_status,response_count,error_code")
        .eq("project_id", id).order("called_at", { ascending: false }).limit(400),
      supabase
        .from("project_reports")
        .select("draft,evidence_hash,ai_state,generated_at")
        .eq("project_id", id)
        .maybeSingle(),
      reportDecisionDb
        .from("country_decision_facts")
        .select("*")
        .eq("project_id", id)
        .order("fetched_at", { ascending: false }),
      reportDecisionDb
        .from("country_action_items")
        .select("*")
        .eq("project_id", id)
        .order("priority", { ascending: true }),
      supabase
        .from("country_verdicts")
        .select("country_code, verdict, evidence_hash, created_at")
        .eq("project_id", id),
    ]);
    const reportProduct = mapReportProduct(product);
    const topCountries = ((countries as Bundle["countries"]) ?? []).map((country) => ({
      ...country,
      country_name: normalizeReportText(country.country_name) ?? UNKNOWN_TEXT,
      rationale: country.rationale
        ? {
            ...country.rationale,
            summary: cleanCountryReportSummary(
              country.rationale.summary,
              country.country_code,
              country.country_name,
            ) ?? undefined,
          }
        : country.rationale,
    }));
    const topCountryCodes = new Set(topCountries.map((country) => country.country_code));
    const reportDecisionFacts = parseReportDecisionFacts(
      decisionFactRows,
      reportProduct?.id ?? null,
      topCountryCodes,
    );
    const reportDecisionActions = parseReportDecisionActions(
      decisionActionRows,
      reportProduct?.id ?? null,
      topCountryCodes,
    );
    const currentCertRows = filterCurrentReportDetailRows(
      (certs as Bundle["certs"]) ?? [],
      reportProduct,
      topCountryCodes,
      "certification",
    );
    const currentRegRows = filterCurrentReportDetailRows(
      (regs as Bundle["regs"]) ?? [],
      reportProduct,
      topCountryCodes,
      "regulation",
    );

    setBundle({
      project: project as Bundle["project"],
      company: company as Bundle["company"],
      product: reportProduct,
      countries: topCountries,
      flags: ((flags as Bundle["flags"]) ?? []).map((flag) => ({
        ...flag,
        summary: normalizeReportSafetySummary(flag.flag_type, flag.summary),
      })),
      certs: currentCertRows,
      regs: currentRegRows.map((reg) => ({
        ...reg,
        topic: normalizeReportText(reg.topic),
        summary: normalizeReportText(reg.summary),
      })),
      risks: ((risks as Bundle["risks"]) ?? []).map((risk) => ({
        ...risk,
        category: normalizeReportText(risk.category),
        level: normalizeReportText(risk.level),
        summary: normalizeReportText(risk.summary),
      })),
      logs: (logs as Bundle["logs"]) ?? [],
      decisionFacts: reportDecisionFacts,
      decisionActions: reportDecisionActions,
      countryVerdicts: parseCountryVerdicts(countryVerdictRows),
      saved_report: normalizeStoredReport(savedReport),
    });
    setLoading(false);
  };
  useEffect(() => { load(); }, [id]);
  const generateAiSummary = async () => {
    if (!bundle || !id) return;
    setGenAi(true);
    const evidenceBundle = buildReportEvidenceBundle(bundle, detailCompletion);
    const evidenceHash = buildReportEvidenceHash(evidenceBundle);
    const fallbackDraft = buildReportDraftFallback(evidenceBundle);
    const existingDraft = isStoredReportUsable(bundle.saved_report)
      ? normalizeReportDraft(bundle.saved_report?.draft, evidenceBundle)
      : null;
    const result = await invoke<
      Partial<ReportDraft> & {
        draft?: Partial<ReportDraft>;
        summary?: string;
        actions?: string[];
        message?: string;
        state?: ApiState;
      }
    >(
      "ai-report-summary",
      evidenceBundle,
      { timeoutMs: 240000, retryOn429: false, retryOn500: true, retry500DelayMs: 800 },
    );
    if (!result.ok) {
      if (existingDraft && bundle.saved_report) {
        setBundle({
          ...bundle,
          ai_summary: existingDraft.decision.headline,
          ai_actions: existingDraft.actionPlan.filter((item) => item.horizon === "D+7").map((item) => item.action),
          ai_report_draft: existingDraft,
        });
        toast.warning("리포트 재생성에 실패했지만 기존 리포트는 유지했습니다.");
        setGenAi(false);
        return;
      }
      const message = result.message ?? "AI 리포트 생성에 실패했습니다.";
      setBundle({
        ...bundle,
        ai_summary: fallbackDraft.decision.headline,
        ai_actions: fallbackDraft.actionPlan.filter((item) => item.horizon === "D+7").map((item) => item.action),
        ai_report_draft: fallbackDraft,
        saved_report: {
          draft: fallbackDraft,
          evidenceHash,
          aiState: "local_fallback",
          generatedAt: new Date().toISOString(),
        },
      });
      await saveReportDraft(id, bundle.project?.user_id, fallbackDraft, evidenceHash, "local_fallback");
      toast.warning(`${message} 규칙 기반 임시 결과로 대체했습니다.`);
      setGenAi(false);
      return;
    }

    const draft = normalizeReportDraft(result.data, evidenceBundle);
    setBundle({
      ...bundle,
      ai_summary: draft.decision.headline,
      ai_actions: draft.actionPlan.filter((item) => item.horizon === "D+7").map((item) => item.action),
      ai_report_draft: draft,
      saved_report: {
        draft,
        evidenceHash,
        aiState: (result.data?.state as string | undefined) ?? "success",
        generatedAt: new Date().toISOString(),
      },
    });
    await saveReportDraft(id, bundle.project?.user_id, draft, evidenceHash, (result.data?.state as string | undefined) ?? "success");
    if ((result.data?.state as ApiState | undefined) === "partial_success") {
      toast.warning(result.message ?? "AI 리포트를 조건부 판단으로 생성했습니다.");
    } else {
      toast.success("AI 의사결정 리포트를 갱신했습니다.");
    }
    await supabase.from("projects").update({ status: "complete" }).eq("id", id);
    setGenAi(false);
  };

  const downloadPdf = async () => {
    if (!reportRef.current) return;
    setDownloading(true);
    setPdfEvidenceOpen(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const canvas = await html2canvas(reportRef.current, { scale: 2, backgroundColor: "#ffffff" });
      const img = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const pageW = 210;
      const pageH = 297;
      const placements = buildPdfImagePlacements({
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        pageWidth: pageW,
        pageHeight: pageH,
        margin: 10,
      });
      placements.forEach((placement) => {
        if (placement.addPageBefore) pdf.addPage();
        pdf.addImage(img, "PNG", placement.x, placement.y, placement.width, placement.height);
      });
      pdf.save(`${bundle?.project?.title ?? "report"}.pdf`);
      toast.success("PDF 다운로드를 시작했습니다.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "PDF 생성 중 오류가 발생했습니다.";
      toast.error(`PDF 생성에 실패했습니다: ${message}`);
    } finally {
      setPdfEvidenceOpen(false);
      setDownloading(false);
    }
  };

  const detailCompletion = useMemo(() => evaluateDetailCompletion(bundle), [bundle]);
  const reportEvidenceBundle = useMemo(
    () => bundle ? buildReportEvidenceBundle(bundle, detailCompletion) : null,
    [bundle, detailCompletion],
  );
  const evidenceHash = useMemo(
    () => reportEvidenceBundle ? buildReportEvidenceHash(reportEvidenceBundle) : "",
    [reportEvidenceBundle],
  );
  const reportDraft = useMemo(() => {
    if (!bundle || !reportEvidenceBundle) return null;
    if (isStoredReportUsable(bundle.saved_report ?? null)) {
      return normalizeReportDraft(bundle.saved_report?.draft, reportEvidenceBundle);
    }
    const source = bundle.ai_report_draft ?? {
      summary: bundle.ai_summary,
      actions: bundle.ai_actions,
    };
    return normalizeReportDraft(source, reportEvidenceBundle);
  }, [bundle, reportEvidenceBundle]);
  const reportIsStale = Boolean(
    bundle?.saved_report &&
    evidenceHash &&
    !isStoredReportFresh(bundle.saved_report, evidenceHash),
  );
  const actionItems = useMemo(() => {
    if (reportDraft) return reportDraft.actionPlan.filter((item) => item.horizon === "D+7").map((item) => sanitize(item.action));
    if (!bundle) return [];
    return buildDefaultActionItems(bundle);
  }, [bundle, reportDraft]);
  const executionActions = useMemo(
    () => buildCountryExecutionActions(bundle?.countries ?? []),
    [bundle?.countries],
  );

  const coreApiStates = useMemo(() => {
    const logs = bundle?.logs ?? [];
    return {
      kicox: pickLatestApiState(logs, "kicox_factory_production"),
      safety: pickLatestApiState(logs, "safetykorea_recall"),
    };
  }, [bundle?.logs]);

  const executiveBrief = useMemo(
    () => buildExecutiveBrief(bundle, detailCompletion, actionItems),
    [bundle, detailCompletion, actionItems],
  );
  const aiSummaryText = useMemo(
    () => reportDraft?.decision.headline ?? buildAiSummaryText(bundle, detailCompletion),
    [bundle, detailCompletion, reportDraft],
  );
  const reportAiState = reportIsStale
    ? "stale"
    : bundle?.saved_report?.aiState ?? (bundle?.ai_report_draft ? "success" : "local_fallback");
  const hasSavedReport = isStoredReportUsable(bundle?.saved_report ?? null);

  return (
    <AppShell
      currentStep={5}
      actionBar={
        <>
          <Button variant="ghost" onClick={() => navigate(`/projects/${id}/safety`)}>이전</Button>
          <Button variant="outline" onClick={generateAiSummary} disabled={genAi || !bundle || downloading} className="min-h-11">
            {genAi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {genAi ? "AI 리포트 생성 중..." : hasSavedReport ? "AI 리포트 재생성" : "AI 리포트 생성"}
          </Button>
          <Button onClick={downloadPdf} disabled={downloading || !bundle || genAi} className="min-h-11">
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {downloading ? "PDF 생성 중..." : "PDF 내려받기"}
          </Button>
        </>
      }
    >
      <div className="mb-6">
        <h1 className="font-display text-xl font-semibold">6. 수출전략 리포트</h1>
        <p className="mt-1 text-sm text-muted-foreground">AI가 수집된 데이터를 종합 분석해 수출 가능성, 리스크, 실행 전략을 정리한 의사결정용 리포트입니다.</p>
        {isRetrying && retryInSec > 0 && (
          <p className="mt-2 text-xs text-risk-reviewable">
            일부 API가 재시도 중입니다. {retryInSec}초 후 자동으로 다시 조회합니다.
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>KICOX 상태</span>
          <ApiStateChip state={coreApiStates.kicox} />
          <span>SafetyKorea 상태</span>
          <ApiStateChip state={coreApiStates.safety} />
        </div>
      </div>

      {loading || !bundle ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />데이터를 불러오는 중입니다.
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="block p-4 md:hidden">
              {reportDraft && reportEvidenceBundle ? (
                <DecisionReportContent
                  bundle={bundle}
                  draft={reportDraft}
                  evidence={reportEvidenceBundle}
                  aiState={reportAiState}
                  reportIsStale={reportIsStale}
                  expandEvidence={false}
                  mobile
                />
              ) : null}
            </div>
            <div className="fixed left-[-10000px] top-0 md:static md:overflow-x-auto">
              <div
                ref={reportRef}
                className="mx-auto w-[190mm] min-w-[190mm] bg-white px-8 py-7 text-[12px] leading-relaxed text-[#161A22]"
                style={{ minHeight: "270mm" }}
              >
                <div className="flex items-end justify-between border-b border-[#0E6B6F] pb-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[#0E6B6F]">AI 수출전략 의사결정 리포트</p>
                    <h2 className="mt-1 font-display text-2xl font-bold">{bundle.project?.title}</h2>
                  </div>
                  <div className="text-right text-[10px] text-[#5b6473]">
                    <p>발행일 {format(new Date(bundle.project?.updated_at ?? Date.now()), "yyyy.MM.dd")}</p>
                    {bundle.project?.partial_score && (
                      <p className="mt-1 inline-block rounded bg-[#f5b95222] px-1.5 py-0.5 text-[#a36b00]">부분 점수</p>
                    )}
                  </div>
                </div>
                {reportDraft && reportEvidenceBundle ? (
                  <DecisionReportContent
                    bundle={bundle}
                    draft={reportDraft}
                    evidence={reportEvidenceBundle}
                    aiState={reportAiState}
                    reportIsStale={reportIsStale}
                    expandEvidence={pdfEvidenceOpen}
                    print
                  />
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="h-full rounded-md border border-[#e6e7ea] bg-white p-2">
      <p className="text-[9px] uppercase tracking-wider text-[#5b6473]">{title}</p>
      <div className="mt-1 text-[12px]">{children}</div>
    </div>
  );
}

function PrintReportSection({
  title,
  subtitle,
  aside,
  tone = "default",
  children,
}: {
  title: string;
  subtitle?: string;
  aside?: ReactNode;
  tone?: "default" | "highlight" | "muted";
  children: ReactNode;
}) {
  const toneClass = tone === "highlight"
    ? "border-[#b7d9d8] bg-[#f2f9f8]"
    : tone === "muted"
      ? "border-[#dfe4ea] bg-[#f8fafc]"
      : "border-[#dfe4ea] bg-white";

  return (
    <section className={`mt-3 break-inside-avoid rounded-md border p-3 ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-[12px] font-semibold text-[#0E6B6F]">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-[9px] leading-relaxed text-[#64748b]">{subtitle}</p> : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

type GateInputPanelProps =
  | {
    topic: "profitability";
    values: ReportGateInputs["profitability"];
    onChange: (patch: Partial<ReportGateInputs["profitability"]>) => void;
    print: boolean;
  }
  | {
    topic: "payment";
    values: ReportGateInputs["payment"];
    onChange: (patch: Partial<ReportGateInputs["payment"]>) => void;
    print: boolean;
  };

function GateInputPanel(props: GateInputPanelProps) {
  const hasValue = Object.values(props.values).some(Boolean);
  const title = props.topic === "profitability" ? "수익성 계산 입력" : "결제조건 확인 입력";
  if (props.print) {
    return hasValue ? (
      <div className="mt-2 rounded bg-slate-50 px-2 py-1 text-[9px] text-slate-600">
        <span className="font-semibold">{title}</span> · {Object.entries(props.values).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`).join(" · ")}
      </div>
    ) : null;
  }

  return (
    <details className="group mt-2 rounded border border-dashed border-[#b7d9d8] bg-[#f8fbfb]">
      <summary className="flex cursor-pointer list-none items-center justify-between px-2 py-1.5 text-[9px] font-semibold text-[#0E6B6F] [&::-webkit-details-marker]:hidden">
        <span>{title} <span className="font-normal text-[#64748b]">· 선택 입력</span></span>
        <span className="font-normal text-[#64748b]">{hasValue ? "입력값 저장됨" : "무역정보를 몰라도 됨"}</span>
      </summary>
      <div className="grid gap-2 border-t border-[#d9e6e6] p-2 text-[9px]">
        {props.topic === "profitability" ? (
          <>
            <p className="text-[9px] leading-relaxed text-[#64748b]">모르는 항목은 비워두세요. 입력값은 다음 AI 리포트 재생성 때 수익성 판정에 반영됩니다.</p>
            <div className="grid grid-cols-2 gap-2">
              <GateInputField label="예상 판매가격" value={props.values.salePrice} type="number" onChange={(value) => props.onChange({ salePrice: value })} />
              <GateInputField label="통화" value={props.values.currency} placeholder="USD" onChange={(value) => props.onChange({ currency: value })} />
              <GateInputField label="제품 1개당 원가" value={props.values.unitCost} type="number" onChange={(value) => props.onChange({ unitCost: value })} />
              <GateInputField label="수출 수량" value={props.values.quantity} type="number" onChange={(value) => props.onChange({ quantity: value })} />
              <GateSelectField label="거래조건" value={props.values.tradeTerm} options={[["", "잘 모르겠습니다"], ["FOB", "FOB · 한국 항구까지"], ["CIF", "CIF · 목적국 항구까지"], ["DDP", "DDP · 목적지까지"]]} onChange={(value) => props.onChange({ tradeTerm: value })} />
              <GateInputField label="운임·보험료" value={props.values.freightInsurance} type="number" placeholder="모르면 비워두기" onChange={(value) => props.onChange({ freightInsurance: value })} />
            </div>
            <GateInputField label="목표 마진율(%)" value={props.values.targetMargin} type="number" onChange={(value) => props.onChange({ targetMargin: value })} />
          </>
        ) : (
          <>
            <p className="text-[9px] leading-relaxed text-[#64748b]">바이어를 아직 정하지 않았다면 미확인 상태로 두어도 됩니다. 국가 평균 위험과 실제 바이어 위험을 구분합니다.</p>
            <GateInputField label="바이어명(또는 후보)" value={props.values.buyerName} onChange={(value) => props.onChange({ buyerName: value })} />
            <div className="grid grid-cols-2 gap-2">
              <GateSelectField label="결제방식" value={props.values.paymentMethod} options={[["", "잘 모르겠습니다"], ["선금", "선금"], ["LC", "신용장(LC)"], ["T/T", "T/T 송금"], ["O/A", "외상(O/A)"]]} onChange={(value) => props.onChange({ paymentMethod: value })} />
              <GateInputField label="선금 비율(%)" value={props.values.advanceRate} type="number" onChange={(value) => props.onChange({ advanceRate: value })} />
              <GateInputField label="외상기간(일)" value={props.values.paymentDays} type="number" onChange={(value) => props.onChange({ paymentDays: value })} />
              <GateSelectField label="바이어 신용확인" value={props.values.creditVerified} options={[["", "미확인"], ["yes", "확인 완료"], ["no", "확인 불가"]]} onChange={(value) => props.onChange({ creditVerified: value })} />
            </div>
            <GateSelectField label="K-SURE 보험" value={props.values.insuranceStatus} options={[["", "미확인"], ["applied", "가입·신청"], ["none", "미가입"]]} onChange={(value) => props.onChange({ insuranceStatus: value })} />
          </>
        )}
      </div>
    </details>
  );
}

function GateInputField({ label, value, type = "text", placeholder, onChange }: { label: string; value: string; type?: string; placeholder?: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-[9px] text-[#475569]">
      <span>{label}</span>
      <input className="h-7 rounded border border-[#cbd5e1] bg-white px-2 text-[10px] text-[#1e293b] outline-none focus:border-[#0E6B6F]" type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function GateSelectField({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-[9px] text-[#475569]">
      <span>{label}</span>
      <select className="h-7 rounded border border-[#cbd5e1] bg-white px-1 text-[10px] text-[#1e293b] outline-none focus:border-[#0E6B6F]" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  );
}

function DecisionReportContent({
  bundle,
  draft,
  evidence,
  aiState,
  reportIsStale,
  expandEvidence = false,
  print = false,
  mobile = false,
}: {
  bundle: Bundle;
  draft: ReportDraft;
  evidence: ReportEvidenceBundle;
  aiState: string;
  reportIsStale: boolean;
  expandEvidence?: boolean;
  print?: boolean;
  mobile?: boolean;
}) {
  const programEvidence = buildReportProgramEvidenceCatalog(evidence);
  const officialCount = draft.officialResearch.sources.length;
  const status = getReportAiStatus(aiState, programEvidence.length, officialCount);
  const selectedCountry = draft.entryStrategy.countryName || bundle.countries[0]?.country_name || "-";

  return (
    <div className={mobile ? "space-y-3 text-sm" : ""} data-report-schema="decision-v2">
      {reportIsStale ? (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-[11px] text-amber-900">
          저장된 리포트 이후 근거 데이터가 변경되었습니다. 최신 판단을 위해 AI 리포트를 다시 생성하세요.
        </div>
      ) : null}

      <PrintReportSection title="1. 기본 정보" subtitle="선택 국가 한 곳과 현재 제품 분류를 기준으로 판단합니다.">
        <div className={mobile ? "grid gap-2" : "grid grid-cols-2 gap-2"}>
          <Block title="기업">
            <p className="font-semibold">{bundle.company?.company_name ?? "-"}</p>
            <p className="text-[#5b6473]">{[bundle.company?.industrial_complex, bundle.company?.address].filter(Boolean).join(" · ") || "-"}</p>
          </Block>
          <Block title="제품·분류">
            <p className="font-semibold">{bundle.product?.name ?? "-"}</p>
            <p className="font-mono text-[10px] text-[#5b6473]">HS {bundle.product?.hs_code ?? "-"} · HSK {bundle.product?.hsk_code ?? "-"}</p>
          </Block>
          <Block title="선택 국가">
            <p className="font-semibold text-[#0E6B6F]">{selectedCountry}</p>
          </Block>
          <Block title="판단 기준일">
            <p className="font-semibold">{format(new Date(bundle.project?.updated_at ?? Date.now()), "yyyy.MM.dd")}</p>
            <p className="text-[10px] text-[#5b6473]">스키마 v{draft.schemaVersion}</p>
          </Block>
        </div>
      </PrintReportSection>

      <PrintReportSection
        title="2. AI 최종판단"
        subtitle="프로그램 데이터와 공식 웹 근거를 종합한 실행 판단입니다."
        tone="highlight"
        aside={<span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${decisionTone(draft.decision.verdict)}`}>{formatDecisionVerdict(draft.decision.verdict)}</span>}
      >
        {/* Hero Metrics 3열 */}
        <div className={mobile ? "grid gap-2" : "grid grid-cols-3 gap-2"}>
          <ReportMetricCard
            label="수출 판단"
            value={formatDecisionVerdict(draft.decision.verdict)}
            detail={decisionHintForVerdict(draft.decision.verdict)}
            emphasis
            verdict={draft.decision.verdict}
          />
          <ReportMetricCard
            label="신뢰도"
            value={formatDecisionConfidence(draft.decision.confidence)}
            detail={(draft.decision as any).confidenceReason ?? "AI 판단 신뢰 수준"}
          />
          <ReportMetricCard
            label="근거 현황"
            value={`P ${programEvidence.length}건 · W ${officialCount}건`}
            detail={draft.unresolvedItems.length > 0 ? `미확인 ${draft.unresolvedItems.length}건` : "모든 근거 확인 완료"}
          />
        </div>

        {/* 헤드라인 + 사유 */}
        <h4 className="mt-3 text-[16px] font-bold leading-snug text-[#123b3d]">{sanitize(draft.decision.headline)}</h4>
        <p className="mt-2 border-l-2 border-[#0E6B6F] pl-3 text-[11px] leading-relaxed text-[#334155]">{sanitize(draft.decision.reason)}</p>

        {/* 핵심 판단 근거 + 주요 위험 요소 2열 */}
        <div className={mobile ? "mt-3 grid gap-2" : "mt-3 grid grid-cols-2 gap-2"}>
          <ReportBasisSection reasons={draft.decisionReasons.filter((r) => r.type === "opportunity")} evidence={evidence} draft={draft} />
          <ReportRiskSection reasons={draft.decisionReasons.filter((r) => r.type === "risk")} evidence={evidence} draft={draft} />
        </div>

        {/* 권장 실행 방향 */}
        <ReportActionSection actions={draft.decision.immediateActions} />

        {/* 국가 상세 데이터 요약 (Step 4 데이터) */}
        <ReportCountryInsightsSummary bundle={bundle} mobile={mobile} />

        {/* 의사결정 게이트 */}
        {draft.decisionGates?.length > 0 ? <ReportGateDashboard gates={draft.decisionGates} mobile={mobile} /> : null}

        {/* 참고 공식자료 */}
        <ReportOfficialSources sources={draft.officialResearch?.sources || []} />

        {/* AI 상태 */}
        <div className={`mt-3 rounded-md border px-3 py-2 text-[10px] ${status.className}`}>
          <p className="font-semibold">{status.label}</p>
        </div>
      </PrintReportSection>

      <PrintReportSection title="3. AI 추천 진입전략" subtitle="여러 대안을 나열하지 않고 우선 실행할 진입 방식 하나를 제안합니다.">
        <div className={mobile ? "grid gap-2" : "grid grid-cols-2 gap-2"}>
          <StrategyField label="우선 고객" value={draft.entryStrategy.targetBuyer} />
          <StrategyField label="우선 채널" value={draft.entryStrategy.primaryChannel} />
          <StrategyField label="초기 제품" value={draft.entryStrategy.initialProducts} />
          <StrategyField label="포지셔닝" value={draft.entryStrategy.positioning} />
          <StrategyField label="거래조건" value={draft.entryStrategy.paymentTerms} />
          <StrategyField label="파일럿 범위" value={draft.entryStrategy.pilotScope} />
          <div className={mobile ? "" : "col-span-2"}><StrategyField label="확대 조건" value={draft.entryStrategy.expansionCondition} /></div>
        </div>
        <EvidenceRefList refs={draft.entryStrategy.evidenceRefs} />
      </PrintReportSection>

      <ReportEvidenceSection draft={draft} programEvidence={programEvidence} expandEvidence={expandEvidence} />

      <p className="mt-3 border-t border-[#dfe4ea] pt-2 text-[9px] leading-relaxed text-[#64748b]">{sanitize(draft.disclaimer)}</p>
    </div>
  );
}

function ReportEvidenceSection({ draft, programEvidence, expandEvidence }: {
  draft: ReportDraft;
  programEvidence: ReturnType<typeof buildReportProgramEvidenceCatalog>;
  expandEvidence: boolean;
}) {
  const content = (
    <div className="grid gap-3">
      <div>
        <p className="text-[10px] font-semibold text-[#334155]">프로그램 API 근거 {programEvidence.length}건</p>
        <div className="mt-1 grid gap-1">
          {programEvidence.map((item) => (
            <div key={item.evidenceId} className="grid grid-cols-[86px_1fr] gap-2 rounded border border-[#e2e8f0] p-2 text-[9px]">
              <span className="font-mono font-semibold text-[#0E6B6F]">{item.evidenceId}</span>
              <span><strong>{sanitize(item.label)}</strong> · {sanitize(item.value)} <span className="text-[#64748b]">({sanitize(item.sourceName)})</span></span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[10px] font-semibold text-[#334155]">공식 웹 근거 {draft.officialResearch.sources.length}건</p>
        {draft.officialResearch.sources.length ? draft.officialResearch.sources.map((source) => (
          <div key={source.evidenceId} className="mt-1 rounded border border-[#e2e8f0] p-2 text-[9px]">
            <span className="mr-2 font-mono font-semibold text-[#0E6B6F]">{source.evidenceId}</span>
            <a className="font-semibold underline" href={toSafePublicHref(source.url) ?? undefined} target="_blank" rel="noreferrer">{sanitize(source.title)}</a>
            <span className="ml-2 text-[#64748b]">{sanitize(source.organization)}</span>
          </div>
        )) : <p className="mt-1 text-[10px] text-[#64748b]">확인된 공식 웹 근거가 없습니다.</p>}
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <EvidenceTextList title="미확인 항목" items={draft.unresolvedItems} />
        <EvidenceTextList title="판단 가정" items={draft.assumptions} />
      </div>
    </div>
  );
  return (
    <PrintReportSection title="4. 근거 보기" subtitle="판단에 사용한 API 값, 공식 출처, 미확인 항목을 확인할 수 있습니다." tone="muted">
      {expandEvidence ? content : (
        <Accordion type="single" collapsible>
          <AccordionItem value="evidence" className="border-0">
            <AccordionTrigger className="py-2 text-sm">근거 상세 펼치기</AccordionTrigger>
            <AccordionContent>{content}</AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </PrintReportSection>
  );
}

function parseCountryVerdicts(
  rows: unknown,
): Bundle["countryVerdicts"] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((raw) => {
    const row = decisionRow(raw);
    const countryCode = decisionText(row.country_code);
    if (!countryCode) return [];
    const parsed = parseVerdictResponse(row.verdict);
    if (!parsed) return [];
    return [{ countryCode, verdict: parsed, createdAt: typeof row.created_at === "string" ? row.created_at : "" }];
  });
}

function ReportMetricCard({ label, value, detail, emphasis, verdict }: {
  label: string;
  value: string;
  detail: string;
  emphasis?: boolean;
  verdict?: string;
}) {
  const bgClass = emphasis && verdict
    ? verdict === "proceed" ? "border-emerald-300 bg-emerald-50/80"
      : verdict === "hold" ? "border-red-300 bg-red-50/80"
        : "border-amber-300 bg-amber-50/80"
    : "border-[#dfe4ea] bg-white";
  return (
    <div className={`rounded-md border p-2.5 ${bgClass}`}>
      <p className="text-[9px] font-semibold uppercase tracking-wide text-[#64748b]">{label}</p>
      <p className={`mt-1 text-[14px] font-bold ${emphasis ? "text-[#0E6B6F]" : "text-[#1e293b]"}`}>{value}</p>
      <p className="mt-0.5 text-[9px] leading-snug text-[#64748b]">{detail}</p>
    </div>
  );
}

function ReportBasisSection({ reasons, evidence, draft }: {
  reasons: ReportDraft["decisionReasons"];
  evidence: ReportEvidenceBundle;
  draft: ReportDraft;
}) {
  if (!reasons || reasons.length === 0) return null;
  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-3">
      <div className="flex items-center gap-1.5">
        <span className="h-4 w-4 text-emerald-600">✓</span>
        <p className="text-[10px] font-semibold text-[#065f46]">핵심 판단 근거</p>
      </div>
      <ul className="mt-2 space-y-2">
        {reasons.map((reason, i) => (
          <li key={`basis-${i}`} className="flex items-start gap-2 text-[11px] leading-relaxed">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
            <div>
              <span className="font-semibold">{sanitize(reason.title)}</span>
              <span className="ml-1">{sanitize(reason.interpretation)}</span>
              {reason.evidenceRefs?.length > 0 ? (
                <span className="ml-1 text-[9px] text-[#64748b]">
                  [{resolveReportSourceNames(reason.evidenceRefs, evidence, draft).join(", ")}]
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReportRiskSection({ reasons, evidence, draft }: {
  reasons: ReportDraft["decisionReasons"];
  evidence: ReportEvidenceBundle;
  draft: ReportDraft;
}) {
  if (!reasons || reasons.length === 0) return null;
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3">
      <div className="flex items-center gap-1.5">
        <span className="h-4 w-4 text-amber-600">⚠</span>
        <p className="text-[10px] font-semibold text-[#78350f]">주요 위험 요소</p>
      </div>
      <ul className="mt-2 space-y-2">
        {reasons.map((reason, i) => (
          <li key={`risk-${i}`} className="flex items-start gap-2 text-[11px] leading-relaxed">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
            <div>
              <span className="font-semibold">{sanitize(reason.title)}</span>
              <span className="ml-1">{sanitize(reason.interpretation)}</span>
              {reason.businessImpact ? (
                <p className="mt-0.5 text-[10px] text-[#64748b]">→ {sanitize(reason.businessImpact)}</p>
              ) : null}
              {reason.evidenceRefs?.length > 0 ? (
                <span className="ml-1 text-[9px] text-[#64748b]">
                  [{resolveReportSourceNames(reason.evidenceRefs, evidence, draft).join(", ")}]
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReportActionSection({ actions }: { actions: ReportDraft["decision"]["immediateActions"] }) {
  if (!actions || actions.length === 0) return null;
  return (
    <div className="mt-3 rounded-md border border-[#bfdbfe] bg-blue-50/60 p-3">
      <div className="flex items-center gap-1.5">
        <span className="h-4 w-4 text-blue-600">→</span>
        <p className="text-[10px] font-semibold text-[#1e40af]">권장 실행 방향</p>
      </div>
      <ol className="mt-2 space-y-2">
        {actions.map((item, i) => (
          <li key={`action-${i}`} className="flex items-start gap-2 text-[11px] leading-relaxed">
            <span className="mt-0.5 text-[10px] font-bold text-blue-500">{i + 1}.</span>
            <div>
              <span className="font-semibold">{sanitize(item.action)}</span>
              {item.owner ? (
                <span className="ml-1.5 inline-flex items-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-[#475569]">{sanitize(item.owner)}</span>
              ) : null}
              {i === 0 ? (
                <span className="ml-1 inline-block rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-medium text-red-800">우선</span>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ReportOfficialSources({ sources }: { sources: ReportDraft["officialResearch"]["sources"] }) {
  if (!sources || sources.length === 0) return null;
  return (
    <div className="mt-3 rounded-md border border-[#dfe4ea] bg-white p-3">
      <p className="text-[9px] font-semibold text-[#334155]">참고 공식자료</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {sources.map((source, i) => {
          const url = toSafePublicHref(source.url ?? "");
          return url ? (
            <a
              key={`official-${i}`}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 rounded border border-blue-200 bg-blue-50/50 px-2 py-1 text-[9px] text-blue-800 transition hover:bg-blue-100"
              title={source.title ?? undefined}
            >
              ↗ {sanitize(source.organization ?? source.title ?? "공식자료")}
            </a>
          ) : (
            <span key={`official-${i}`} className="inline-flex items-center rounded border border-[#e2e8f0] bg-[#f8fafc] px-2 py-1 text-[9px] text-[#64748b]">
              {sanitize(source.organization ?? source.title ?? "공식자료")}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function ReportCountryInsightsSummary({ bundle, mobile }: { bundle: Bundle; mobile: boolean }) {
  const insights = useMemo(() => {
    return bundle.countries.slice(0, 3).map((country) => {
      const facts = bundle.decisionFacts.filter((f) => f.countryCode === country.country_code);
      const market = buildMarketEvidence(facts);
      const tariff = buildTariffRangeEvidence(facts);
      const logistics = buildLogisticsEvidence(facts);
      const verdict = bundle.countryVerdicts?.find((v) => v.countryCode === country.country_code) ?? null;
      const paymentFact = facts.find((f) => f.category === "payment_risk" && f.factKey?.includes("ksure"));
      const paymentValue = paymentFact?.value as Record<string, unknown> | undefined;
      return { country, market, tariff, logistics, verdict, paymentValue };
    });
  }, [bundle]);

  if (insights.every((i) => !i.market && !i.tariff && !i.logistics && !i.verdict)) return null;

  return (
    <div className="mt-3 space-y-2">
      <p className="text-[10px] font-semibold text-[#0E6B6F]">국가 상세 데이터 요약</p>
      {insights.map(({ country, market, tariff, logistics, verdict, paymentValue }) => (
        <div key={`insight-${country.country_code}`} className="rounded-md border border-[#dfe4ea] bg-white p-3">
          <p className="text-[11px] font-semibold text-[#1e293b]">{country.country_name} ({country.country_code})</p>
          <div className={mobile ? "mt-2 grid gap-2" : "mt-2 grid grid-cols-3 gap-2"}>
            {market ? (
              <div className="rounded border border-[#e2e8f0] bg-[#f8fafc] p-2">
                <p className="text-[9px] font-semibold text-[#0E6B6F]">시장 기회</p>
                <p className="mt-1 text-[11px] font-bold text-[#1e293b]">수입 ${formatInsightUsd(market.importMarketUsd)}</p>
                <p className="text-[9px] text-[#64748b]">한국산 {market.koreaSharePct.toFixed(1)}% · ${formatInsightUsd(market.importsFromKoreaUsd)}</p>
                <p className="text-[8px] text-[#94a3b8]">{market.sourceName} · {market.referenceDate ?? "-"}</p>
              </div>
            ) : null}
            {tariff ? (
              <div className="rounded border border-[#e2e8f0] bg-[#f8fafc] p-2">
                <p className="text-[9px] font-semibold text-[#0E6B6F]">관세 현황</p>
                <p className="mt-1 text-[11px] font-bold text-[#1e293b]">
                  일반 {tariff.averageRatePct.toFixed(1)}%
                  {tariff.minRatePct === 0 ? " · 특혜 Free" : ""}
                </p>
                <p className="text-[9px] text-[#64748b]">범위 {tariff.minRatePct}%~{tariff.maxRatePct}%</p>
                <p className="text-[8px] text-[#94a3b8]">{tariff.sourceName}</p>
              </div>
            ) : null}
            {logistics ? (
              <div className="rounded border border-[#e2e8f0] bg-[#f8fafc] p-2">
                <p className="text-[9px] font-semibold text-[#0E6B6F]">물류 환경</p>
                <p className="mt-1 text-[11px] font-bold text-[#1e293b]">LPI {logistics.overall?.toFixed(1) ?? "-"}/5</p>
                <p className="text-[9px] text-[#64748b]">
                  통관 {logistics.customs?.toFixed(1) ?? "-"}
                  · 인프라 {logistics.infrastructure?.toFixed(1) ?? "-"}
                  · 운송 {logistics.internationalShipments?.toFixed(1) ?? "-"}
                </p>
                <p className="text-[8px] text-[#94a3b8]">{logistics.sourceName} · {logistics.referenceDate ?? "-"}</p>
              </div>
            ) : null}
          </div>
          {paymentValue ? (() => {
            const pm = paymentValue.payment as Record<string, unknown> | null | undefined;
            const lateRate = pm?.late_payment_rate ?? paymentValue.late_payment_rate ?? paymentValue.latePaymentRate ?? paymentValue.lateRate;
            const avgPeriod = pm?.average_payment_period ?? paymentValue.average_payment_period ?? paymentValue.avgPaymentPeriod ?? paymentValue.paymentPeriod;
            return (
              <div className="mt-2 rounded border border-[#e2e8f0] bg-[#f8fafc] p-2">
                <p className="text-[9px] font-semibold text-[#0E6B6F]">결제 위험</p>
                <p className="mt-1 text-[10px] text-[#334155]">
                  국가신용등급 {String(paymentValue.countryGrade ?? paymentValue.grade ?? "-")}
                  · 지연율 {lateRate != null ? String(lateRate) : "-"}%
                  · 평균 결제기간 {avgPeriod != null ? String(avgPeriod) : "-"}일
                </p>
              </div>
            );
          })() : null}
          {verdict ? (
            <div className={`mt-2 rounded border p-2 ${
              verdict.verdict.opinion === "적극 검토 권장" ? "border-emerald-200 bg-emerald-50/60"
                : verdict.verdict.opinion === "진출 보류 권장" ? "border-red-200 bg-red-50/60"
                  : "border-amber-200 bg-amber-50/60"
            }`}>
              <p className="text-[9px] font-semibold text-[#0E6B6F]">국가별 AI 판단 (Step 4)</p>
              <p className="mt-1 text-[11px] font-bold text-[#1e293b]">{verdict.verdict.opinion} · 신뢰도 {verdict.verdict.confidence}</p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-[#475569]">{verdict.verdict.opinionDetail}</p>
              <p className="mt-1 text-[8px] text-[#94a3b8]">생성 {verdict.createdAt ? new Date(verdict.createdAt).toLocaleDateString("ko-KR") : "-"} · Gemini</p>
            </div>
          ) : (
            <div className="mt-2 rounded border border-dashed border-[#cbd5e1] bg-[#f8fafc] p-2">
              <p className="text-[9px] text-[#94a3b8]">국가 상세분석에서 AI 판단을 먼저 생성하세요.</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ReportGateDashboard({ gates, mobile }: { gates: ReportDraft["decisionGates"]; mobile: boolean }) {
  if (!gates || gates.length === 0) return null;
  const gateIcons: Record<string, string> = {
    certification: "🛡️",
    regulation: "📋",
    tariff: "💰",
    profitability: "📊",
    payment: "🏦",
    safety: "⚠️",
  };
  const gateLabels: Record<string, string> = {
    certification: "인증",
    regulation: "규제",
    tariff: "관세",
    profitability: "수익성",
    payment: "결제",
    safety: "안전",
  };
  const blockedGates = gates.filter((g) => g.status === "blocked");
  return (
    <div className="mt-3 rounded-md border border-[#dfe4ea] bg-[#f8fafc] p-3">
      <p className="text-[10px] font-semibold text-[#0E6B6F]">의사결정 게이트</p>
      <div className={mobile ? "mt-2 grid grid-cols-2 gap-1.5" : "mt-2 grid grid-cols-3 gap-1.5"}>
        {gates.map((gate) => {
          const topic = (gate as any).gate || gate.topic;
          const icon = gateIcons[topic] ?? "📌";
          const label = gateLabels[topic] ?? topic;
          const statusClass = gate.status === "clear"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : gate.status === "blocked"
              ? "border-red-300 bg-red-50 text-red-800"
              : "border-amber-200 bg-amber-50 text-amber-800";
          const statusLabel = gate.status === "clear" ? "통과"
            : gate.status === "blocked" ? "차단"
              : "확인 필요";
          return (
            <details key={topic} className={`rounded border p-2 ${statusClass}`}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-1 text-[10px] font-semibold [&::-webkit-details-marker]:hidden">
                <span>{icon} {label}</span>
                <span className="rounded-full bg-white/60 px-1.5 py-0.5 text-[8px]">{statusLabel}</span>
              </summary>
              <div className="mt-1.5 space-y-1 border-t border-black/10 pt-1.5 text-[9px]">
                {gate.decision ? <p>{sanitize(gate.decision)}</p> : null}
                {gate.requiredAction ? <p className="text-[#475569]">필요 조치: {sanitize(gate.requiredAction)}</p> : null}
                {gate.owner ? <p className="text-[#64748b]">담당: {sanitize(gate.owner)} · 기한: {sanitize(gate.due ?? "미정")}</p> : null}
                {gate.stopCondition ? <p className="text-red-700">중단 조건: {sanitize(gate.stopCondition)}</p> : null}
              </div>
            </details>
          );
        })}
      </div>
      {blockedGates.length > 0 ? (
        <p className="mt-2 text-[10px] font-semibold text-red-700">
          ⚠ "{gateLabels[(blockedGates[0] as any).gate || blockedGates[0].topic] ?? ((blockedGates[0] as any).gate || blockedGates[0].topic)}" 게이트가 차단 상태입니다. 해소 후 수출 추진이 가능합니다.
        </p>
      ) : null}
    </div>
  );
}

function decisionHintForVerdict(verdict: string): string {
  switch (verdict) {
    case "proceed": return "주요 요건 충족, 추진 가능";
    case "conditional": return "일부 조건 확인 후 추진 가능";
    case "hold": return "차단 요인 해소 후 재검토 필요";
    default: return "판단 대기";
  }
}

function resolveReportSourceNames(
  refs: string[],
  evidence: ReportEvidenceBundle,
  draft: ReportDraft,
): string[] {
  const names: string[] = [];
  for (const ref of refs) {
    if (ref.startsWith("W-")) {
      const source = draft.officialResearch?.sources?.find((s) => s.evidenceId === ref);
      if (source?.organization) { names.push(source.organization); continue; }
      if (source?.title) { names.push(source.title); continue; }
    }
    if (ref.startsWith("P-")) {
      const item = evidence.decisionFacts?.find((f) => f.factKey === ref);
      if (item?.sourceName) { names.push(item.sourceName); continue; }
      const catalogItem = buildReportProgramEvidenceCatalog(evidence).find((e) => e.evidenceId === ref);
      if (catalogItem?.sourceName) { names.push(catalogItem.sourceName); continue; }
    }
    names.push(ref);
  }
  return [...new Set(names)];
}

function formatInsightUsd(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  return value.toLocaleString("ko-KR");
}

function StrategyField({ label, value }: { label: string; value: string }) {
  return <div className="h-full rounded-md border border-[#e2e8f0] bg-white p-2.5"><p className="text-[9px] font-semibold text-[#64748b]">{label}</p><p className="mt-1 text-[11px] leading-relaxed">{sanitize(value)}</p></div>;
}

function EvidenceTextList({ title, items }: { title: string; items: string[] }) {
  return <div className="rounded border border-[#e2e8f0] p-2"><p className="text-[10px] font-semibold">{title}</p><ul className="mt-1 space-y-1 text-[9px] text-[#475569]">{items.map((item, index) => <li key={`${title}-${index}`}>• {sanitize(item)}</li>)}</ul></div>;
}

function EvidenceRefList({ refs }: { refs: string[] }) {
  if (!refs.length) return null;
  return <div className="mt-1.5 flex flex-wrap gap-1">{refs.map((ref) => <span key={ref} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[8px] text-slate-600">{ref}</span>)}</div>;
}

function getReportAiStatus(aiState: string, programCount: number, officialCount: number) {
  if (aiState === "success") return { label: `Gemini AI 판단 완료 · 프로그램 근거 ${programCount}건 · 공식 웹 근거 ${officialCount}건`, className: "border-emerald-200 bg-emerald-50 text-emerald-800" };
  if (aiState === "partial_success") return { label: `일부 근거 미확인 · 조건부 판단 · 프로그램 근거 ${programCount}건 · 공식 웹 근거 ${officialCount}건`, className: "border-amber-200 bg-amber-50 text-amber-800" };
  if (aiState === "stale") return { label: "저장 리포트 근거 변경 · 재생성 필요", className: "border-amber-200 bg-amber-50 text-amber-800" };
  return { label: "규칙 기반 임시 결과 · Gemini 판단 미완료", className: "border-slate-200 bg-slate-50 text-slate-700" };
}

function formatDecisionVerdict(value: ReportDraft["decision"]["verdict"]): string {
  return value === "proceed" ? "추진" : value === "hold" ? "보류" : "조건부 추진";
}
function formatDecisionConfidence(value: ReportDraft["decision"]["confidence"]): string {
  return value === "high" ? "높음" : value === "low" ? "낮음" : "보통";
}
function decisionTone(value: ReportDraft["decision"]["verdict"]): string {
  return value === "proceed" ? "bg-emerald-100 text-emerald-800" : value === "hold" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800";
}
async function saveReportDraft(
  projectId: string,
  userId: string | undefined,
  draft: ReportDraft,
  evidenceHash: string,
  aiState: string,
): Promise<void> {
  if (!userId) return;

  const { error } = await supabase.from("project_reports").upsert({
    project_id: projectId,
    user_id: userId,
    draft: draft as unknown as Json,
    evidence_hash: evidenceHash,
    ai_state: aiState,
    generated_at: new Date().toISOString(),
  }, { onConflict: "project_id" });

  if (error) {
    toast.warning(`AI 리포트 저장 실패: ${error.message}`);
  }
}

function DetailCompletionBanner({
  detailCompletion,
  mobile = false,
}: {
  detailCompletion: DetailCompletionSummary;
  mobile?: boolean;
}) {
  if (!detailCompletion.incomplete) return null;

  return (
    <section className={mobile
      ? "rounded-md border border-[#f1c453] bg-[#fff8e1] p-3 text-xs text-[#8b5e00]"
      : "mt-3 break-inside-avoid rounded-md border border-[#f1c453] bg-[#fff8e1] p-3 text-[10px] text-[#8b5e00]"
    }>
      <p className="font-semibold">상세 분석 미완료</p>
      <p className="mt-1">{detailCompletion.reason}</p>
      {detailCompletion.unresolvedItems.length > 0 ? (
        <p className="mt-1">미완료 항목: {detailCompletion.unresolvedItems.join(", ")}</p>
      ) : null}
      <p className="mt-1">Step 5/리포트 진행은 가능하지만 Step 4 상세 분석 결과를 보완해야 합니다.</p>
    </section>
  );
}

function ReportFreshnessBanner({ reportIsStale, mobile = false }: { reportIsStale: boolean; mobile?: boolean }) {
  if (!reportIsStale) return null;

  return (
    <section className={mobile
      ? "rounded-md border border-[#f1c453] bg-[#fff8e1] p-3 text-xs text-[#8b5e00]"
      : "mt-3 break-inside-avoid rounded-md border border-[#f1c453] bg-[#fff8e1] p-3 text-[10px] text-[#8b5e00]"
    }>
      <p className="font-semibold">AI 리포트 재생성 필요</p>
      <p className="mt-1">저장된 AI 리포트 이후 후보국·인증·규제·리스크 근거가 변경되었습니다. 최신 근거 기준으로 AI 요약을 다시 생성하세요.</p>
    </section>
  );
}

function CountryCautionCards({
  draft,
  countries,
  print = false,
  mobile = false,
}: {
  draft: ReportDraft | null;
  countries: Bundle["countries"];
  print?: boolean;
  mobile?: boolean;
}) {
  if (countries.length === 0) {
    return (
      <p className={print ? "rounded bg-[#f4f4f4] p-2 text-[10px] text-[#5b6473]" : "rounded-md border border-border bg-white p-3 text-xs text-muted-foreground"}>
        데이터가 없습니다.
      </p>
    );
  }

  const generated = draft?.countryCautionAnalysisStatus === "generated";
  return (
    <div className={print ? "space-y-2" : "space-y-3"}>
      {countries.map((country) => {
        const analysis = generated ? findCountryCautionAnalysis(draft, country) : null;
        return (
          <CountryCautionCard
            key={`${print ? "print" : mobile ? "mobile" : "screen"}-caution-${country.country_code}`}
            countryName={country.country_name}
            analysis={analysis}
            print={print}
            mobile={mobile}
          />
        );
      })}
    </div>
  );
}

function CountryCautionCard({
  countryName,
  analysis,
  print,
  mobile,
}: {
  countryName: string;
  analysis: CountryCautionAnalysis | null;
  print: boolean;
  mobile: boolean;
}) {
  const displayName = splitCountryDisplayName(analysis?.countryName ?? countryName);
  const cardClassName = print
    ? "rounded border border-[#dfe4ea] bg-white p-2"
    : mobile
      ? "rounded-md border border-border bg-white p-3"
      : "rounded-md border border-[#dfe4ea] bg-white p-4";
  const primaryClassName = print ? "text-[10px] font-semibold text-[#0f172a]" : "font-semibold text-foreground";
  const secondaryClassName = print ? "mt-0.5 text-[9px] text-[#64748b]" : "mt-0.5 text-xs font-medium text-muted-foreground";

  if (!analysis) {
    return (
      <div className={cardClassName}>
        <CountryCautionTitle displayName={displayName} primaryClassName={primaryClassName} secondaryClassName={secondaryClassName} />
        <div className={print ? "mt-2 rounded bg-[#fff8e1] p-2 text-[10px] text-[#8b5e00]" : "mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"}>
          <p className="font-semibold">AI 국가별 유의사항 분석 미생성</p>
          <p className="mt-1">Gemini 분석 결과가 없어 원천 데이터 단순 나열을 표시하지 않습니다. AI 요약 생성을 다시 실행하세요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cardClassName}>
      <CountryCautionTitle displayName={displayName} primaryClassName={primaryClassName} secondaryClassName={secondaryClassName} />
      <div className={print ? "mt-2 rounded bg-[#f8fafc] p-2" : "mt-3 rounded-md bg-slate-50 p-3"}>
        <p className={print ? "text-[9px] font-semibold text-[#0E6B6F]" : "text-xs font-semibold text-[#0E6B6F]"}>핵심 요약</p>
        <p className={print ? "mt-1 text-[10px] leading-relaxed text-[#334155]" : "mt-1 text-sm leading-relaxed text-muted-foreground"}>
          {analysis.coreSummary}
        </p>
      </div>
      <CountryCautionIntegratedAnalysis analysis={analysis} print={print} />
    </div>
  );
}

function CountryCautionTitle({
  displayName,
  primaryClassName,
  secondaryClassName,
}: {
  displayName: { primary: string; secondary: string | null };
  primaryClassName: string;
  secondaryClassName: string;
}) {
  return (
    <div>
      <p className={primaryClassName}>{displayName.primary}</p>
      {displayName.secondary ? <p className={secondaryClassName}>{displayName.secondary}</p> : null}
    </div>
  );
}

const COUNTRY_CAUTION_FLOW_GROUPS: Array<{
  title: string;
  kinds: CountryCautionSection["kind"][];
}> = [
  { title: "인증·규제 확인", kinds: ["certification", "regulation"] },
  {
    title: "K-SURE 위험·결제 조건",
    kinds: ["ksure_country_risk", "ksure_industry_risk", "ksure_payment"],
  },
];

function CountryCautionIntegratedAnalysis({
  analysis,
  print,
}: {
  analysis: CountryCautionAnalysis;
  print: boolean;
}) {
  const sectionsByKind = new Map(analysis.sections.map((section) => [section.kind, section]));
  const groupedKinds = new Set(COUNTRY_CAUTION_FLOW_GROUPS.flatMap((group) => group.kinds));
  const groups = COUNTRY_CAUTION_FLOW_GROUPS
    .map((group) => ({
      title: group.title,
      sections: group.kinds
        .map((kind) => sectionsByKind.get(kind))
        .filter((section): section is CountryCautionSection => Boolean(section)),
    }))
    .filter((group) => group.sections.length > 0);
  const remainingSections = analysis.sections.filter((section) => !groupedKinds.has(section.kind));

  return (
    <div className={print ? "mt-2 divide-y divide-[#e6e7ea] border-t border-[#e6e7ea]" : "mt-3 divide-y divide-border border-t border-border"}>
      {groups.map((group) => (
        <CountryCautionFlowGroup
          key={`${analysis.countryCode}-${group.title}`}
          title={group.title}
          sections={group.sections}
          print={print}
        />
      ))}
      {remainingSections.map((section) => (
        <CountryCautionFlowGroup
          key={`${analysis.countryCode}-${section.kind}`}
          title={section.title}
          sections={[section]}
          print={print}
        />
      ))}
    </div>
  );
}

function CountryCautionFlowGroup({
  title,
  sections,
  print,
}: {
  title: string;
  sections: CountryCautionSection[];
  print: boolean;
}) {
  return (
    <section className={print ? "py-2 first:pt-2 last:pb-0" : "py-3 first:pt-3 last:pb-0"}>
      <h4 className={print ? "text-[10px] font-semibold text-[#0f172a]" : "text-sm font-semibold text-foreground"}>
        {title}
      </h4>
      <div className={print ? "mt-1 space-y-1" : "mt-2 grid gap-2"}>
        {sections.map((section) => (
          <CountryCautionFactCluster key={section.kind} section={section} print={print} />
        ))}
      </div>
      <CountryCautionInterpretations sections={sections} print={print} />
    </section>
  );
}

function CountryCautionFactCluster({
  section,
  print,
}: {
  section: CountryCautionSection;
  print: boolean;
}) {
  if (section.facts.length === 0) {
    return (
      <p className={print ? "text-[10px] leading-relaxed text-[#64748b]" : "text-xs leading-relaxed text-muted-foreground"}>
        <span className={print ? "font-semibold text-[#0f172a]" : "font-semibold text-foreground"}>{section.title}: </span>
        확인 가능한 데이터가 부족하므로 추가 검증 필요
      </p>
    );
  }

  return (
    <div>
      <p className={print ? "text-[10px] font-semibold text-[#0E6B6F]" : "text-xs font-semibold text-[#0E6B6F]"}>
        {section.title}
      </p>
      <ul className={print ? "mt-0.5 space-y-0.5 text-[10px] text-[#475569]" : "mt-1 space-y-1 text-xs text-muted-foreground"}>
        {section.facts.map((fact, factIndex) => (
          <li key={`${section.kind}-${fact.label}-${factIndex}`} className="leading-relaxed">
            <span className="font-medium text-foreground">{fact.label}: </span>
            <span className={getCountryCautionFactValueClass(section.kind, fact.label, fact.value, print)}>
              {fact.value}
            </span>
            <span> ({fact.meaning})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CountryCautionInterpretations({
  sections,
  print,
}: {
  sections: CountryCautionSection[];
  print: boolean;
}) {
  const interpretationSections = sections.filter((section) => section.interpretation.trim().length > 0);
  if (interpretationSections.length === 0) return null;

  return (
    <div className={print ? "mt-1 space-y-1 text-[10px] leading-relaxed text-[#334155]" : "mt-2 space-y-1.5 text-xs leading-relaxed text-foreground"}>
      {interpretationSections.map((section) => (
        <p key={`${section.kind}-interpretation`}>
          <span className="font-semibold">{section.title}: </span>
          {section.interpretation}
        </p>
      ))}
    </div>
  );
}

function getCountryCautionFactValueClass(
  kind: CountryCautionSection["kind"],
  label: string,
  value: string,
  print: boolean,
): string {
  const text = `${label} ${value}`.toLowerCase();
  const important = kind.startsWith("ksure") || /grade|risk index|late rate|payment period|late period|top term|%|\d/.test(text);
  if (!important) return print ? "font-semibold text-[#0f172a]" : "font-semibold text-foreground";
  return print ? "font-semibold text-[#0E6B6F]" : "font-semibold text-[#0E6B6F]";
}

function findCountryCautionAnalysis(
  draft: ReportDraft | null,
  country: Bundle["countries"][number],
): CountryCautionAnalysis | null {
  if (!draft) return null;
  const countryCode = country.country_code;
  const countryNameKey = normalizeCountryCautionName(country.country_name);
  return draft.countryCautionAnalyses.find((analysis) => (
    analysis.countryCode === countryCode ||
    normalizeCountryCautionName(analysis.countryName) === countryNameKey
  )) ?? null;
}

function splitCountryDisplayName(value: string): { primary: string; secondary: string | null } {
  const normalized = normalizeReportText(value) ?? UNKNOWN_TEXT;
  const match = normalized.match(/^(.+?)\(([^()]+)\)$/);
  if (!match) return { primary: normalized, secondary: null };
  return { primary: match[1].trim(), secondary: match[2].trim() };
}

function normalizeCountryCautionName(value: string | null | undefined): string {
  return (normalizeReportText(value) ?? "").toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
}

function ExecutiveSummaryPanel({ brief, mobile = false }: { brief: ExecutiveBrief; mobile?: boolean }) {
  return (
    <section className={mobile
      ? "rounded-md border border-border bg-white p-4"
      : "mt-3 break-inside-avoid rounded-md border border-[#dfe4ea] bg-[#f8fafc] p-3"
    }>
      <p className="text-[10px] font-semibold tracking-wide text-[#0E6B6F]">심사 핵심 요약</p>
      <div className={mobile ? "mt-2 grid gap-2" : "mt-2 grid grid-cols-3 gap-2"}>
        <SummaryCell title="Top 3" items={brief.top3} />
        <SummaryCell title="핵심 리스크" items={brief.keyRisks} />
        <SummaryCell title="다음 액션" items={brief.nextActions} />
      </div>
    </section>
  );
}

function SummaryCell({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded border border-[#e6e7ea] bg-white p-2">
      <p className="text-[10px] font-semibold text-[#334155]">{title}</p>
      <ul className="mt-1 space-y-1 text-[10px] text-[#475569]">
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>• {item}</li>
        ))}
      </ul>
    </div>
  );
}

async function loadReportCountries(projectId: string, selectedCountryCode: string | null) {
  const baseQuery = () => supabase
    .from("project_countries")
    .select("country_code,country_name,total_score,label,rationale")
    .eq("project_id", projectId)
    .order("rank", { ascending: true });

  if (selectedCountryCode) {
    const selectedResult = await baseQuery().eq("country_code", selectedCountryCode).limit(1);
    if ((selectedResult.data?.length ?? 0) > 0) return selectedResult;
  }
  return baseQuery().limit(1);
}

function ReportDecisionOverview({ bundle, print = false }: { bundle: Bundle; print?: boolean }) {
  const activeFacts = bundle.decisionFacts.filter((fact) => (
    !fact.isStale && !REPORT_NON_API_FACT_KEYS.has(fact.factKey ?? "")
  ));
  const incompleteActions = [...bundle.decisionActions]
    .filter((action) => action.status !== "done")
    .sort((a, b) => a.priority - b.priority);
  const commonChecks = uniqueDecisionFacts(activeFacts.filter((fact) => (
    fact.category === "customs_requirement" ||
    fact.category === "customs_documents" ||
    fact.category === "strategic_goods" ||
    fact.category === "sanctions"
  )));
  const sectionClass = print
    ? "mt-3 break-inside-avoid rounded-md border border-[#dfe4ea] bg-[#f8fafc] p-3"
    : "rounded-md border border-border bg-white p-4";
  const panelClass = print
    ? "rounded border border-[#e6e7ea] bg-white p-2"
    : "rounded-md border border-border bg-muted/20 p-3";

  return (
    <section className={sectionClass}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className={print ? "text-[10px] font-semibold tracking-wide text-[#0E6B6F]" : "text-xs font-semibold text-brand"}>실데이터 의사결정 보드</p>
          <h3 className={print ? "mt-0.5 text-[12px] font-semibold" : "mt-1 text-sm font-semibold"}>선택 국가 판단 근거</h3>
        </div>
        <p className={print ? "text-[9px] text-[#64748b]" : "text-[11px] text-muted-foreground"}>상세 근거가 있는 국가만 시장·관세 수치를 표시합니다.</p>
      </div>

      <div className={print ? "mt-2 space-y-1.5" : "mt-3 space-y-2"}>
        {bundle.countries.map((country, index) => {
          const score = Math.max(0, Math.min(100, country.total_score ?? 0));
          return (
            <div key={`decision-score-${country.country_code}`} className="grid grid-cols-[82px_1fr_34px] items-center gap-2">
              <p className={print ? "truncate text-[9px] font-medium" : "truncate text-xs font-medium"}>{index + 1}. {country.country_name}</p>
              <div className="h-2 overflow-hidden rounded-full bg-slate-200" role="img" aria-label={`${country.country_name} 추천 점수 ${score}점`}>
                <div className="h-full rounded-full bg-[#0E6B6F]" style={{ width: `${score}%` }} />
              </div>
              <p className={print ? "text-right text-[9px] font-semibold" : "text-right text-xs font-semibold"}>{country.total_score ?? "-"}</p>
            </div>
          );
        })}
      </div>

      <div className={print ? "mt-3 space-y-2" : "mt-4 grid gap-2"}>
        {bundle.countries.map((country) => {
          const facts = activeFacts.filter((fact) => fact.countryCode === country.country_code);
          const market = buildMarketEvidence(facts);
          const tariff = buildTariffRangeEvidence(facts);
          const pendingCount = incompleteActions.filter((action) => action.countryCode === country.country_code).length;
          return (
            <div
              key={`decision-country-${country.country_code}`}
              className={print ? `${panelClass} grid grid-cols-[210px_1fr] items-stretch gap-3` : panelClass}
            >
              <div className={print ? "flex items-start justify-between gap-2 border-r border-[#e6e7ea] pr-3" : "flex items-start justify-between gap-2"}>
                <div>
                  <p className={print ? "text-[10px] font-semibold" : "text-xs font-semibold"}>{country.country_name}</p>
                  <p className={print ? "text-[8px] text-[#64748b]" : "text-[10px] text-muted-foreground"}>{country.country_code} · {LABEL_KO[country.label]}</p>
                </div>
                <span className={print ? "text-[8px] text-[#0E6B6F]" : "text-[10px] font-medium text-brand"}>{facts.length ? `근거 ${facts.length}건` : "상세 미실행"}</span>
              </div>
              <div className={print ? "grid grid-cols-3 items-center gap-2 text-[9px]" : "mt-2 grid grid-cols-3 gap-2 text-[11px]"}>
                <p><span className="text-muted-foreground">시장</span> {market ? `${formatDecisionUsd(market.importMarketUsd)} · 한국산 ${market.koreaSharePct}%` : "수치 미확인"}</p>
                <p><span className="text-muted-foreground">관세</span> {tariff ? `평균 ${tariff.averageRatePct}% (${tariff.minRatePct}~${tariff.maxRatePct}%)` : "세율 미확정"}</p>
                <p><span className="text-muted-foreground">다음 행동</span> {pendingCount}건</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className={print ? "mt-3 grid grid-cols-2 gap-2" : "mt-4 grid gap-3 md:grid-cols-2"}>
        <div className={panelClass}>
          <p className={print ? "text-[9px] font-semibold text-[#334155]" : "text-xs font-semibold"}>한국 수출 전 공통점검</p>
          <ul className={print ? "mt-1 space-y-0.5 text-[9px] text-[#475569]" : "mt-2 space-y-1 text-xs text-muted-foreground"}>
            {commonChecks.slice(0, 4).map((fact) => <li key={`common-${fact.factKey ?? fact.id}`}>• {sanitize(fact.summary)}</li>)}
            {bundle.flags.slice(0, Math.max(0, 4 - commonChecks.length)).map((flag, index) => (
              <li key={`safety-${flag.flag_type}-${index}`}>• {formatFlagTypeLabel(flag.flag_type)}: {sanitize(flag.summary ?? UNKNOWN_TEXT)}</li>
            ))}
            {commonChecks.length === 0 && bundle.flags.length === 0 ? <li>• 공통점검 근거 미수집</li> : null}
          </ul>
        </div>
        <div className={panelClass}>
          <div className="flex items-center justify-between gap-2">
            <p className={print ? "text-[9px] font-semibold text-[#334155]" : "text-xs font-semibold"}>미완료 실행 항목</p>
            <span className={print ? "text-[8px] text-[#64748b]" : "text-[10px] text-muted-foreground"}>{incompleteActions.length}건</span>
          </div>
          <ol className={print ? "mt-1 space-y-0.5 text-[9px] text-[#475569]" : "mt-2 space-y-1 text-xs text-muted-foreground"}>
            {incompleteActions.slice(0, 5).map((action) => (
              <li key={`report-action-${action.countryCode}-${action.actionKey}`}>
                {countryNameForCode(bundle, action.countryCode)} · {sanitize(action.title)}
              </li>
            ))}
            {incompleteActions.length > 5 ? (
              <li className="font-medium text-[#0E6B6F]">외 {incompleteActions.length - 5}건은 국가 상세 체크리스트에서 확인</li>
            ) : null}
            {incompleteActions.length === 0 ? <li>저장된 미완료 항목이 없습니다.</li> : null}
          </ol>
        </div>
      </div>
    </section>
  );
}

function uniqueDecisionFacts(facts: ReportDecisionFact[]): ReportDecisionFact[] {
  const seen = new Set<string>();
  return facts.filter((fact) => {
    const key = fact.factKey ?? `${fact.category}:${fact.summary}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function countryNameForCode(bundle: Bundle, countryCode: string): string {
  return bundle.countries.find((country) => country.country_code === countryCode)?.country_name ?? countryCode;
}

function formatDecisionUsd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}M`;
  return `$${value.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}`;
}

function ReportAiConclusionPrint({ draft, summaryText }: { draft: ReportDraft | null; summaryText: string }) {
  return (
    <PrintReportSection title="AI 종합 결론" tone="highlight">
      <p className="text-[12px] font-semibold leading-relaxed text-[#102a2d]">
        {sanitize(draft?.executiveSummary ?? summaryText)}
      </p>
      {draft ? (
        <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
          <ConclusionMetric title="우선 판단" value={draft.topCountryReason} />
          <ConclusionMetric title="수출 가능성" value={draft.exportFeasibility} />
          <ConclusionMetric title="다음 조치" value={draft.actionPlan7Days[0] ?? UNKNOWN_TEXT} />
        </div>
      ) : null}
    </PrintReportSection>
  );
}

function ConclusionMetric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded border border-[#c9dedf] bg-white px-2 py-1.5">
      <p className="text-[9px] font-semibold text-[#0E6B6F]">{title}</p>
      <p className="mt-0.5 line-clamp-3 text-[9px] leading-snug text-[#334155]">{sanitize(value)}</p>
    </div>
  );
}

function ReportAiDecisionPanel({ draft, print = false }: { draft: ReportDraft; print?: boolean }) {
  const decision = draft.aiDecision;
  const research = draft.webResearch;
  const sectionClass = print
    ? "mt-3 break-inside-avoid rounded-md border border-[#c9dedf] bg-white p-3"
    : "rounded-md border border-brand/30 bg-white p-4";
  const textClass = print ? "text-[10px] leading-relaxed text-[#334155]" : "text-xs leading-relaxed text-muted-foreground";

  return (
    <section className={sectionClass}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={print ? "text-[12px] font-semibold text-[#0E6B6F]" : "text-sm font-semibold text-brand"}>AI 종합판단</h3>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#0E6B6F] px-2 py-0.5 text-[10px] font-semibold text-white">{formatAiVerdict(decision.verdict)}</span>
          <span className={print ? "text-[9px] text-[#64748b]" : "text-[11px] text-muted-foreground"}>판단 신뢰도 {formatAiConfidence(decision.confidence)}</span>
        </div>
      </div>
      <p className={`mt-2 ${textClass}`}>{sanitize(decision.rationale)}</p>

      <div className={print ? "mt-3 grid grid-cols-3 gap-2" : "mt-3 grid gap-2 sm:grid-cols-3"}>
        <DecisionList title="기회" items={decision.opportunities} print={print} />
        <DecisionList title="차단 요인" items={decision.blockers} print={print} />
        <DecisionList title="중단 조건" items={decision.stopConditions} print={print} />
      </div>

      <div className={print ? "mt-3 rounded bg-[#eef8f7] p-2" : "mt-3 rounded-md bg-brand/5 p-3"}>
        <p className={print ? "text-[9px] font-semibold text-[#0E6B6F]" : "text-xs font-semibold text-brand"}>권장 진행 방향</p>
        <p className={`mt-1 ${textClass}`}>{sanitize(decision.recommendedDirection)}</p>
      </div>

      <div className="mt-3 border-t border-border pt-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className={print ? "text-[10px] font-semibold" : "text-xs font-semibold"}>인터넷 검색 근거</p>
            <p className={print ? "text-[8px] text-[#64748b]" : "text-[10px] text-muted-foreground"}>검색 근거는 공공데이터와 구분하여 표시합니다.</p>
          </div>
          <span className={print ? "text-[8px] text-[#64748b]" : "text-[10px] text-muted-foreground"}>{research.sources.length}개 출처</span>
        </div>
        <p className={`mt-2 ${textClass}`}>{sanitize(research.summary)}</p>
        {research.keyFindings.length > 0 ? (
          <ul className={`mt-2 space-y-1 ${textClass}`}>
            {research.keyFindings.slice(0, 5).map((finding, index) => <li key={`web-finding-${index}`}>• {sanitize(finding)}</li>)}
          </ul>
        ) : null}
        {research.sources.length > 0 ? (
          <ol className={`mt-2 space-y-1 ${textClass}`}>
            {research.sources.slice(0, 8).map((source, index) => (
              <li key={`web-source-${source.url}-${index}`}>
                <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-brand underline underline-offset-2">
                  {index + 1}. {sanitize(source.title)}
                </a>
              </li>
            ))}
          </ol>
        ) : (
          <p className={`mt-2 ${textClass}`}>검색 출처가 생성되지 않았습니다. AI 리포트를 다시 생성해 주세요.</p>
        )}
      </div>
    </section>
  );
}

function DecisionList({ title, items, print }: { title: string; items: string[]; print: boolean }) {
  return (
    <div className={print ? "rounded border border-[#e6e7ea] p-2" : "rounded-md border border-border p-3"}>
      <p className={print ? "text-[9px] font-semibold" : "text-xs font-semibold"}>{title}</p>
      <ul className={print ? "mt-1 space-y-0.5 text-[9px] text-[#475569]" : "mt-2 space-y-1 text-xs text-muted-foreground"}>
        {items.slice(0, 4).map((item, index) => <li key={`${title}-${index}`}>• {sanitize(item)}</li>)}
        {items.length === 0 ? <li>• 확인된 항목 없음</li> : null}
      </ul>
    </div>
  );
}

function formatAiVerdict(value: ReportDraft["aiDecision"]["verdict"]): string {
  if (value === "proceed") return "추진 검토";
  if (value === "hold") return "보류";
  return "조건부 추진";
}

function formatAiConfidence(value: ReportDraft["aiDecision"]["confidence"]): string {
  if (value === "high") return "높음";
  if (value === "low") return "낮음";
  return "보통";
}

function ReportCountryCardsPrint({ bundle, draft }: { bundle: Bundle; draft: ReportDraft | null }) {
  return (
    <>
      <h3 className="mt-5 font-display text-sm font-semibold text-[#0E6B6F]">수출 후보국 Top 3</h3>
      <div className="mt-2 grid grid-cols-3 gap-3">
        {bundle.countries.length === 0 ? (
          <p className="col-span-3 rounded bg-[#f4f4f4] p-3 text-[#5b6473]">추천 국가 데이터가 없습니다.</p>
        ) : bundle.countries.map((country, idx) => {
          const strategy = findCountryStrategy(draft, country.country_code);
          return (
            <div key={country.country_code} className="rounded border border-[#e6e7ea] p-3">
              <p className="text-[9px] uppercase text-[#5b6473]">Rank {idx + 1} · {country.country_code}</p>
              <p className="mt-1 font-display text-base font-bold">{country.country_name}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {country.total_score ?? "-"}
                <span className="text-[10px] font-normal text-[#5b6473]">/100</span>
              </p>
              <p className="mt-1 text-[10px]">{LABEL_KO[country.label]}</p>
              <p className="mt-2 rounded bg-[#eef8f7] px-2 py-1 text-[10px] font-semibold leading-snug text-[#0E4F53]">
                판단: {sanitize(strategy?.oneLineDecision ?? buildCountryEvidenceBrief(bundle, country))}
              </p>
              <p className="mt-1 line-clamp-3 text-[10px] text-[#5b6473]">
                {buildCountryEvidenceBrief(bundle, country)}
              </p>
            </div>
          );
        })}
      </div>
    </>
  );
}

function ReportFeasibilityPrint({ draft }: { draft: ReportDraft }) {
  return (
    <PrintReportSection title="수출 가능성 종합 판정" tone="highlight">
      <p className="text-[11px] leading-relaxed">{sanitize(draft.exportFeasibility)}</p>
      <div className="mt-2 space-y-2">
        {draft.countryStrategies.slice(0, 3).map((strategy, idx) => (
          <div key={`feasibility-${strategy.countryCode}`} className="grid grid-cols-[128px_1fr] items-stretch gap-3 rounded-md border border-[#dfe4ea] bg-white p-2">
            <div className="flex flex-col justify-center border-r border-[#e6e7ea] pr-3 text-center">
              <p className="text-[9px] text-[#5b6473]">선택 국가 {idx + 1}</p>
              <p className="mt-0.5 text-[11px] font-semibold">{strategy.countryName}</p>
              <p className="mt-0.5 font-mono text-[13px] font-bold tabular-nums text-[#334155]">
                {String((strategy as { totalScore?: number | string | null }).totalScore ?? "—")}
              </p>
              <div className="mt-1"><FeasibilityBadgePrint grade={strategy.feasibilityGrade} /></div>
            </div>
            <div className="flex flex-col justify-center">
              <p className="text-[9px] font-semibold text-[#0E6B6F]">판단 요약</p>
              <p className="mt-1 text-[10px] leading-relaxed text-[#334155]">{sanitize(strategy.oneLineDecision)}</p>
            </div>
          </div>
        ))}
      </div>
    </PrintReportSection>
  );
}

function ReportNewsImpactPrint({ draft }: { draft: ReportDraft }) {
  const hasAnyNews = draft.countryStrategies.some(
    (s) => s.newsImpactAnalysis && parseNewsImpactAnalysis(s.newsImpactAnalysis).state !== "no_evidence",
  );
  return (
    <PrintReportSection title="뉴스·이슈 수출전략 영향">
      <NewsImpactAccordion strategies={draft.countryStrategies.slice(0, 3)} print />
      {!hasAnyNews ? (
        <p className="mt-2 text-[9px] text-[#8b5e00]">안내: 대상국 직접 뉴스가 부족합니다. 관련 뉴스 모니터링을 권고합니다.</p>
      ) : null}
    </PrintReportSection>
  );
}

function NewsImpactAccordion({
  strategies,
  print = false,
}: {
  strategies: ReportDraft["countryStrategies"];
  print?: boolean;
}) {
  return (
    <Accordion type="multiple" className={print ? "space-y-1.5" : "space-y-2"}>
      {strategies.map((strategy) => {
        const parsed = parseNewsImpactAnalysis(strategy.newsImpactAnalysis);
        return (
          <AccordionItem
            key={`news-${strategy.countryCode}`}
            value={`news-${strategy.countryCode}`}
            className={print
              ? "rounded-md border border-[#e6e7ea] bg-white px-2 shadow-none"
              : "rounded-md border border-border bg-white px-3 shadow-sm"
            }
          >
            <AccordionTrigger
              className={print
                ? "group py-2 text-left text-[10px] hover:no-underline"
                : "group py-3 text-left text-sm hover:no-underline"
              }
            >
              <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className={print ? "block font-semibold text-[#334155]" : "block font-semibold text-foreground"}>
                    {strategy.countryName} ({strategy.countryCode})
                  </span>
                  <span className={print ? "mt-0.5 block text-[9px] font-semibold text-[#0E6B6F]" : "mt-0.5 block text-[11px] font-semibold text-brand"}>
                    수출전략 영향 · {formatNewsImpactState(parsed.state)}
                  </span>
                </span>
                <span className={print
                  ? "shrink-0 rounded border border-[#0E6B6F] px-1.5 py-0.5 text-[8px] font-semibold text-[#0E6B6F]"
                  : "shrink-0 rounded-md border border-brand/40 px-2 py-1 text-[11px] font-semibold text-brand"
                }>
                  <span className="group-data-[state=open]:hidden">세부 내용 펼치기</span>
                  <span className="hidden group-data-[state=open]:inline">접기</span>
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className={print ? "pb-2 pt-0" : "pb-3 pt-0"}>
              <NewsImpactAnalysisContent value={strategy.newsImpactAnalysis} print={print} />
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}

function TradeOfficeActionsAccordion({
  actions,
  print = false,
}: {
  actions: CountryExecutionActions[];
  print?: boolean;
}) {
  if (actions.length === 0) return null;

  const officeCount = actions.reduce((sum, action) => sum + action.tradeOffices.length, 0);

  return (
    <Accordion type="multiple" className={print ? "mt-3 break-inside-avoid" : ""}>
      <AccordionItem
        value="trade-office-actions"
        className={print
          ? "rounded-md border border-[#dfe4ea] bg-white px-3 shadow-none"
          : "rounded-md border border-border bg-white px-4 shadow-sm"
        }
      >
        <AccordionTrigger
          className={print
            ? "group py-2 text-left hover:no-underline"
            : "group py-3 text-left hover:no-underline"
          }
        >
          <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
            <span className="min-w-0">
              <span className={print
                ? "block font-display text-sm font-semibold text-[#0E6B6F]"
                : "block text-sm font-semibold text-foreground"
              }>
                실행 연결 경로(무역관)
              </span>
              <span className={print
                ? "mt-0.5 block text-[9px] font-medium text-[#5b6473]"
                : "mt-0.5 block text-xs font-medium text-muted-foreground"
              }>
                {actions.length}개국 · 무역관 {officeCount}건
              </span>
            </span>
            <span className={print
              ? "shrink-0 rounded border border-[#0E6B6F] px-1.5 py-0.5 text-[8px] font-semibold text-[#0E6B6F]"
              : "shrink-0 rounded-md border border-brand/40 px-2 py-1 text-[11px] font-semibold text-brand"
            }>
              <span className="group-data-[state=open]:hidden">상세 보기</span>
              <span className="hidden group-data-[state=open]:inline">접기</span>
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent className={print ? "pb-2 pt-0" : "pb-3 pt-0"}>
          <div className={print ? "space-y-2" : "space-y-2"}>
            {actions.map((countryAction) => (
              <div
                key={`${print ? "print" : "mobile"}-execution-${countryAction.countryCode}`}
                className={print
                  ? "rounded border border-[#e6e7ea] p-2"
                  : "rounded-md border border-border p-2"
                }
              >
                <p className={print ? "text-[10px] font-semibold" : "text-xs font-semibold"}>
                  {countryAction.countryName} ({countryAction.countryCode})
                </p>
                {countryAction.tradeOffices.length > 0 ? (
                  <div className={print ? "mt-1 space-y-1.5" : "mt-1 space-y-2"}>
                    <p className={print ? "text-[10px] text-[#5b6473]" : "text-[11px] text-muted-foreground"}>무역관</p>
                    {countryAction.tradeOffices.map((item, idx) => (
                      <div
                        key={`${print ? "print" : "mobile"}-trade-${countryAction.countryCode}-${idx}`}
                        className={print
                          ? "rounded-sm bg-[#f8fafc] px-2 py-1.5 text-[10px]"
                          : "rounded-sm bg-muted/40 px-2 py-1.5 text-xs"
                        }
                      >
                        <p className={print ? "font-semibold text-[#102a2d]" : "font-semibold"}>
                          {item.url ? (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noreferrer"
                              className={print
                                ? "text-[#0E6B6F] underline decoration-dotted underline-offset-2"
                                : "text-brand underline"
                              }
                            >
                              {item.title}
                            </a>
                          ) : (
                            <span>{item.title}</span>
                          )}
                        </p>
                        {item.displaySummary ? (
                          <p className={print
                            ? "mt-0.5 break-words leading-relaxed text-[#5b6473]"
                            : "mt-1 break-words leading-relaxed text-muted-foreground"
                          }>
                            {item.displaySummary}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={print ? "mt-1 text-[10px] text-[#5b6473]" : "mt-1 text-xs text-muted-foreground"}>
                    확실한 정보 없음
                  </p>
                )}
              </div>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function NewsImpactAnalysisContent({ value, print = false }: { value: string; print?: boolean }) {
  const parsed = parseNewsImpactAnalysis(value);
  if (parsed.state === "structured") {
    return (
      <div className={print ? "mt-1 space-y-1" : "mt-2 space-y-2"}>
        {parsed.sections.map((section) => (
          <div
            key={section.label}
            className={print ? "border-l-2 border-[#0E6B6F] pl-2" : "border-l-2 border-brand/70 pl-2"}
          >
            <p className={print ? "text-[9px] font-semibold text-[#0E6B6F]" : "text-[11px] font-semibold text-brand"}>
              {section.label}
            </p>
            <p className={print ? "mt-0.5 text-[10px] leading-relaxed text-[#334155]" : "mt-0.5 text-xs leading-relaxed text-muted-foreground"}>
              {sanitize(section.body)}
            </p>
          </div>
        ))}
      </div>
    );
  }

  const toneClass = parsed.state === "no_evidence" || parsed.state === "pending"
    ? print ? "text-[#8b5e00]" : "text-amber-700"
    : print ? "text-[#334155]" : "text-muted-foreground";
  return (
    <p className={`${print ? "mt-1 text-[10px]" : "mt-1 text-xs"} leading-relaxed ${toneClass}`}>
      {sanitize(parsed.text)}
    </p>
  );
}

function formatNewsImpactState(state: ReturnType<typeof parseNewsImpactAnalysis>["state"]): string {
  if (state === "structured") return "세부 분석 3개 항목";
  if (state === "pending") return "AI 분석 미생성";
  if (state === "no_evidence") return "뉴스 근거 부족";
  return "기존 문장";
}

function ReportCertRegChecklistPrint({ draft }: { draft: ReportDraft }) {
  return (
    <PrintReportSection title="인증·규제 체크리스트">
      <div className="space-y-2 text-[10px]">
        {draft.countryStrategies.slice(0, 3).map((strategy) => (
          <div key={`cert-reg-${strategy.countryCode}`} className="rounded-md border border-[#e6e7ea] bg-white p-3">
            <p className="font-semibold text-[#334155]">{strategy.countryName} ({strategy.countryCode})</p>
            <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[#5b6473]">
              {strategy.certRegChecklist.slice(0, 5).map((item, index) => (
                <li key={index} className="flex items-start gap-1">
                  <span className="mt-0.5 text-[#0E6B6F]">☐</span>
                  <span>{sanitize(item)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </PrintReportSection>
  );
}

function ReportStrategyPrint({ draft }: { draft: ReportDraft }) {
  return (
    <PrintReportSection title="선택 국가 진입전략">
      <div className="space-y-2">
        {draft.countryStrategies.slice(0, 3).map((strategy) => (
          <div key={`strategy-${strategy.countryCode}`} className="rounded-md border border-[#e6e7ea] bg-white p-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold">{strategy.countryName} ({strategy.countryCode})</p>
              <FeasibilityBadgePrint grade={strategy.feasibilityGrade} />
            </div>
            <p className="mt-2 rounded-md bg-[#eef8f7] px-2 py-1.5 text-[9px] font-semibold leading-relaxed text-[#0E4F53]">
              {sanitize(strategy.oneLineDecision)}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-md bg-[#f8fafc] p-2">
                <p className="text-[9px] font-semibold text-[#0E6B6F]">시장 기회</p>
                <p className="mt-1 text-[9px] leading-relaxed text-[#334155]">{sanitize(strategy.marketOpportunity)}</p>
              </div>
              <div className="rounded-md bg-[#f8fafc] p-2">
                <p className="text-[9px] font-semibold text-[#475569]">진입 전략</p>
                <p className="mt-1 text-[9px] leading-relaxed text-[#334155]">{sanitize(strategy.entryStrategy)}</p>
              </div>
              <div className="rounded-md bg-[#f8fafc] p-2">
                <p className="text-[9px] font-semibold text-[#475569]">인증·규제 체크리스트</p>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-[9px] text-[#5b6473]">
                  {strategy.certRegChecklist.slice(0, 4).map((item, index) => <li key={index}>{sanitize(item)}</li>)}
                </ul>
              </div>
              <div className="rounded-md bg-[#f8fafc] p-2">
                <p className="text-[9px] font-semibold text-[#475569]">결제 리스크</p>
                <p className="mt-1 text-[9px] leading-relaxed text-[#5b6473]">{sanitize(strategy.paymentRiskAssessment)}</p>
              </div>
            </div>
            {strategy.evidenceRefs.length > 0 ? (
              <p className="mt-2 text-[9px] text-[#0E6B6F]">
                근거: {strategy.evidenceRefs.slice(0, 2).map((item) => sanitize(item)).join(", ")}
              </p>
            ) : null}
            {strategy.evidenceLimits.length > 0 ? (
              <p className="mt-1 text-[9px] text-[#8b5e00]">
                한계: {strategy.evidenceLimits.slice(0, 2).map((item) => sanitize(item)).join(", ")}
              </p>
            ) : null}
            {renderKotraEntryStrategyEvidence(strategy.kotraEntryStrategy, "print")}
          </div>
        ))}
      </div>
    </PrintReportSection>
  );
}

function renderKotraEntryStrategyEvidence(
  strategy: {
    status?: string;
    title?: string;
    publishedDate?: string;
    tradeOffice?: string;
    sourceUrl?: string;
    attachmentName?: string;
    attachmentUrl?: string;
    usedPdf?: boolean;
    basisSummary?: string;
    limitations?: string[];
  } | undefined,
  variant: "print" | "mobile",
) {
  if (!strategy || (strategy.status !== "available" && strategy.status !== "pdf_failed")) return null;
  const isPrint = variant === "print";
  const textSize = isPrint ? "text-[9px]" : "text-xs";
  const titleSize = isPrint ? "text-[9px]" : "text-[11px]";
  const containerClass = isPrint
    ? "mt-1.5 rounded border border-[#d8e7e6] bg-[#f5fbfa] p-1.5"
    : "mt-2 rounded-md border border-border bg-brand/5 p-2";
  const attachmentHref = toSafePublicHref(strategy.attachmentUrl ?? "");
  const limitations = Array.isArray(strategy.limitations) ? strategy.limitations.filter(Boolean) : [];

  return (
    <div className={containerClass}>
      <p className={`${titleSize} font-semibold text-[#0E6B6F]`}>KOTRA 진출전략 참고 링크</p>
      <p className={`mt-0.5 ${textSize} text-[#334155]`}>
        {sanitize(strategy.title ?? "진출전략 제목 없음")}
      </p>
      {strategy.tradeOffice ? (
        <p className={`mt-0.5 ${textSize} text-[#5b6473]`}>담당 무역관: {sanitize(strategy.tradeOffice)}</p>
      ) : null}
      {strategy.publishedDate ? (
        <p className={`mt-0.5 ${textSize} text-[#5b6473]`}>공개일: {sanitize(strategy.publishedDate)}</p>
      ) : null}
      <div className={`mt-0.5 flex flex-wrap gap-2 ${textSize}`}>
        {attachmentHref ? (
          <a href={attachmentHref} target="_blank" rel="noopener noreferrer" className="text-[#0E6B6F] underline">
            {strategy.attachmentName ? sanitize(strategy.attachmentName) : "첨부 PDF"}
          </a>
        ) : strategy.attachmentName ? (
          <span className="text-[#0E6B6F]">{sanitize(strategy.attachmentName)}</span>
        ) : null}
      </div>
      {limitations.length > 0 ? (
        <p className={`mt-0.5 ${textSize} text-[#8b5e00]`}>
          한계: {limitations.slice(0, 2).map((item) => sanitize(item)).join(", ")}
        </p>
      ) : null}
    </div>
  );
}

function ReportPreExportChecklistPrint({ draft }: { draft: ReportDraft }) {
  return (
    <PrintReportSection title="수출 전 필수 확인 사항">
      <ul className="grid grid-cols-2 gap-2 text-[10px]">
        {draft.preExportChecklist.slice(0, 10).map((item, index) => (
          <li key={index} className="flex items-start gap-1 rounded-md border border-[#e6e7ea] px-2 py-1.5">
            <span className="mt-0.5 text-[#0E6B6F]">☐</span>
            <span>{sanitize(item)}</span>
          </li>
        ))}
      </ul>
    </PrintReportSection>
  );
}

function ReportActionPlanPrint({ draft }: { draft: ReportDraft }) {
  return (
    <PrintReportSection title="실행 로드맵">
      <div className="grid grid-cols-3 gap-2 text-[10px]">
        <ActionPlanColumn title="D+7" items={draft.actionPlan7Days} />
        <ActionPlanColumn title="D+30" items={draft.actionPlan30Days} />
        <ActionPlanColumn title="D+90" items={draft.actionPlan90Days} />
      </div>
    </PrintReportSection>
  );
}

function ReportFallbackActionPlanPrint({
  actionItems,
  hasAiActions,
}: {
  actionItems: string[];
  hasAiActions: boolean;
}) {
  return (
    <PrintReportSection title="실행 로드맵">
      {!hasAiActions ? (
        <p className="text-[10px] text-[#5b6473]">AI 요약이 없어서 기본 권고안을 표시합니다.</p>
      ) : null}
      <ol className={`${hasAiActions ? "" : "mt-2"} list-inside list-decimal space-y-1 text-[11px]`}>
        {actionItems.map((action, index) => <li key={index}>{sanitize(action)}</li>)}
      </ol>
    </PrintReportSection>
  );
}

function ActionPlanColumn({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="h-full rounded-md border border-[#e6e7ea] bg-white p-2">
      <p className="text-[10px] font-semibold text-[#334155]">{title}</p>
      <ol className="mt-1 list-inside list-decimal space-y-0.5 text-[#5b6473]">
        {items.slice(0, 4).map((item, index) => <li key={index}>{sanitize(item)}</li>)}
      </ol>
    </div>
  );
}

function findCountryStrategy(draft: ReportDraft | null, countryCode: string) {
  return draft?.countryStrategies.find((strategy) => strategy.countryCode === countryCode) ?? null;
}

function MobileReportView({
  bundle,
  actionItems,
  executionActions,
  detailCompletion,
  reportIsStale,
  executiveBrief,
  aiSummaryText,
  reportDraft,
}: {
  bundle: Bundle;
  actionItems: string[];
  executionActions: CountryExecutionActions[];
  detailCompletion: DetailCompletionSummary;
  reportIsStale: boolean;
  executiveBrief: ExecutiveBrief;
  aiSummaryText: string;
  reportDraft: ReportDraft | null;
}) {
  return (
    <div className="space-y-4 text-sm">
      <section className="rounded-md border border-border bg-white p-4">
        <p className="text-xs text-muted-foreground">AI 수출전략 의사결정 리포트</p>
        <h2 className="mt-1 text-lg font-semibold">{bundle.project?.title ?? "리포트"}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          발행일 {format(new Date(bundle.project?.updated_at ?? Date.now()), "yyyy.MM.dd")}
        </p>
      </section>
      <DetailCompletionBanner detailCompletion={detailCompletion} mobile />
      <ReportFreshnessBanner reportIsStale={reportIsStale} mobile />
      <MobileAiConclusionBlock draft={reportDraft} summaryText={aiSummaryText} />
      {reportDraft ? <ReportAiDecisionPanel draft={reportDraft} /> : null}
      <ExecutiveSummaryPanel brief={executiveBrief} mobile />
      <ReportDecisionOverview bundle={bundle} />

      <>
        <MobileInfoBlock title="기업 정보">
          <p className="font-medium">{bundle.company?.company_name ?? "-"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {bundle.company?.industrial_complex ?? ""} {bundle.company?.address ?? ""}
          </p>
        </MobileInfoBlock>
        <MobileInfoBlock title="제품 정보">
          <p className="font-medium">{bundle.product?.name ?? "-"}</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            HS {bundle.product?.hs_code ?? "-"} · HSK {bundle.product?.hsk_code ?? "-"}
          </p>
        </MobileInfoBlock>
        <MobileInfoBlock title="제품 분류 근거">
          <p className="font-mono text-xs text-muted-foreground">
            HS {bundle.product?.hs_code ?? "-"} · HSK {bundle.product?.hsk_code ?? "-"}
          </p>
          <p className="mt-1 text-xs">
            선택 소스: {getSelectionSourceLabel(bundle.product?.hs_selection_source ?? null)}
            {bundle.product?.hs_selection_score !== null && bundle.product?.hs_selection_score !== undefined
              ? ` (${bundle.product.hs_selection_score}점)`
              : ""}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            상태: {getSelectionStatusLabel(bundle.product?.hs_selection_status ?? null)} · {getSelectionStatusDetail(bundle.product?.hs_selection_status ?? null)}
          </p>
        </MobileInfoBlock>
      </>

      {reportDraft ? (
        <>
          <MobileInfoBlock title="수출 가능성 종합 판정">
            <p className="text-xs leading-relaxed">{sanitize(reportDraft.exportFeasibility)}</p>
            <div className="mt-3 space-y-2">
              {reportDraft.countryStrategies.slice(0, 3).map((strategy, idx) => (
                <div key={`mobile-feas-${strategy.countryCode}`} className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 p-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground">선택 국가 {idx + 1}</p>
                    <p className="mt-0.5 text-xs font-semibold">{strategy.countryName}</p>
                  </div>
                  <FeasibilityBadgePrint grade={strategy.feasibilityGrade} />
                </div>
              ))}
            </div>
          </MobileInfoBlock>
          <MobileInfoBlock title="뉴스·이슈 수출전략 영향">
            <NewsImpactAccordion strategies={reportDraft.countryStrategies.slice(0, 3)} />
          </MobileInfoBlock>
          <MobileCertRegChecklistBlock draft={reportDraft} />
          <MobileStrategyBlock draft={reportDraft} />
          <MobileInfoBlock title="수출 전 필수 확인 사항">
            <ul className="space-y-1">
              {reportDraft.preExportChecklist.slice(0, 10).map((item, index) => (
                <li key={index} className="flex items-start gap-2 text-xs">
                  <span className="mt-0.5 text-brand">☐</span>
                  <span>{sanitize(item)}</span>
                </li>
              ))}
            </ul>
          </MobileInfoBlock>
        </>
      ) : null}

      <TradeOfficeActionsAccordion actions={executionActions} />

      <MobileInfoBlock title="선택 국가 유의사항">
        <CountryCautionCards draft={reportDraft} countries={bundle.countries} mobile />
      </MobileInfoBlock>

      {reportDraft ? (
        <MobileActionPlanBlock draft={reportDraft} />
      ) : (
        <MobileInfoBlock title="실행 로드맵">
          <ol className="list-inside list-decimal space-y-1 text-xs leading-relaxed">
            {actionItems.map((action, index) => <li key={index}>{sanitize(action)}</li>)}
          </ol>
        </MobileInfoBlock>
      )}

    </div>
  );
}

function MobileInfoBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-white p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function MobileAiConclusionBlock({ draft, summaryText }: { draft: ReportDraft | null; summaryText: string }) {
  return (
    <section className="rounded-md border border-brand/40 bg-brand/5 p-4">
      <h3 className="text-sm font-semibold text-brand">AI 종합 결론</h3>
      <p className="mt-2 text-sm font-medium leading-relaxed">
        {sanitize(draft?.executiveSummary ?? summaryText)}
      </p>
      {draft ? (
        <div className="mt-3 grid gap-2">
          <MobileConclusionMetric title="우선 판단" value={draft.topCountryReason} />
          <MobileConclusionMetric title="수출 가능성" value={draft.exportFeasibility} />
          <MobileConclusionMetric title="다음 조치" value={draft.actionPlan7Days[0] ?? UNKNOWN_TEXT} />
        </div>
      ) : null}
    </section>
  );
}

function MobileConclusionMetric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-white p-2">
      <p className="text-[11px] font-semibold text-brand">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{sanitize(value)}</p>
    </div>
  );
}

function MobileCountryCards({ bundle, draft }: { bundle: Bundle; draft: ReportDraft | null }) {
  return (
    <section>
      <h3 className="font-semibold">수출 후보국 Top 3</h3>
      <div className="mt-2 space-y-2">
        {bundle.countries.length === 0 ? (
          <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">추천 국가 데이터가 없습니다.</p>
        ) : (
          bundle.countries.map((country, index) => {
            const strategy = findCountryStrategy(draft, country.country_code);
            return (
              <div key={country.country_code} className="rounded-md border border-border bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Rank {index + 1} · {country.country_code}</p>
                    <p className="mt-1 font-medium">{country.country_name}</p>
                  </div>
                  <p className="font-semibold tabular-nums">{country.total_score ?? "-"}/100</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{LABEL_KO[country.label]}</p>
                <p className="mt-2 rounded-md bg-brand/5 px-2 py-1 text-xs font-semibold text-brand">
                  판단: {sanitize(strategy?.oneLineDecision ?? buildCountryEvidenceBrief(bundle, country))}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {buildCountryEvidenceBrief(bundle, country)}
                </p>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function MobileCertRegChecklistBlock({ draft }: { draft: ReportDraft }) {
  return (
    <MobileInfoBlock title="인증·규제 체크리스트">
      <div className="space-y-2">
        {draft.countryStrategies.slice(0, 3).map((strategy) => (
          <div key={`mobile-cert-reg-${strategy.countryCode}`} className="rounded-md border border-border p-2">
            <p className="text-xs font-semibold">{strategy.countryName} ({strategy.countryCode})</p>
            <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
              {strategy.certRegChecklist.map((item, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="mt-0.5 text-brand">☐</span>
                  <span>{sanitize(item)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </MobileInfoBlock>
  );
}

function MobileStrategyBlock({ draft }: { draft: ReportDraft }) {
  return (
    <MobileInfoBlock title="국가별 진입전략">
      <div className="space-y-3">
        {draft.countryStrategies.map((strategy) => (
          <div key={`mobile-strategy-${strategy.countryCode}`} className="rounded-md border border-border p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold">{strategy.countryName} ({strategy.countryCode})</p>
              <FeasibilityBadgePrint grade={strategy.feasibilityGrade} />
            </div>
            <p className="mt-2 rounded-md bg-brand/5 px-2 py-1 text-xs font-semibold text-brand">
              {sanitize(strategy.oneLineDecision)}
            </p>
            <p className="mt-2 text-[11px] font-semibold text-brand">시장 기회</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{sanitize(strategy.marketOpportunity)}</p>
            <p className="mt-2 text-[11px] font-semibold">진입 전략</p>
            <p className="mt-0.5 text-xs">{sanitize(strategy.entryStrategy)}</p>
            <p className="mt-2 text-[11px] font-semibold">인증·규제 체크리스트</p>
            <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-muted-foreground">
              {strategy.certRegChecklist.map((item, index) => <li key={index}>{sanitize(item)}</li>)}
            </ul>
            <p className="mt-2 text-[11px] font-semibold">결제 리스크</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{sanitize(strategy.paymentRiskAssessment)}</p>
            {strategy.evidenceRefs.length > 0 ? (
              <p className="mt-2 text-xs text-brand">
                근거: {strategy.evidenceRefs.map((item) => sanitize(item)).join(", ")}
              </p>
            ) : null}
            {strategy.evidenceLimits.length > 0 ? (
              <p className="mt-1 text-xs text-risk-reviewable">
                한계: {strategy.evidenceLimits.slice(0, 3).map((item) => sanitize(item)).join(", ")}
              </p>
            ) : null}
            {renderKotraEntryStrategyEvidence(strategy.kotraEntryStrategy, "mobile")}
          </div>
        ))}
      </div>
    </MobileInfoBlock>
  );
}

function MobileActionPlanBlock({ draft }: { draft: ReportDraft }) {
  return (
    <MobileInfoBlock title="실행 로드맵">
      <div className="grid gap-2">
        <MobileActionList title="D+7" items={draft.actionPlan7Days} />
        <MobileActionList title="D+30" items={draft.actionPlan30Days} />
        <MobileActionList title="D+90" items={draft.actionPlan90Days} />
      </div>
    </MobileInfoBlock>
  );
}

function MobileActionList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border border-border p-2">
      <p className="text-xs font-semibold">{title}</p>
      <ol className="mt-1 list-inside list-decimal space-y-1 text-xs text-muted-foreground">
        {items.map((item, index) => <li key={index}>{sanitize(item)}</li>)}
      </ol>
    </div>
  );
}

function mapReportProduct(raw: unknown): ReportProduct | null {
  const parsed = buildProductAnalysisCode(raw);
  const row = decisionRow(raw);
  const hasValue =
    Boolean(parsed.name) ||
    Boolean(parsed.hsCode) ||
    Boolean(parsed.hskCode) ||
    parsed.selectionSource !== null ||
    parsed.selectionStatus !== null ||
    parsed.selectionScore !== null ||
    parsed.selectedCandidateKey !== null;
  if (!hasValue) return null;
  return {
    id: decisionText(row.id) || null,
    name: normalizeReportText(parsed.name) || "-",
    hs_code: parsed.hsCode || null,
    hsk_code: parsed.hskCode || null,
    hs_selection_source: parsed.selectionSource,
    hs_selection_status: parsed.selectionStatus,
    hs_selection_score: parsed.selectionScore,
    hs_review_required: parsed.reviewRequired,
    hs_selected_candidate_key: parsed.selectedCandidateKey,
  };
}

function parseReportDecisionFacts(
  rows: unknown,
  productId: string | null,
  countryCodes: Set<string>,
): ReportDecisionFact[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((raw) => {
    const row = decisionRow(raw);
    const countryCode = decisionText(row.country_code);
    const rowProductId = decisionText(row.product_id);
    if (!countryCode || (productId && rowProductId !== productId)) return [];
    if (countryCodes.size > 0 && !countryCodes.has(countryCode)) return [];
    return parseDecisionFactRows([raw]).map((fact) => ({ ...fact, countryCode }));
  });
}

function parseReportDecisionActions(
  rows: unknown,
  productId: string | null,
  countryCodes: Set<string>,
): ReportDecisionAction[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((raw) => {
    const row = decisionRow(raw);
    const countryCode = decisionText(row.country_code);
    const rowProductId = decisionText(row.product_id);
    if (!countryCode || (productId && rowProductId !== productId)) return [];
    if (countryCodes.size > 0 && !countryCodes.has(countryCode)) return [];
    return parseDecisionActionRows([raw]).map((action) => ({ ...action, countryCode }));
  });
}

function decisionRow(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function decisionText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function filterCurrentReportDetailRows<
  T extends { country_code: string; raw?: unknown },
>(
  rows: T[],
  product: ReportProduct | null,
  topCountryCodes: Set<string>,
  kind: "certification" | "regulation",
): T[] {
  const scopedRows = rows.filter((row) => topCountryCodes.size === 0 || topCountryCodes.has(row.country_code));
  if (!product?.name || (!product.hs_code && !product.hsk_code)) return scopedRows;

  return scopedRows.filter((row) => {
    const context: CurrentDetailContext = {
      countryCode: row.country_code,
      productName: product.name,
      hsCode: product.hs_code,
      hskCode: product.hsk_code,
    };
    return filterRowsByCurrentDetailContext([row], context, kind).length > 0;
  });
}

function getReportCertificationEvidenceRows(rows: Bundle["certs"]): Bundle["certs"] {
  return getSuccessfulDetailRows(rows).filter((row) => !isCertReviewRequired(row));
}

function getReportRegulationEvidenceRows(rows: Bundle["regs"]): Bundle["regs"] {
  return getSuccessfulDetailRows(rows).filter((row) => !isRegReviewRequired(row));
}

function buildReportEvidenceBundle(
  bundle: Bundle,
  detailCompletion: DetailCompletionSummary,
): ReportEvidenceBundle {
  const certEvidenceRows = getReportCertificationEvidenceRows(bundle.certs);
  const regEvidenceRows = getReportRegulationEvidenceRows(bundle.regs);

  return {
    company: bundle.company
      ? {
        companyName: normalizeReportText(bundle.company.company_name),
        industrialComplex: normalizeReportText(bundle.company.industrial_complex),
        address: normalizeReportText(bundle.company.address),
      }
      : null,
    product: bundle.product
      ? {
        name: normalizeReportText(bundle.product.name),
        hsCode: normalizeReportText(bundle.product.hs_code),
        hskCode: normalizeReportText(bundle.product.hsk_code),
        hsReviewRequired: bundle.product.hs_review_required,
      }
      : null,
    topCountries: bundle.countries.map((country) => ({
      countryCode: country.country_code,
      countryName: normalizeReportText(country.country_name) ?? UNKNOWN_TEXT,
      totalScore: country.total_score,
      label: LABEL_KO[country.label] ?? country.label,
      summary: cleanCountryReportSummary(country.rationale?.summary, country.country_code, country.country_name),
      ...extractCustomsExportEvidence(country.rationale),
      evidenceSources: buildCountryEvidenceSources(country),
    })),
    certs: certEvidenceRows.map((cert) => ({
      countryCode: cert.country_code,
      summary: normalizeReportText(cert.scheme ?? cert.source_org),
      sourceOrg: normalizeReportText(cert.source_org),
      raw: cert.raw ?? null,
    })),
    regs: regEvidenceRows.map((reg) => ({
      countryCode: reg.country_code,
      category: normalizeReportText(reg.topic),
      summary: normalizeReportText(reg.summary ?? reg.topic),
      sourceOrg: normalizeReportText(reg.source_org),
      raw: reg.raw ?? null,
    })),
    risks: bundle.risks.map((risk) => ({
      countryCode: risk.country_code,
      category: normalizeReportText(risk.category),
      level: normalizeReportText(risk.level),
      summary: normalizeReportText(risk.summary ?? risk.level),
      sourceOrg: normalizeReportText(risk.source_org),
      raw: risk.raw ?? null,
    })),
    decisionFacts: bundle.decisionFacts
      .filter((fact) => !fact.isStale && !REPORT_NON_API_FACT_KEYS.has(fact.factKey ?? ""))
      .map((fact) => ({
        countryCode: fact.countryCode,
        factKey: fact.factKey ?? null,
        category: fact.category,
        status: fact.status,
        severity: fact.severity,
        summary: normalizeReportText(fact.summary) ?? UNKNOWN_TEXT,
        value: fact.value,
        sourceName: fact.sourceName,
        referenceDate: fact.referenceDate,
        caveat: normalizeReportText(fact.caveat),
        nextAction: normalizeReportText(fact.nextAction),
      })),
    decisionActions: bundle.decisionActions.map((action) => ({
      countryCode: action.countryCode,
      actionKey: action.actionKey,
      title: normalizeReportText(action.title) ?? UNKNOWN_TEXT,
      reason: normalizeReportText(action.reason) ?? UNKNOWN_TEXT,
      status: action.status,
      priority: action.priority,
    })),
    safetyFlags: [],
    apiLogs: bundle.logs.map((log) => ({
      apiKeyName: log.api_key_name,
      status: log.status,
      responseCount: log.response_count,
    })),
    missingEvidence: buildMissingEvidence(bundle, detailCompletion),
  };
}

function buildSafetyEvidenceFlags(flags: ReportFlagRow[]): ReportEvidenceBundle["safetyFlags"] {
  const safetyFlag = flags.find((flag) => flag.flag_type === "product_safety");
  const safetyRaw = (safetyFlag?.raw ?? {}) as Record<string, unknown>;
  const selectedDomesticIds = safetyRaw.selected_domestic_recall_ids;
  const selectedForeignIds = safetyRaw.selected_foreign_recall_ids;
  const selectedCertIds = safetyRaw.selected_cert_ids;
  const hasRecallSelection = Array.isArray(selectedDomesticIds) || Array.isArray(selectedForeignIds);

  if (!hasRecallSelection) {
    return flags.map((flag) => ({
      flagType: normalizeReportText(flag.flag_type),
      summary: composeFlagSummary(flag.flag_type, flag.summary),
    }));
  }

  const baseFlags = flags
    .filter((flag) => flag.flag_type !== "recall")
    .map((flag) => ({
      flagType: normalizeReportText(flag.flag_type),
      summary: flag.flag_type === "product_safety"
        ? buildSelectedProductSafetyEvidenceSummary(flag, selectedCertIds, selectedDomesticIds, selectedForeignIds)
        : composeFlagSummary(flag.flag_type, flag.summary),
    }));
  const selectedRecalls = [
    ...getSelectedRecallItems(safetyFlag, "domestic_recall", selectedDomesticIds),
    ...getSelectedRecallItems(safetyFlag, "foreign_recall", selectedForeignIds),
  ];
  const recallFlags = selectedRecalls.map((recall) => ({
    flagType: "recall",
    summary: formatSelectedRecallEvidenceSummary(recall),
  }));

  return [...baseFlags, ...recallFlags];
}

function buildSelectedProductSafetyEvidenceSummary(
  flag: ReportFlagRow,
  selectedCertIds: unknown,
  selectedDomesticIds: unknown,
  selectedForeignIds: unknown,
): string {
  const raw = (flag.raw ?? {}) as Record<string, unknown>;
  const certCount = Array.isArray(selectedCertIds) ? selectedCertIds.length : readFlagRawNumber(raw, "cert_match_count");
  const domesticCount = Array.isArray(selectedDomesticIds) ? selectedDomesticIds.length : readFlagRawNumber(raw, "domestic_recall_count");
  const foreignCount = Array.isArray(selectedForeignIds) ? selectedForeignIds.length : readFlagRawNumber(raw, "foreign_recall_count");
  return [
    "제품안전: SafetyKorea 선택 결과",
    `KC 인증 ${certCount ?? 0}건`,
    `국내 리콜 ${domesticCount ?? 0}건`,
    `국외 리콜 ${foreignCount ?? 0}건`,
  ].join(" | ");
}

function formatSelectedRecallEvidenceSummary(recall: SelectedRecallItem): string {
  const sourceLabel = getRecallSourceLabel(recall.source);
  const riskLabel = recall.source === "domestic_recall" ? "제품결함" : "위해내용";
  const actionLabel = recall.source === "domestic_recall" ? "소비자 행동요령" : "조치사항";
  return [
    `${sourceLabel} 리콜 선택`,
    `제품명 ${recall.productName || UNKNOWN_TEXT}`,
    recall.modelName ? `모델명 ${recall.modelName}` : "",
    recall.noticeDate ? `공표일 ${recall.noticeDate}` : "",
    `${riskLabel} ${recall.defectSummary || recall.hazardSummary || UNKNOWN_TEXT}`,
    `${actionLabel} ${recall.actionSummary || UNKNOWN_TEXT}`,
  ].filter(Boolean).join(" | ");
}

function buildMissingEvidence(bundle: Bundle, detailCompletion: DetailCompletionSummary): string[] {
  const items = [...detailCompletion.unresolvedItems];
  const latestByKey: Record<string, Bundle["logs"][number]> = {};
  for (const log of bundle.logs) {
    if (!latestByKey[log.api_key_name]) latestByKey[log.api_key_name] = log;
  }

  for (const api of API_REGISTRY) {
    const log = latestByKey[api.key];
    const status = resolveSourceStatusView(log, api.key);
    if (!isSourceReadyForCompletion(log, api.key)) {
      items.push(`${api.name}(${status.statusLabel})`);
      continue;
    }
    if ((log?.response_count ?? null) === 0) {
      items.push(`${api.name}(조회 결과 없음)`);
    }
  }

  return uniqueTexts(items);
}

function buildCountryCautions(bundle: Bundle, country: Bundle["countries"][number]): string[] {
  const cautions: string[] = [];
  const countryCode = country.country_code;
  const certRows = getReportCertificationEvidenceRows(bundle.certs).filter((value) => value.country_code === countryCode);
  const reg = getReportRegulationEvidenceRows(bundle.regs).find((value) => value.country_code === countryCode);
  const countryRisks = bundle.risks.filter((value) => value.country_code === countryCode);
  const ksureCountryRisk = countryRisks.find((value) => normalizeRiskCategory(value.category) === "k_sure");
  const ksureIndustryRisk = pickTopIndustryRisk(countryRisks);
  const industryMatchFailed = hasIndustryMatchFailure(countryRisks);
  const ksurePaymentRisk = countryRisks.find((value) => normalizeRiskCategory(value.category) === "k_sure_payment");
  const certFallback = getEvidenceFallbackText(bundle, "cert");
  const regFallback = getEvidenceFallbackText(bundle, "reg");
  const paymentFallback = getEvidenceFallbackText(bundle, "payment");

  const certEvidenceCount = certRows.length;
  const certText = certEvidenceCount > 0
    ? `인증 근거 ${certEvidenceCount}건 원문 적합성 확인 필요`
    : certFallback;
  const regText = normalizeReportText(
    reg?.topic
      ? `${reg.topic} 적용 범위 확인 필요`
      : regFallback,
  ) ?? regFallback;
  const paymentText = normalizeReportText(ksurePaymentRisk?.summary ?? paymentFallback) ?? paymentFallback;
  const paymentScope = resolveRiskScope(ksurePaymentRisk?.raw);
  const paymentLabel = paymentScope === "country"
    ? "K-SURE 수출결제(국가별)"
    : paymentScope === "global"
    ? "K-SURE 수출결제(전세계 참고자료·낮은 신뢰도)"
    : "K-SURE 수출결제";
  const industryText = industryMatchFailed
    ? "입력 업종 매핑 불일치로 점수 제외(확인 필요)"
    : normalizeReportText(ksureIndustryRisk?.summary ?? UNKNOWN_TEXT) ?? UNKNOWN_TEXT;

  cautions.push(`인증: ${certText}`);
  cautions.push(`규제: ${regText}`);
  cautions.push(`K-SURE 국가위험: ${normalizeReportText(ksureCountryRisk?.summary ?? UNKNOWN_TEXT) ?? UNKNOWN_TEXT}`);
  cautions.push(`K-SURE 업종위험: ${industryText}`);
  cautions.push(`${paymentLabel}: ${paymentText}`);
  return cautions;
}

function buildCountryEvidenceBrief(bundle: Bundle, country: Bundle["countries"][number]): string {
  const countryCode = country.country_code;
  const certCount = getReportCertificationEvidenceRows(bundle.certs).filter((row) => row.country_code === countryCode).length;
  const regCount = getReportRegulationEvidenceRows(bundle.regs).filter((row) => row.country_code === countryCode).length;
  const riskCount = bundle.risks.filter((row) => row.country_code === countryCode).length;
  const directEvidenceCount = buildCountryEvidenceSources(country)
    .filter((source) => source.evidenceType === "direct")
    .length;
  const customsEvidence = extractCustomsExportEvidence(country.rationale);
  const customsText = customsEvidence.customsExport12mUsd
    ? formatCustomsExportUsd(customsEvidence.customsExport12mUsd)
    : customsEvidence.customsExportStatus === "empty"
      ? "조회 결과 없음"
      : UNKNOWN_TEXT;

  return [
    `추천 점수 ${country.total_score ?? "-"}점`,
    `최근 12개월 수출액 ${customsText}`,
    `인증 근거 ${certCount > 0 ? `${certCount}건` : UNKNOWN_TEXT}`,
    `수입규제 ${regCount > 0 ? `${regCount}건` : UNKNOWN_TEXT}`,
    `K-SURE 위험 ${riskCount > 0 ? `${riskCount}건` : UNKNOWN_TEXT}`,
    `대상국 직접 뉴스 ${directEvidenceCount > 0 ? `${directEvidenceCount}건` : UNKNOWN_TEXT}`,
  ].join(" · ");
}

function normalizeRiskCategory(value: string | null | undefined): string {
  return normalizeReportText(value)?.toLowerCase() ?? "";
}

function pickTopIndustryRisk(
  risks: Array<{ category: string | null; level: string | null; summary: string | null; raw?: unknown }>,
) {
  const industryRows = risks.filter((value) => normalizeRiskCategory(value.category) === "k_sure_industry");
  if (industryRows.length === 0) return null;
  const successfulRows = getSuccessfulDetailRows(industryRows).filter((value) => !isIndustryMatchFailedRaw(value.raw));
  if (successfulRows.length === 0) return null;
  return [...successfulRows].sort((left, right) => {
    const byLevel = riskLevelWeight(right.level) - riskLevelWeight(left.level);
    if (byLevel !== 0) return byLevel;
    const leftSummary = normalizeReportText(left.summary) ?? "";
    const rightSummary = normalizeReportText(right.summary) ?? "";
    return rightSummary.localeCompare(leftSummary);
  })[0];
}

function hasIndustryMatchFailure(
  risks: Array<{ category: string | null; raw?: unknown }>,
): boolean {
  return risks.some(
    (value) => normalizeRiskCategory(value.category) === "k_sure_industry" && isIndustryMatchFailedRaw(value.raw),
  );
}

function isIndustryMatchFailedRaw(raw: unknown): boolean {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  return isIndustryMatchFailed(row);
}

function resolveRiskScope(raw: unknown): "country" | "global" | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const scope = normalizeReportText(
    typeof row.scope === "string" || typeof row.scope === "number" ? String(row.scope) : null,
  )?.toLowerCase();
  if (scope === "country" || scope === "global") return scope;
  return null;
}

function riskLevelWeight(level: string | null | undefined): number {
  const normalized = normalizeReportText(level)?.toLowerCase() ?? "";
  if (normalized === "high") return 3;
  if (normalized === "caution") return 2;
  if (normalized === "info") return 1;
  if (normalized === "unavailable") return 0;
  return -1;
}

function evaluateDetailCompletion(bundle: Bundle | null): DetailCompletionSummary {
  if (!bundle) {
    return { incomplete: false, unresolvedItems: [], reason: "" };
  }

  const detailExecuted = bundle.certs.length > 0 || bundle.regs.length > 0 || bundle.risks.length > 0;
  const ksureRows = bundle.risks.filter((row) => isKsureCategory(row.category));
  const certEvidenceRows = getReportCertificationEvidenceRows(bundle.certs);
  const regEvidenceRows = getReportRegulationEvidenceRows(bundle.regs);

  const certSectionState = resolveSectionState({
    detailExecuted,
    successfulRowCount: certEvidenceRows.length,
    placeholderState: pickPlaceholderState(bundle.certs),
  });
  const regSectionState = resolveSectionState({
    detailExecuted,
    successfulRowCount: regEvidenceRows.length,
    placeholderState: pickPlaceholderState(bundle.regs),
  });
  const riskSectionState = resolveSectionState({
    detailExecuted,
    successfulRowCount: getSuccessfulDetailRows(ksureRows).length,
    placeholderState: pickPlaceholderState(ksureRows),
  });

  const unresolvedItems: string[] = [];
  if (certSectionState === "not_run") unresolvedItems.push("해외인증(미실행)");
  if (certSectionState === "empty") unresolvedItems.push("해외인증(0건)");
  if (certSectionState === "stale") unresolvedItems.push("해외인증(캐시 미동기화/오래됨)");
  if (certSectionState === "error") unresolvedItems.push("해외인증(API 오류)");

  if (regSectionState === "not_run") unresolvedItems.push("수입규제(미실행)");
  if (regSectionState === "empty") unresolvedItems.push("수입규제(0건)");
  if (regSectionState === "stale") unresolvedItems.push("수입규제(캐시 미동기화/오래됨)");
  if (regSectionState === "error") unresolvedItems.push("수입규제(API 오류)");

  if (riskSectionState === "not_run") unresolvedItems.push("K-SURE 위험(미실행)");
  if (riskSectionState === "empty") unresolvedItems.push("K-SURE 위험(0건)");
  if (riskSectionState === "stale") unresolvedItems.push("K-SURE 위험(캐시 미동기화/오래됨)");
  if (riskSectionState === "error") unresolvedItems.push("K-SURE 위험(API 오류)");
  if (
    bundle.risks.some(
      (row) => normalizeRiskCategory(row.category) === "k_sure_industry" && isIndustryMatchFailedRaw(row.raw),
    )
  ) {
    unresolvedItems.push("K-SURE 업종위험(입력 업종 매칭 실패)");
  }

  const normalizedUnresolved = uniqueTexts(unresolvedItems);
  if (normalizedUnresolved.length === 0) {
    return { incomplete: false, unresolvedItems: [], reason: "" };
  }

  if (!detailExecuted) {
    return {
      incomplete: true,
      unresolvedItems: normalizedUnresolved,
      reason: "Step 4 상세 분석 결과가 없어 상세 분석 미완료 상태입니다.",
    };
  }

  return {
    incomplete: true,
    unresolvedItems: normalizedUnresolved,
    reason: `${normalizedUnresolved.join(", ")} 데이터가 실패/미실행 상태여서 ${DETAIL_INCOMPLETE_TEXT}입니다.`,
  };
}

function cleanReportSummary(value: string | null | undefined): string | null {
  const text = normalizeReportText(value);
  if (!text) return text;

  const seen = new Set<string>();
  const parts = text.split(" | ").map((part) => normalizeReportText(part) ?? "").filter((part) => {
    const normalized = part.toLowerCase();
    if (normalized.includes("recent news: no matched items")) return false;
    if (normalized.includes("no matched news")) return false;
    if (normalized.startsWith("news:") && !isLikelyProductNews(part)) return false;

    const dedupeKey = normalized.trim();
    if (!dedupeKey) return false;
    if (seen.has(dedupeKey)) return false;
    seen.add(dedupeKey);
    return true;
  });
  const cleaned = parts.join(" | ");
  return cleaned || null;
}

function cleanCountryReportSummary(
  value: string | null | undefined,
  countryCode: string,
  countryName: string,
): string | null {
  const text = cleanReportSummary(value);
  if (!text) return text;

  const parts = text.split(" | ").filter((part) => {
    const directCountry = extractDirectEvidenceCountry(part);
    if (!directCountry) return true;
    return countryNameMatches(directCountry, countryCode, countryName);
  });
  return parts.join(" | ") || null;
}

function extractDirectEvidenceCountry(value: string): string | null {
  const match = value.match(/직접\s*근거\s*:\s*([^,|]+)/);
  return normalizeReportText(match?.[1]) ?? null;
}

function buildCountryEvidenceSources(country: Bundle["countries"][number]) {
  return (country.rationale?.sources ?? [])
    .map((source) => ({
      sourceType: normalizeReportText(source.type),
      title: normalizeReportText(source.title),
      country: normalizeReportText(source.country),
      summary: normalizeReportText(source.summary),
      articleBody: normalizeReportText(source.article_body),
      articleBodyTruncated: source.article_body_truncated === true,
      articleBodyOriginalLength: source.article_body_original_length,
      newsCategory: normalizeReportText(source.news_category),
      newsScope: normalizeReportText(source.news_scope),
      impactSummary: normalizeReportText(source.impact_summary),
      evidenceType: classifyCountryEvidenceSource(source, country),
    }))
    .filter((source) => source.title || source.summary || source.articleBody);
}

function classifyCountryEvidenceSource(
  source: NonNullable<NonNullable<Bundle["countries"][number]["rationale"]>["sources"]>[number],
  country: Bundle["countries"][number],
): "direct" | "indirect" | "background" | "excluded" {
  const aiCategory = normalizeReportText(source.ai_category)?.toLowerCase() ?? "";
  if (aiCategory === "unrelated") return "excluded";
  if (isNoEvidencePlaceholder(source.title ?? "")) return "excluded";

  const sourceCountry = normalizeReportText(source.country);
  const countryMatched = sourceCountry
    ? countryNameMatches(sourceCountry, country.country_code, country.country_name)
    : normalizeReportText(source.country_match_type)?.toLowerCase().includes("target") === true;
  const sourceType = normalizeReportText(source.type)?.toLowerCase() ?? "";
  const newsCategory = normalizeReportText(source.news_category)?.toLowerCase() ?? "";
  const isProductEvidence =
    sourceType === "product_evidence" ||
    sourceType === "news" ||
    aiCategory === "direct_product" ||
    newsCategory.includes("product");

  if (mentionsDifferentKnownCountry(`${source.title ?? ""} ${source.summary ?? ""}`, country.country_code)) {
    return "indirect";
  }
  if (isProductEvidence) return countryMatched ? "direct" : "indirect";
  if (countryMatched) return "background";
  return "excluded";
}

function countryNameMatches(sourceCountry: string, countryCode: string, countryName: string): boolean {
  const sourceTokens = buildCountryMatchTokens(sourceCountry, countryCode);
  const targetTokens = buildCountryMatchTokens(countryName, countryCode);
  return sourceTokens.some((source) => targetTokens.some((target) => source.includes(target) || target.includes(source)));
}

function buildCountryMatchTokens(value: string | null | undefined, countryCode: string): string[] {
  const tokens = new Set<string>();
  const normalized = normalizeCountryMatchToken(value);
  if (normalized) tokens.add(normalized);

  const aliases: Record<string, string[]> = {
    US: ["미국", "미합중국", "unitedstates", "usa", "america"],
    CN: ["중국", "중화인민공화국", "china", "peoplesrepublicofchina"],
    PL: ["폴란드", "폴란드공화국", "poland", "republicofpoland"],
    DE: ["독일", "독일연방공화국", "germany", "federalrepublicofgermany"],
    VE: ["베네수엘라", "venezuela"],
    DK: ["덴마크", "denmark"],
  };
  for (const alias of aliases[countryCode.toUpperCase()] ?? []) tokens.add(normalizeCountryMatchToken(alias));
  return [...tokens].filter(Boolean);
}

function normalizeCountryMatchToken(value: string | null | undefined): string {
  return (normalizeReportText(value) ?? "")
    .toLowerCase()
    .replace(/the\s+/g, "")
    .replace(/[^a-z0-9가-힣]/g, "");
}

function mentionsDifferentKnownCountry(value: string, targetCountryCode: string): boolean {
  const normalized = normalizeCountryMatchToken(value);
  if (!normalized) return false;
  const targetCode = targetCountryCode.toUpperCase();
  const aliases: Record<string, string[]> = {
    US: ["미국", "미합중국", "unitedstates", "usa", "america"],
    CN: ["중국", "중화인민공화국", "china", "peoplesrepublicofchina"],
    PL: ["폴란드", "폴란드공화국", "poland", "republicofpoland"],
    DE: ["독일", "독일연방공화국", "germany", "federalrepublicofgermany"],
    VE: ["베네수엘라", "venezuela"],
    DK: ["덴마크", "denmark"],
  };
  return Object.entries(aliases).some(([code, codeAliases]) => (
    code !== targetCode && codeAliases.some((alias) => normalized.includes(normalizeCountryMatchToken(alias)))
  ));
}

function isNoEvidencePlaceholder(value: string): boolean {
  const normalized = normalizeCountryMatchToken(value);
  return (
    normalized.includes("직접근거없음") ||
    normalized.includes("확실한정보없음") ||
    normalized.includes("nomatched") ||
    normalized.includes("noevidence")
  );
}

function isLikelyProductNews(value: string): boolean {
  const normalized = sanitize(normalizeReportText(value) ?? value).toLowerCase();

  if (
    normalized.includes("medical") ||
    normalized.includes("cosmetic") ||
    normalized.includes("scalp") ||
    normalized.includes("ar glasses") ||
    normalized.includes("beauty")
  ) {
    return false;
  }

  return (
    normalized.includes("브레이크") ||
    normalized.includes("차량") ||
    normalized.includes("자동차") ||
    normalized.includes("brake") ||
    normalized.includes("automotive") ||
    normalized.includes("870830") ||
    normalized.includes("8708")
  );
}

function extractSourceMatchedCount(
  sources: Array<{ type?: string | null; title?: string | null }> | undefined,
  type: "cert_data" | "regulation_data",
) {
  if (!Array.isArray(sources)) return 0;
  const target = sources.find((source) => {
    const title = source.title?.toLowerCase() ?? "";
    const sourceType = source.type?.toLowerCase() ?? "";
    if (type === "cert_data") {
      return sourceType === "cert_data" || title.includes("certification matched") || title.includes("인증 매칭");
    }
    return sourceType === "regulation_data" || title.includes("import regulation matched") || title.includes("규제 매칭");
  });
  if (!target?.title) return 0;
  const match = target.title.match(/(\d+)\s*(item|건)?/i);
  if (!match) return 0;
  const count = Number(match[1]);
  return Number.isFinite(count) ? count : 0;
}

function uniqueTexts(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = normalizeReportText(value);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function pickLatestApiState(logs: Bundle["logs"], apiKey: string): ApiState {
  const row = logs.find((log) => log.api_key_name === apiKey);
  return resolveSourceStatusView(row, apiKey).chipState;
}

function buildDefaultActionItems(bundle: Bundle): string[] {
  const topCountry = bundle.countries[0];
  const items = [
    `우선 검토 대상 국가(${normalizeReportText(topCountry?.country_name) ?? UNKNOWN_TEXT})의 인증 요구사항을 먼저 확인하세요.`,
    "수입 규제와 통관 요구사항을 사전에 점검해 리스크를 줄이세요.",
    "SafetyKorea 및 전략물자 데이터를 반영해 제품 안전/규제 적합성을 재검토하세요.",
  ];
  return items;
}

function buildRuleBasedReportFallback(
  bundle: Bundle,
  detailCompletion: DetailCompletionSummary,
): { summary: string; actions: string[] } {
  const topCountry = bundle.countries[0];
  const topCountryText = normalizeReportText(topCountry?.country_name) ?? UNKNOWN_TEXT;
  const productName = normalizeReportText(bundle.product?.name) ?? UNKNOWN_TEXT;
  const actionItems = buildDefaultActionItems(bundle).slice(0, 5);
  const caution = buildEvidenceCaution(bundle, detailCompletion);
  const summaryParts = [
    `규칙 기반 요약입니다. 제품 ${productName} 기준 우선 검토 국가는 ${topCountryText}입니다.`,
    detailCompletion.incomplete
      ? `${DETAIL_INCOMPLETE_TEXT}: ${detailCompletion.reason}`
      : "상세 분석 데이터가 확인되어 리포트 근거가 확보되었습니다.",
    "출처·조회일·원문 링크를 점검한 뒤 제출용 리포트를 확정하세요.",
  ];
  if (caution) summaryParts.push(caution);

  return {
    summary: summaryParts.join(" "),
    actions: actionItems.length > 0 ? actionItems : ["근거 데이터 재확인 후 리포트를 다시 생성하세요."],
  };
}

function normalizeReportSafetySummary(flagType: string, summary: string | null | undefined): string | null {
  const normalized = normalizeReportText(summary);
  if (!normalized) return normalized;

  if (flagType !== "product_safety" && flagType !== "recall") {
    return normalized;
  }

  const lower = normalized.toLowerCase();
  const looksLikeProviderError =
    lower.includes("safetykorea") &&
    (lower.includes("api 오류") || lower.includes("error") || lower.includes("failed") || lower.includes("handshake"));

  if (!looksLikeProviderError) return normalized;

  const code = normalized.match(/\b(safetykorea_[a-z0-9_]+)\b/i)?.[1]?.toLowerCase() ?? "safetykorea_api_failed";
  return `SafetyKorea error (${code})`;
}

function buildExecutiveBrief(
  bundle: Bundle | null,
  detailCompletion: DetailCompletionSummary,
  actionItems: string[],
): ExecutiveBrief {
  if (!bundle) {
    return {
      top3: [UNKNOWN_TEXT],
      keyRisks: [DETAIL_INCOMPLETE_TEXT],
      nextActions: [UNKNOWN_TEXT],
    };
  }

  const top3 = bundle.countries.length > 0
    ? bundle.countries.slice(0, 3).map((country, index) =>
      `${index + 1}. ${country.country_name} (${country.total_score ?? "-"}점, ${LABEL_KO[country.label]})`)
    : [UNKNOWN_TEXT];

  const keyRisks: string[] = [];
  if (detailCompletion.incomplete) {
    keyRisks.push(`${DETAIL_INCOMPLETE_TEXT}: ${detailCompletion.reason}`);
  }
  keyRisks.push(
    ...bundle.flags.slice(0, 3).map((flag) => composeFlagSummary(flag.flag_type, flag.summary)),
  );
  if (keyRisks.length === 0) keyRisks.push(UNKNOWN_TEXT);

  const nextActions = actionItems.slice(0, 3).map((item) => sanitize(item));
  if (nextActions.length === 0) nextActions.push(UNKNOWN_TEXT);

  return { top3, keyRisks, nextActions };
}

function buildAiSummaryText(bundle: Bundle | null, detailCompletion: DetailCompletionSummary): string {
  const base = normalizeReportText(bundle?.ai_summary) ?? "";
  const evidenceCaution = buildEvidenceCaution(bundle, detailCompletion);

  if (!base) {
    const fallback = "AI 요약이 아직 생성되지 않았습니다. 핵심 결과를 검토한 뒤 AI 요약을 생성하세요.";
    return evidenceCaution ? `${fallback} ${evidenceCaution}` : fallback;
  }
  if (!evidenceCaution) return base;
  if (base.includes(evidenceCaution)) return base;
  return `${base} ${evidenceCaution}`;
}

function buildEvidenceCaution(bundle: Bundle | null, detailCompletion: DetailCompletionSummary): string | null {
  if (!bundle) return null;
  const parts: string[] = [];
  const certState = resolveDetailEvidenceState(bundle, "cert");
  const regState = resolveDetailEvidenceState(bundle, "reg");
  const paymentState = resolveDetailEvidenceState(bundle, "payment");

  if (certState !== "available") parts.push(`인증(${toEvidenceStateText(certState)})`);
  if (regState !== "available") parts.push(`규제(${toEvidenceStateText(regState)})`);
  if (paymentState !== "available") parts.push(`결제위험(${toEvidenceStateText(paymentState)})`);
  if (parts.length === 0) return detailCompletion.incomplete ? `${DETAIL_INCOMPLETE_TEXT} 상태가 포함되어 추가 검증이 필요합니다.` : null;

  return `근거 부족 영역: ${parts.join(", ")}. 위 항목은 특정 인증명/규제/결제조건을 단정할 수 없습니다.`;
}

function toEvidenceStateText(state: DetailEvidenceState): string {
  return state === "not_run" ? DETAIL_NOT_RUN_TEXT : UNKNOWN_TEXT;
}

function getEvidenceFallbackText(bundle: Bundle, kind: DetailEvidenceKind): string {
  const state = resolveDetailEvidenceState(bundle, kind);
  if (state === "not_run") return DETAIL_NOT_RUN_TEXT;
  if (state === "unknown") return UNKNOWN_TEXT;
  return UNKNOWN_TEXT;
}

function resolveDetailEvidenceState(bundle: Bundle, kind: DetailEvidenceKind): DetailEvidenceState {
  if (kind === "cert") {
    return classifyEvidenceState(bundle, "kotra_overseas_certification", getReportCertificationEvidenceRows(bundle.certs).length);
  }
  if (kind === "reg") {
    return classifyEvidenceState(bundle, "kotra_import_regulation", getReportRegulationEvidenceRows(bundle.regs).length);
  }
  const paymentRows = bundle.risks.filter((row) => normalizeRiskCategory(row.category) === "k_sure_payment");
  return classifyEvidenceState(bundle, "ksure_export_payment", paymentRows.length);
}

function classifyEvidenceState(
  bundle: Bundle,
  apiKey: (typeof DETAIL_REQUIRED_API_KEYS)[number] | "ksure_export_payment",
  rowCount: number,
): DetailEvidenceState {
  const log = bundle.logs.find((entry) => entry.api_key_name === apiKey);
  if (!isSourceReadyForCompletion(log, apiKey)) {
    return "not_run";
  }
  if (rowCount > 0) return "available";
  return "unknown";
}

/* ─── Safety Flags: Print View ────────────────────────────────── */

type ReportFlagRow = Bundle["flags"][number];
type RecallSource = "domestic_recall" | "foreign_recall";

interface SelectedRecallItem {
  source: RecallSource;
  recordId: string;
  productName: string;
  modelName: string;
  brandName: string;
  noticeDate: string;
  recallType: string;
  defectSummary: string;
  hazardSummary: string;
  actionSummary: string;
  sourceUrl: string;
}

function SafetyFlagsPrint({ flags }: { flags: ReportFlagRow[] }) {
  if (flags.length === 0) return null;

  const safetyFlag = flags.find((f) => f.flag_type === "product_safety");

  const safetyRaw = (safetyFlag?.raw ?? {}) as Record<string, unknown>;
  const selectedDomesticIds = safetyRaw.selected_domestic_recall_ids;
  const selectedForeignIds = safetyRaw.selected_foreign_recall_ids;
  const selectedCertIds = safetyRaw.selected_cert_ids;
  const selectedDomesticRecalls = getSelectedRecallItems(safetyFlag, "domestic_recall", selectedDomesticIds);
  const selectedForeignRecalls = getSelectedRecallItems(safetyFlag, "foreign_recall", selectedForeignIds);

  return (
    <>
      <h3 className="mt-4 font-display text-sm font-semibold text-[#0E6B6F]">KC인증 / 리콜정보</h3>
      <div className="mt-2 space-y-2">
        {safetyFlag ? <SafetySummaryCardPrint flag={safetyFlag} selectedCertIds={selectedCertIds} selectedDomesticIds={selectedDomesticIds} selectedForeignIds={selectedForeignIds} /> : null}
        {safetyFlag ? <KcCertDetailPrint flag={safetyFlag} selectedCertIds={selectedCertIds} /> : null}
        {selectedDomesticRecalls.length > 0 ? <RecallHighlightsPrint title="국내 리콜 상세" recalls={selectedDomesticRecalls} /> : null}
        {selectedForeignRecalls.length > 0 ? <RecallHighlightsPrint title="국외 리콜 상세" recalls={selectedForeignRecalls} /> : null}
      </div>
    </>
  );
}

function StrategicFlagCardPrint({ flag }: { flag: ReportFlagRow }) {
  const raw = (flag.raw ?? {}) as Record<string, unknown>;
  const matchType = readFlagRawText(raw, "match_type");
  const controlNo = readFlagRawText(raw, "control_no");
  const hsCode = readFlagRawText(raw, "hs_code");
  const hskCode = readFlagRawText(raw, "hsk_code");
  const isMatched = matchType !== "" && matchType !== "none";

  return (
    <div className={`rounded border p-2 text-[11px] ${isMatched ? "border-[#f1c453] bg-[#fff8e1]" : "border-[#e6e7ea] bg-white"}`}>
      <div className="flex items-center gap-2">
        <span className="rounded bg-[#0E6B6F] px-1.5 py-0.5 text-[9px] text-white">전략물자</span>
        <span className="text-[10px] font-semibold text-[#334155]">
          {normalizeReportText(flag.summary) ?? UNKNOWN_TEXT}
        </span>
      </div>
      <div className="mt-1.5 grid grid-cols-4 gap-2 text-[10px]">
        <FlagFactCell label="HS" value={hsCode || "-"} />
        <FlagFactCell label="HSK" value={hskCode || "-"} />
        <FlagFactCell label="매칭 유형" value={matchType || "매칭 없음"} />
        <FlagFactCell label="통제번호" value={controlNo || "-"} />
      </div>
    </div>
  );
}

function SafetySummaryCardPrint({ flag, selectedCertIds, selectedDomesticIds, selectedForeignIds }: {
  flag: ReportFlagRow;
  selectedCertIds: unknown;
  selectedDomesticIds: unknown;
  selectedForeignIds: unknown;
}) {
  const raw = (flag.raw ?? {}) as Record<string, unknown>;
  const certCount = Array.isArray(selectedCertIds) ? selectedCertIds.length : readFlagRawNumber(raw, "cert_match_count");
  const domesticCount = Array.isArray(selectedDomesticIds) ? selectedDomesticIds.length : readFlagRawNumber(raw, "domestic_recall_count");
  const foreignCount = Array.isArray(selectedForeignIds) ? selectedForeignIds.length : readFlagRawNumber(raw, "foreign_recall_count");
  const isFiltered = Array.isArray(selectedCertIds) || Array.isArray(selectedDomesticIds) || Array.isArray(selectedForeignIds);
  const search = (raw.safety_search ?? {}) as Record<string, unknown>;
  const searchProduct = readFlagRawText(search, "productName");
  const searchModel = readFlagRawText(search, "modelName");
  const hasCounts = certCount !== null || domesticCount !== null || foreignCount !== null;
  const confidence = searchModel ? "높음 (모델명 기준)" : searchProduct ? "낮음 (제품명 기준)" : "확인 불가";

  return (
    <div className="rounded border border-[#e6e7ea] bg-white p-2 text-[11px]">
      <div className="flex items-center gap-2">
        <span className="rounded bg-[#0E6B6F] px-1.5 py-0.5 text-[9px] text-white">제품안전</span>
        <span className="text-[10px] font-semibold text-[#334155]">SafetyKorea 조회 결과 요약{isFiltered ? " (선택 항목 기준)" : ""}</span>
      </div>
      {hasCounts ? (
        <div className="mt-1.5 grid grid-cols-4 gap-2 text-[10px]">
          <FlagFactCell label="KC 인증" value={certCount !== null ? `${certCount}건` : "-"} />
          <FlagFactCell label="국내 리콜" value={domesticCount !== null ? `${domesticCount}건` : "-"} />
          <FlagFactCell label="국외 리콜" value={foreignCount !== null ? `${foreignCount}건` : "-"} />
          <FlagFactCell label="매칭 신뢰도" value={confidence} />
        </div>
      ) : (
        <p className="mt-1.5 text-[10px] text-[#5b6473]">{normalizeReportText(flag.summary) ?? UNKNOWN_TEXT}</p>
      )}
      {searchProduct ? (
        <p className="mt-1 text-[9px] text-[#5b6473]">
          조회 기준: 제품명 "{searchProduct}"{searchModel ? ` · 모델명 "${searchModel}"` : ""}
        </p>
      ) : null}
    </div>
  );
}

function RecallHighlightsPrint({ title, recalls }: { title: string; recalls: SelectedRecallItem[] }) {
  if (recalls.length === 0) return null;
  return (
    <div className="rounded border border-[#e6e7ea] bg-white p-2 text-[11px]">
      <p className="text-[10px] font-semibold text-[#334155]">{title} ({recalls.length}건)</p>
      <div className="mt-1.5 space-y-1.5">
        {recalls.map((recall, idx) => {
          const sourceLabel = getRecallSourceLabel(recall.source);
          const riskLabel = recall.source === "domestic_recall" ? "제품결함" : "위해내용";
          const actionLabel = recall.source === "domestic_recall" ? "소비자 행동요령" : "조치사항";

          return (
            <div key={`recall-print-${recall.source}-${recall.recordId || idx}`} className="rounded border border-[#f1c453]/30 bg-[#fef9ee] px-2 py-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-1.5">
                  <span className="mt-0.5 shrink-0 rounded bg-[#f1c453] px-1 py-0.5 text-[8px] font-medium text-[#6b4500]">{sourceLabel}</span>
                  <div>
                    <p className="text-[10px] font-semibold text-[#334155]">
                      {recall.productName || recall.modelName || "제품명 없음"}
                      {recall.noticeDate ? <span className="ml-1 font-normal text-[#5b6473]">({recall.noticeDate})</span> : null}
                    </p>
                    {(recall.modelName || recall.brandName || recall.recallType) ? (
                      <p className="mt-0.5 text-[9px] text-[#5b6473]">
                        {recall.brandName ? `브랜드: ${recall.brandName}` : ""}
                        {recall.brandName && recall.modelName ? " · " : ""}
                        {recall.modelName ? `모델: ${recall.modelName}` : ""}
                        {(recall.brandName || recall.modelName) && recall.recallType ? " · " : ""}
                        {recall.recallType ? `유형: ${recall.recallType}` : ""}
                      </p>
                    ) : null}
                  </div>
                </div>
                {recall.sourceUrl ? (
                  <a href={recall.sourceUrl} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 rounded bg-[#0E6B6F] px-1.5 py-0.5 text-[8px] font-medium text-white hover:opacity-80"
                    onClick={(e) => e.stopPropagation()}
                  >
                    원문↗
                  </a>
                ) : null}
              </div>
              {recall.defectSummary || recall.hazardSummary ? (
                <p className="mt-1 line-clamp-2 text-[9px] text-[#5b6473]">• {riskLabel}: {recall.defectSummary || recall.hazardSummary}</p>
              ) : null}
              {recall.actionSummary ? (
                <p className="mt-0.5 line-clamp-1 text-[9px] text-[#5b6473]">• {actionLabel}: {recall.actionSummary}</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KcCertDetailPrint({ flag, selectedCertIds }: { flag: ReportFlagRow; selectedCertIds: unknown }) {
  const raw = (flag.raw ?? {}) as Record<string, unknown>;
  const allCerts = Array.isArray(raw.certifications) ? (raw.certifications as Record<string, unknown>[]) : [];
  const certIds = Array.isArray(selectedCertIds) ? (selectedCertIds as string[]) : null;
  const certs = certIds ? allCerts.filter((c) => certIds.includes(String(c.certNum ?? ""))) : allCerts;
  if (certs.length === 0) return null;

  const fieldText = (obj: Record<string, unknown>, key: string) => {
    const v = obj[key];
    return v != null && v !== "" ? normalizeReportText(String(v)) ?? "-" : "-";
  };

  return (
    <div className="rounded border border-[#e6e7ea] bg-white p-2 text-[11px]">
      <p className="text-[10px] font-semibold text-[#334155]">KC 인증 상세 ({certs.length}건)</p>
      <div className="mt-1.5 space-y-1.5">
        {certs.map((cert, idx) => {
          const url = String(cert.sourceUrl ?? "");
          return (
            <div key={`cert-print-${idx}`} className="rounded border border-[#c8e6c9]/60 bg-[#f1f8f1] px-2 py-1.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold text-[#334155]">{fieldText(cert, "certNum")}</p>
                  <p className="mt-0.5 text-[9px] text-[#5b6473]">상태: {fieldText(cert, "certState")} · 인증일: {fieldText(cert, "certDate")}</p>
                </div>
                {url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 rounded bg-[#0E6B6F] px-1.5 py-0.5 text-[8px] font-medium text-white hover:opacity-80"
                  >
                    인증 상세↗
                  </a>
                ) : null}
              </div>
              <div className="mt-1 grid grid-cols-2 gap-1 text-[9px] text-[#5b6473]">
                <span>모델: {fieldText(cert, "modelName")}</span>
                <span>제조사: {fieldText(cert, "makerName")}</span>
                <span>수입사: {fieldText(cert, "importerName")}</span>
                <span>제조국: {fieldText(cert, "makerCntryName")}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


function FlagFactCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-[#f8fafc] px-1.5 py-1">
      <p className="text-[8px] font-medium text-[#5b6473]">{label}</p>
      <p className="mt-0.5 text-[9px] font-medium text-[#334155]">{sanitize(value)}</p>
    </div>
  );
}

/* ─── Safety Flags: Mobile View ───────────────────────────────── */

function SafetyFlagsMobile({ flags }: { flags: ReportFlagRow[] }) {
  if (flags.length === 0) return null;

  const safetyFlag = flags.find((f) => f.flag_type === "product_safety");

  const safetyRaw = (safetyFlag?.raw ?? {}) as Record<string, unknown>;
  const selectedDomesticIds = safetyRaw.selected_domestic_recall_ids;
  const selectedForeignIds = safetyRaw.selected_foreign_recall_ids;
  const selectedCertIds = safetyRaw.selected_cert_ids;
  const selectedDomesticRecalls = getSelectedRecallItems(safetyFlag, "domestic_recall", selectedDomesticIds);
  const selectedForeignRecalls = getSelectedRecallItems(safetyFlag, "foreign_recall", selectedForeignIds);

  return (
    <MobileInfoBlock title="KC인증 / 리콜정보">
      <div className="space-y-3">
        {safetyFlag ? <SafetySummaryCardMobile flag={safetyFlag} selectedCertIds={selectedCertIds} selectedDomesticIds={selectedDomesticIds} selectedForeignIds={selectedForeignIds} /> : null}
        {safetyFlag ? <KcCertDetailMobile flag={safetyFlag} selectedCertIds={selectedCertIds} /> : null}
        {selectedDomesticRecalls.length > 0 ? <RecallHighlightsMobile title="국내 리콜 상세" recalls={selectedDomesticRecalls} /> : null}
        {selectedForeignRecalls.length > 0 ? <RecallHighlightsMobile title="국외 리콜 상세" recalls={selectedForeignRecalls} /> : null}
      </div>
    </MobileInfoBlock>
  );
}

function StrategicFlagCardMobile({ flag }: { flag: ReportFlagRow }) {
  const raw = (flag.raw ?? {}) as Record<string, unknown>;
  const matchType = readFlagRawText(raw, "match_type");
  const controlNo = readFlagRawText(raw, "control_no");
  const hsCode = readFlagRawText(raw, "hs_code");
  const hskCode = readFlagRawText(raw, "hsk_code");
  const isMatched = matchType !== "" && matchType !== "none";

  return (
    <div className={`rounded-md border p-3 ${isMatched ? "border-amber-200 bg-amber-50" : "border-border bg-white"}`}>
      <div className="flex items-center gap-2">
        <span className="rounded bg-brand px-2 py-0.5 text-[10px] font-medium text-white">전략물자</span>
        <p className="text-xs font-semibold">{normalizeReportText(flag.summary) ?? UNKNOWN_TEXT}</p>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <MobileFlagFact label="HS" value={hsCode || "-"} />
        <MobileFlagFact label="HSK" value={hskCode || "-"} />
        <MobileFlagFact label="매칭 유형" value={matchType || "매칭 없음"} />
        <MobileFlagFact label="통제번호" value={controlNo || "-"} />
      </div>
    </div>
  );
}

function SafetySummaryCardMobile({ flag, selectedCertIds, selectedDomesticIds, selectedForeignIds }: {
  flag: ReportFlagRow;
  selectedCertIds: unknown;
  selectedDomesticIds: unknown;
  selectedForeignIds: unknown;
}) {
  const raw = (flag.raw ?? {}) as Record<string, unknown>;
  const certCount = Array.isArray(selectedCertIds) ? selectedCertIds.length : readFlagRawNumber(raw, "cert_match_count");
  const domesticCount = Array.isArray(selectedDomesticIds) ? selectedDomesticIds.length : readFlagRawNumber(raw, "domestic_recall_count");
  const foreignCount = Array.isArray(selectedForeignIds) ? selectedForeignIds.length : readFlagRawNumber(raw, "foreign_recall_count");
  const isFiltered = Array.isArray(selectedCertIds) || Array.isArray(selectedDomesticIds) || Array.isArray(selectedForeignIds);
  const search = (raw.safety_search ?? {}) as Record<string, unknown>;
  const searchProduct = readFlagRawText(search, "productName");
  const searchModel = readFlagRawText(search, "modelName");
  const hasCounts = certCount !== null || domesticCount !== null || foreignCount !== null;
  const confidence = searchModel ? "높음 (모델명)" : searchProduct ? "낮음 (제품명)" : "확인 불가";

  return (
    <div className="rounded-md border border-border bg-white p-3">
      <div className="flex items-center gap-2">
        <span className="rounded bg-brand px-2 py-0.5 text-[10px] font-medium text-white">제품안전</span>
        <p className="text-xs font-semibold">SafetyKorea 조회 결과{isFiltered ? " (선택 항목)" : ""}</p>
      </div>
      {hasCounts ? (
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <MobileFlagFact label="KC 인증" value={certCount !== null ? `${certCount}건` : "-"} />
          <MobileFlagFact label="국내 리콜" value={domesticCount !== null ? `${domesticCount}건` : "-"} />
          <MobileFlagFact label="국외 리콜" value={foreignCount !== null ? `${foreignCount}건` : "-"} />
          <MobileFlagFact label="매칭 신뢰도" value={confidence} />
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">{normalizeReportText(flag.summary) ?? UNKNOWN_TEXT}</p>
      )}
      {searchProduct ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          조회 기준: {searchProduct}{searchModel ? ` · 모델명 ${searchModel}` : ""}
        </p>
      ) : null}
    </div>
  );
}

function RecallHighlightsMobile({ title, recalls }: { title: string; recalls: SelectedRecallItem[] }) {
  if (recalls.length === 0) return null;

  return (
    <div className="rounded-md border border-border bg-white p-3">
      <p className="text-xs font-semibold">{title} ({recalls.length}건)</p>
      <div className="mt-2 space-y-2">
        {recalls.map((recall, idx) => {
          const sourceLabel = getRecallSourceLabel(recall.source);
          const riskLabel = recall.source === "domestic_recall" ? "제품결함" : "위해내용";
          const actionLabel = recall.source === "domestic_recall" ? "소비자 행동요령" : "조치사항";

          return (
            <div key={`recall-mobile-${recall.source}-${recall.recordId || idx}`} className="rounded-md border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2">
                  <span className="mt-0.5 shrink-0 rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
                    {sourceLabel}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">
                      {recall.productName || recall.modelName || "제품명 없음"}
                    </p>
                    {recall.noticeDate ? <p className="mt-0.5 text-[11px] text-muted-foreground">공표일: {recall.noticeDate}</p> : null}
                    {(recall.brandName || recall.modelName || recall.recallType) ? (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {recall.brandName ? `브랜드: ${recall.brandName}` : ""}
                        {recall.brandName && recall.modelName ? " · " : ""}
                        {recall.modelName ? `모델: ${recall.modelName}` : ""}
                        {(recall.brandName || recall.modelName) && recall.recallType ? " · " : ""}
                        {recall.recallType ? `유형: ${recall.recallType}` : ""}
                      </p>
                    ) : null}
                  </div>
                </div>
                {recall.sourceUrl ? (
                  <a href={recall.sourceUrl} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 rounded-md bg-brand px-2 py-1 text-[11px] font-medium text-white hover:opacity-80"
                  >
                    원문↗
                  </a>
                ) : null}
              </div>
              {recall.defectSummary || recall.hazardSummary ? (
                <p className="mt-2 line-clamp-3 text-[11px] text-muted-foreground">• {riskLabel}: {recall.defectSummary || recall.hazardSummary}</p>
              ) : null}
              {recall.actionSummary ? (
                <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">• {actionLabel}: {recall.actionSummary}</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KcCertDetailMobile({ flag, selectedCertIds }: { flag: ReportFlagRow; selectedCertIds: unknown }) {
  const raw = (flag.raw ?? {}) as Record<string, unknown>;
  const allCerts = Array.isArray(raw.certifications) ? (raw.certifications as Record<string, unknown>[]) : [];
  const certIds = Array.isArray(selectedCertIds) ? (selectedCertIds as string[]) : null;
  const certs = certIds ? allCerts.filter((c) => certIds.includes(String(c.certNum ?? ""))) : allCerts;
  if (certs.length === 0) return null;

  const fieldText = (obj: Record<string, unknown>, key: string) => {
    const v = obj[key];
    return v != null && v !== "" ? normalizeReportText(String(v)) ?? "-" : "-";
  };

  return (
    <div className="rounded-md border border-border bg-white p-3">
      <p className="text-xs font-semibold">KC 인증 상세 ({certs.length}건)</p>
      <div className="mt-2 space-y-2">
        {certs.map((cert, idx) => {
          const url = String(cert.sourceUrl ?? "");
          return (
            <div key={`cert-mobile-${idx}`} className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-foreground">{fieldText(cert, "certNum")}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">상태: {fieldText(cert, "certState")} · 인증일: {fieldText(cert, "certDate")}</p>
                </div>
                {url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 rounded-md bg-brand px-2 py-1 text-[11px] font-medium text-white hover:opacity-80"
                  >
                    인증 상세↗
                  </a>
                ) : null}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px] text-muted-foreground">
                <span>모델: {fieldText(cert, "modelName")}</span>
                <span>제조사: {fieldText(cert, "makerName")}</span>
                <span>수입사: {fieldText(cert, "importerName")}</span>
                <span>제조국: {fieldText(cert, "makerCntryName")}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


function MobileFlagFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/40 px-2 py-1.5">
      <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xs font-medium">{sanitize(value)}</p>
    </div>
  );
}

/* ─── Safety Flag helpers ─────────────────────────────────────── */

function getSelectedRecallItems(
  safetyFlag: ReportFlagRow | undefined,
  source: RecallSource,
  selectedIdsValue: unknown,
): SelectedRecallItem[] {
  if (!safetyFlag || !Array.isArray(selectedIdsValue)) return [];

  const raw = (safetyFlag.raw ?? {}) as Record<string, unknown>;
  const itemsKey = source === "domestic_recall" ? "domestic_recalls" : "foreign_recalls";
  const selectedIds = new Set(selectedIdsValue.map((value) => String(value)));
  const items = Array.isArray(raw[itemsKey])
    ? (raw[itemsKey] as unknown[]).map(asSafetyRecord)
    : [];

  return items
    .filter((item) => {
      const recordId = readSafetyItemText(item, "recordId");
      return recordId !== "" && selectedIds.has(recordId);
    })
    .map((item) => normalizeSelectedRecallItem(item, source));
}

function normalizeSelectedRecallItem(item: Record<string, unknown>, source: RecallSource): SelectedRecallItem {
  return {
    source,
    recordId: readSafetyItemText(item, "recordId"),
    productName: readSafetyItemText(item, "productName"),
    modelName: readSafetyItemText(item, "modelName"),
    brandName: readSafetyItemText(item, "brandName"),
    noticeDate: readSafetyItemText(item, "noticeDate"),
    recallType: readSafetyItemText(item, "recallType"),
    defectSummary: readSafetyItemText(item, "defectSummary"),
    hazardSummary: readSafetyItemText(item, "hazardSummary"),
    actionSummary: readSafetyItemText(item, "actionSummary"),
    sourceUrl: readSafetyItemHref(item, "sourceUrl"),
  };
}

function getRecallSourceLabel(source: RecallSource): string {
  return source === "domestic_recall" ? "국내" : "국외";
}

function readSafetyItemText(item: Record<string, unknown>, key: string): string {
  const value = item[key];
  if (value == null || value === "") return "";
  return normalizeReportText(String(value)) ?? "";
}

function readSafetyItemHref(item: Record<string, unknown>, key: string): string {
  const value = item[key];
  if (value == null || value === "") return "";
  return toSafePublicHref(String(value)) ?? "";
}

function asSafetyRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readFlagRawText(raw: Record<string, unknown>, key: string): string {
  const value = raw[key];
  if (value == null || value === "") return "";
  return normalizeReportText(String(value)) ?? "";
}

function readFlagRawNumber(raw: Record<string, unknown>, key: string): number | null {
  const value = raw[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
