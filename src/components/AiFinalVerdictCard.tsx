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
  ExternalLink,
  LinkIcon,
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
  const generateVerdict = useCallback(async () => {
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
            <Button size="sm" onClick={generateVerdict}>
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
            <Button size="sm" variant="outline" onClick={generateVerdict}>
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
            <Button size="sm" variant="ghost" onClick={generateVerdict} title="AI 판단 재생성">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-3 sm:p-4">
        {/* 최종 진출 의견 */}
        <div className="rounded-lg p-3" style={{ backgroundColor: style.opinionBg }}>
          <p className="text-lg font-bold" style={{ color: style.opinionColor }}>{verdict.opinion}</p>
          <p className="mt-1 text-sm leading-relaxed text-foreground/90">{verdict.opinionDetail}</p>
        </div>

        {/* 핵심 판단 근거 + 주요 위험 요소 2열 */}
        <div className="grid gap-3 sm:grid-cols-2">
          <BasisSection items={verdict.keyBasis} />
          <RiskSection items={verdict.majorRisks} />
        </div>

        {/* 권장 실행 방향 */}
        <ActionSection items={verdict.recommendedActions} />

        {/* 참고 공식자료 */}
        {verdict.officialSources.length > 0 ? (
          <div className="rounded-lg border border-border/70 bg-card p-3">
            <div className="flex items-center gap-1.5">
              <LinkIcon className="h-4 w-4 text-blue-600" />
              <p className="text-xs font-semibold text-foreground">참고 공식자료</p>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {verdict.officialSources.map((source, i) => (
                <a
                  key={i}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50/50 px-2 py-1 text-[11px] text-blue-800 transition hover:bg-blue-100"
                  title={source.relevance}
                >
                  <ExternalLink className="h-2.5 w-2.5" />
                  {source.name}
                </a>
              ))}
            </div>
          </div>
        ) : null}

        {/* 면책 문구 */}
        <div className="flex items-start gap-1.5 rounded-md bg-muted/50 px-3 py-2">
          <Info className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            본 판단은 KOTRA·K-SURE·KICOX 등 공공데이터와 인터넷 공식자료를 Gemini가 종합 분석하여 생성한 참고 의견입니다.
            최종 수출 의사결정은 전문가 자문과 관계기관의 공식 확인을 거쳐야 합니다.
            {createdAt ? ` · 생성 ${new Date(createdAt).toLocaleDateString("ko-KR")}` : ""}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ──────────── 서브 컴포넌트 ──────────── */

function BasisSection({ items }: { items: AiFinalVerdict["keyBasis"] }) {
  return (
    <div className="rounded-lg border border-border/70 bg-card p-3">
      <div className="flex items-center gap-1.5">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        <p className="text-xs font-semibold text-foreground">핵심 판단 근거</p>
      </div>
      <ul className="mt-2 space-y-2 text-sm leading-relaxed">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
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
    <div className="rounded-lg border border-border/70 bg-card p-3">
      <div className="flex items-center gap-1.5">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <p className="text-xs font-semibold text-foreground">주요 위험 요소</p>
      </div>
      <ul className="mt-2 space-y-2 text-sm leading-relaxed">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
            <div>
              <span>{item.risk}</span>
              {item.mitigation ? (
                <p className="mt-0.5 text-xs text-muted-foreground">→ {item.mitigation}</p>
              ) : null}
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

function ActionSection({ items }: { items: AiFinalVerdict["recommendedActions"] }) {
  return (
    <div className="rounded-lg border border-border/70 bg-card p-3">
      <div className="flex items-center gap-1.5">
        <ArrowRight className="h-4 w-4 text-blue-600" />
        <p className="text-xs font-semibold text-foreground">권장 실행 방향</p>
      </div>
      <ol className="mt-2 space-y-2 text-sm leading-relaxed">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-0.5 text-xs font-bold text-blue-500">{i + 1}.</span>
            <div>
              <span className="font-medium">{item.action}</span>
              {item.reason ? (
                <p className="mt-0.5 text-xs text-muted-foreground">{item.reason}</p>
              ) : null}
              {item.priority === "high" ? (
                <span className="ml-1 inline-block rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800">우선</span>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SourceTag({ name, url }: { name: string; url?: string }) {
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-blue-600 hover:underline"
      >
        [{name}]
        <ExternalLink className="h-2 w-2" />
      </a>
    );
  }
  return <span className="ml-1 text-[10px] text-muted-foreground">[{name}]</span>;
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
