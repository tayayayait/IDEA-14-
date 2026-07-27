import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Info,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  computeEvidenceHash,
  parseVerdictResponse,
  type AiFinalVerdict,
  type VerdictOpinion,
  type VerdictConfidence,
} from "@/lib/country-decision-verdict";
import type { DecisionFact } from "@/lib/country-decision";
import { OfficialSupportProgramsSection } from "@/components/OfficialSupportProgramsSection";

/* ──────────── Props ──────────── */

interface Props {
  projectId: string;
  facts: DecisionFact[];
  countryCode: string;
  countryName: string;
  productName: string;
  hs6: string;
  opportunityScore: number | null;
  rationale?: {
    inclusion_reason?: string;
    recommendation_reason?: string;
    low_recommendation_reason?: string;
  };
  detailExecuted: boolean;
}

type VerdictState = "idle" | "loading" | "success" | "error";

/* ──────────── 메인 컴포넌트 ──────────── */

export function AiFinalVerdictCard(props: Props) {
  const [verdict, setVerdict] = useState<AiFinalVerdict | null>(null);
  const [state, setState] = useState<VerdictState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);

  const evidenceHash = useMemo(
    () => computeEvidenceHash(props.facts),
    [props.facts],
  );
  const supportVerdictSignals = useMemo(() => {
    if (!verdict) return [];
    const summaryText = [
      verdict.executiveSummary,
      verdict.opinionDetail,
      ...verdict.keyBasis.map((item) => item.point),
    ].filter(Boolean).join(" ");

    return [
      ...(summaryText
        ? [{ source: "summary" as const, text: summaryText }]
        : []),
      ...verdict.majorRisks.map((item) => ({
        source: "risk" as const,
        text: [item.risk, item.mitigation].filter(Boolean).join(" "),
      })),
      ...verdict.recommendedActions.map((item) => ({
        source: "action" as const,
        text: [
          item.action,
          item.reason,
          ...(item.subSteps ?? []),
        ].filter(Boolean).join(" "),
      })),
    ];
  }, [verdict]);

  // 캐시 조회
  useEffect(() => {
    if (!props.detailExecuted || !props.projectId) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from("country_verdicts")
        .select("verdict, evidence_hash, created_at")
        .eq("project_id", props.projectId)
        .eq("country_code", props.countryCode)
        .maybeSingle();

      if (cancelled) return;
      if (data && data.evidence_hash === evidenceHash) {
        const parsed = parseVerdictResponse(data.verdict);
        if (parsed) {
          setVerdict(parsed);
          setState("success");
          setCreatedAt(data.created_at);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [props.projectId, props.countryCode, props.detailExecuted, evidenceHash]);

  // AI 판단 생성
  const generateVerdict = useCallback(async (forceRefresh = false) => {
    setState("loading");
    setErrorMsg(null);

    try {
      const { data, error } = await supabase.functions.invoke("ai-country-verdict", {
        body: {
          project_id: props.projectId,
          country_code: props.countryCode,
          country_name: props.countryName,
          product_name: props.productName,
          hs6: props.hs6,
          evidence_hash: evidenceHash,
          force_refresh: forceRefresh,
          opportunity_score: props.opportunityScore,
          rationale: props.rationale ?? {},
          decision_facts: props.facts
            .filter((f) => !f.isStale)
            .slice(0, 30)
            .map((f) => ({
              id: f.id,
              category: f.category,
              status: f.status,
              severity: f.severity,
              summary: f.summary,
              caveat: f.caveat,
              nextAction: f.nextAction,
              scope: f.scope,
              sourceName: f.sourceName,
            })),
        },
      });

      if (error) throw new Error(error.message ?? "AI 판단 생성 실패");

      const verdictData = data?.verdict ?? data;
      const parsed = parseVerdictResponse(verdictData);
      if (parsed) {
        setVerdict(parsed);
        setState("success");
        setCreatedAt(new Date().toISOString());
      } else {
        throw new Error("AI 응답을 파싱할 수 없습니다");
      }
    } catch (err) {
      console.error("verdict generation error:", err);
      setState("error");
      setErrorMsg(err instanceof Error ? err.message : "알 수 없는 오류");
    }
  }, [props, evidenceHash]);

  // 상세 분석 미실행
  if (!props.detailExecuted) {
    return (
      <Card className="mt-6 border-dashed">
        <CardHeader className="p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">AI 최종 판단</CardTitle>
          </div>
          <CardDescription>상세 분석을 실행하면 AI가 공공데이터와 인터넷 공식자료를 종합하여 최종 진출 의견을 제공합니다.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // 아직 판단이 없으면 생성 유도
  if (state === "idle" && !verdict) {
    return (
      <Card className="mt-6 border-dashed">
        <CardHeader className="p-3 sm:p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-brand" />
              <CardTitle className="text-base">AI 최종 판단</CardTitle>
            </div>
            <Button size="sm" onClick={() => generateVerdict()}>
              <Bot className="mr-1 h-3.5 w-3.5" />
              AI 판단 생성
            </Button>
          </div>
          <CardDescription>수집된 데이터와 인터넷 공식자료를 Gemini가 종합 분석하여 최종 진출 판단을 생성합니다.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // 로딩 중
  if (state === "loading") {
    return (
      <Card className="mt-6">
        <CardHeader className="p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-brand" />
            <CardTitle className="text-base">AI 최종 판단 생성 중...</CardTitle>
          </div>
          <CardDescription>
            AI가 인터넷 공식자료(정부기관, 관세청, NHTSA, USITC 등)를 검색하고 수집 데이터와 종합하여 판단을 생성하고 있습니다. 최대 2분 소요됩니다.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // 에러
  if (state === "error") {
    return (
      <Card className="mt-6 border-red-200">
        <CardHeader className="p-3 sm:p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <CardTitle className="text-base">AI 판단 생성 실패</CardTitle>
            </div>
            <Button size="sm" variant="outline" onClick={() => generateVerdict()}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              재시도
            </Button>
          </div>
          <CardDescription className="text-red-600">{errorMsg}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!verdict) return null;

  const style = OPINION_STYLES[verdict.opinion] ?? OPINION_STYLES["추가 데이터 필요"];

  return (
    <Card className="mt-6 overflow-hidden border-l-4" style={{ borderLeftColor: style.borderColor }}>
      <CardHeader className="p-3 sm:p-4" style={{ backgroundColor: style.headerBg }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5" style={{ color: style.iconColor }} />
            <CardTitle className="text-base">AI 최종 판단</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <ConfidenceBadge confidence={verdict.confidence} reason={verdict.confidenceReason} />
            <Button size="sm" variant="outline" onClick={() => generateVerdict(true)} className="h-7 gap-1 text-xs bg-background/80 hover:bg-background">
              <RefreshCw className="h-3.5 w-3.5" />
              AI 판단 재생성
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-3 sm:p-4">
        {/* 한줄 핵심 요약 & 최종 진출 의견 */}
        <div className="rounded-lg p-3 sm:p-4 space-y-2" style={{ backgroundColor: style.opinionBg }}>
          {verdict.executiveSummary ? (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1 text-xs font-semibold text-foreground shadow-sm border border-border/50">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              <span>{verdict.executiveSummary}</span>
            </div>
          ) : null}
          <div>
            <p className="text-lg font-bold" style={{ color: style.opinionColor }}>{verdict.opinion}</p>
            <p className="mt-1 text-sm leading-relaxed text-foreground/90">{verdict.opinionDetail}</p>
          </div>
        </div>

        {/* 5대 위험 스코어보드 */}
        {verdict.riskScoreboard ? (
          <RiskScoreboardView scoreboard={verdict.riskScoreboard} />
        ) : null}

        {/* 핵심 판단 근거 + 주요 위험 요소 2열 */}
        <div className="grid gap-3 sm:grid-cols-2">
          <BasisSection items={verdict.keyBasis} />
          <RiskSection items={verdict.majorRisks} />
        </div>

        {/* 권장 실행 방향 */}
        <ActionSection items={verdict.recommendedActions} />

        {/* 기업마당 공식 지원사업 */}
        <OfficialSupportProgramsSection
          projectId={props.projectId}
          productName={props.productName}
          countryName={props.countryName}
          verdictSignals={supportVerdictSignals}
        />

        {/* 참고 공공데이터 출처 */}
        {verdict.officialSources.length > 0 ? (
          <div className="rounded-lg border border-border/70 bg-card p-3">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-blue-600" />
              <p className="text-xs font-semibold text-foreground">연동 및 참고 공공데이터 기관</p>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {verdict.officialSources.map((source, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-md border border-blue-100 bg-blue-50/60 px-2 py-1 text-[11px] font-medium text-blue-800"
                  title={source.relevance || "공공데이터 기관"}
                >
                  <CheckCircle2 className="h-3 w-3 text-blue-500" />
                  {source.name}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {/* 면책 문구 */}
        <div className="flex items-start gap-1.5 rounded-md bg-muted/50 px-3 py-2">
          <Info className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            본 판단은 KOTRA·K-SURE·KICOX 등 공공데이터와 전문 규제 팩트를 Gemini가 종합 분석하여 생성한 참고 의견입니다.
            최종 수출 의사결정은 전문가 자문과 관계기관의 공식 확인을 거쳐야 합니다.
            {createdAt ? ` · 생성 ${new Date(createdAt).toLocaleDateString("ko-KR")}` : ""}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ──────────── 서브 컴포넌트 ──────────── */

function RiskScoreboardView({ scoreboard }: { scoreboard: AiFinalVerdict["riskScoreboard"] }) {
  const items = [
    { label: "관세·원산지", level: scoreboard.tariffRisk },
    { label: "인증·규제", level: scoreboard.certificationRisk },
    { label: "대금 회수", level: scoreboard.paymentRisk },
    { label: "통관·물류", level: scoreboard.logisticsRisk },
    { label: "계약·분쟁", level: scoreboard.legalRisk },
  ];

  const getLevelStyle = (level: "높음" | "보통" | "낮음") => {
    if (level === "높음") return "bg-red-100 text-red-800 border-red-200";
    if (level === "보통") return "bg-amber-100 text-amber-800 border-amber-200";
    return "bg-emerald-100 text-emerald-800 border-emerald-200";
  };

  return (
    <div className="rounded-lg border border-border/70 bg-card p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <ShieldCheck className="h-4 w-4 text-indigo-600" />
        <p className="text-xs font-semibold text-foreground">5대 분야별 위험 수준 스코어보드</p>
      </div>
      <div className="grid grid-cols-5 gap-1.5 text-center">
        {items.map((item, idx) => (
          <div key={idx} className="rounded-md border bg-muted/30 p-1.5">
            <p className="text-[10px] font-medium text-muted-foreground">{item.label}</p>
            <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold border ${getLevelStyle(item.level)}`}>
              {item.level}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BasisSection({ items }: { items: AiFinalVerdict["keyBasis"] }) {
  return (
    <div className="rounded-lg border border-border/70 bg-card p-3 sm:p-4">
      <div className="flex items-center gap-1.5">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        <p className="text-xs font-semibold text-foreground">핵심 판단 근거</p>
      </div>
      <ul className="mt-3 space-y-3 text-sm leading-relaxed">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 border-b border-border/40 pb-2.5 last:border-0 last:pb-0">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
            <div>
              <span>{item.point}</span>
              {item.source ? (
                <SourceTag name={item.source} url={item.sourceUrl} />
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RiskSection({ items }: { items: AiFinalVerdict["majorRisks"] }) {
  return (
    <div className="rounded-lg border border-border/70 bg-card p-3 sm:p-4">
      <div className="flex items-center gap-1.5">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <p className="text-xs font-semibold text-foreground">주요 위험 요소 & AI 솔루션</p>
      </div>
      <ul className="mt-3 space-y-3 text-sm leading-relaxed">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 border-b border-border/40 pb-2.5 last:border-0 last:pb-0">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
            <div className="space-y-1.5 w-full">
              <div className="flex flex-wrap items-center gap-1.5">
                {item.severity ? (
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    item.severity === "치명적" ? "bg-red-600 text-white" : item.severity === "높음" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                  }`}>
                    {item.severity}
                  </span>
                ) : null}
                {item.likelihood ? (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    가능성 {item.likelihood}
                  </span>
                ) : null}
                <span className="font-medium text-foreground">{item.risk}</span>
                {item.source ? <SourceTag name={item.source} /> : null}
              </div>

              {item.financialImpact ? (
                <p className="text-xs text-red-600 font-medium bg-red-50/50 p-1.5 rounded border border-red-100">
                  💡 <span className="font-semibold">예상 피해/영향:</span> {item.financialImpact}
                </p>
              ) : null}

              {item.mitigation ? (
                <div className="rounded-md bg-amber-50/80 px-2.5 py-1.5 text-xs text-amber-900 border border-amber-200/60 font-medium">
                  ➔ <span className="font-semibold">AI 대응 솔루션:</span> {item.mitigation}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActionSection({ items }: { items: AiFinalVerdict["recommendedActions"] }) {
  return (
    <div className="rounded-lg border border-border/70 bg-card p-3 sm:p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <ArrowRight className="h-4 w-4 text-blue-600" />
          <p className="text-xs font-semibold text-foreground">권장 실행 방향 및 세부 가이드</p>
        </div>
      </div>
      <ol className="mt-3 space-y-3.5 text-sm leading-relaxed">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2.5 rounded-lg border border-border/50 bg-background/50 p-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
              {i + 1}
            </span>
            <div className="space-y-1.5 w-full">
              <span className="font-semibold text-foreground text-sm">{item.action}</span>

              {item.reason ? (
                <p className="text-xs text-muted-foreground">{item.reason}</p>
              ) : null}

              {item.subSteps && item.subSteps.length > 0 ? (
                <div className="mt-2 rounded bg-muted/40 p-2 text-xs space-y-1 border border-border/40">
                  <p className="font-semibold text-foreground/90">📋 세부 실행 단계:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-muted-foreground pl-1">
                    {item.subSteps.map((step, idx) => (
                      <li key={idx}>{step}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SourceTag({ name }: { name: string; url?: string }) {
  if (!name || name.toUpperCase() === "N/A") return null;
  const cleanName = name.replace(/^\[|\]$/g, "").trim();
  return (
    <span className="ml-1.5 inline-flex items-center rounded-full bg-blue-50/80 px-2 py-0.5 text-[10px] font-medium text-blue-700 border border-blue-100/60">
      출처: {cleanName}
    </span>
  );
}

function ConfidenceBadge({ confidence, reason }: { confidence: VerdictConfidence; reason: string }) {
  const style = CONFIDENCE_STYLES[confidence];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium"
      style={{ backgroundColor: style.bg, color: style.text }}
      title={reason}
    >
      <ShieldCheck className="h-3 w-3" />
      신뢰도 {confidence}
    </span>
  );
}

/* ──────────── 스타일 매핑 ──────────── */

const OPINION_STYLES: Record<VerdictOpinion, {
  borderColor: string;
  headerBg: string;
  iconColor: string;
  opinionBg: string;
  opinionColor: string;
}> = {
  "적극 검토 권장": {
    borderColor: "#10b981",
    headerBg: "rgba(16, 185, 129, 0.06)",
    iconColor: "#10b981",
    opinionBg: "rgba(16, 185, 129, 0.08)",
    opinionColor: "#065f46",
  },
  "조건부 진출 가능": {
    borderColor: "#f59e0b",
    headerBg: "rgba(245, 158, 11, 0.06)",
    iconColor: "#f59e0b",
    opinionBg: "rgba(245, 158, 11, 0.08)",
    opinionColor: "#78350f",
  },
  "진출 보류 권장": {
    borderColor: "#ef4444",
    headerBg: "rgba(239, 68, 68, 0.06)",
    iconColor: "#ef4444",
    opinionBg: "rgba(239, 68, 68, 0.08)",
    opinionColor: "#7f1d1d",
  },
  "추가 데이터 필요": {
    borderColor: "#6b7280",
    headerBg: "rgba(107, 114, 128, 0.06)",
    iconColor: "#6b7280",
    opinionBg: "rgba(107, 114, 128, 0.08)",
    opinionColor: "#374151",
  },
};

const CONFIDENCE_STYLES: Record<VerdictConfidence, { bg: string; text: string }> = {
  "높음": { bg: "rgba(16, 185, 129, 0.1)", text: "#065f46" },
  "보통": { bg: "rgba(245, 158, 11, 0.1)", text: "#78350f" },
  "낮음": { bg: "rgba(239, 68, 68, 0.1)", text: "#7f1d1d" },
};
