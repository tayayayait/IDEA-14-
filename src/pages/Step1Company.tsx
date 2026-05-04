import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useApiCall } from "@/hooks/useApiCall";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SourceBadge } from "@/components/SourceBadge";
import { ManualBadge } from "@/components/ManualBadge";
import { MobileCardList } from "@/components/MobileCardList";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiStateChip, type ApiState } from "@/components/ApiStateChip";
import { Search, Loader2, AlertCircle, Building2, RotateCcw } from "lucide-react";
import { toast } from "@/components/ui/sonner";

interface CompanyResult {
  business_no?: string;
  company_name: string;
  industrial_complex?: string;
  address?: string;
  industry_code?: string;
  employees?: number;
  factory_manage_no?: string;
  region?: string;
  main_product?: string;
}

const REGIONS = [
  "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
] as const;
const PAGE_SIZE = 10;

export default function Step1Company() {
  useAuthGuard();
  const { invoke, retryInSec, isRetrying } = useApiCall();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [complex, setComplex] = useState("");
  const [factoryManageNo, setFactoryManageNo] = useState("");
  const [region, setRegion] = useState("");
  const [productKeyword, setProductKeyword] = useState("");
  const [state, setState] = useState<ApiState>("idle");
  const [results, setResults] = useState<CompanyResult[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<"kicox" | "manual">("manual");

  // manual fields
  const [manual, setManual] = useState<CompanyResult>({ company_name: "" });
  const [saving, setSaving] = useState(false);

  // hydrate existing
  useEffect(() => {
    if (!id) return;
    supabase.from("project_companies").select("*").eq("project_id", id).maybeSingle().then(({ data }) => {
      if (data) {
        setManual({
          business_no: data.business_no ?? undefined,
          company_name: data.company_name,
          industrial_complex: data.industrial_complex ?? undefined,
          address: data.address ?? undefined,
          industry_code: data.industry_code ?? undefined,
          employees: data.employees ?? undefined,
          factory_manage_no: String(
            (data.raw as Record<string, unknown> | null)?.factory_manage_no ??
            (data.raw as Record<string, unknown> | null)?.factory_name ??
            "",
          ),
          region: String((data.raw as Record<string, unknown> | null)?.region ?? ""),
          main_product: String((data.raw as Record<string, unknown> | null)?.main_product ?? ""),
        });
        setSourceType(data.source === "kicox" ? "kicox" : "manual");
      }
    });
  }, [id]);

  useEffect(() => {
    if (!results.length) {
      if (currentPage !== 1) {
        setCurrentPage(1);
      }
      return;
    }

    const pageCount = Math.ceil(results.length / PAGE_SIZE);
    if (currentPage > pageCount) {
      setCurrentPage(pageCount);
    }
  }, [results.length, currentPage]);

  const pageStartIndex = (currentPage - 1) * PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const pagedResults = results.slice(pageStartIndex, pageStartIndex + PAGE_SIZE);

  const hasValidSearch = () => {
    const textTerms = [q, complex, factoryManageNo, productKeyword].map((v) => v.trim());
    if (textTerms.some((v) => v.length >= 2)) return true;
    return region.trim().length >= 2;
  };

  const search = async () => {
    if (!hasValidSearch()) {
      return toast.warning("검색 조건은 1개 이상, 각 조건은 2자 이상 입력해 주세요");
    }
    setState("loading"); setErrMsg(null); setResults([]); setCurrentPage(1);
    const result = await invoke<{ items?: CompanyResult[]; state?: ApiState; message?: string }>(
      "api-kicox-search",
      {
        project_id: id,
        query: q.trim(),
        complex: complex.trim(),
        factory_manage_no: factoryManageNo.trim(),
        region: region.trim(),
        product_keyword: productKeyword.trim(),
      },
    );

    if (!result.ok) {
      setState(result.state);
      setErrMsg(result.message ?? "조회 실패");
      return;
    }

    const items = (result.data?.items ?? []) as CompanyResult[];
    const nextState = (result.data?.state ?? (items.length ? "success" : "empty")) as ApiState;
    setResults(items);
    setState(nextState);
    setErrMsg(result.message ?? null);
  };

  const pickFromSearch = (r: CompanyResult) => {
    setManual((prev) => ({
      business_no: prev.business_no,
      company_name: r.company_name,
      industrial_complex: r.industrial_complex,
      address: r.address,
      industry_code: r.industry_code,
      employees: r.employees,
      factory_manage_no: r.factory_manage_no,
      region: r.region,
      main_product: r.main_product,
    }));
    setSourceType("kicox");
  };

  const updateManual = <K extends keyof CompanyResult>(key: K, value: CompanyResult[K]) => {
    setManual((m) => ({ ...m, [key]: value }));
    if (sourceType !== "manual") setSourceType("manual");
  };

  const resetSearch = () => {
    setQ("");
    setComplex("");
    setFactoryManageNo("");
    setRegion("");
    setProductKeyword("");
    setResults([]);
    setErrMsg(null);
    setState("idle");
    setCurrentPage(1);
  };

  const getCompanyResultKey = (result: CompanyResult, index: number) => {
    const companyName = result.company_name.trim() || "unknown-company";
    const businessNo = result.business_no?.trim();
    const factoryManageNo = result.factory_manage_no?.trim();
    return businessNo
      ? `${companyName}-${businessNo}-${index}`
      : factoryManageNo
        ? `${companyName}-${factoryManageNo}-${index}`
        : `${companyName}-no-business-no-${index}`;
  };

  const saveAndNext = async () => {
    if (!id || !manual.company_name) return toast.warning("회사명을 입력해 주세요");
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setSaving(false);
      return;
    }
    // upsert: delete then insert
    await supabase.from("project_companies").delete().eq("project_id", id);
    const { error } = await supabase.from("project_companies").insert({
      project_id: id, user_id: u.user.id,
      source: sourceType,
      business_no: manual.business_no, company_name: manual.company_name,
      industrial_complex: manual.industrial_complex, address: manual.address,
      industry_code: manual.industry_code, employees: manual.employees,
      raw: {
        factory_manage_no: manual.factory_manage_no ?? null,
        region: manual.region ?? null,
        main_product: manual.main_product ?? null,
        product_keyword: productKeyword.trim() || null,
      },
      user_overridden: true,
    });
    await supabase.from("projects").update({ current_step: 2, status: "ready" }).eq("id", id);
    setSaving(false);
    if (error) return toast.error(error.message);
    navigate(`/projects/${id}/product`);
  };

  return (
    <AppShell
      currentStep={1}
      evidence={
        <div className="space-y-3 text-sm">
          <h3 className="font-display font-semibold">근거 · 출처</h3>
          <p className="text-muted-foreground">
            기업 정보는 <span className="font-medium">한국산업단지공단 입주기업 OpenAPI(KICOX)</span>에서 조회합니다.
            검색 결과가 없으면 직접 입력해 진행할 수 있으며, 입력값에는 <span className="font-medium">‘사용자 입력’</span> 배지가 붙습니다.
          </p>
          <div className="rounded-md bg-muted p-3">
            <p className="font-medium">조회 상태</p>
            <div className="mt-1 flex items-center gap-2">
              <ApiStateChip state={state} />
              {sourceType === "manual" ? <ManualBadge /> : <SourceBadge source="KICOX" />}
            </div>
            {errMsg && <p className="mt-2 text-xs text-muted-foreground">{errMsg}</p>}
          </div>
        </div>
      }
      actionBar={
        <>
          <Button variant="ghost" onClick={() => navigate("/projects")}>취소</Button>
          <Button onClick={saveAndNext} disabled={saving || !manual.company_name}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}저장 후 다음 단계
          </Button>
        </>
      }
    >
      <div className="mb-6">
        <h1 className="font-display text-xl font-semibold">1. 기업·공장 검색</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          산업단지 입주기업을 검색하거나 직접 입력합니다.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">KICOX 검색</CardTitle>
          <CardDescription>검색 조건 1개 이상, 텍스트 조건은 2자 이상 입력해야 조회됩니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input placeholder="회사명 (예: ○○산업)" value={q} onChange={(e) => setQ(e.target.value)} />
            <Input placeholder="산단명 (예: 반월시화)" value={complex} onChange={(e) => setComplex(e.target.value)} />
            <Input
              placeholder="공장관리번호 (예: 115452009184637)"
              value={factoryManageNo}
              onChange={(e) => setFactoryManageNo(e.target.value)}
            />
            <Input placeholder="생산품 키워드 (예: 모터, 센서)" value={productKeyword} onChange={(e) => setProductKeyword(e.target.value)} />
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">지역</Label>
              <Select value={region} onValueChange={setRegion}>
                <SelectTrigger aria-label="지역 선택">
                  <SelectValue placeholder="지역 선택" />
                </SelectTrigger>
                <SelectContent>
                  {REGIONS.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2 self-end">
              <Button onClick={search} disabled={state === "loading"} className="min-h-11">
                {state === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {state === "loading" ? "검색 중..." : "검색 실행"}
              </Button>
              <Button type="button" variant="outline" onClick={resetSearch} className="min-h-11">
                <RotateCcw className="h-4 w-4" />
                조건 초기화
              </Button>
            </div>
          </div>

          {isRetrying && retryInSec > 0 && (
            <p className="rounded-md border border-risk-reviewable/30 bg-risk-reviewable-soft p-2 text-xs text-risk-reviewable">
              요청 한도 초과로 자동 재시도 대기 중입니다. {retryInSec}초 후 다시 호출합니다.
            </p>
          )}

          {state === "error" && (
            <div className="flex items-start gap-2 rounded-md border border-risk-high/30 bg-risk-high-soft p-3 text-sm text-risk-high">
              <AlertCircle className="mt-0.5 h-4 w-4" />
              <div>
                <p className="font-medium">API 인증 정보 미설정 또는 호출 실패</p>
                <p className="text-xs">{errMsg ?? "잠시 후 다시 시도하거나 직접 입력으로 진행하세요."}</p>
              </div>
            </div>
          )}

          {state === "empty" && (
            <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              조회 결과가 없습니다. 아래에서 직접 입력해 진행할 수 있습니다.
            </p>
          )}

          {results.length > 0 && (
            <>
              <MobileCardList
                items={pagedResults}
                getKey={(item, index) => getCompanyResultKey(item, pageStartIndex + index)}
                renderCard={(r) => (
                  <div className="space-y-2 text-sm">
                    <p className="font-medium">{r.company_name}</p>
                    <p className="text-xs text-muted-foreground">산단: {r.industrial_complex ?? "-"}</p>
                    <p className="text-xs text-muted-foreground">업종: {r.industry_code ?? "-"}</p>
                    <p className="text-xs text-muted-foreground">생산품: {r.main_product ?? "-"}</p>
                    <p className="text-xs text-muted-foreground">{r.address ?? "-"}</p>
                    <Button size="sm" variant="outline" onClick={() => pickFromSearch(r)} className="min-h-11 min-w-11">
                      채우기
                    </Button>
                  </div>
                )}
              />

              <div className="hidden overflow-hidden rounded-lg border border-border md:block">
                <table className="w-full text-sm" aria-label="기업 검색 결과 표">
                  <caption className="sr-only">기업 검색 결과 목록</caption>
                  <thead className="bg-muted/60 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">회사명</th>
                      <th className="px-3 py-2 text-left">산단</th>
                      <th className="px-3 py-2 text-left">업종</th>
                      <th className="px-3 py-2 text-left">생산품</th>
                      <th className="px-3 py-2 text-left">주소</th>
                      <th className="px-3 py-2 text-right">선택</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {pagedResults.map((r, i) => (
                      <tr key={getCompanyResultKey(r, pageStartIndex + i)} className="hover:bg-muted/30">
                        <td className="px-3 py-3 font-medium">{r.company_name}</td>
                        <td className="px-3 py-3 text-muted-foreground">{r.industrial_complex ?? "-"}</td>
                        <td className="px-3 py-3 text-muted-foreground">{r.industry_code ?? "-"}</td>
                        <td className="px-3 py-3 text-muted-foreground">{r.main_product ?? "-"}</td>
                        <td className="px-3 py-3 text-muted-foreground">{r.address ?? "-"}</td>
                        <td className="px-3 py-3 text-right">
                          <Button size="sm" variant="outline" onClick={() => pickFromSearch(r)} className="min-h-11 min-w-11">채우기</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">
                    총 {results.length.toLocaleString()}건 · {currentPage}/{totalPages} 페이지
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    >
                      이전
                    </Button>
                    {Array.from({ length: totalPages }, (_, index) => {
                      const page = index + 1;
                      return (
                        <Button
                          key={page}
                          type="button"
                          size="sm"
                          variant={page === currentPage ? "default" : "outline"}
                          onClick={() => setCurrentPage(page)}
                          className="min-h-9 min-w-9 px-3"
                        >
                          {page}
                        </Button>
                      );
                    })}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    >
                      다음
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
            <p className="font-medium">선택 요약</p>
            {!manual.company_name ? (
              <p className="mt-1 text-muted-foreground">아직 선택/입력된 기업 정보가 없습니다.</p>
            ) : (
              <div className="mt-2 space-y-1 text-muted-foreground">
                <p><span className="text-foreground">회사명:</span> {manual.company_name}</p>
                <p><span className="text-foreground">산단:</span> {manual.industrial_complex ?? "-"}</p>
                <p><span className="text-foreground">공장관리번호:</span> {manual.factory_manage_no ?? "-"}</p>
                <p><span className="text-foreground">지역:</span> {manual.region ?? "-"}</p>
                <p><span className="text-foreground">생산품:</span> {manual.main_product ?? "-"}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" />기업 정보
          </CardTitle>
          <CardDescription>검색 결과를 채우거나 직접 입력해 주세요.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="회사명" required value={manual.company_name} onChange={(v) => updateManual("company_name", v)} />
          <Field label="산단명" value={manual.industrial_complex ?? ""} onChange={(v) => updateManual("industrial_complex", v)} />
          <Field
            label="공장관리번호"
            value={manual.factory_manage_no ?? ""}
            onChange={(v) => updateManual("factory_manage_no", v)}
          />
          <Field label="주소" value={manual.address ?? ""} onChange={(v) => updateManual("address", v)} />
          <Field label="지역" value={manual.region ?? ""} onChange={(v) => updateManual("region", v)} />
          <Field label="업종 코드" value={manual.industry_code ?? ""} onChange={(v) => updateManual("industry_code", v)} />
          <Field label="주요 생산품" value={manual.main_product ?? ""} onChange={(v) => updateManual("main_product", v)} />
          <Field label="종업원 수" type="number" value={String(manual.employees ?? "")}
            onChange={(v) => updateManual("employees", v ? Number(v) : undefined)} />
        </CardContent>
      </Card>
    </AppShell>
  );
}

function Field({ label, value, onChange, type = "text", required }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}{required && <span className="ml-0.5 text-destructive">*</span>}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} type={type} />
    </div>
  );
}

