import { ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { STEPS, StepNav, getStepPath } from "./StepNav";
import { Button } from "@/components/ui/button";
import { Compass, LogOut, Database, FolderKanban, PanelRightClose, PanelRightOpen, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { STEP_REQUIREMENT_MAP, loadLastSelectedCountry, saveLastSelectedCountry } from "@/lib/project-step";
import { toast } from "@/components/ui/sonner";
import { isSourceReadyForCompletion } from "@/lib/source-status";
import {
  PROJECT_PROGRESS_API_KEYS,
  resolveProjectStepCompletion,
  type ProjectFeatureEvidence,
  type ProjectStepCompletion,
} from "@/lib/project-progress";
import { preloadPage, preloadRoute } from "@/lib/route-preload";

interface Props {
  children: ReactNode;
  currentStep?: number;
  evidence?: ReactNode;
  actionBar?: ReactNode;
}

interface ApiStatusLogRow {
  api_key_name: string;
  status: string;
  called_at: string;
  http_status: number | null;
  response_count: number | null;
  error_code: string | null;
}

interface ProjectRefRow {
  project_id: string;
}

interface RiskRefRow {
  category: string | null;
}

const preloadProjectsPage = () => preloadPage("projects");
const preloadDataSourcesPage = () => preloadPage("dataSources");
const preloadKcRecallPage = () => preloadPage("kcRecallLookup");
const preloadAuthPage = () => preloadPage("auth");

export function AppShell({ children, currentStep, evidence, actionBar }: Props) {
  const { id, cc } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [evOpen, setEvOpen] = useState(true);
  const [stepCompletion, setStepCompletion] = useState<ProjectStepCompletion | null>(null);

  const selectedCountryCode = useMemo(() => {
    if (!id) return null;
    if (cc) return cc.toUpperCase();
    return loadLastSelectedCountry(id);
  }, [id, cc]);

  useEffect(() => {
    if (!id || !cc) return;
    saveLastSelectedCountry(id, cc);
  }, [id, cc]);

  useEffect(() => {
    toast.dismiss();
  }, [location.pathname]);

  useEffect(() => {
    if (!id) {
      setStepCompletion(null);
      return;
    }

    let cancelled = false;

    const refreshStepCompletion = async () => {
      const [
        { data: project },
        { data: logs },
        { data: companies },
        { data: products },
        { data: countries },
        { data: certs },
        { data: regs },
        { data: risks },
      ] = await Promise.all([
        supabase.from("projects").select("current_step,status").eq("id", id).maybeSingle(),
        supabase
          .from("api_call_logs")
          .select("api_key_name,status,called_at,http_status,response_count,error_code")
          .eq("project_id", id)
          .in("api_key_name", [...PROJECT_PROGRESS_API_KEYS])
          .order("called_at", { ascending: false })
          .limit(200),
        supabase.from("project_companies").select("project_id").eq("project_id", id).limit(1),
        supabase.from("project_products").select("project_id").eq("project_id", id).limit(1),
        supabase.from("project_countries").select("project_id").eq("project_id", id).limit(1),
        supabase.from("project_certifications").select("project_id").eq("project_id", id).limit(1),
        supabase.from("project_regulations").select("project_id").eq("project_id", id).limit(1),
        supabase.from("project_risks").select("category").eq("project_id", id),
      ]);

      const latestLogByApi = new Map<string, ApiStatusLogRow>();
      for (const row of (logs as ApiStatusLogRow[] | null) ?? []) {
        if (!latestLogByApi.has(row.api_key_name)) latestLogByApi.set(row.api_key_name, row);
      }

      const isApiReady = (apiKey: string) =>
        isSourceReadyForCompletion(latestLogByApi.get(apiKey), apiKey);

      let countryRiskReady = false;
      let industryRiskReady = false;
      let paymentRiskReady = false;
      for (const row of (risks as RiskRefRow[] | null) ?? []) {
        const category = (row.category ?? "").toLowerCase();
        if (category === "k_sure") countryRiskReady = true;
        if (category === "k_sure_industry") industryRiskReady = true;
        if (category === "k_sure_payment") paymentRiskReady = true;
      }

      const evidence: ProjectFeatureEvidence = {
        companyReady: ((companies as ProjectRefRow[] | null) ?? []).length > 0 && isApiReady("kicox_factory_production"),
        productReady: ((products as ProjectRefRow[] | null) ?? []).length > 0,
        candidatesReady: ((countries as ProjectRefRow[] | null) ?? []).length > 0 && isApiReady("kotra_country_info"),
        certificationReady: ((certs as ProjectRefRow[] | null) ?? []).length > 0 && isApiReady("kotra_overseas_certification"),
        regulationReady: ((regs as ProjectRefRow[] | null) ?? []).length > 0 && isApiReady("kotra_import_regulation"),
        countryIndustryRiskReady:
          countryRiskReady &&
          industryRiskReady &&
          isApiReady("ksure_country_risk") &&
          isApiReady("ksure_industry_risk"),
        exportPaymentRiskReady: paymentRiskReady && isApiReady("ksure_export_payment"),
        reportReady: (project as { status?: string | null } | null)?.status === "complete",
      };

      if (!cancelled) {
        setStepCompletion(resolveProjectStepCompletion(evidence));
      }
    };

    void refreshStepCompletion();

    return () => {
      cancelled = true;
    };
  }, [id, location.pathname]);

  const currentStepMeta = currentStep ? STEP_REQUIREMENT_MAP[currentStep] : undefined;

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-background">
      <header
        className="fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b border-border bg-surface/95 px-4 backdrop-blur md:px-6"
        style={{ height: "var(--topbar-h)" }}
      >
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-2"
            aria-label="홈"
            onFocus={preloadProjectsPage}
            onMouseEnter={preloadProjectsPage}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-brand-foreground">
              <Compass className="h-5 w-5" />
            </span>
            <span className="hidden text-sm font-semibold tracking-tight md:inline font-display">
              산단수출 코파일럿
            </span>
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="min-h-11">
            <Link to="/projects" onFocus={preloadProjectsPage} onMouseEnter={preloadProjectsPage}>
              <FolderKanban className="h-4 w-4" />프로젝트
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="min-h-11">
            <Link to="/data-sources" onFocus={preloadDataSourcesPage} onMouseEnter={preloadDataSourcesPage}>
              <Database className="h-4 w-4" />데이터 출처
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="min-h-11">
            <Link
              to="/kc-recall"
              onFocus={preloadKcRecallPage}
              onMouseEnter={preloadKcRecallPage}
              aria-label="KC·리콜 조회"
              className="text-[0]"
            >
              <span className="order-2 text-sm">KC·리콜 조회</span>
              <ShieldCheck className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            onFocus={preloadAuthPage}
            onMouseEnter={preloadAuthPage}
            aria-label="로그아웃"
            className="min-h-11 min-w-11"
          >
            <LogOut className="h-4 w-4" /><span className="hidden md:inline">로그아웃</span>
          </Button>
        </div>
      </header>

      <div className="flex" style={{ paddingTop: "var(--topbar-h)" }}>
        {id && (
          <aside
            className="sticky hidden border-r border-border bg-sidebar p-2 md:block lg:hidden"
            style={{ top: "var(--topbar-h)", height: "calc(100vh - var(--topbar-h))", width: 72 }}
          >
            <StepNav
              projectId={id}
              current={currentStep ?? 1}
              compact
              selectedCountryCode={selectedCountryCode}
              stepCompletion={stepCompletion}
            />
          </aside>
        )}

        {id && (
          <aside
            className="sticky hidden border-r border-border bg-sidebar p-4 lg:block"
            style={{ top: "var(--topbar-h)", height: "calc(100vh - var(--topbar-h))", width: 264 }}
          >
            <p className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              분석 단계
            </p>
            <StepNav
              projectId={id}
              current={currentStep ?? 1}
              selectedCountryCode={selectedCountryCode}
              stepCompletion={stepCompletion}
            />
          </aside>
        )}

        <main
          className={cn(
            "min-w-0 flex-1",
            actionBar && "pb-[calc(var(--actionbar-h)+1rem)]",
            id && !actionBar && "pb-14 md:pb-0",
          )}
          style={{ minHeight: "calc(100vh - var(--topbar-h))" }}
        >
          <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
            {id && currentStepMeta ? (
              <div className="mb-4 rounded-md border border-border bg-muted/30 p-3">
                <p className="text-xs font-semibold text-muted-foreground">기획 요구사항 매핑</p>
                <p className="mt-1 text-sm font-medium">{currentStepMeta.requirementRange}</p>
                <p className="text-xs text-muted-foreground">{currentStepMeta.description}</p>
              </div>
            ) : null}
            {children}
          </div>
        </main>

        {evidence && (
          <aside
            className={cn(
              "sticky hidden border-l border-border bg-surface transition-[width] duration-200 lg:block",
            )}
            style={{
              top: "var(--topbar-h)",
              height: "calc(100vh - var(--topbar-h))",
              width: evOpen ? "var(--evidence-w)" : 56,
            }}
          >
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className={cn("text-xs font-semibold uppercase tracking-wider text-muted-foreground", !evOpen && "sr-only")}>
                근거 패널
              </span>
              <Button
                variant="ghost" size="icon"
                onClick={() => setEvOpen((v) => !v)}
                aria-label={evOpen ? "근거 패널 접기" : "근거 패널 펼치기"}
              >
                {evOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
              </Button>
            </div>
            {evOpen && <div className="h-[calc(100%-41px)] overflow-y-auto p-4">{evidence}</div>}
          </aside>
        )}
      </div>

      {id && (
        <div
          className="fixed inset-x-0 z-30 border-t border-border bg-surface px-2 py-1 md:hidden"
          style={{ bottom: actionBar ? "var(--actionbar-h)" : 0 }}
        >
          <div className="flex items-center justify-between">
            {STEPS.map((step) => {
              const to = `/projects/${id}/${getStepPath(step, selectedCountryCode)}`;
              return (
                <Link
                  key={step.n}
                  to={to}
                  onFocus={() => preloadRoute(to)}
                  onMouseEnter={() => preloadRoute(to)}
                  aria-current={step.n === currentStep ? "step" : undefined}
                  aria-label={`${step.n}단계 ${step.label}`}
                  className={cn(
                    "flex min-h-11 flex-1 items-center justify-center rounded-md text-[11px] font-medium",
                    step.n === currentStep ? "bg-brand-soft text-brand" : "text-muted-foreground",
                  )}
                >
                  {step.n}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {actionBar && (
        <div
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur"
          style={{ height: "var(--actionbar-h)" }}
        >
          <div className="mx-auto flex h-full max-w-5xl items-center justify-end gap-2 px-4 md:px-8">
            {actionBar}
          </div>
        </div>
      )}
    </div>
  );
}
