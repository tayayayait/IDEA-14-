import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useApiCall } from "@/hooks/useApiCall";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RiskBadge } from "@/components/RiskBadge";
import { SourceBadge } from "@/components/SourceBadge";
import { ApiStateChip } from "@/components/ApiStateChip";
import { Loader2, Sparkles, ArrowLeft, ExternalLink } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import type { RiskLabel } from "@/lib/scoring";
import { sanitize, sanitizeNullable } from "@/lib/scoring";
import { toPublicSourceUrl, buildKotraCertDetailUrl, buildKotraRegDetailUrl } from "@/lib/source-url";
import {
  buildProductAnalysisCode,
  getSelectionSourceLabel,
  getSelectionStatusDetail,
  getSelectionStatusLabel,
} from "@/lib/analysis-code";
import { saveLastSelectedCountry } from "@/lib/project-step";
import {
  getSuccessfulDetailRows,
  filterRowsByCurrentDetailContext,
  getCertificationSourceKind,
  getRegulationSourceKind,
  isIndustryMatchFailed,
  isCertificationReviewRequired as isCertReviewRequired,
  isRegulationReviewRequired as isRegReviewRequired,
  isKsureCategory,
  pickPlaceholderState,
  resolveCountryDetailApiState,
  resolveMatchedCountForDisplay,
  resolveSectionState,
  type CurrentDetailContext,
} from "@/lib/step4-detail-consistency";
import {
  groupKsureRiskRows,
  isGlobalPaymentScope,
  resolveKsurePaymentUnavailableMessage,
  resolveKsurePaymentUnavailableSourceUrl,
  toRiskLevelLabel,
} from "@/lib/step4-risk-presenter";
import { normalizeExecutionState, toApiChipState, type ExecutionState } from "@/lib/execution-state";
import { useRunningProgress } from "@/hooks/useRunningProgress";
import { normalizeReportText } from "@/lib/report-text";
import {
  buildNationalInfoPresentation,
  cleanNationalInfoText,
  type NationalInfoKind,
  type NationalInfoPresentation,
} from "@/lib/kotra-national-info";

type AiNewsCategory = "direct_product" | "adjacent_value_chain" | "broad_macro_export_env" | "unrelated";

interface CountryDetail {
  country_code: string;
  country_name: string;
  label: RiskLabel;
  total_score: number | null;
  rank?: number | null;
  rationale: {
    summary?: string;
    sources?: {
      type?: string | null;
      title: string;
      url?: string | null;
      summary?: string | null;
      keywords?: string[] | string | null;
      score_relevant?: boolean | null;
      ai_category?: AiNewsCategory | string | null;
      ai_product_relevance_score?: number | null;
      ai_country_relevance_score?: number | null;
      ai_export_impact_score?: number | null;
      ai_reason?: string | null;
      office_name?: string | null;
      office_address?: string | null;
      airport_route_text?: string | null;
      summary_source?: "ai" | "rule" | string | null;
    }[];
    target_markets?: Array<{ code?: string | null; name?: string | null }>;
    target_market_matched?: boolean | null;
    inclusion_reason?: string | null;
    recommendation_reason?: string | null;
    low_recommendation_reason?: string | null;
    alternative_markets?: Array<{ code?: string | null; name?: string | null }>;
    candidate_signals?: string[];
  } | null;
}

interface CertRow {
  id: string;
  scheme: string | null;
  required: boolean | null;
  est_cost_krw: number | null;
  est_lead_days: number | null;
  source_org: string | null;
  source_url: string | null;
  raw?: Record<string, unknown> | null;
}

interface RegRow {
  id: string;
  topic: string | null;
  summary: string | null;
  effective_date?: string | null;
  source_org: string | null;
  source_url: string | null;
  raw?: Record<string, unknown> | null;
}

interface RiskRow {
  id: string;
  category: string | null;
  level: string | null;
  summary: string | null;
  source_org: string | null;
  source_url: string | null;
  raw?: Record<string, unknown> | null;
}

type DetailSourceModel<T> = {
  rows: T[];
  successfulRows: T[];
  confirmedRows: T[];
  reviewRows: T[];
  placeholderRow: T | null;
  sectionState: "not_run" | "ready" | "empty" | "error" | "stale";
};

const KOTRA_CERT_NO_DIRECT_INFO_MESSAGE =
  "KOTRA 해외인증정보 API에서 현재 입력한 국가·HS Code·제품명 기준으로 직접 관련된 해외인증 정보가 확인되지 않았습니다.\n다만 인증 필요 여부는 제품의 세부 사양, 용도, 구성품, 현지 수입자 요건에 따라 달라질 수 있으므로 최종 수출 전 현지 인증기관 또는 KOTRA 무역관 확인이 필요합니다.";

export default function Step4CountryDetail() {
  const { session, loading: authLoading } = useAuthGuard();
  const { invoke, retryInSec, isRetrying } = useApiCall();
  const { id, cc } = useParams<{ id: string; cc: string }>();
  const navigate = useNavigate();

  const [country, setCountry] = useState<CountryDetail | null>(null);
  const [certs, setCerts] = useState<CertRow[]>([]);
  const [regs, setRegs] = useState<RegRow[]>([]);
  const [risks, setRisks] = useState<RiskRow[]>([]);
  const [aiState, setAiState] = useState<ExecutionState>("idle");
  const [analysisCode, setAnalysisCode] = useState(() => buildProductAnalysisCode(null));
  const [analysisProductName, setAnalysisProductName] = useState("");
  const [currentDetailContext, setCurrentDetailContext] = useState<CurrentDetailContext>({});
  const [selectedReg, setSelectedReg] = useState<RegRow | null>(null);
  const [nationalInfo, setNationalInfo] = useState<Record<string, unknown> | null>(null);
  const aiRunning = aiState === "running";
  const aiElapsedSec = useRunningProgress(aiRunning);
  const aiDelayed = aiRunning && aiElapsedSec >= 45;
  const aiRunningMessage = resolveStep4RunningMessage(aiElapsedSec);
  const aiChipState = toApiChipState(aiDelayed ? "stale" : aiState);

  const load = async () => {
    if (!id || !cc || authLoading || !session) return;

    const [{ data: c }, { data: ce }, { data: re }, { data: ri }, { data: productData }] = await Promise.all([
      supabase.from("project_countries").select("*").eq("project_id", id).eq("country_code", cc).maybeSingle(),
      supabase.from("project_certifications").select("*").eq("project_id", id).eq("country_code", cc),
      supabase.from("project_regulations").select("*").eq("project_id", id).eq("country_code", cc),
      supabase.from("project_risks").select("*").eq("project_id", id).eq("country_code", cc),
      supabase
        .from("project_products")
        .select("name,hs_code,hsk_code,components,confirmed")
        .eq("project_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const certRows = ((ce as CertRow[]) ?? []).map(sanitizeCertRow);
    const regRows = ((re as RegRow[]) ?? []).map(sanitizeRegRow);
    const riskRows = ((ri as RiskRow[]) ?? []).map(sanitizeRiskRow);

    const sanitizedCountry = sanitizeCountryDetail(c as CountryDetail | null);
    const currentProductName = sanitizeNullable(productData?.name ?? null) ?? "";
    const currentHsCode = sanitizeNullable(productData?.hs_code ?? null) ?? "";
    const currentHskCode = sanitizeNullable(productData?.hsk_code ?? null) ?? "";

    setCountry(sanitizedCountry);
    setCerts(certRows);
    setRegs(regRows);
    setRisks(riskRows);
    setAnalysisCode(buildProductAnalysisCode(productData));
    setAnalysisProductName(currentProductName);
    setCurrentDetailContext({
      countryCode: cc,
      productName: currentProductName,
      hsCode: currentHsCode,
      hskCode: currentHskCode,
    });

    return {
      certCount: certRows.length,
      regCount: regRows.length,
      riskCount: riskRows.filter((row) => isKsureCategory(row.category)).length,
    };
  };

  useEffect(() => {
    if (authLoading || !session) return;
    load();
  }, [id, cc, authLoading, session?.access_token]);

  useEffect(() => {
    if (!id || !cc) return;
    saveLastSelectedCountry(id, cc);
  }, [id, cc]);

  const runDetail = async () => {
    if (!id || !cc) return;
    if (authLoading || !session) {
      toast.error("로그인이 필요합니다. 다시 로그인해 주세요.");
      navigate("/auth", { replace: true });
      return;
    }
    setAiState("running");
    const result = await invoke<{ state?: string; message?: string }>(
      "country-detail",
      {
        project_id: id,
        country_code: cc,
      },
      { timeoutMs: 45000 },
    );
    const loaded = await load();
    const hasLoadedDetailRows = Boolean(loaded && (loaded.certCount > 0 || loaded.regCount > 0 || loaded.riskCount > 0));
    const nextAiState = resolveCountryDetailApiState({
      ok: result.ok,
      resultState: result.state,
      responseState: result.ok ? (result.data?.state ?? "success") : undefined,
      hasLoadedDetailRows,
    });

    if (!result.ok) {
      setAiState(nextAiState);
      const message = result.message ?? "상세 분석 실패";
      if (hasLoadedDetailRows) {
        toast.warning(`${message} (최신 데이터는 반영됨)`);
      } else if (nextAiState === "partial_success" || nextAiState === "stale") {
        toast.warning(message);
      } else {
        toast.error(message);
      }
      return;
    }

    setAiState(nextAiState);
    if (result.data && typeof result.data === "object" && "national_info" in result.data) {
      setNationalInfo((result.data as Record<string, unknown>).national_info as Record<string, unknown> | null);
    }
    if (nextAiState === "partial_success" || nextAiState === "stale") {
      toast.warning(result.message ?? "부분 결과로 갱신했습니다.");
    } else {
      toast.success("국가 상세 분석을 갱신했습니다.");
    }
  };

  const certMatchedCount = extractSourceMatchedCount(country?.rationale?.sources, "cert_data");
  const regulationMatchedCount = extractSourceMatchedCount(country?.rationale?.sources, "regulation_data");
  const detailExecuted = certs.length > 0 || regs.length > 0 || risks.length > 0 || !!nationalInfo;
  const visibleSources = filterVisibleSources(country?.rationale?.sources);
  const currentCertRows = filterRowsByCurrentDetailContext(certs, currentDetailContext, "certification");
  const currentRegRows = filterRowsByCurrentDetailContext(regs, currentDetailContext, "regulation")
    .filter((row) => getRegulationSourceKind(row) === "kotra_import_regulation");
  const kotraCertSource = buildCertSourceModel(
    currentCertRows.filter((row) => getCertificationSourceKind(row) === "kotra_overseas_cert"),
    detailExecuted,
  );
  const kotraRegSource = buildRegSourceModel(
    currentRegRows,
    detailExecuted,
  );
  const certSuccessfulRows = getSuccessfulDetailRows(currentCertRows);
  const certConfirmedRows = certSuccessfulRows.filter((row) => !isCertReviewRequired(row));
  const certReviewRows = certSuccessfulRows.filter(isCertReviewRequired);
  const regSuccessfulRows = getSuccessfulDetailRows(currentRegRows);
  const regConfirmedRows = regSuccessfulRows.filter((row) => !isRegReviewRequired(row));
  const regReviewRows = regSuccessfulRows.filter(isRegReviewRequired);
  const certCurrentContextMismatch = certs.length > 0 && currentCertRows.length === 0;
  const regCurrentContextMismatch = regs.length > 0 && currentRegRows.length === 0;
  const ksureRisks = risks.filter((row) => isKsureCategory(row.category));
  const riskSuccessfulRows = getSuccessfulDetailRows(ksureRisks);
  const groupedRisks = useMemo(
    () => groupKsureRiskRows(riskSuccessfulRows, { industryLimit: 3 }),
    [riskSuccessfulRows],
  );
  const industryPlaceholder = findCategoryPlaceholderRow(ksureRisks, "k_sure_industry");
  const industryMatchFailureMessage = resolveIndustryMatchFailureMessage(industryPlaceholder);
  const paymentPlaceholder = findCategoryPlaceholderRow(ksureRisks, "k_sure_payment");
  const paymentUnavailableMessage = resolveKsurePaymentUnavailableMessage(paymentPlaceholder);
  const paymentUnavailableSourceUrl = resolveKsurePaymentUnavailableSourceUrl(paymentPlaceholder);

  const certSectionState = resolveSectionState({
    detailExecuted,
    successfulRowCount: certSuccessfulRows.length,
    placeholderState: pickPlaceholderState(currentCertRows),
  });
  const regSectionState = resolveSectionState({
    detailExecuted,
    successfulRowCount: regSuccessfulRows.length,
    placeholderState: pickPlaceholderState(currentRegRows),
  });
  const riskSectionState = resolveSectionState({
    detailExecuted,
    successfulRowCount: riskSuccessfulRows.length,
    placeholderState: pickPlaceholderState(ksureRisks),
  });
  const certPlaceholderRow = findDetailPlaceholderRow(currentCertRows);
  const regPlaceholderRow = findDetailPlaceholderRow(currentRegRows);

  const certCountForDisplay = resolveMatchedCountForDisplay({
    detailExecuted,
    matchedCount: certMatchedCount,
    successfulRowCount: certConfirmedRows.length,
  });
  const regulationCountForDisplay = resolveMatchedCountForDisplay({
    detailExecuted,
    matchedCount: regulationMatchedCount,
    successfulRowCount: regConfirmedRows.length,
  });

  const renderCertRow = (row: CertRow) => (
    <li key={row.id} className="rounded-md border border-border p-3">
      <p className="font-medium">
        {certValue(row, "applicable_items", row.scheme ?? "정확한 정보 없음")}
        {row.required ? <span className="ml-2 text-xs text-risk-high">필수</span> : null}
      </p>
      <div className="mt-1 space-y-1 text-xs text-muted-foreground">
        <p>매칭 기준: {certValue(row, "match_basis", "정확한 정보 없음")}</p>
        {isCertReviewRequired(row) ? <p>검토 상태: 기관 확인 필요</p> : null}
        <p>필요서류: {certValue(row, "required_docs", "정확한 정보 없음")}</p>
        <p className="line-clamp-3">절차: {certValue(row, "procedure", "정확한 정보 없음")}</p>
        <p>유효기간: {certValue(row, "validity_period", "정확한 정보 없음")}</p>
        <p>
          예상 비용 {row.est_cost_krw ? `${row.est_cost_krw.toLocaleString()} KRW` : "정확한 정보 없음"} / 예상
          기간 {row.est_lead_days ?? "정확한 정보 없음"}일
        </p>
      </div>
      {row.source_url ? (
        <a
          href={row.source_org === "KOTRA" ? buildKotraCertDetailUrl(row.raw) : row.source_url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-xs text-brand hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          {row.source_org || "출처"}
        </a>
      ) : null}
    </li>
  );

  const renderRegRow = (row: RegRow) => {
    const sourceUrl = resolveRegSourceUrl(row, cc ?? country?.country_code ?? null);
    const sourceLabel = resolveRegSourceLabel(row);
    const backupSource = isRegBackupSource(row);
    const matchConfidence = readDetailRawText(row.raw ?? null, "match_confidence").toLowerCase();
    const reviewRequired = isRegReviewRequired(row) && matchConfidence !== "high";
    const matchBasisLabel = resolveRegMatchBasisLabel(row);
    const matchedTokensLabel = resolveRegMatchedTokensLabel(row);
    const translatedRegType = translateRegulationType(
      regValue(row, "regulation_type", row.topic ?? "정확한 정보 없음"),
    );

    // 일반 규제(KOTRA 등) 카드
    return (
      <li key={row.id} className="rounded-md border border-border p-3">
        <p className="font-medium">
          {regValue(row, "hs_code", "정확한 정보 없음")} / {translatedRegType}
          {reviewRequired ? (
            <span className="ml-2 text-xs text-risk-reviewable">HS 불일치 검토 필요</span>
          ) : null}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          시행일: {regValue(row, "effective_date", row.effective_date ?? "정확한 정보 없음")}
        </p>
        <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
          {sanitizeNullable(row.summary) ?? "정확한 정보 없음"}
        </p>
        {reviewRequired ? (
          <p className="mt-1 text-xs text-risk-reviewable">
            확정 규제가 아닌 검토 필요 후보입니다. HS 기준 불일치로 기관 원문 확인이 필요합니다.
          </p>
        ) : null}
        {matchBasisLabel ? (
          <p className="mt-1 text-xs text-muted-foreground">
            매칭 기준: {matchBasisLabel}{matchedTokensLabel ? ` / ${matchedTokensLabel}` : ""}
          </p>
        ) : null}
        {backupSource ? (
          <p className="mt-1 text-xs text-amber-700">
            백업 근거 사용: 국별 대세계 수입규제 현황(CSV)
          </p>
        ) : null}
        <p className="mt-1 text-xs text-muted-foreground">
          출처 유형: {resolveRegSourceTypeLabel(row)}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setSelectedReg(row)}>
            상세 보기
          </Button>
          {sourceUrl ? (
            <a href={sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand hover:underline">
              <ExternalLink className="h-3 w-3" />
              {sourceLabel}
            </a>
          ) : null}
        </div>
      </li>
    );
  };

  const renderCertSourceCard = (params: {
    title: string;
    description: string;
    source: DetailSourceModel<CertRow>;
    emptyMessage: string;
    contextMismatch?: boolean;
    notRunMessage?: string;
  }) => {
    const { title, description, source, emptyMessage, contextMismatch = false, notRunMessage } = params;
    return (
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription className="mt-1">{description}</CardDescription>
            </div>
            <SourceStatusPill source={source} />
          </div>
          <p className="text-xs text-muted-foreground">
            확정 인증정보 {source.confirmedRows.length}건 / 검토 필요 인증정보 {source.reviewRows.length}건
          </p>
        </CardHeader>
        <CardContent>
          {source.sectionState === "not_run" ? (
            <Empty msg={notRunMessage ?? "상세 분석 미실행 상태입니다. 대상국 분석 실행을 눌러주세요."} />
          ) : contextMismatch ? (
            <Empty msg={KOTRA_CERT_NO_DIRECT_INFO_MESSAGE} />
          ) : source.sectionState !== "ready" ? (
            <SourceZeroResultNotice source={source} emptyMessage={emptyMessage} />
          ) : (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-medium">확정 인증정보 {source.confirmedRows.length}건</p>
                {source.confirmedRows.length > 0 ? (
                  <ul className="space-y-3">{source.confirmedRows.map(renderCertRow)}</ul>
                ) : (
                  <Empty msg={emptyMessage} />
                )}
              </div>
              {source.reviewRows.length > 0 ? (
                <div>
                  <p className="mb-2 text-sm font-medium text-risk-reviewable">
                    검토 필요 인증정보 {source.reviewRows.length}건
                  </p>
                  <ul className="space-y-3">{source.reviewRows.map(renderCertRow)}</ul>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderRegSourceCard = (params: {
    title: string;
    description: string;
    source: DetailSourceModel<RegRow>;
    emptyMessage: string;
    contextMismatch?: boolean;
    notRunMessage?: string;
  }) => {
    const { title, description, source, emptyMessage, contextMismatch = false, notRunMessage } = params;
    return (
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription className="mt-1">{description}</CardDescription>
            </div>
            <SourceStatusPill source={source} />
          </div>
          <p className="text-xs text-muted-foreground">
            확정 {source.confirmedRows.length}건 / 검토 후보 {source.reviewRows.length}건
          </p>
        </CardHeader>
        <CardContent>
          {source.sectionState === "not_run" ? (
            <Empty msg={notRunMessage ?? "상세 분석 미실행 상태입니다. 대상국 분석 실행을 눌러주세요."} />
          ) : contextMismatch ? (
            <Empty msg="현재 제품명/HS코드 기준으로 확인된 해외인증 정보가 없습니다. 단, 인증정보 없음은 인증 불필요를 의미하지 않으므로 세부 HS코드와 제품 용도를 기준으로 추가 확인이 필요합니다." />
          ) : source.sectionState !== "ready" ? (
            <SourceZeroResultNotice source={source} emptyMessage={emptyMessage} />
          ) : (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-medium">확정 {source.confirmedRows.length}건</p>
                {source.confirmedRows.length > 0 ? (
                  <ul className="space-y-3">{source.confirmedRows.map(renderRegRow)}</ul>
                ) : (
                  <Empty msg={emptyMessage} />
                )}
              </div>
              {source.reviewRows.length > 0 ? (
                <div>
                  <p className="mb-2 text-sm font-medium text-risk-reviewable">
                    검토 후보 {source.reviewRows.length}건
                  </p>
                  <ul className="space-y-3">{source.reviewRows.map(renderRegRow)}</ul>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <AppShell
      currentStep={4}
      evidence={
        <div className="space-y-3 text-sm">
          <h3 className="font-display font-semibold">출처</h3>
          <div className="rounded-md border border-border p-3">
            <p className="font-medium">분석 기준 코드</p>
            <p className="mt-1 break-words text-xs text-muted-foreground">
              제품명: {analysisProductName || "확실한 정보 없음"}
            </p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              HS {analysisCode.hsCode || "-"} / HSK {analysisCode.hskCode || "-"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              적용 방식: {getSelectionSourceLabel(analysisCode.selectionSource)}
              {analysisCode.selectionScore !== null ? ` (${analysisCode.selectionScore})` : ""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              상태: {getSelectionStatusLabel(analysisCode.selectionStatus)} / {getSelectionStatusDetail(analysisCode.selectionStatus)}
            </p>
            {analysisCode.reviewRequired ? (
              <p className="mt-1 text-xs text-risk-reviewable">
                후속 단계 참고용 코드이므로 최종 확정 전 추가 검증이 필요합니다.
              </p>
            ) : null}
          </div>

          {visibleSources.length ? (
            <ul className="space-y-2">
              {visibleSources.map((source, index) => (
                <li key={index}>
                  <div className="space-y-1">
                    <SourceBadge source={sourceFromText(`${source.title} ${source.url}`)} />
                    {resolveSourceLabel(source.type, source.score_relevant) ? (
                      <p className="text-xs text-muted-foreground">{resolveSourceLabel(source.type, source.score_relevant)}</p>
                    ) : null}
                    {source.url ? (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-start gap-1 text-brand hover:underline"
                      >
                        <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
                        <span className="text-xs">{source.title}</span>
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">{source.title} / 원문 링크 없음</span>
                    )}
                    {source.summary ? <p className="text-xs text-muted-foreground">{source.summary}</p> : null}
                    {source.ai_reason ? (
                      <p className="text-xs text-muted-foreground">AI 판정: {source.ai_reason}</p>
                    ) : null}
                    {!source.summary && normalizeSourceKeywords(source.keywords).length > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        키워드: {normalizeSourceKeywords(source.keywords).join(", ")}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              출처가 아직 수집되지 않았습니다. 대상국 분석 실행을 눌러주세요.
            </p>
          )}

          <div className="rounded-md bg-muted p-3">
            <p className="font-medium">AI 상태</p>
            <ApiStateChip state={aiChipState} className="mt-1" />
            {aiRunning ? (
              <p className="mt-2 text-xs text-muted-foreground">{aiRunningMessage}</p>
            ) : null}
            {aiDelayed ? (
              <p className="mt-1 text-xs text-risk-reviewable">
                45초 이상 응답 지연 중입니다. 실패가 아니면 완료 후 자동 반영합니다.
              </p>
            ) : null}
            {isRetrying && retryInSec > 0 && (
              <p className="mt-2 text-xs text-risk-reviewable">
                요청 시도 초과로 자동 재시도 대기 중입니다. {retryInSec}초 후 다시 호출합니다.
              </p>
            )}
          </div>
        </div>
      }
      actionBar={
        <>
          <Button variant="ghost" onClick={() => navigate(`/projects/${id}/countries`)}>
            <ArrowLeft className="h-4 w-4" />
            후보군으로
          </Button>
          <Button onClick={() => navigate(`/projects/${id}/report`)} className="text-[0]">
            <span className="text-sm">리포트로</span>
            안전성 검토로
          </Button>
        </>
      }
    >
      {!country ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          상세 데이터 조회 중...
        </div>
      ) : (
        <>
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-mono text-muted-foreground">{country.country_code}</p>
              <h1 className="font-display text-2xl font-semibold">{country.country_name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <OverallVerdictBadge score={country.total_score} />
                <span className="text-sm text-muted-foreground">점수: {country.total_score ?? "-"}/100</span>
                <RiskBadge label={country.label} />
              </div>
              {detailExecuted ? (
                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  <p>핵심 리스크: {resolveKeyRisks(kotraRegSource, kotraCertSource)}</p>
                  <p>다음 확인사항: {resolveNextCheckItems(kotraRegSource, kotraCertSource)}</p>
                </div>
              ) : null}
            </div>
            <Button onClick={runDetail} disabled={authLoading || !session || aiRunning} className="min-h-11">
              {aiRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {aiRunning ? "상세 데이터 조회 중..." : "상세 분석 실행"}
            </Button>
          </div>

          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-base">수출 진입장벽 요약</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">판정</p>
                  <div className="mt-1 flex items-center gap-2">
                    <OverallVerdictBadge score={country.total_score} />
                    <span className="font-medium">{country.total_score ?? "-"}/100</span>
                    {country.rank ? <span className="text-muted-foreground">Rank {country.rank}</span> : null}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">포함 여부</p>
                  <p className="mt-1 font-medium">
                    {country.rationale?.target_market_matched ? "목표시장으로 감지됨" : "기본 후보군 포함"}
                  </p>
                </div>
              </div>
              {country.rationale?.inclusion_reason ? (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">포함 이유</p>
                  <p className="mt-0.5">{country.rationale.inclusion_reason}</p>
                </div>
              ) : null}
              {country.rationale?.recommendation_reason ? (
                <div>
                  <p className="text-xs font-semibold text-emerald-700">긍정 요인</p>
                  <p className="mt-0.5">{country.rationale.recommendation_reason}</p>
                </div>
              ) : null}
              {country.rationale?.low_recommendation_reason ? (
                <div>
                  <p className="text-xs font-semibold text-risk-reviewable">주의 요인</p>
                  <p className="mt-0.5 text-risk-reviewable">{country.rationale.low_recommendation_reason}</p>
                </div>
              ) : null}
              {formatMarkets(country.rationale?.alternative_markets).length > 0 ? (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">대안시장</p>
                  <p className="mt-0.5">{formatMarkets(country.rationale?.alternative_markets).join(", ")}</p>
                </div>
              ) : null}
              {country.rationale?.candidate_signals?.length ? (
                <p className="text-xs text-muted-foreground">후보 편입 근거: {country.rationale.candidate_signals.join(", ")}</p>
              ) : null}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            {renderCertSourceCard({
              title: "KOTRA 해외인증·규격",
              description: "국가·HS/HSK·제품 기준 KOTRA 해외인증 API 결과",
              source: kotraCertSource,
              emptyMessage: KOTRA_CERT_NO_DIRECT_INFO_MESSAGE,
              contextMismatch: certCurrentContextMismatch,
              notRunMessage: certMatchedCount > 0
                ? `추천 단계에서 인증 ${certMatchedCount}건이 감지되었습니다. 상세 분석을 실행하면 출처별 카드에 동기화됩니다.`
                : undefined,
            })}

            {renderRegSourceCard({
              title: "KOTRA 수입규제·무역구제",
              description: "DS00000128 API + 국별 대세계 수입규제 CSV 기준 결과",
              source: kotraRegSource,
              emptyMessage: `${country?.country_name ?? "선택국가"} 내 한국산 해당 HS 기준 KOTRA 수입규제·무역구제 매칭 0건`,
              contextMismatch: regCurrentContextMismatch,
              notRunMessage: regulationMatchedCount > 0
                ? `추천 단계에서 규제 ${regulationMatchedCount}건이 감지되었습니다. 상세 분석을 실행하면 출처별 카드에 동기화됩니다.`
                : undefined,
            })}

            <NationalInfoCard
              nationalInfo={nationalInfo}
              detailExecuted={detailExecuted}
              productContext={currentDetailContext}
            />

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">결제·국가 리스크(K-SURE)</CardTitle>
                <CardDescription>
                  국가위험 {groupedRisks.countryRisk ? 1 : 0}건, 입력 업종 기준 위험지수{" "}
                  {groupedRisks.industryRisks.length}건, 수출결제 {groupedRisks.paymentRisk ? "1건" : "0건"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {riskSectionState === "not_run" ? (
                  <Empty msg="상세 분석 미실행 상태입니다. 대상국 분석 실행을 눌러주세요." />
                ) : riskSectionState === "error" ? (
                  <Empty msg="K-SURE 조회 중 API 오류가 발생했습니다. 기관 확인이 필요합니다." />
                ) : riskSectionState === "stale" ? (
                  <Empty msg="K-SURE 데이터가 미동기화/오래됨 상태입니다. 원문 확인 후 재실행하세요." />
                ) : riskSectionState === "empty" ? (
                  <Empty msg="조회 결과 없음" />
                ) : (
                  <>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-md border border-border p-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">국가 위험 등급</p>
                        {groupedRisks.countryRisk ? (
                          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                            <p className="text-sm font-medium text-foreground">
                              {toRiskLevelLabel(groupedRisks.countryRisk.level)}
                            </p>
                            <p>국가명: {riskValue(groupedRisks.countryRisk, "country_name", "정확한 정보 없음")}</p>
                            <p>평가 등급: {riskValue(groupedRisks.countryRisk, "eval_grade", "정확한 정보 없음")}</p>
                            <p>평가일: {riskValue(groupedRisks.countryRisk, "eval_date", "정확한 정보 없음")}</p>
                            {groupedRisks.countryRisk.source_url ? (
                              <a
                                href={groupedRisks.countryRisk.source_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-brand hover:underline"
                              >
                                <ExternalLink className="h-3 w-3" />
                                K-SURE 출처
                              </a>
                            ) : null}
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-muted-foreground">정확한 정보 없음</p>
                        )}
                      </div>

                      <div className="rounded-md border border-border p-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">업종 위험 지수(입력 업종 기준)</p>
                        {groupedRisks.industryRisks.length > 0 ? (
                          <ul className="mt-2 space-y-2">
                            {groupedRisks.industryRisks.map((row) => (
                              <li key={row.id} className="text-xs text-muted-foreground">
                                <p className="text-sm font-medium text-foreground">{toRiskLevelLabel(row.level)}</p>
                                <p>업종명: {riskValue(row, "biz_type_name", "정확한 정보 없음")}</p>
                                <p>위험 지수: {riskValue(row, "risk_index", "정확한 정보 없음")}</p>
                                {row.source_url ? (
                                  <a
                                    href={row.source_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-brand hover:underline"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    K-SURE 출처
                                  </a>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        ) : industryMatchFailureMessage ? (
                          <p className="mt-2 text-xs text-risk-reviewable">{industryMatchFailureMessage}</p>
                        ) : (
                          <p className="mt-2 text-xs text-muted-foreground">정확한 정보 없음</p>
                        )}
                      </div>

                      <div className="rounded-md border border-border p-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">수출결제 현황</p>
                        {groupedRisks.paymentRisk ? (
                          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                            <p className="text-sm font-medium text-foreground">
                              {toRiskLevelLabel(groupedRisks.paymentRisk.level)}
                            </p>
                            {isGlobalPaymentScope(groupedRisks.paymentRisk) ? (
                              <p className="text-risk-reviewable">전세계 참고자료 (국가 단위 아님)</p>
                            ) : null}
                            <p>
                              평균 결제기간:{" "}
                              {formatDaysValue(groupedRisks.paymentRisk.raw?.average_payment_period)}
                            </p>
                            <p>
                              연체율:{" "}
                              {formatPercentValue(groupedRisks.paymentRisk.raw?.late_payment_rate)}
                            </p>
                            <p>
                              주요 결제조건:{" "}
                              {riskValue(groupedRisks.paymentRisk, "top_payment_term_name", "정확한 정보 없음")}
                              {formatShareValue(groupedRisks.paymentRisk.raw?.top_payment_term_share)}
                            </p>
                            {groupedRisks.paymentRisk.source_url ? (
                              <a
                                href={groupedRisks.paymentRisk.source_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-brand hover:underline"
                              >
                                <ExternalLink className="h-3 w-3" />
                                K-SURE 출처
                              </a>
                            ) : null}
                          </div>
                        ) : paymentUnavailableMessage ? (
                          <div className="mt-2 space-y-1 text-xs text-risk-reviewable">
                            <p>{paymentUnavailableMessage}</p>
                            {paymentUnavailableSourceUrl ? (
                              <a
                                href={paymentUnavailableSourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-brand hover:underline"
                              >
                                <ExternalLink className="h-3 w-3" />
                                K-SURE 출처
                              </a>
                            ) : null}
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-muted-foreground">정확한 정보 없음</p>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      K-SURE 데이터는 국가·업종 단위 참고자료입니다.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

          </div>

          <Dialog open={Boolean(selectedReg)} onOpenChange={(open) => !open && setSelectedReg(null)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>규제 상세 정보</DialogTitle>
                <DialogDescription>
                  KOTRA DS00000128 API/cache 및 국별 대세계 수입규제 CSV 기준 상세입니다.
                </DialogDescription>
              </DialogHeader>
              {selectedReg ? (
                <div className="space-y-2 text-sm max-h-[70vh] overflow-y-auto pr-2">
                  <RegDetailRow label="HS 코드" value={regValue(selectedReg, "hs_code", "정확한 정보 없음")} />
                  <RegDetailRow label="품목명" value={regValue(selectedReg, "product_name", "정확한 정보 없음")} />
                  <RegDetailRow label="규제 유형" value={translateRegulationType(regValue(selectedReg, "regulation_type", selectedReg.topic ?? "정확한 정보 없음"))} />
                  <RegDetailRow label="규제 대상국" value={regValue(selectedReg, "probe_target_country", "정확한 정보 없음")} />
                  <RegDetailRow label="지역 본부" value={regValue(selectedReg, "hq_region", "정확한 정보 없음")} />
                  <RegDetailRow label="시행일" value={regValue(selectedReg, "effective_date", selectedReg.effective_date ?? "정확한 정보 없음")} />
                  <RegDetailRow label="종료일" value={regValue(selectedReg, "regulation_end_date", "정확한 정보 없음")} />
                  <RegDetailRow label="등록일" value={regValue(selectedReg, "reg_input_date_raw", "정확한 정보 없음")} />
                  <RegDetailRow label="근거 소스" value={resolveRegSourceLabel(selectedReg)} />
                  <RegDetailRow label="요약" value={sanitizeNullable(selectedReg.summary) ?? "정확한 정보 없음"} multiline />
                </div>
              ) : null}
            </DialogContent>
          </Dialog>
        </>
      )}
    </AppShell>
  );
}

function resolveStep4RunningMessage(elapsedSec: number): string {
  if (elapsedSec >= 45) return `상세 분석 응답 지연 상태입니다. (${elapsedSec}초 경과)`;
  if (elapsedSec >= 20) return `인증·규제·K-SURE 원문 근거를 수집 중입니다. (${elapsedSec}초 경과)`;
  if (elapsedSec > 0) return `상세 분석 요청을 처리 중입니다. (${elapsedSec}초 경과)`;
  return "상세 분석을 시작합니다.";
}

function DetailZeroResultNotice({
  row,
  kind,
}: {
  row: { raw?: Record<string, unknown> | null } | null;
  kind: "certification" | "regulation";
}) {
  const raw = row?.raw ?? null;
  const detailState = readDetailRawText(raw, "detail_state").toLowerCase();
  const countryName = readDetailRawText(raw, "country_name") || "선택국가";
  const headline = detailState === "error"
    ? (kind === "certification" ? "인증 조회 중 API 오류가 발생했습니다." : "규제/NTM 조회 중 API 오류가 발생했습니다.")
    : detailState === "stale"
      ? (kind === "certification" ? "인증 데이터가 미동기화/오래됨 상태입니다." : "규제/NTM 캐시가 미동기화/오래됨 상태입니다.")
      : kind === "certification"
        ? "해당 국가·제품명·HS 기준으로 확인된 인증 정보 없음"
        : `${countryName} 내 한국산 해당 HS 기준 수입규제 확인 결과 0건`;
  const description = detailState === "error"
    ? "상세 분석을 다시 실행하세요."
    : detailState === "stale"
      ? "최신 데이터 동기화 후 다시 실행하세요."
      : "";

  return (
    <div className="rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
      <p className="text-sm font-medium text-foreground">{headline}</p>
      {description ? <p className="mt-1">{description}</p> : null}
    </div>
  );
}

function buildCertSourceModel(rows: CertRow[], detailExecuted: boolean): DetailSourceModel<CertRow> {
  const successfulRows = getSuccessfulDetailRows(rows);
  return {
    rows,
    successfulRows,
    confirmedRows: successfulRows.filter((row) => !isCertReviewRequired(row)),
    reviewRows: successfulRows.filter(isCertReviewRequired),
    placeholderRow: findDetailPlaceholderRow(rows),
    sectionState: resolveSectionState({
      detailExecuted,
      successfulRowCount: successfulRows.length,
      placeholderState: pickPlaceholderState(rows),
    }),
  };
}

function buildRegSourceModel(rows: RegRow[], detailExecuted: boolean): DetailSourceModel<RegRow> {
  const successfulRows = getSuccessfulDetailRows(rows);
  return {
    rows,
    successfulRows,
    confirmedRows: successfulRows.filter((row) => !isRegReviewRequired(row)),
    reviewRows: successfulRows.filter(isRegReviewRequired),
    placeholderRow: findDetailPlaceholderRow(rows),
    sectionState: resolveSectionState({
      detailExecuted,
      successfulRowCount: successfulRows.length,
      placeholderState: pickPlaceholderState(rows),
    }),
  };
}

function SourceStatusPill<T extends { raw?: Record<string, unknown> | null }>({
  source,
}: {
  source: DetailSourceModel<T>;
}) {
  const status = resolveDetailSourceStatus(source);
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}>
      {status.label}
    </span>
  );
}

function SourceZeroResultNotice<T extends { raw?: Record<string, unknown> | null }>({
  source,
  emptyMessage,
}: {
  source: DetailSourceModel<T>;
  emptyMessage: string;
}) {
  const status = resolveDetailSourceStatus(source);
  const raw = source.placeholderRow?.raw ?? null;
  const apiMessage = resolveSourceApiMessage(raw);
  const searchSummary = resolveSourceSearchSummary(raw);
  const description = status.kind === "missing_key"
    ? "Supabase Edge Function secret 설정이 필요합니다."
    : status.kind === "error"
      ? "상세 분석을 다시 실행하거나 API 응답 상태를 확인해야 합니다."
      : status.kind === "stale"
        ? "캐시 동기화 후 다시 실행해야 합니다."
        : "";

  return (
    <div className="rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
      <p className="text-sm font-medium text-foreground">
        {status.kind === "empty" ? emptyMessage : status.label}
      </p>
      {description ? <p className="mt-1">{description}</p> : null}
      {apiMessage ? <p className="mt-1">API 상태: {apiMessage}</p> : null}
      {searchSummary ? <p className="mt-1">확인 범위: {searchSummary}</p> : null}
    </div>
  );
}

function resolveSourceApiMessage(raw: Record<string, unknown> | null): string {
  const message = readDetailRawText(raw, "api_message");
  const normalized = message.toLowerCase();
  if (!message) return "";
  if (normalized.includes("after product relevance filter")) {
    const rawCount = message.match(/\((\d+) raw items\)/i)?.[1];
    return rawCount
      ? `조회 결과: 통보문 ${rawCount}건 중 제품 관련 매칭 없음`
      : "조회 결과: 제품 관련 매칭 통보문 없음";
  }
  if (normalized.includes("cache_filter_match_0_csv_backup_no_match")) return "API/cache 및 CSV 백업 정상 조회, 매칭 0건";
  if (normalized.includes("cache_filter_match_0_csv_backup_used")) return "API/cache 0건 후 CSV 백업 매칭 사용";
  if (normalized.includes("cache_empty_csv_backup")) return "API/cache 0건 후 CSV 백업 확인";
  if (normalized === "cache_filter_match_0") return "API/cache 정상 조회, 매칭 0건";
  if (normalized === "cache_read_ok") return "API/cache 정상 조회";
  return message;
}

function resolveSourceSearchSummary(raw: Record<string, unknown> | null): string {
  const sourceType = readDetailRawText(raw, "source_type").toLowerCase();
  const country = readDetailRawText(raw, "input_country_name") ||
    readDetailRawText(raw, "country_name") ||
    readDetailRawText(raw, "input_country_code");
  const hsCode = readDetailRawText(raw, "input_hs_code") || readDetailRawText(raw, "hs_code");
  const hskCode = readDetailRawText(raw, "input_hsk_code") || readDetailRawText(raw, "hsk_code");
  const productName = readDetailRawText(raw, "input_product_name") || readDetailRawText(raw, "product_name");
  const criteria = [
    country ? `국가 ${country}` : "",
    hsCode ? `HS ${hsCode}` : "",
    hskCode ? `HSK ${hskCode}` : "",
    productName ? `제품 ${productName}` : "",
  ].filter(Boolean).join(", ");

  if (sourceType === "kotra_cache" || sourceType === "kotra_api_sync" || sourceType === "csv_backup") {
    return `KOTRA DS00000128 API/cache와 국별 대세계 수입규제 CSV를 함께 확인했습니다${criteria ? ` (${criteria})` : ""}.`;
  }
  if (sourceType === "kotra_overseas_cert") {
    return `KOTRA 해외인증 API를 국가·HS·제품 기준으로 확인했습니다${criteria ? ` (${criteria})` : ""}.`;
  }
  return "";
}

function resolveDetailSourceStatus<T extends { raw?: Record<string, unknown> | null }>(
  source: DetailSourceModel<T>,
): { label: string; kind: "idle" | "ready" | "empty" | "missing_key" | "error" | "stale"; className: string } {
  const raw = source.placeholderRow?.raw ?? null;
  const apiMessage = readDetailRawText(raw, "api_message").toLowerCase();
  const keyMissing = apiMessage.includes("api_key is missing");

  if (source.sectionState === "not_run") {
    return { label: "미실행", kind: "idle", className: "bg-muted text-muted-foreground" };
  }
  if (keyMissing) {
    return { label: "키 없음", kind: "missing_key", className: "bg-amber-50 text-amber-700" };
  }
  if (source.sectionState === "ready") {
    return { label: "조회 성공", kind: "ready", className: "bg-emerald-50 text-emerald-700" };
  }
  if (source.sectionState === "error") {
    return { label: "API 실패", kind: "error", className: "bg-red-50 text-red-700" };
  }
  if (source.sectionState === "stale") {
    return { label: "캐시 점검", kind: "stale", className: "bg-amber-50 text-amber-700" };
  }
  return { label: "확인된 인증정보 없음", kind: "empty", className: "bg-slate-100 text-slate-700" };
}

function Empty({ msg }: { msg: string }) {
  return <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">{msg}</p>;
}

function RegDetailRow({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className={multiline ? "rounded-md border border-border p-2" : "flex items-start gap-2"}>
      <p className="min-w-[88px] text-xs font-medium text-muted-foreground">{label}</p>
      <p className={multiline ? "mt-1 whitespace-pre-wrap text-sm" : "text-sm"}>{value}</p>
    </div>
  );
}

function certValue(row: CertRow, key: string, fallback: string): string {
  const value = row.raw?.[key];
  if (value == null || value === "") return sanitize(fallback);
  return sanitize(String(value));
}

function regValue(row: RegRow, key: string, fallback: string): string {
  const value = row.raw?.[key];
  if (value == null || value === "") return sanitize(fallback);
  return sanitize(String(value));
}

function isRegBackupSource(row: RegRow): boolean {
  const sourceType = readDetailRawText(row.raw ?? null, "source_type").toLowerCase();
  return sourceType === "csv_backup";
}

function resolveRegSourceUrl(row: RegRow, countryCodeIso2: string | null): string | null {
  if (isRegBackupSource(row)) {
    return sanitizeNullable(row.source_url);
  }
  if (row.source_org === "KOTRA") {
    return buildKotraRegDetailUrl(row.raw, { countryCodeIso2 });
  }
  return sanitizeNullable(row.source_url);
}

function resolveRegSourceLabel(row: RegRow): string {
  if (isRegBackupSource(row)) {
    return "KOTRA CSV 백업";
  }
  return row.source_org || "출처";
}

function resolveRegSourceTypeLabel(row: RegRow): string {
  const sourceType = readDetailRawText(row.raw ?? null, "source_type");
  return formatRegSourceTypeLabel(sourceType);
}

function resolveRegMatchBasisLabel(row: RegRow): string {
  // 백엔드에서 전달된 한국어 라벨 우선 사용
  const backendLabel = readDetailRawText(row.raw ?? null, "match_basis_label");
  if (backendLabel) return backendLabel;
  const priority = readDetailRawText(row.raw ?? null, "match_priority");
  if (priority === "1") return "1순위 국가+HS/HSK 정확 일치";
  if (priority === "2") return "2순위 국가+HS6 일치";
  if (priority === "3") return "3순위 국가+HS4+제품명 유사";
  if (priority === "4") return "4순위 국가+제품명 유사";
  return "";
}

function resolveRegMatchedTokensLabel(row: RegRow): string {
  const tokens = normalizeDetailTextArray(row.raw?.matched_tokens);
  return tokens.length > 0 ? `제품 토큰 ${tokens.slice(0, 3).join(", ")}` : "";
}

function formatRegSourceTypeLabel(sourceType: string): string {
  const normalized = sanitize(sourceType).toLowerCase();
  if (normalized === "csv_backup") return "CSV 백업";
  if (normalized === "kotra_api_sync") return "실시간 API 동기화";
  if (normalized === "kotra_cache") return "캐시";
  return "정확한 정보 없음";
}

function riskValue(row: RiskRow, key: string, fallback: string): string {
  const value = row.raw?.[key];
  if (value == null || value === "") return sanitize(fallback);
  return sanitize(String(value));
}

function findDetailPlaceholderRow<T extends { raw?: Record<string, unknown> | null }>(rows: T[]): T | null {
  return rows.find((row) => {
    const state = readDetailRawText(row.raw ?? null, "detail_state").toLowerCase();
    return state === "empty" || state === "error" || state === "stale";
  }) ?? null;
}

function findCategoryPlaceholderRow(rows: RiskRow[], category: string): RiskRow | null {
  const normalizedCategory = sanitize(category).toLowerCase();
  return rows.find((row) => {
    const categoryValue = sanitizeNullable(row.category)?.toLowerCase() ?? "";
    if (categoryValue !== normalizedCategory) return false;
    const state = readDetailRawText(row.raw ?? null, "detail_state").toLowerCase();
    return state === "empty" || state === "error" || state === "stale";
  }) ?? null;
}

function resolveIndustryMatchFailureMessage(row: RiskRow | null): string {
  if (!row?.raw) return "";
  const failed = isIndustryMatchFailed(row.raw);
  if (!failed) return "";

  const inputCode = readDetailRawText(row.raw, "input_industry_code") || "정확한 정보 없음";
  const rawRow = row.raw as Record<string, unknown>;
  const mappedCodes = normalizeDetailTextArray(rawRow.mapped_industry_codes);
  const mappedText = mappedCodes.length > 0 ? mappedCodes.join(", ") : "정확한 정보 없음";
  return `입력 업종 매칭 실패로 업종위험 점수에서 제외됨 (입력: ${inputCode}, 매핑: ${mappedText})`;
}

function readDetailRawText(raw: Record<string, unknown> | null, key: string): string {
  if (!raw) return "";
  const value = raw[key];
  if (typeof value === "string") return sanitize(value);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return "";
}

function readRawNumber(raw: Record<string, unknown> | null, key: string, fallback = 0): number {
  if (!raw) return fallback;
  const value = raw[key];
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : fallback;
}

function normalizeDetailTextArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const text = typeof entry === "string" ? sanitize(entry) : "";
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out.slice(0, 10);
}

function extractSourceMatchedCount(
  sources: { title: string; url?: string | null }[] | undefined,
  type: "cert_data" | "regulation_data",
) {
  if (!Array.isArray(sources)) return 0;
  const target = sources.find((source) => {
    const normalized = source.title?.toLowerCase() ?? "";
    if (type === "cert_data") return normalized.includes("certification matched") || normalized.includes("인증 매칭");
    return normalized.includes("import regulation matched") || normalized.includes("수입규제 매칭");
  });
  if (!target) return 0;
  const match = target.title.match(/(\d+)\s*(?:item|건)/i);
  if (!match) return 0;
  const count = Number(match[1]);
  return Number.isFinite(count) ? count : 0;
}

function formatMarkets(markets: Array<{ code?: string | null; name?: string | null }> | undefined): string[] {
  if (!Array.isArray(markets)) return [];
  return markets
    .map((market) => {
      const code = sanitizeNullable(market.code)?.toUpperCase() ?? "";
      const name = sanitizeNullable(market.name) ?? "";
      if (!code && !name) return null;
      const normalizedCode = code || name.toUpperCase();
      const normalizedName = name || normalizedCode;
      return `${normalizedName}(${normalizedCode})`;
    })
    .filter((value): value is string => Boolean(value));
}

function normalizeSignalLabel(value: string | null | undefined): string {
  const text = sanitize(value ?? "");
  const key = text.toLowerCase();
  const direct: Record<string, string> = {
    "certification data exists": "인증 데이터 존재",
    "import regulation data exists": "수입 규제 데이터 존재",
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

function normalizeSourceTitle(value: string | null | undefined): string {
  const text = normalizeReportText(value) ?? "출처 제목 없음";
  const certMatch = text.match(/certification matched\s+(\d+)\s+item\(s\)/i);
  if (certMatch) return `인증 매칭 ${certMatch[1]}건`;
  const regulationMatch = text.match(/import regulation matched\s+(\d+)\s+item\(s\)/i);
  if (regulationMatch) return `수입규제 매칭 ${regulationMatch[1]}건`;
  return text;
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

export function filterVisibleSources(
  sources: {
    type?: string | null;
    title: string;
    url?: string | null;
    summary?: string | null;
    keywords?: string[] | string | null;
    score_relevant?: boolean | null;
    ai_category?: AiNewsCategory | string | null;
    ai_product_relevance_score?: number | null;
    ai_country_relevance_score?: number | null;
    ai_export_impact_score?: number | null;
    ai_reason?: string | null;
  }[] | undefined,
) {
  if (!Array.isArray(sources)) return [];
  return sources
    .filter((source) => {
      if (source.ai_category === "unrelated") return false;
      if (normalizeAiNewsCategory(source.ai_category) === "unrelated") return false;
      if (isTradeOfficeSource(source)) return false;
      if (isHiddenSidebarSource(source)) return false;
      const type = (source.type ?? "").toLowerCase();
      if (type === "product_evidence" || type === "news" || type === "country_background") return true;
      return Boolean(source.title);
    })
    .map((source) => ({
      ...source,
      title: normalizeSourceTitle(source.title),
      summary: normalizeReportText(source.summary),
      keywords: normalizeSourceKeywords(source.keywords),
      ai_reason: normalizeReportText(source.ai_reason),
    }));
}

function isHiddenSidebarSource(source: {
  title: string;
  url?: string | null;
  summary?: string | null;
}): boolean {
  const text = (normalizeReportText(`${source.title} ${source.url ?? ""} ${source.summary ?? ""}`) ?? "").toLowerCase();
  return [
    "k-sure",
    "ksure",
    "strategic item",
    "trade_security",
    "yestrade",
    "safetykorea",
    "safety korea",
    "country and market profile",
    "export region rank",
  ].some((keyword) => text.includes(keyword));
}

function isTradeOfficeSource(source: {
  type?: string | null;
  title: string;
}): boolean {
  const normalized = (source.type ?? "").toLowerCase();
  return normalized === "trade_office_action" || source.title.toLowerCase().startsWith("무역관 연락");
}

function sourceFromText(text: string): string {
  const value = (normalizeReportText(text) ?? "").toLowerCase();
  if (value.includes("kotra")) return "KOTRA";
  if (value.includes("ksure") || value.includes("k-sure")) return "K-SURE";
  if (value.includes("kicox")) return "KICOX";
  if (value.includes("safety")) return "SafetyKorea";
  if (value.includes("yestrade") || value.includes("무역안보")) return "무역안보관리원";
  return "기타";
}

function resolveSourceLabel(type: string | null | undefined, scoreRelevant: boolean | null | undefined): string {
  const normalized = (type ?? "").toLowerCase();
  if (normalized === "product_evidence") return "점수 반영";
  if (normalized === "country_background" || normalized === "news") {
    return scoreRelevant ? "점수 반영" : "시장 배경";
  }
  return "";
}

function normalizeSourceKeywords(value: string[] | string | null | undefined): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.map((entry) => normalizeReportText(entry) ?? "").filter(Boolean))].slice(0, 12);
  }
  const text = normalizeReportText(value) ?? "";
  if (!text) return [];
  const tokens = text
    .split(/[,\n/|]+/g)
    .map((entry) => normalizeReportText(entry) ?? "")
    .filter(Boolean);
  return [...new Set(tokens)].slice(0, 12);
}

function sanitizeCountryDetail(row: CountryDetail | null): CountryDetail | null {
  if (!row) return null;
  if (!row.rationale) return { ...row, country_name: sanitize(row.country_name) };
  return {
    ...row,
    country_name: sanitize(row.country_name),
    rationale: {
      ...row.rationale,
      summary: sanitizeNullable(row.rationale.summary) ?? undefined,
      target_markets: row.rationale.target_markets?.map((market) => ({
        code: sanitizeNullable(market.code) ?? undefined,
        name: sanitizeNullable(market.name) ?? undefined,
      })),
      target_market_matched: Boolean(row.rationale.target_market_matched),
      inclusion_reason: normalizeStoredRationaleText(row.rationale.inclusion_reason),
      recommendation_reason: normalizeStoredRationaleText(row.rationale.recommendation_reason),
      low_recommendation_reason: normalizeStoredRationaleText(row.rationale.low_recommendation_reason),
      alternative_markets: row.rationale.alternative_markets?.map((market) => ({
        code: sanitizeNullable(market.code) ?? undefined,
        name: sanitizeNullable(market.name) ?? undefined,
      })),
      candidate_signals: Array.isArray(row.rationale.candidate_signals)
        ? row.rationale.candidate_signals.map((signal) => normalizeSignalLabel(signal)).filter(Boolean)
        : [],
      sources: row.rationale.sources?.map((source) => ({
        ...source,
        type: sanitizeNullable(source.type),
        title: normalizeSourceTitle(source.title),
        url: toPublicSourceUrl(sanitizeNullable(source.url)),
        summary: normalizeReportText(source.summary),
        keywords: normalizeSourceKeywords(source.keywords),
        score_relevant: typeof source.score_relevant === "boolean" ? source.score_relevant : undefined,
        ai_category: normalizeAiNewsCategory(source.ai_category),
        ai_product_relevance_score: normalizeOptionalScore(source.ai_product_relevance_score),
        ai_country_relevance_score: normalizeOptionalScore(source.ai_country_relevance_score),
        ai_export_impact_score: normalizeOptionalScore(source.ai_export_impact_score),
        ai_reason: normalizeReportText(source.ai_reason),
        office_name: sanitizeNullable(source.office_name),
        office_address: sanitizeNullable(source.office_address),
        airport_route_text: sanitizeNullable(source.airport_route_text),
        summary_source: sanitizeNullable(source.summary_source),
      })),
    },
  };
}

function sanitizeCertRow(row: CertRow): CertRow {
  return {
    ...row,
    scheme: sanitizeNullable(row.scheme),
    source_org: sanitizeNullable(row.source_org),
    source_url: toPublicSourceUrl(sanitizeNullable(row.source_url)),
  };
}

function sanitizeRegRow(row: RegRow): RegRow {
  return {
    ...row,
    topic: sanitizeNullable(row.topic),
    summary: sanitizeNullable(row.summary),
    source_org: sanitizeNullable(row.source_org),
    source_url: toPublicSourceUrl(sanitizeNullable(row.source_url)),
  };
}

function sanitizeRiskRow(row: RiskRow): RiskRow {
  return {
    ...row,
    category: sanitizeNullable(row.category),
    level: sanitizeNullable(row.level),
    summary: sanitizeNullable(row.summary),
    source_org: sanitizeNullable(row.source_org),
    source_url: toPublicSourceUrl(sanitizeNullable(row.source_url)),
  };
}

function formatPercentValue(value: unknown): string {
  const n = toNumber(value);
  if (n == null) return "정확한 정보 없음";
  return `${n}%`;
}

function formatDaysValue(value: unknown): string {
  const n = toNumber(value);
  if (n == null) return "정확한 정보 없음";
  return `${n}일`;
}

function formatShareValue(value: unknown): string {
  const n = toNumber(value);
  if (n == null) return "";
  return ` (${n}%)`;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const REGULATION_TYPE_TRANSLATIONS: Record<string, string> = {
  "Regular notification": "정기 통보",
  "regular notification": "정기 통보",
  "Addendum to Regular Notification": "정기 통보 부록",
  "addendum to regular notification": "정기 통보 부록",
  "Revision to Regular Notification": "정기 통보 개정",
  "revision to regular notification": "정기 통보 개정",
  "Corrigendum": "정오표",
  "corrigendum": "정오표",
  "Emergency notification": "긴급 통보",
  "emergency notification": "긴급 통보",
  "Urgent notification": "긴급 통보",
  "Addendum": "부록",
  "Revision": "개정",
};

function translateRegulationType(raw: string): string {
  if (!raw || raw === "정확한 정보 없음") return raw;

  let result = raw;
  // TBT/SPS 접두사 보존, 나머지 번역
  const prefixMatch = result.match(/^(TBT|SPS)\s+(.+)$/i);
  if (prefixMatch) {
    const prefix = prefixMatch[1].toUpperCase();
    const rest = prefixMatch[2].trim();
    const translation = REGULATION_TYPE_TRANSLATIONS[rest] || REGULATION_TYPE_TRANSLATIONS[rest.toLowerCase()];
    if (translation) {
      return `${prefix} ${translation}`;
    }
    // 부분 매칭 시도
    for (const [eng, ko] of Object.entries(REGULATION_TYPE_TRANSLATIONS)) {
      if (rest.toLowerCase().includes(eng.toLowerCase())) {
        result = `${prefix} ${rest.toLowerCase().replace(eng.toLowerCase(), ko)}`;
        return result;
      }
    }
    return `${prefix} ${rest}`;
  }

  const directTranslation = REGULATION_TYPE_TRANSLATIONS[raw] || REGULATION_TYPE_TRANSLATIONS[raw.toLowerCase()];
  if (directTranslation) return directTranslation;

  return raw;
}

/* ────────── 종합판정 배지 ────────── */

function OverallVerdictBadge({ score }: { score: number | null | undefined }) {
  const verdict = resolveOverallVerdict(score);
  return (
    <span className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold ${verdict.className}`}>
      {verdict.label}
    </span>
  );
}

function resolveOverallVerdict(score: number | null | undefined): { label: string; className: string } {
  if (score == null || !Number.isFinite(score)) {
    return { label: "판정 불가", className: "bg-slate-100 text-slate-600" };
  }
  if (score >= 70) return { label: "우선검토", className: "bg-emerald-100 text-emerald-800" };
  if (score >= 40) return { label: "주의필요", className: "bg-amber-100 text-amber-800" };
  return { label: "보류", className: "bg-red-100 text-red-800" };
}

function resolveKeyRisks(
  regSource: { confirmedRows: RegRow[]; reviewRows: RegRow[] },
  certSource: { confirmedRows: CertRow[] },
): string {
  const parts: string[] = [];
  const regCount = regSource.confirmedRows.length + regSource.reviewRows.length;
  if (regCount > 0) parts.push(`수입규제 ${regCount}건`);
  if (certSource.confirmedRows.length === 0) parts.push("인증정보 미확인");
  if (parts.length === 0) return "특이사항 없음";
  return parts.join(", ");
}

function resolveNextCheckItems(
  regSource: { confirmedRows: RegRow[] },
  certSource: { confirmedRows: CertRow[] },
): string {
  const items: string[] = [];
  if (certSource.confirmedRows.length === 0) {
    items.push("세부 HS코드·제품 용도 기준 인증 요건 재확인");
  }
  if (regSource.confirmedRows.length === 0) {
    items.push("적용 가능 수입규제 유무 확인");
  }
  items.push("적용 관세율 확인");
  return items.join(", ");
}

function NationalInfoSection({ presentation }: { presentation: NationalInfoPresentation }) {
  const [isOpen, setIsOpen] = useState(false);
  
  if (!presentation.rawText) return null;

  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      <div className="p-3 border-b border-border bg-muted/10">
        <h4 className="font-semibold text-sm text-foreground">{presentation.label}</h4>
        <NationalInfoSummaryGroups presentation={presentation} />
      </div>
      <details 
        className="group text-sm" 
        open={isOpen} 
        onToggle={(e) => setIsOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer font-medium text-primary px-3 py-2 hover:bg-muted/50 list-none flex items-center justify-between border-t border-transparent">
          <span className="text-xs">{isOpen ? "원문 닫기" : "자세히 보기"}</span>
          <span className="text-muted-foreground text-xs">{isOpen ? "접기" : "펼치기"}</span>
        </summary>
        <div className="space-y-3 p-3 border-t border-border bg-muted/5">
          {formatNationalInfoRawParagraphs(presentation.rawText).map((paragraph, index) => (
            <p key={index} className="whitespace-pre-line text-muted-foreground leading-relaxed text-xs">
              {paragraph}
            </p>
          ))}
        </div>
      </details>
    </div>
  );
}

function NationalInfoSummaryGroups({ presentation }: { presentation: NationalInfoPresentation }) {
  const hasGroupedSummary =
    presentation.direct.length > 0 || presentation.common.length > 0 || presentation.conditional.length > 0;

  if (!hasGroupedSummary) {
    return (
      <ul className="mt-2 space-y-1 pl-4 list-disc text-xs text-muted-foreground">
        {presentation.defaultBullets.map((line, idx) => (
          <li key={idx}>{line}</li>
        ))}
      </ul>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      <NationalInfoBulletGroup title="직접 관련" bullets={presentation.direct} />
      <NationalInfoBulletGroup title="공통 참고" bullets={presentation.common} />
      <NationalInfoBulletGroup title="조건부 확인" bullets={presentation.conditional} />
    </div>
  );
}

function NationalInfoBulletGroup({ title, bullets }: { title: string; bullets: string[] }) {
  if (bullets.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-foreground">{title}</p>
      <ul className="mt-1 space-y-1 pl-4 list-disc text-xs text-muted-foreground">
        {bullets.slice(0, 3).map((line, idx) => (
          <li key={idx}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

function formatNationalInfoRawParagraphs(value: string): string[] {
  const paragraphs = value
    .split(/\n\s*\n/g)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  return paragraphs.length > 0 ? paragraphs : [value];
}

const NATIONAL_INFO_FIELDS = [
  { key: "entrPrcstCntnt", label: "통관 시 유의사항" },
  { key: "tarifSystSumryCntnt", label: "관세제도 개요" },
  { key: "tarifCnfrmMthCntnt", label: "관세율 확인 방법" },
  { key: "tbtCntnt", label: "TBT / 기술규제" },
  { key: "crtfcSystCntnt", label: "인증제도" },
  { key: "imprtPrhbtCmdltCntnt", label: "수입금지품목" },
  { key: "ecnmyTrendCntnt", label: "경제 동향" },
  { key: "ecnmyPrsptCntnt", label: "경제 전망" },
  { key: "expBhrcCmdltCntnt", label: "수출유망품목" },
];

function getNationalInfoKind(key: string): NationalInfoKind {
  if (key === "ecnmyTrendCntnt" || key === "ecnmyPrsptCntnt") return "common";
  return "regulated";
}

function NationalInfoRelevanceOverview({ presentations }: { presentations: NationalInfoPresentation[] }) {
  const direct = dedupeNationalInfoBullets(
    presentations.flatMap((presentation) =>
      presentation.direct.filter((line) => !line.startsWith("현재 원문에서 해당 HS코드")),
    ),
  );
  const common = dedupeNationalInfoBullets(presentations.flatMap((presentation) => presentation.common)).slice(0, 3);
  const conditional = dedupeNationalInfoBullets(
    presentations.flatMap((presentation) => presentation.conditional),
  ).slice(0, 3);
  const directBullets =
    direct.length > 0 ? direct.slice(0, 3) : ["현재 원문에서 해당 HS코드 또는 제품명과 직접 일치하는 규제는 확인되지 않았습니다."];

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
      <h4 className="font-semibold text-amber-900 text-sm flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-amber-600" />
        제품 관련성 요약
      </h4>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <NationalInfoBulletGroup title="직접 관련" bullets={directBullets} />
        <NationalInfoBulletGroup title="공통 참고" bullets={common} />
        <NationalInfoBulletGroup title="조건부 확인" bullets={conditional} />
      </div>
    </div>
  );
}

function dedupeNationalInfoBullets(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = value.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function NationalInfoCard({
  nationalInfo,
  detailExecuted,
  productContext,
}: {
  nationalInfo: Record<string, unknown> | null;
  detailExecuted: boolean;
  productContext: CurrentDetailContext;
}) {
  if (!detailExecuted) {
    return (
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">통관·관세·국가환경</CardTitle>
          <CardDescription>KOTRA 국가정보 API 기반 — 상세 분석 실행 후 표시됩니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">상세 분석 미실행 상태입니다. 대상국 분석 실행을 눌러주세요.</p>
        </CardContent>
      </Card>
    );
  }

  if (!nationalInfo || Object.keys(nationalInfo).length === 0) {
    return (
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">통관·관세·국가환경</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            해당 국가의 통관·관세·국가환경 정보를 불러오지 못했습니다.
            KOTRA 국가정보 서비스에서 직접 확인하세요.
          </p>
        </CardContent>
      </Card>
    );
  }

  const sections = NATIONAL_INFO_FIELDS
    .map(({ key, label }) => {
      const raw = nationalInfo[key];
      const text = cleanNationalInfoText(raw);
      const kind = getNationalInfoKind(key);
      const presentation = buildNationalInfoPresentation({
        label,
        text,
        context: {
          productName: productContext.productName,
          hsCode: productContext.hsCode,
          hskCode: productContext.hskCode,
        },
        kind,
      });
      return { key, label, text, kind, presentation };
    })
    .filter(({ text }) => text.length > 0);

  const topImports = nationalInfo["tp10cImprtCmdltList"];
  const hasTopImports = Array.isArray(topImports) && topImports.length > 0;
  
  const hasSections = sections.length > 0 || hasTopImports;

  if (!hasSections) {
    return (
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">통관·관세·국가환경</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">조회된 국가정보 항목이 없습니다.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">통관·관세·국가환경</CardTitle>
        <CardDescription>KOTRA 국가정보 API 기반 의사결정 요약</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        
        <NationalInfoRelevanceOverview
          presentations={sections
            .filter((section) => section.kind === "regulated")
            .map((section) => section.presentation)}
        />

        {/* 요약 중심의 항목 섹션 */}
        <div className="space-y-3">
          {sections.map(({ label, presentation }) => (
            <NationalInfoSection key={label} presentation={presentation} />
          ))}
        </div>

        {/* 최근 3년 상위 수입품목 (표) */}
        {hasTopImports && (
          <div className="rounded-md border border-border bg-card overflow-hidden mt-4">
            <div className="p-3 border-b border-border bg-muted/10">
              <h4 className="font-semibold text-sm text-foreground">최근 3년 상위 수입품목 (Top 10)</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/30 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">순위</th>
                    <th className="px-3 py-2 font-medium">연도</th>
                    <th className="px-3 py-2 font-medium">HS코드</th>
                    <th className="px-3 py-2 font-medium">품목명</th>
                    <th className="px-3 py-2 font-medium text-right">금액(천 불)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {topImports.map((item: any, i: number) => (
                    <tr key={i} className="hover:bg-muted/10">
                      <td className="px-3 py-2">{item.rk || "-"}</td>
                      <td className="px-3 py-2">{item.stdrYy || "-"}</td>
                      <td className="px-3 py-2 font-mono text-muted-foreground">{item.hscd || "-"}</td>
                      <td className="px-3 py-2 truncate max-w-[200px]" title={cleanNationalInfoText(item.cmdltNm)}>{cleanNationalInfoText(item.cmdltNm) || "-"}</td>
                      <td className="px-3 py-2 text-right">{item.amt ? Number(item.amt).toLocaleString() : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="mt-4 text-[11px] text-muted-foreground leading-relaxed">
          ※ 국가정보 API는 국가 단위 참고정보입니다. 특정 제품/HS코드에 대한 직접 판정은 상단의 해외인증정보와 수입규제 결과를 기준으로 확인해야 합니다. 최신 데이터는 KOTRA 웹사이트에서 확인하세요.
        </p>
      </CardContent>
    </Card>
  );
}
