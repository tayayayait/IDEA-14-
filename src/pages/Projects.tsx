import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { FolderOpen, FileText, Loader2, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ApiStateChip, type ApiState } from "@/components/ApiStateChip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { supabase } from "@/integrations/supabase/client";
import { loadLastSelectedCountry } from "@/lib/project-step";
import {
  computeProjectFeatureProgress,
  PROJECT_PROGRESS_API_KEYS,
  type ProjectFeatureProgress,
} from "@/lib/project-progress";
import { isSourceReadyForCompletion, resolveSourceStatusView } from "@/lib/source-status";

interface ProjectRow {
  id: string;
  title: string;
  status: string;
  current_step: number;
  updated_at: string;
}

interface ApiStatusLogRow {
  project_id: string;
  api_key_name: string;
  status: ApiState;
  called_at: string;
  http_status: number | null;
  response_count: number | null;
  error_code: string | null;
}

interface ProjectRefRow {
  project_id: string;
}

interface RiskRefRow {
  project_id: string;
  category: string | null;
}

const STATUS_KO: Record<string, string> = {
  draft: "초안",
  ready: "준비",
  analyzing: "분석 중",
  review_required: "검토 필요",
  complete: "완료",
  blocked: "차단",
};

function normalizeStep(step: number) {
  if (!Number.isFinite(step)) return 1;
  return Math.min(5, Math.max(1, Math.trunc(step)));
}

function resolveResumePath(project: ProjectRow) {
  const step = normalizeStep(project.current_step);
  if (step >= 5) return "report";
  if (step >= 4) {
    const lastCountry = loadLastSelectedCountry(project.id);
    return lastCountry ? `countries/${lastCountry}` : "countries";
  }
  if (step >= 3) return "countries";
  if (step >= 2) return "product";
  return "company";
}

export default function Projects() {
  useAuthGuard();
  const navigate = useNavigate();
  const [items, setItems] = useState<ProjectRow[]>([]);
  const [coreApiStates, setCoreApiStates] = useState<Record<string, { kicox: ApiState }>>({});
  const [featureProgressByProject, setFeatureProgressByProject] = useState<Record<string, ProjectFeatureProgress>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("projects")
      .select("id,title,status,current_step,updated_at")
      .order("updated_at", { ascending: false });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    const projects = data ?? [];
    setItems(projects);

    if (projects.length === 0) {
      setCoreApiStates({});
      setFeatureProgressByProject({});
      setLoading(false);
      return;
    }

    const projectIds = projects.map((project) => project.id);
    const [
      { data: logs },
      { data: companies },
      { data: products },
      { data: countries },
      { data: certs },
      { data: regs },
      { data: risks },
    ] = await Promise.all([
      supabase
        .from("api_call_logs")
        .select("project_id,api_key_name,status,called_at,http_status,response_count,error_code")
        .in("project_id", projectIds)
        .in("api_key_name", PROJECT_PROGRESS_API_KEYS)
        .order("called_at", { ascending: false })
        .limit(4000),
      supabase.from("project_companies").select("project_id").in("project_id", projectIds),
      supabase.from("project_products").select("project_id").in("project_id", projectIds),
      supabase.from("project_countries").select("project_id").in("project_id", projectIds),
      supabase.from("project_certifications").select("project_id").in("project_id", projectIds),
      supabase.from("project_regulations").select("project_id").in("project_id", projectIds),
      supabase.from("project_risks").select("project_id,category").in("project_id", projectIds),
    ]);

    const companyProjectIds = new Set(((companies as ProjectRefRow[] | null) ?? []).map((row) => row.project_id));
    const productProjectIds = new Set(((products as ProjectRefRow[] | null) ?? []).map((row) => row.project_id));
    const candidateProjectIds = new Set(((countries as ProjectRefRow[] | null) ?? []).map((row) => row.project_id));
    const certProjectIds = new Set(((certs as ProjectRefRow[] | null) ?? []).map((row) => row.project_id));
    const regulationProjectIds = new Set(((regs as ProjectRefRow[] | null) ?? []).map((row) => row.project_id));

    const countryRiskProjectIds = new Set<string>();
    const industryRiskProjectIds = new Set<string>();
    const paymentRiskProjectIds = new Set<string>();
    for (const row of (risks as RiskRefRow[] | null) ?? []) {
      const category = (row.category ?? "").toLowerCase();
      if (category === "k_sure") countryRiskProjectIds.add(row.project_id);
      if (category === "k_sure_industry") industryRiskProjectIds.add(row.project_id);
      if (category === "k_sure_payment") paymentRiskProjectIds.add(row.project_id);
    }

    const byProject: Record<string, { kicox: ApiState }> = Object.fromEntries(
      projectIds.map((id) => [id, { kicox: "idle" }]),
    );
    const latestLogByProjectApi: Record<string, Record<string, ApiStatusLogRow>> = Object.fromEntries(
      projectIds.map((id) => [id, {}]),
    );
    const seen = new Set<string>();

    for (const row of (logs as ApiStatusLogRow[] | null) ?? []) {
      const projectState = byProject[row.project_id];
      if (!projectState) continue;
      const key = `${row.project_id}:${row.api_key_name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      latestLogByProjectApi[row.project_id][row.api_key_name] = row;
      const mappedState = resolveSourceStatusView(row, row.api_key_name).chipState;
      if (row.api_key_name === "kicox_factory_production") projectState.kicox = mappedState;
    }

    const progressByProject: Record<string, ProjectFeatureProgress> = {};
    for (const project of projects) {
      const projectId = project.id;
      const isApiReady = (apiKey: string) =>
        isSourceReadyForCompletion(latestLogByProjectApi[projectId]?.[apiKey], apiKey);

      progressByProject[projectId] = computeProjectFeatureProgress({
        companyReady: companyProjectIds.has(projectId) && isApiReady("kicox_factory_production"),
        productReady: productProjectIds.has(projectId),
        candidatesReady: candidateProjectIds.has(projectId) && isApiReady("kotra_country_info"),
        certificationReady: certProjectIds.has(projectId) && isApiReady("kotra_overseas_certification"),
        regulationReady: regulationProjectIds.has(projectId) && isApiReady("kotra_import_regulation"),
        countryIndustryRiskReady:
          countryRiskProjectIds.has(projectId) &&
          industryRiskProjectIds.has(projectId) &&
          isApiReady("ksure_country_risk") &&
          isApiReady("ksure_industry_risk"),
        exportPaymentRiskReady: paymentRiskProjectIds.has(projectId) && isApiReady("ksure_export_payment"),
        reportReady: project.status === "complete",
      });
    }

    setCoreApiStates(byProject);
    setFeatureProgressByProject(progressByProject);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const createNew = async () => {
    setCreating(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setCreating(false);
      return;
    }

    const { data, error } = await supabase
      .from("projects")
      .insert({ user_id: u.user.id, title: `새 분석 ${new Date().toLocaleDateString("ko-KR")}` })
      .select("id")
      .single();

    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate(`/projects/${data.id}/company`);
  };

  const deleteProject = async (project: ProjectRow) => {
    if (deletingId) return;
    const ok = window.confirm(`"${project.title}" 프로젝트를 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.`);
    if (!ok) return;

    setDeletingId(project.id);
    const { error } = await supabase.from("projects").delete().eq("id", project.id);
    setDeletingId(null);

    if (error) {
      toast.error(`프로젝트 삭제 실패: ${error.message}`);
      return;
    }

    setItems((prev) => prev.filter((item) => item.id !== project.id));
    setCoreApiStates((prev) => {
      const next = { ...prev };
      delete next[project.id];
      return next;
    });
    setFeatureProgressByProject((prev) => {
      const next = { ...prev };
      delete next[project.id];
      return next;
    });
    toast.success("프로젝트를 삭제했습니다.");
  };

  return (
    <AppShell>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">분석 프로젝트</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            기업·제품 정보를 입력하면 5단계 분석과 8개 요구사항 결과를 리포트로 확인할 수 있습니다.
          </p>
        </div>
        <Button onClick={createNew} disabled={creating} size="lg" className="min-h-11">
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {creating ? "분석 생성 중..." : "새 분석 시작"}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          불러오는 중
        </div>
      ) : items.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <FolderOpen className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">아직 분석이 없습니다</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              기업·공장 검색, 제품 정보 입력, 후보국 추천, 국가 상세 분석, 리포트 생성 순서로 진행합니다.
            </p>
            <Button onClick={createNew} disabled={creating} className="min-h-11">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {creating ? "분석 생성 중..." : "지금 시작하기"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {items.map((project) => {
            const progress = featureProgressByProject[project.id] ?? { completed: 0, total: 8, percent: 0 };
            const resumeHref = `/projects/${project.id}/${resolveResumePath(project)}`;
            const deleting = deletingId === project.id;
            return (
              <div
                key={project.id}
                className="group flex items-center justify-between gap-4 rounded-lg border border-border bg-surface px-5 py-4 shadow-card transition-all hover:border-brand/40 hover:shadow-elevated"
              >
                <button
                  type="button"
                  onClick={() => navigate(resumeHref)}
                  className="flex min-w-0 flex-1 items-center gap-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-soft text-brand">
                    <FileText className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium">{project.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {STATUS_KO[project.status] ?? project.status} · 단계 {normalizeStep(project.current_step)}/5 · 완료율{" "}
                      {progress.percent}% (기능 {progress.completed}/{progress.total}) ·{" "}
                      {format(new Date(project.updated_at), "yyyy.MM.dd HH:mm", { locale: ko })}
                    </p>
                    <div className="mt-1 h-1.5 w-48 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-brand transition-all"
                        style={{ width: `${progress.percent}%` }}
                      />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>KICOX</span>
                      <ApiStateChip state={coreApiStates[project.id]?.kicox ?? "idle"} />
                    </div>
                  </div>
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(resumeHref)}
                    className="text-muted-foreground group-hover:text-brand"
                  >
                    계속하기
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={deleting}
                    aria-label={`${project.title} 삭제`}
                    onClick={() => {
                      void deleteProject(project);
                    }}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
