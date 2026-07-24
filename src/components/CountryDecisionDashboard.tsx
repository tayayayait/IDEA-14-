import { type ReactNode, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  ChevronDown,
  Landmark,
  Loader2,
  RefreshCw,
  SearchCheck,
  ShieldAlert,
  Truck,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  buildDecisionSummary,
  decisionCategoryLabel,
  decisionScopeLabel,
  type DecisionFact,
} from "@/lib/country-decision";
import { decisionValueLabel, flattenDecisionFactValue } from "@/lib/country-decision-value";
import {
  decisionEvidenceLabel,
  prepareDecisionFactsForDisplay,
  providerMessageLabel,
  toUserFacingDecisionSummary,
} from "@/lib/country-decision-presentation";
import {
  buildMarketEvidence,
  buildLogisticsEvidence,
  buildTariffRangeEvidence,
  buildUsitcHtsEvidence,
  groupDecisionFactsForService,
  type DecisionServiceGroups,
  type LogisticsEvidence,
  type MarketEvidence,
  type TariffRangeEvidence,
  type UsitcHtsEvidence,
} from "@/lib/country-decision-insights";

export interface CountryDecisionProviderStatus {
  key: string;
  label: string;
  state: "success" | "empty" | "error" | "not_run";
  itemCount: number;
  message: string;
  fetchedAt: string;
}

interface Props {
  countryCode: string;
  countryName: string;
  productName: string;
  hs6: string;
  hsk10: string;
  opportunityScore: number | null;
  facts: DecisionFact[];
  providers: CountryDecisionProviderStatus[];
  lastUpdated: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  topDecisionContent?: ReactNode;
}

const NON_API_FACT_KEYS = new Set([
  "tariff_fta:baseline",
  "customs_documents:baseline",
  "sanctions:entity_screening",
  "strategic_goods:classification",
]);

const sections: Array<{
  key: keyof DecisionServiceGroups;
  title: string;
  description: string;
  icon: typeof Landmark;
}> = [
  { key: "marketOpportunity", title: "시장 기회", description: "목적국 수입시장과 한국산 점유율", icon: BarChart3 },
  { key: "marketEntry", title: "시장 진입 조건", description: "관세·인증·수입규제와 목적국 세번 확인", icon: Landmark },
  { key: "transactionRisk", title: "거래·물류·비용 위험", description: "결제위험·물류환경·비용 참고값", icon: Truck },
  { key: "commonExportChecks", title: "출발 전 공통점검", description: "국가와 무관하게 수출 전에 확인할 국내 요건", icon: ShieldAlert },
];

const primarySections = sections;

export function CountryDecisionDashboard(props: Props) {
  const [detailOpen, setDetailOpen] = useState(false);
  const facts = useMemo(
    () => prepareDecisionFactsForDisplay(
      props.facts.filter((fact) => !fact.isStale && !NON_API_FACT_KEYS.has(fact.factKey ?? "")),
    ),
    [props.facts],
  );
  const staleFacts = useMemo(
    () => prepareDecisionFactsForDisplay(
      props.facts.filter((fact) => fact.isStale && !NON_API_FACT_KEYS.has(fact.factKey ?? "")),
    ),
    [props.facts],
  );
  const summary = useMemo(
    () => buildDecisionSummary({ opportunityScore: props.opportunityScore, facts }),
    [facts, props.opportunityScore],
  );
  const hasUsitcHtsFact = useMemo(
    () => facts.some((fact) => fact.category === "tariff_fta" && fact.factKey === "tariff_fta:usitc_hts_candidates"),
    [facts],
  );
  // KOTRA 인증·수입규제 원문은 Step 4 하단의 전용 근거 패널에서 보여준다.
  // 대시보드에는 관세·HTS·물류처럼 의사결정에 필요한 요약 정보만 남겨 중복을 피한다.
  const dashboardFacts = useMemo(
    () => facts.filter((fact) => (
      fact.category !== "certification" &&
      fact.category !== "import_regulation" &&
      !(hasUsitcHtsFact && fact.factKey === "tariff_fta:wits_hs6_range")
    )),
    [facts, hasUsitcHtsFact],
  );
  const groupedFacts = useMemo(() => groupDecisionFactsForService(dashboardFacts), [dashboardFacts]);
  const marketEvidence = useMemo(() => buildMarketEvidence(facts), [facts]);
  const tariffEvidence = useMemo(() => buildTariffRangeEvidence(facts), [facts]);
  const logisticsEvidence = useMemo(() => buildLogisticsEvidence(facts), [facts]);
  const usitcHtsEvidence = useMemo(() => buildUsitcHtsEvidence(facts), [facts]);
  const verificationCount = facts.filter((fact) => fact.status === "needs_verification").length;
  const failedCount = props.providers.filter((provider) => provider.state === "error").length;

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border bg-gradient-to-br from-brand/10 via-background to-background p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-3">
              <div>
                <p className="font-mono text-xs text-muted-foreground">{props.countryCode}</p>
                <h1 className="font-display text-2xl font-semibold tracking-tight">{props.countryName}</h1>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <ContextChip label="제품" value={props.productName || "미확인"} />
                <ContextChip label="HS6" value={props.hs6 || "미확인"} mono />
                <ContextChip label="HSK10" value={props.hsk10 || "미확인"} mono />
              </div>
              <p className="max-w-2xl text-[11px] leading-5 text-muted-foreground">
                분석은 HSK10 정확 일치 → HS6 → 제품명 순으로 적용됩니다. 제품 설명과 품목코드가 다르면 결과도 달라질 수 있습니다.
              </p>
              <p className="text-xs text-muted-foreground">
                최종 갱신 {formatDateTime(props.lastUpdated)}
                {failedCount > 0 ? <span className="ml-2 text-amber-700">· {failedCount}개 공급자 실패, 마지막 정상 데이터 유지</span> : null}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button variant="outline" onClick={props.onRefresh} disabled={props.refreshing}>
                {props.refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {props.refreshing ? "갱신 중..." : "데이터 갱신"}
              </Button>
              <Button variant="secondary" onClick={() => setDetailOpen(true)}>
                <SearchCheck className="h-4 w-4" />
                상세 분석
              </Button>
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <MetricCard
              label="수출 적합도"
              value={facts.length ? summary.suitability : "분석 필요"}
              detail={facts.length ? decisionHint(summary.suitability) : "데이터 갱신으로 근거를 수집하세요."}
              emphasis
            />
            <MetricCard
              label="시장 기회 점수"
              value={summary.opportunityScore == null ? "—" : String(summary.opportunityScore) + "/100"}
              detail="시장 규모·성장성 기준이며 규제 위험은 포함하지 않습니다."
            />
            <MetricCard
              label="근거 충족도"
              value={String(summary.evidenceCompleteness) + "%"}
              detail={"확인 " + summary.confirmedCount + "건 · 참고 " + summary.estimatedCount + "건 · 추가 확인 " + verificationCount + "건"}
            />
          </div>
        </div>
        {props.topDecisionContent ? (
          <div className="p-4 sm:p-5">{props.topDecisionContent}</div>
        ) : null}
      </section>

      <div className="columns-1 gap-3 2xl:columns-2">
        {primarySections.map((section) => {
          const sectionFacts = groupedFacts[section.key];
          const sectionVisual = section.key === "marketOpportunity" && marketEvidence
            ? <MarketEvidenceChart evidence={marketEvidence} />
            : section.key === "marketEntry" && (tariffEvidence || usitcHtsEvidence)
              ? <MarketEntryVisual countryCode={props.countryCode} tariffEvidence={tariffEvidence} usitcEvidence={usitcHtsEvidence} />
              : section.key === "transactionRisk" && logisticsEvidence
                ? <LogisticsEvidenceChart evidence={logisticsEvidence} />
                : null;
          return (
            <DecisionSection
              key={section.key}
              title={section.title}
              description={section.description}
              icon={section.icon}
              sectionKey={section.key}
              countryName={props.countryName}
              facts={sectionFacts}
              visual={sectionVisual}
            />
          );
        })}
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>전체 분석 근거</DialogTitle>
            <DialogDescription>분야별 핵심 결론을 먼저 보고, 필요한 근거만 펼쳐서 확인하세요.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {facts.length ? (
              <div className="space-y-2">
                {sections.map((section) => {
                  const sectionFacts = groupedFacts[section.key];
                  if (!sectionFacts.length) return null;
                  const SectionIcon = section.icon;
                  return (
                    <details key={section.title} className="group rounded-lg border border-border bg-card">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
                        <div className="flex items-center gap-3">
                          <div className="rounded-lg bg-brand/10 p-2 text-brand"><SectionIcon className="h-4 w-4" /></div>
                          <div>
                            <p className="text-sm font-semibold">{section.title}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{sectionFacts.length}개 판단 근거</p>
                          </div>
                        </div>
                        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="space-y-3 border-t border-border p-4">
                        {sectionFacts.map((fact) => (
                          <DetailedFact key={fact.id} fact={fact} countryName={props.countryName} />
                        ))}
                      </div>
                    </details>
                  );
                })}
              </div>
            ) : <EmptyDecision message="저장된 분석 근거가 없습니다." />}
            <ProviderOverview providers={props.providers} />
            {staleFacts.length ? (
              <details className="rounded-lg border border-amber-300 bg-amber-50/60 p-3">
                <summary className="cursor-pointer text-sm font-medium text-amber-900">오래된 데이터 {staleFacts.length}건</summary>
                <div className="mt-3 space-y-3">{staleFacts.map((fact) => <DetailedFact key={fact.id} fact={fact} countryName={props.countryName} />)}</div>
              </details>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DecisionSection({
  title,
  description,
  facts,
  icon: Icon,
  sectionKey,
  countryName,
  visual,
}: {
  title: string;
  description: string;
  facts: DecisionFact[];
  icon: typeof Landmark;
  sectionKey: keyof DecisionServiceGroups;
  countryName: string;
  visual?: ReactNode;
}) {
  const needsVerification = facts.filter((fact) => fact.status === "needs_verification").length;
  const isMarketEntry = sectionKey === "marketEntry";
  return (
    <Card className="mb-3 break-inside-avoid-column overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-muted/20 p-3 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-brand/10 p-2 text-brand"><Icon className="h-4 w-4" /></div>
            <div><CardTitle className="text-base">{title}</CardTitle><CardDescription className="mt-1">{description}</CardDescription></div>
          </div>
          {facts.length ? (
            <span className="shrink-0 rounded-full bg-background px-2 py-1 text-[11px] text-muted-foreground shadow-sm">
              {needsVerification ? "확인 필요 " + needsVerification + "건" : "근거 " + facts.length + "건"}
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-4">
        {visual}
        {facts.length ? (
          <ul className={visual ? "mt-4 space-y-3 border-t border-border pt-4" : "space-y-3"}>
            {facts.slice(0, isMarketEntry ? 2 : 4).map((fact) => (
              <li key={fact.id} className="border-t border-border pt-3 first:border-0 first:pt-0">
                <div className="flex flex-wrap items-center gap-2"><EvidencePill fact={fact} /><span className="text-xs text-muted-foreground">{decisionScopeLabel(fact.scope)}</span></div>
                <p className="mt-2 text-sm font-semibold leading-6">{toUserFacingDecisionSummary(fact.summary, countryName)}</p>
                <FactHighlights value={fact.value} limit={isMarketEntry ? 2 : 4} />
                {fact.nextAction ? (
                  <div className="mt-3 rounded-md border border-brand/20 bg-brand/5 px-3 py-2 text-xs leading-5 text-foreground">
                    <span className="mr-1 font-semibold text-brand">다음 확인</span>{fact.nextAction}
                  </div>
                ) : null}
                <details className="group mt-3 rounded-md border border-border/70 bg-muted/20 text-xs">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                    <span>{isMarketEntry ? "전체 결과·출처 보기" : "출처·판단 한계"}</span>
                    <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="space-y-2 border-t border-border/70 px-3 py-3">
                    {isMarketEntry ? <FactHighlights value={fact.value} expanded /> : null}
                    {fact.caveat ? <p className="flex gap-1.5 leading-5 text-amber-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{fact.caveat}</p> : null}
                    <FactSource fact={fact} />
                  </div>
                </details>
              </li>
            ))}
            {facts.length > 4 ? <li className="text-xs text-muted-foreground">상세 분석에서 나머지 {facts.length - 4}건을 확인할 수 있습니다.</li> : null}
          </ul>
        ) : <EmptyDecision message={sectionKey === "transactionRisk"
          ? "결제·물류 또는 비용 참고값을 아직 확인하지 못했습니다. 실제 견적과 거래조건 확인이 필요합니다."
          : sectionKey === "marketEntry"
            ? "관세·목적국 세번 결과를 아직 확인하지 못했습니다. 상세 분석을 다시 실행하면 관세·HTS 결과를 이곳에 표시합니다. 인증·수입규제 원문은 아래 패널에서 확인할 수 있습니다."
          : sectionKey === "commonExportChecks"
            ? "직접 일치 결과가 없어도 수출요건이 없다는 뜻은 아닙니다. 관계기관의 최종 확인이 필요합니다."
            : "직접 일치 결과가 없습니다. 결과 없음은 요건 없음을 의미하지 않습니다."} />}
      </CardContent>
    </Card>
  );
}

function MarketEntryVisual({
  countryCode,
  tariffEvidence,
  usitcEvidence,
}: {
  countryCode: string;
  tariffEvidence: TariffRangeEvidence | null;
  usitcEvidence: UsitcHtsEvidence | null;
}) {
  return (
    <div className="space-y-3">
      {tariffEvidence && !usitcEvidence ? <TariffRangeChart evidence={tariffEvidence} /> : !usitcEvidence ? (
        <div className={usitcEvidence
          ? "rounded-lg border border-sky-200 bg-sky-50/60 p-3 text-xs leading-5 text-sky-900"
          : "rounded-lg border border-dashed border-amber-300 bg-amber-50/60 p-3 text-xs leading-5 text-amber-900"}>
          {usitcEvidence
            ? "WITS HS6 범위는 제공되지 않아, 아래 목적국 공식 HTS 후보와 세율을 우선 표시합니다."
            : "HS6 관세 범위를 확인하지 못했습니다. 목적국 8~10자리 세번 확정 후 다시 확인하세요."}
        </div>
        ) : null}
      {countryCode === "US" && usitcEvidence ? <UsitcHtsCard evidence={usitcEvidence} /> : null}
      {countryCode === "US" && !usitcEvidence ? (
        <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/60 p-3 text-xs leading-5 text-amber-900">
          미국 HTS 후보를 아직 확인하지 못했습니다. 데이터 갱신 후 제품 사양과 함께 다시 조회하세요.
        </div>
      ) : null}
    </div>
  );
}

function UsitcHtsCard({ evidence }: { evidence: UsitcHtsEvidence }) {
  const [showAllCandidates, setShowAllCandidates] = useState(false);
  const candidates = showAllCandidates ? evidence.candidates : evidence.primaryCandidates;
  const remainingCount = evidence.remainingCandidates.length;
  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-sky-950">미국 HTS 후보</p>
          <p className="mt-0.5 text-[11px] text-sky-800">미국 공식 관세표 기준 · 최종 세번은 제품 사양 확인 필요</p>
        </div>
        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">최종 확인</span>
      </div>
      <p className="mt-3 text-xs text-sky-900">HS6 하위 분류 {evidence.candidates.length}건</p>
      <div className="mt-2 space-y-2">
        {candidates.map((candidate) => (
          <div key={candidate.htsCode} className="rounded-md border border-sky-200/80 bg-white/80 p-2.5" style={{ marginLeft: formatUsitcIndent(candidate.indent) }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold text-sky-950">{candidate.htsCode}</span>
                <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-800">
                  {candidate.isFinalCandidate
                    ? "10자리 최종 후보"
                    : candidate.codeLevel === 6
                      ? "HS6 기준"
                      : candidate.codeLevel + "자리 분류"}
                </span>
              </div>
              <span className="text-xs font-medium text-slate-700">일반세율 {formatUsitcRate(candidate.generalRate)}</span>
            </div>
            {candidate.description ? <p className="mt-1 text-xs leading-5 text-slate-700">{formatUsitcDescription(candidate.description)}</p> : null}
            {candidate.specialRate !== "-" || candidate.otherRate !== "-" ? (
              <div className="mt-1 grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
                <span>한국산 특혜 {formatUsitcRate(candidate.specialRate)}</span>
                <span>기타 {formatUsitcRate(candidate.otherRate)}</span>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {remainingCount ? (
        <button
          type="button"
          className="mt-3 w-full rounded-md border border-sky-200 bg-white/70 px-3 py-2 text-xs font-medium text-sky-900 transition hover:bg-white"
          onClick={() => setShowAllCandidates((current) => !current)}
        >
          {showAllCandidates ? "우선 후보만 보기" : "전체 후보 보기 (" + remainingCount + ")"}
        </button>
      ) : null}
      {evidence.additionalMeasures.length ? (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          <p className="font-semibold">추가 관세</p>
          <p className="mt-0.5">{evidence.additionalMeasures.map((item) => item.htsCode + " " + formatUsitcRate(item.generalRate)).join(" · ")}</p>
        </div>
      ) : null}
      {evidence.specificationHint ? <p className="mt-2 text-[11px] leading-5 text-muted-foreground">확인할 정보: {evidence.specificationHint}</p> : null}
      <p className="mt-2 text-[11px] text-muted-foreground">자료: 미국 국제무역위원회(USITC) · 기준 {evidence.referenceDate ?? "미제공"}</p>
    </div>
  );
}

function formatUsitcIndent(indent: number | null): string {
  return indent == null ? "0rem" : Math.max(0, indent - 1) * 0.75 + "rem";
}

function formatUsitcRate(rate: string): string {
  return rate.replace(/\s*\([^)]*\)/g, "").trim() || "-";
}

function formatUsitcDescription(description: string): string {
  const plain = description
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
  if (/^radial$/i.test(plain)) return "래디얼 타이어";
  if (/^other$/i.test(plain)) return "기타";
  if (/^of a kind used on motor cars/i.test(plain)) return "승용자동차용(스테이션 왜건·경주용 자동차 포함)";

  const orLess = plain.match(/Having a rim diameter of ([\d.]+) cm \((\d+) inches\) or less/i);
  if (orLess) return "림 직경 " + orLess[1] + "cm(" + orLess[2] + "인치) 이하";

  const range = plain.match(/Having a rim diameter greater than\s*(?:\(>\)|>)?\s*([\d.]+) cm \((\d+) inches\) but not more than\s*(?:\(>\)|>)?\s*([\d.]+) cm \((\d+) inches\)/i);
  if (range) return "림 직경 " + range[1] + "cm(" + range[2] + "인치) 초과 ~ " + range[3] + "cm(" + range[4] + "인치) 이하";

  const greaterThan = plain.match(/Having a rim diameter greater than\s*(?:\(>\)|>)?\s*([\d.]+) cm \((\d+) inches\)/i);
  if (greaterThan) return "림 직경 " + greaterThan[1] + "cm(" + greaterThan[2] + "인치) 초과";

  return plain;
}
function lpiGrade(value: number | null): { label: string; color: string; bgColor: string; barColor: string; description: string } {
  if (value == null) return { label: "미확인", color: "text-slate-500", bgColor: "bg-slate-100", barColor: "bg-slate-300", description: "데이터를 확인하지 못했습니다." };
  if (value >= 3.5) return { label: "우수", color: "text-emerald-700", bgColor: "bg-emerald-100", barColor: "bg-emerald-600", description: "물류 인프라가 잘 갖추어져 통관·운송이 원활합니다." };
  if (value >= 3.0) return { label: "양호", color: "text-sky-700", bgColor: "bg-sky-100", barColor: "bg-sky-500", description: "대체로 안정적이나 일부 지연 가능성을 고려하세요." };
  if (value >= 2.5) return { label: "보통", color: "text-amber-700", bgColor: "bg-amber-100", barColor: "bg-amber-500", description: "통관 지연·운송 비용 변동에 대비가 필요합니다." };
  return { label: "취약", color: "text-red-700", bgColor: "bg-red-100", barColor: "bg-red-500", description: "물류 리스크가 높아 추가 비용·기간 여유를 확보하세요." };
}

function LogisticsEvidenceChart({ evidence }: { evidence: LogisticsEvidence }) {
  const metrics = [
    ["물류 종합", evidence.overall],
    ["통관 효율", evidence.customs],
    ["물류 인프라", evidence.infrastructure],
    ["국제 운송", evidence.internationalShipments],
  ] as const;
  const overallGrade = lpiGrade(evidence.overall);
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-emerald-950">물류환경 LPI</p>
          <p className="mt-0.5 text-[11px] text-emerald-800">국가 단위 물류환경 참고지표</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${overallGrade.bgColor} ${overallGrade.color}`}>{overallGrade.label}</span>
          <span className="font-display text-sm font-semibold text-emerald-950">{formatLpiValue(evidence.overall)} / 5</span>
        </div>
      </div>
      <div className="mt-3 space-y-2.5" role="img" aria-label="World Bank 물류성과지수 세부 지표">
        {metrics.map(([label, value]) => {
          const grade = lpiGrade(value);
          return (
            <div key={label} className="grid grid-cols-[5.5rem_1fr_4.5rem] items-center gap-2 text-xs">
              <span className="text-slate-700">{label}</span>
              <div className="h-2 overflow-hidden rounded-full bg-emerald-100">
                <div className={`h-full rounded-full ${grade.barColor} transition-all`} style={{ width: `${value == null ? 0 : (value / 5) * 100}%` }} />
              </div>
              <div className="flex items-center justify-end gap-1">
                <span className={`inline-flex rounded px-1 py-px text-[10px] font-medium ${grade.bgColor} ${grade.color}`}>{grade.label}</span>
                <span className="text-right font-medium text-emerald-950 w-6">{formatLpiValue(value)}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className={`mt-3 rounded-md ${overallGrade.bgColor} px-2.5 py-2`}>
        <p className={`text-[11px] leading-relaxed font-medium ${overallGrade.color}`}>
          📋 판단 가이드: {overallGrade.description}
        </p>
      </div>
      <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{evidence.sourceName} · 최신 발행 기준 {evidence.year ?? evidence.referenceDate ?? "미제공"} (2~3년 주기 발행) · 실제 운송사 견적과 함께 확인</p>
      <details className="mt-1.5">
        <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground transition-colors">점수 기준 안내</summary>
        <div className="mt-1.5 grid grid-cols-4 gap-1 text-[10px]">
          <span className="rounded bg-emerald-100 px-1.5 py-1 text-center text-emerald-700 font-medium">3.5~5.0 우수</span>
          <span className="rounded bg-sky-100 px-1.5 py-1 text-center text-sky-700 font-medium">3.0~3.4 양호</span>
          <span className="rounded bg-amber-100 px-1.5 py-1 text-center text-amber-700 font-medium">2.5~2.9 보통</span>
          <span className="rounded bg-red-100 px-1.5 py-1 text-center text-red-700 font-medium">1.0~2.4 취약</span>
        </div>
      </details>
    </div>
  );
}

function formatLpiValue(value: number | null): string {
  return value == null ? "-" : value.toFixed(1);
}


function MarketEvidenceChart({ evidence }: { evidence: MarketEvidence }) {
  const data = [{
    name: "수입시장",
    korea: evidence.koreaSharePct,
    others: Math.max(0, 100 - evidence.koreaSharePct),
  }];
  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <ChartMetric label={`${evidence.period ?? "최근"} 전체 수입`} value={formatCompactUsd(evidence.importMarketUsd)} />
        <ChartMetric label="한국산 수입" value={formatCompactUsd(evidence.importsFromKoreaUsd)} />
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="font-medium text-slate-700">한국산 점유율</span>
        <strong className="text-sky-800">{evidence.koreaSharePct.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}%</strong>
      </div>
      <div className="mt-1 h-14" role="img" aria-label={`한국산 점유율 ${evidence.koreaSharePct}%`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 0, bottom: 4, left: 0 }}>
            <XAxis type="number" domain={[0, 100]} hide />
            <YAxis type="category" dataKey="name" hide />
            <Tooltip formatter={(value: number, name: string) => [`${Number(value).toFixed(2)}%`, name === "korea" ? "한국산" : "기타 국가"]} />
            <Bar dataKey="korea" name="한국산" stackId="share" fill="#0E7490" radius={[5, 0, 0, 5]} />
            <Bar dataKey="others" name="기타 국가" stackId="share" fill="#CBD5E1" radius={[0, 5, 5, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{evidence.sourceName} · 자료 기준 {evidence.referenceDate ?? "미제공"} · 단일 연도 통계로 성장 추세는 표시하지 않습니다.</p>
    </div>
  );
}

function TariffRangeChart({ evidence }: { evidence: TariffRangeEvidence }) {
  const data = [
    { name: "최저", value: evidence.minRatePct, color: "#94A3B8" },
    { name: "단순평균", value: evidence.averageRatePct, color: "#0E7490" },
    { name: "최고", value: evidence.maxRatePct, color: "#F59E0B" },
  ];
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-amber-950">HS6 관세 범위</p>
          <p className="mt-0.5 text-[11px] text-amber-800">목적국 세부코드 확정 전 참고값</p>
        </div>
        <span className="text-xs font-semibold text-amber-950">평균 {evidence.averageRatePct}%</span>
      </div>
      <div className="mt-2 h-36" role="img" aria-label={`관세율 최저 ${evidence.minRatePct}%, 평균 ${evidence.averageRatePct}%, 최고 ${evidence.maxRatePct}%`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} unit="%" />
            <Tooltip formatter={(value: number) => [`${Number(value).toFixed(2)}%`, "관세율"]} />
            <Bar dataKey="value" radius={[5, 5, 0, 0]}>
              {data.map((item) => <Cell key={item.name} fill={item.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{evidence.sourceName} · 자료 기준 {evidence.referenceDate ?? "미제공"} · 실제 MFN·FTA 적용세율이 아닙니다.</p>
    </div>
  );
}

function ChartMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-white/80 px-3 py-2"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-0.5 font-display text-base font-semibold text-slate-900">{value}</p></div>;
}

function formatCompactUsd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}M`;
  if (value >= 1_000) return `$${(value / 1_000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}K`;
  return `$${value.toLocaleString("ko-KR")}`;
}

function DetailedFact({ fact, countryName }: { fact: DecisionFact; countryName: string }) {
  return (
    <article className="rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold">{decisionCategoryLabel(fact.category)}</span><EvidencePill fact={fact} /><span className="text-xs text-muted-foreground">{decisionScopeLabel(fact.scope)}</span></div>
      <p className="mt-2 text-sm font-semibold leading-6">{toUserFacingDecisionSummary(fact.summary, countryName)}</p>
      <FactHighlights value={fact.value} expanded />
      {fact.caveat ? <p className="mt-3 text-xs leading-5 text-amber-800"><span className="font-semibold">판단 한계</span> · {fact.caveat}</p> : null}
      {fact.nextAction ? <p className="mt-2 rounded-md bg-brand/5 px-3 py-2 text-xs leading-5"><span className="font-semibold text-brand">다음 확인</span> · {fact.nextAction}</p> : null}
      <FactSource fact={fact} />
    </article>
  );
}

function ProviderOverview({ providers }: { providers: CountryDecisionProviderStatus[] }) {
  if (!providers.length) return null;
  return (
    <details className="group rounded-lg border border-border bg-muted/20">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <div>
          <p className="text-sm font-semibold">데이터 수집 상태</p>
          <p className="mt-0.5 text-xs text-muted-foreground">API별 성공·빈 결과·실패 여부를 확인합니다.</p>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="grid gap-2 border-t border-border p-4 sm:grid-cols-2">
        {providers.map((provider) => (
          <div key={provider.key} className="rounded-md border border-border bg-background p-3 text-xs">
            <div className="flex items-center justify-between gap-2"><span className="font-medium">{provider.label}</span><span className={provider.state === "error" ? "text-red-700" : "text-muted-foreground"}>{providerStateLabel(provider.state)} · {provider.itemCount}건</span></div>
            <p className="mt-1 line-clamp-2 text-muted-foreground">{providerMessageLabel(provider.message)}</p>
          </div>
        ))}
      </div>
    </details>
  );
}

function FactHighlights({ value, expanded = false, limit = 5 }: { value: unknown; expanded?: boolean; limit?: number }) {
  const entries = flattenDecisionFactValue(value).slice(0, expanded ? 8 : limit);
  if (!entries.length) return null;
  return (
    <dl className={expanded
      ? "mt-2 grid gap-x-5 gap-y-2 rounded-md bg-muted/50 p-2 text-xs sm:grid-cols-2"
      : "mt-2 grid gap-y-2 rounded-md bg-muted/50 p-2 text-xs"}
    >
      {entries.map(([key, item]) => {
        const compact = isCompactDecisionValue(item);
        return (
          <div key={key} className="flex min-w-0 items-start justify-between gap-4">
            <dt className="min-w-0 text-muted-foreground">{decisionValueLabel(key)}</dt>
            <dd
              className={compact
                ? "shrink-0 whitespace-nowrap text-right font-medium"
                : "max-w-[62%] break-words text-right font-medium [overflow-wrap:anywhere]"}
              title={item}
            >
              {item}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function isCompactDecisionValue(value: string): boolean {
  return value.length <= 18 && !value.includes(" / ");
}

function FactSource({ fact }: { fact: DecisionFact }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
      <span><strong className="font-medium text-foreground">출처</strong> {fact.sourceName}</span>
      <span>·</span>
      <span><strong className="font-medium text-foreground">자료 기준</strong> {fact.referenceDate || "미제공"}</span>
      <span>·</span>
      <span><strong className="font-medium text-foreground">조회</strong> {formatDateTime(fact.fetchedAt)}</span>
      {fact.sourceUrl ? <a href={fact.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-brand hover:underline">공식 확인 <ArrowUpRight className="h-3 w-3" /></a> : null}
    </div>
  );
}

function MetricCard({ label, value, detail, emphasis = false }: { label: string; value: string; detail: string; emphasis?: boolean }) {
  const classes = ["rounded-lg", "border", "p-3", emphasis ? "border-brand/30 bg-brand/5" : "border-border bg-background/80"].join(" ");
  return <div className={classes}><p className="text-xs font-medium text-muted-foreground">{label}</p><p className={emphasis ? "mt-0.5 font-display text-xl font-semibold text-brand" : "mt-0.5 font-display text-lg font-semibold"}>{value}</p><p className="mt-1 text-[11px] leading-4 text-muted-foreground">{detail}</p></div>;
}

function ContextChip({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <span className="rounded-full border border-border bg-background/80 px-2.5 py-1 text-muted-foreground">{label}<strong className={mono ? "ml-1 font-mono font-medium text-foreground" : "ml-1 font-medium text-foreground"}>{value}</strong></span>;
}

function EvidencePill({ fact }: { fact: DecisionFact }) {
  const style = fact.status === "confirmed" ? "bg-emerald-100 text-emerald-800" : fact.status === "estimated" ? "bg-sky-100 text-sky-800" : fact.status === "needs_verification" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700";
  return <span className={["rounded-full px-2 py-0.5 text-[11px] font-medium", style].join(" ")}>{decisionEvidenceLabel(fact)}</span>;
}

function EmptyDecision({ message }: { message: string }) {
  return <div className="mt-2 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-xs leading-5 text-muted-foreground">{message}</div>;
}

function formatDateTime(value: string | null): string {
  if (!value) return "미실행";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function decisionHint(value: ReturnType<typeof buildDecisionSummary>["suitability"]): string {
  if (value === "검토 유망") return "핵심 근거가 충분하며 후속 검증을 진행할 가치가 있습니다.";
  if (value === "조건부 검토") return "일부 요건을 확인한 뒤 수출 여부를 결정해야 합니다.";
  if (value === "우선 보류") return "확인된 차단요소를 해소하기 전 진행을 보류하세요.";
  return "필수 근거가 50% 미만이어서 적합도를 확정하지 않습니다.";
}

function providerStateLabel(state: CountryDecisionProviderStatus["state"]): string {
  if (state === "success") return "성공";
  if (state === "empty") return "직접 일치 없음";
  if (state === "error") return "실패";
  return "미실행";
}
