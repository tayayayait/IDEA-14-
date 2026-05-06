import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useApiCall } from "@/hooks/useApiCall";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiStateChip, type ApiState } from "@/components/ApiStateChip";
import { TagInput } from "@/components/TagInput";
import { MobileCardList } from "@/components/MobileCardList";
import { Sparkles, Loader2, Check, Building2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { sanitize, sanitizeNullable } from "@/lib/scoring";
import { PROCEED_REVIEW_REQUIRED_LABEL, REQUIRE_PRODUCT_CONFIRMATION_FOR_STEP3 } from "@/lib/step3-entry-policy";
import { filterRelevantHsCandidates } from "@/lib/hs-candidate-relevance";
import {
  decideAutoSelection,
  resolveCandidateScore,
  resolveSelectionStatus,
  sortCandidatesByScore,
  type HsSelectionStatus,
} from "@/lib/hs-selection-policy";

const UNKNOWN_TEXT = "확실한 정보 없음";
const HS_SUGGEST_TIMEOUT_MS = 20000;
const RECOMMEND_COUNTRIES_TIMEOUT_MS = 120000;
type HsSelectionSource = "auto" | "manual";

interface HsCandidate {
  hs_code: string;
  hsk_code?: string;
  description: string;
  confidence: number;
  source?: "CUSTOMS_HS";
  official_name_ko?: string;
  official_name_en?: string;
  standard_name?: string | null;
  required_specs?: string | null;
  match_reason?: string;
  match_score?: number;
}
interface CompanySummary {
  company_name: string;
  industrial_complex: string | null;
  industry_code: string | null;
  raw: Record<string, unknown> | null;
}

interface ProductMeta {
  tags: string[];
  modelName?: string;
  targetMarketNote?: string;
  hsSelectionSource?: HsSelectionSource;
  hsReviewRequired?: boolean;
  hsSelectionScore?: number | null;
  hsSelectionStatus?: HsSelectionStatus;
  hsSelectedCandidateKey?: string | null;
}

interface ProductSeed {
  name: string;
  tags: string[];
}

interface CandidateRelevanceContext {
  name: string;
  description?: string;
  components?: string[];
}

interface DescriptionDraftResponse {
  description?: string;
  rationale?: string | null;
  state?: ApiState;
  message?: string;
}

export default function Step2Product() {
  useAuthGuard();
  const { invoke, retryInSec, isRetrying } = useApiCall();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [modelName, setModelName] = useState("");
  const [targetMarketNote, setTargetMarketNote] = useState("");
  const [description, setDescription] = useState("");
  const [componentTags, setComponentTags] = useState<string[]>([]);
  const [hsCode, setHsCode] = useState("");
  const [hskCode, setHskCode] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [candidates, setCandidates] = useState<HsCandidate[]>([]);
  const [aiState, setAiState] = useState<ApiState>("idle");
  const [aiRationale, setAiRationale] = useState<string | null>(null);
  const [descriptionAiState, setDescriptionAiState] = useState<ApiState>("idle");
  const [descriptionAiRationale, setDescriptionAiRationale] = useState<string | null>(null);
  const [companySummary, setCompanySummary] = useState<CompanySummary | null>(null);
  const [hsSelectionSource, setHsSelectionSource] = useState<HsSelectionSource | null>(null);
  const [hsReviewRequired, setHsReviewRequired] = useState(false);
  const [hsSelectionScore, setHsSelectionScore] = useState<number | null>(null);
  const [hsSelectionStatus, setHsSelectionStatus] = useState<HsSelectionStatus | null>(null);
  const [hsSelectedCandidateKey, setHsSelectedCandidateKey] = useState<string | null>(null);
  const [productRowId, setProductRowId] = useState<string | null>(null);
  const productRowIdRef = useRef<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [preparingRecommendation, setPreparingRecommendation] = useState(false);
  const descriptionTouchedRef = useRef(false);

  const markUnscoredManualInput = () => {
    setConfirmed(false);
    setHsSelectionSource("manual");
    setHsReviewRequired(true);
    setHsSelectionScore(null);
    setHsSelectionStatus(null);
    setHsSelectedCandidateKey(null);
  };

  const applyCandidateSelection = (candidate: HsCandidate, source: HsSelectionSource, preserveConfirmed = false) => {
    const score = resolveCandidateScore(candidate);
    const status = resolveSelectionStatus(score);
    setHsCode(normalizeCode(candidate.hs_code));
    setHskCode(normalizeCode(candidate.hsk_code ?? ""));
    setHsSelectionSource(source);
    setHsReviewRequired(status !== "high_confidence");
    setHsSelectionScore(score);
    setHsSelectionStatus(status);
    setHsSelectedCandidateKey(getCandidateKey(candidate));
    if (!preserveConfirmed) {
      setConfirmed(source === "manual");
    }
  };

  const applyAutoSelection = (items: HsCandidate[]) => {
    const ranked = sortCandidatesByScore(items, getCandidateKey);
    const decision = decideAutoSelection(ranked);
    if (!decision.topCandidate) return;

    if (decision.selectedCandidate) {
      applyCandidateSelection(decision.selectedCandidate, "auto");
      return;
    }

    setHsCode("");
    setHskCode("");
    setHsSelectionSource(null);
    setHsReviewRequired(decision.reviewRequired);
    setHsSelectionScore(decision.topScore);
    setHsSelectionStatus(decision.status);
    setHsSelectedCandidateKey(getCandidateKey(decision.topCandidate));
    setConfirmed(false);
  };

  const syncSelectionMetaFromLoadedData = (
    loadedMeta: ProductMeta,
    loadedCandidates: HsCandidate[],
    loadedHsCode: string,
    loadedHskCode: string,
    loadedConfirmed: boolean,
  ) => {
    const source = loadedMeta.hsSelectionSource ?? (loadedConfirmed ? "manual" : "auto");
    const selectedCandidate = findCandidateByCodes(loadedCandidates, loadedHsCode, loadedHskCode);
    const storedScore = Number.isFinite(loadedMeta.hsSelectionScore)
      ? Math.max(0, Math.min(100, Number(loadedMeta.hsSelectionScore)))
      : null;
    const score = selectedCandidate ? resolveCandidateScore(selectedCandidate) : storedScore;
    const status = loadedMeta.hsSelectionStatus ?? (score !== null ? resolveSelectionStatus(score) : null);

    setHsSelectionSource(source);
    setHsSelectionScore(score);
    setHsSelectionStatus(status);
    setHsSelectedCandidateKey(
      loadedMeta.hsSelectedCandidateKey
      ?? (selectedCandidate ? getCandidateKey(selectedCandidate) : null),
    );
    setHsReviewRequired(
      typeof loadedMeta.hsReviewRequired === "boolean"
        ? loadedMeta.hsReviewRequired
        : status !== "high_confidence",
    );
  };

  const persistDescriptionDraft = async ({
    draft,
    productName,
    rationale,
    tags,
  }: {
    draft: string;
    productName: string;
    rationale: string | null;
    tags: string[];
  }) => {
    if (!id) return;

    const components = JSON.stringify({
      tags,
      modelName: modelName.trim() || undefined,
      targetMarketNote: targetMarketNote.trim() || undefined,
      hsSelectionSource: hsSelectionSource ?? undefined,
      hsReviewRequired,
      hsSelectionScore,
      hsSelectionStatus: hsSelectionStatus ?? undefined,
      hsSelectedCandidateKey,
    } satisfies ProductMeta);
    const payload = {
      name: productName,
      description: draft,
      components,
      ai_rationale: rationale,
    };

    const targetId = productRowIdRef.current ?? productRowId ?? await findLatestProductRowId(id);
    if (targetId) {
      const { error } = await supabase.from("project_products").update(payload).eq("id", targetId);
      if (error) {
        toast.warning("AI 설명 초안은 화면에 반영됐지만 저장하지 못했습니다.");
        return;
      }
      productRowIdRef.current = targetId;
      setProductRowId(targetId);
      return;
    }

    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      toast.warning("로그인 세션을 확인할 수 없어 AI 설명 초안을 저장하지 못했습니다.");
      return;
    }

    const { data: inserted, error } = await supabase
      .from("project_products")
      .insert({
        ...payload,
        project_id: id,
        user_id: u.user.id,
      })
      .select("id")
      .maybeSingle();

    if (error) {
      toast.warning("AI 설명 초안은 화면에 반영됐지만 저장하지 못했습니다.");
      return;
    }
    const insertedId = typeof inserted?.id === "string" ? inserted.id : null;
    productRowIdRef.current = insertedId;
    setProductRowId(insertedId);
  };

  const generateDescriptionDraft = async ({
    productName,
    tags,
    company,
    force = false,
    silent = false,
  }: {
    productName?: string;
    tags?: string[];
    company?: CompanySummary | null;
    force?: boolean;
    silent?: boolean;
  } = {}) => {
    const nextName = (productName ?? name).trim();
    const nextTags = tags ?? componentTags;
    const nextCompany = company ?? companySummary;
    if (!nextName) {
      if (!silent) toast.warning("제품명을 먼저 입력해 주세요");
      return;
    }

    setDescriptionAiState("loading");
    const result = await invoke<DescriptionDraftResponse>(
      "ai-product-description",
      buildDescriptionDraftPayload({
        name: nextName,
        tags: nextTags,
        company: nextCompany,
      }),
    );

    if (!result.ok) {
      setDescriptionAiState(result.state);
      if (!silent) {
        const message = result.message ?? "AI 설명 초안 생성 실패";
        if (result.state === "partial_success") {
          toast.warning(message);
        } else {
          toast.error(message);
        }
      }
      return;
    }

    const draft = buildDescriptionParagraphs(sanitize(result.data?.description ?? ""));
    if (!draft) {
      setDescriptionAiState("empty");
      if (!silent) toast.warning("AI 설명 초안을 생성하지 못했습니다.");
      return;
    }

    descriptionTouchedRef.current = true;
    setDescription((prev) => {
      if (!force && prev.trim().length > 0) return prev;
      return draft;
    });

    const rationale = sanitizeNullable(result.data?.rationale);
    setDescriptionAiRationale(rationale);
    setDescriptionAiState((result.data?.state as ApiState | undefined) ?? "success");
    if (!silent) {
      void persistDescriptionDraft({
        draft,
        productName: nextName,
        rationale,
        tags: nextTags,
      });
    }
  };

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    descriptionTouchedRef.current = false;
    productRowIdRef.current = null;
    setProductRowId(null);
    (async () => {
      const [productRes, companyRes] = await Promise.all([
        supabase.from("project_products").select("*").eq("project_id", id).maybeSingle(),
        supabase.from("project_companies")
          .select("company_name,industrial_complex,industry_code,raw")
          .eq("project_id", id)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      const product = productRes.data;
      const company = (companyRes.data as CompanySummary | null) ?? null;
      setCompanySummary(company);

      if (product) {
        const loadedName = product.name;
        const loadedDescription = product.description ?? "";
        const meta = parseProductMeta(product.components ?? "");
        const loadedCandidates = normalizeCandidates(
          (product.hs_candidates as unknown as HsCandidate[] | null) ?? [],
          { name: loadedName, description: loadedDescription, components: meta.tags },
        );
        const loadedRationale = sanitizeNullable(product.ai_rationale);
        const loadedHsCode = normalizeCode(product.hs_code ?? "");
        const loadedHskCode = normalizeCode(product.hsk_code ?? "");

        const loadedProductRowId = typeof product.id === "string" ? product.id : null;
        productRowIdRef.current = loadedProductRowId;
        setProductRowId(loadedProductRowId);
        setName(loadedName);
        setDescription((prev) => (descriptionTouchedRef.current ? prev : loadedDescription));
        setComponentTags(meta.tags);
        setModelName(meta.modelName ?? "");
        setTargetMarketNote(meta.targetMarketNote ?? "");
        setHsCode(loadedHsCode);
        setHskCode(loadedHskCode);
        setConfirmed(product.confirmed);
        setCandidates(loadedCandidates);
        setAiRationale(loadedRationale);
        syncSelectionMetaFromLoadedData(meta, loadedCandidates, loadedHsCode, loadedHskCode, product.confirmed);

        if (
          hasEnglishHsOutput(loadedCandidates, loadedRationale) &&
          loadedName.trim().length > 0 &&
          isDescriptionValid(loadedDescription)
        ) {
          setAiState("loading");
          const refreshResult = await invoke<{ candidates?: HsCandidate[]; rationale?: string | null; state?: ApiState }>(
            "ai-hs-suggest",
            {
              name: loadedName,
              model_name: meta.modelName ?? "",
              target_market_note: meta.targetMarketNote ?? "",
              description: loadedDescription,
              components: meta.tags.join(", "),
              industry_code: company?.industry_code ?? "",
            },
            { timeoutMs: HS_SUGGEST_TIMEOUT_MS, retryOn429: false, retryOn500: true, retry500DelayMs: 800 },
          );

          if (cancelled) return;

          if (refreshResult.ok) {
            const refreshedCandidates = normalizeCandidates(refreshResult.data?.candidates ?? [], {
              name: loadedName,
              description: loadedDescription,
              components: meta.tags,
            });
            setCandidates(refreshedCandidates);
            setAiRationale(sanitizeNullable(refreshResult.data?.rationale));
            setAiState((refreshResult.data?.state as ApiState | undefined) ?? (refreshedCandidates.length ? "success" : "empty"));
            if (!product.confirmed && refreshedCandidates.length > 0) {
              applyAutoSelection(refreshedCandidates);
            } else {
              syncSelectionMetaFromLoadedData(meta, refreshedCandidates, loadedHsCode, loadedHskCode, product.confirmed);
            }
          } else {
            setAiState(refreshResult.state);
          }
        }
        return;
      }

      setProductRowId(null);
      const seeded = buildSeedFromCompany(company);
      if (!seeded) return;

      setName((prev) => prev || seeded.name);
      setComponentTags((prev) => (prev.length ? prev : seeded.tags));

      setDescriptionAiState("loading");
      const draftResult = await invoke<DescriptionDraftResponse>(
        "ai-product-description",
        buildDescriptionDraftPayload({
          name: seeded.name,
          tags: seeded.tags,
          company,
        }),
      );

      if (cancelled) return;

      if (!draftResult.ok) {
        setDescriptionAiState(draftResult.state);
        return;
      }

      const draft = buildDescriptionParagraphs(sanitize(draftResult.data?.description ?? ""));
      if (!draft) {
        setDescriptionAiState("empty");
        return;
      }

      setDescription((prev) => (prev.trim().length > 0 ? prev : draft));
      setDescriptionAiRationale(sanitizeNullable(draftResult.data?.rationale));
      setDescriptionAiState((draftResult.data?.state as ApiState | undefined) ?? "success");
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const componentsText = componentTags.join(", ");
  const productNameTokens = splitProductNameTokens(name);
  const hasMixedProductName = productNameTokens.length > 1;
  const itemSplitRequired = hasMixedProductName;
  const effectiveSelectionStatus: HsSelectionStatus | null = itemSplitRequired ? "review_required" : hsSelectionStatus;
  const effectiveReviewRequired = hsReviewRequired || itemSplitRequired;
  const selectionMeta = getSelectionStatusMeta(effectiveSelectionStatus, itemSplitRequired, hsSelectionSource);

  const askAi = async () => {
    if (!name) return toast.warning("제품명을 입력해 주세요");
    if (!isDescriptionValid(description)) return toast.warning("제품 설명은 20자 이상 1000자 이하로 입력해 주세요");
    setAiState("loading");
    const result = await invoke<{ candidates?: HsCandidate[]; rationale?: string | null; state?: ApiState; message?: string }>(
      "ai-hs-suggest",
      {
        name,
        model_name: modelName,
        target_market_note: targetMarketNote,
        description,
        components: componentsText,
        industry_code: companySummary?.industry_code ?? "",
      },
      { timeoutMs: HS_SUGGEST_TIMEOUT_MS, retryOn429: false, retryOn500: true, retry500DelayMs: 800 },
    );

    if (!result.ok) {
      setAiState(result.state);
      const message = result.message ?? "AI 추천 실패";
      if (result.state === "partial_success") {
        toast.warning(message);
      } else {
        toast.error(message);
      }
      return;
    }

    const suggested = normalizeCandidates(result.data?.candidates ?? [], {
      name,
      description,
      components: componentTags,
    });
    setCandidates(suggested);
    setAiRationale(sanitizeNullable(result.data?.rationale));
    setAiState((result.data?.state as ApiState | undefined) ?? (suggested.length ? "success" : "empty"));
    if ((result.data?.state as ApiState | undefined) === "partial_success") {
      toast.warning(result.message ?? "일부 후보만 생성되어 검토가 필요합니다.");
    }
    if (suggested.length === 0) {
      setHsSelectionSource(null);
      setHsSelectionStatus(null);
      setHsSelectionScore(null);
      setHsReviewRequired(false);
      setHsSelectedCandidateKey(null);
      return;
    }
    applyAutoSelection(suggested);
  };

  const saveAndNext = async () => {
    if (!id || !name) return;
    if (REQUIRE_PRODUCT_CONFIRMATION_FOR_STEP3 && !confirmed) {
      return toast.warning("확정 체크 후 Step 3으로 이동할 수 있습니다.");
    }

    const normalizedHsCode = normalizeCode(hsCode);
    const normalizedHskCode = normalizeCode(hskCode);
    const normalizedSelectionStatus: HsSelectionStatus | null = itemSplitRequired ? "review_required" : hsSelectionStatus;
    const normalizedReviewRequired = hsReviewRequired || itemSplitRequired;

    if (!isDescriptionValid(description)) return toast.warning("제품 설명은 20자 이상 1000자 이하로 입력해 주세요");
    if (candidates.length > 0 && (!normalizedHsCode || !normalizedHskCode)) {
      return toast.warning("후보에서 HS/HSK 코드를 선택한 뒤 다음 단계로 진행해 주세요.");
    }
    if (!isValidCode(normalizedHsCode)) return toast.warning("HS 코드는 숫자 6~10자리로 입력해 주세요");
    if (!isValidCode(normalizedHskCode)) return toast.warning("HSK 코드는 숫자 6~10자리로 입력해 주세요");
    setHsCode(normalizedHsCode);
    setHskCode(normalizedHskCode);
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setSaving(false);
      return;
    }
    await supabase.from("project_products").delete().eq("project_id", id);
    const { error } = await supabase.from("project_products").insert({
      project_id: id, user_id: u.user.id,
      name,
      description,
      components: JSON.stringify({
        tags: componentTags,
        modelName: modelName.trim() || undefined,
        targetMarketNote: targetMarketNote.trim() || undefined,
        hsSelectionSource: hsSelectionSource ?? undefined,
        hsReviewRequired: normalizedReviewRequired,
        hsSelectionScore,
        hsSelectionStatus: normalizedSelectionStatus ?? undefined,
        hsSelectedCandidateKey,
      } satisfies ProductMeta),
      hs_code: normalizedHsCode || null, hsk_code: normalizedHskCode || null,
      hs_candidates: candidates as never, confirmed, ai_rationale: aiRationale,
    });

    if (error) {
      setSaving(false);
      return toast.error(error.message);
    }

    setPreparingRecommendation(true);
    const recommendationResult = await invoke<{
      state?: ApiState;
      message?: string;
      ai_used?: boolean;
      fallback_used?: boolean;
    }>(
      "recommend-countries",
      { project_id: id, require_ai: true },
      { timeoutMs: RECOMMEND_COUNTRIES_TIMEOUT_MS, retryOn500: false },
    );
    setPreparingRecommendation(false);

    if (!recommendationResult.ok || recommendationResult.data?.ai_used !== true) {
      setSaving(false);
      const message = sanitizeNullable(recommendationResult.message) ??
        "AI 후보국 추천 해석이 완료되지 않아 3단계로 이동하지 않았습니다.";
      return toast.error(message);
    }

    setSaving(false);
    if (!confirmed && !REQUIRE_PRODUCT_CONFIRMATION_FOR_STEP3) {
      toast.warning(`${PROCEED_REVIEW_REQUIRED_LABEL}: Step 3에서 코드 근거를 다시 확인하세요.`);
    }
    navigate(`/projects/${id}/countries`);
  };

  const nextActionLabel = saving
    ? (preparingRecommendation ? "AI 추천 분석 중..." : "저장 중...")
    : REQUIRE_PRODUCT_CONFIRMATION_FOR_STEP3 && !confirmed
      ? "확정 체크 필요"
      : !confirmed
        ? PROCEED_REVIEW_REQUIRED_LABEL
        : "저장 후 다음 단계";

  return (
    <AppShell
      currentStep={2}
      evidence={
        <div className="space-y-3 text-sm">
          <h3 className="font-display font-semibold">근거 · 출처</h3>
          <p className="text-muted-foreground">
            HS·HSK 후보는 관세청 공식 코드 데이터(HS부호/표준품명)에서 검색한 결과를 기준으로 정렬해 제시합니다. AI는 후보 재정렬과 요약 근거 보조에만 사용됩니다.
          </p>
          <div className="rounded-md bg-muted p-3">
            <p className="font-medium">HS 후보 검색 상태</p>
            <ApiStateChip state={aiState} className="mt-1" />
            {aiRationale && <p className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">{aiRationale}</p>}
          </div>
        </div>
      }
      actionBar={
        <>
          <Button variant="ghost" onClick={() => navigate(`/projects/${id}/company`)}>이전</Button>
          <Button onClick={saveAndNext} disabled={saving || preparingRecommendation || !name || (REQUIRE_PRODUCT_CONFIRMATION_FOR_STEP3 && !confirmed)}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}{nextActionLabel}
          </Button>
        </>
      }
    >
      {companySummary && (
        <Card className="mb-4 border border-border bg-muted/30">
          <CardContent className="flex items-center gap-3 p-4">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <div className="text-sm">
              <p className="font-medium">{companySummary.company_name}</p>
              <p className="text-muted-foreground">
                {companySummary.industrial_complex ?? "산단 정보 없음"} · 업종 {companySummary.industry_code ?? "미입력"}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mb-6">
        <h1 className="font-display text-xl font-semibold">2. 제품·HS 코드</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          제품 정보를 입력하면 관세청 공식 코드표에서 HS/HSK 후보를 검색합니다. 확정 토글로 분석에 사용할 코드를 선택하세요.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">제품 정보</CardTitle>
          <CardDescription>핵심 부품·소재·용도를 함께 적으면 정확도가 높아집니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>제품명 <span className="text-destructive">*</span></Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예) 전기차용 BLDC 모터" />
            {hasMixedProductName ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                <p className="font-semibold">품목 분리 필요</p>
                <p className="mt-1">
                  현재 제품명에 {productNameTokens.length}개 품목이 포함되어 있습니다. 품목별로 나눠 입력하고, 확정 코드는 실제 수출
                  계약 기준의 <span className="font-medium">주력 1개 품목</span>으로 선택하세요.
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">제품명을 1개 품목으로 입력하면 HS·HSK 후보 정확도가 높아집니다.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>모델명</Label>
            <Input value={modelName} onChange={(e) => setModelName(e.target.value)} placeholder="예) BLDC-MTR-3000" />
          </div>
          <div className="space-y-1.5">
            <Label>목표 시장 메모</Label>
            <Textarea
              rows={2}
              value={targetMarketNote}
              onChange={(e) => setTargetMarketNote(e.target.value)}
              placeholder="예) 동남아 OEM 공급, 1차 베트남·인도네시아 우선"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <Label>제품 설명 <span className="text-destructive">*</span></Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={descriptionAiState === "loading" || !name.trim()}
                onClick={() => void generateDescriptionDraft({ force: true, silent: false })}
              >
                {descriptionAiState === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                AI 설명 초안 작성
              </Button>
            </div>
            <Textarea rows={3} value={description} onChange={(e) => {
              descriptionTouchedRef.current = true;
              setDescription(e.target.value);
            }}
              placeholder="용도, 정격 출력, 소재, 인증, 응용 분야 등 (20~1000자)" />
            <p className="text-xs text-muted-foreground">{description.length}/1000자</p>
            {(descriptionAiState !== "idle" || descriptionAiRationale) && (
              <div className="space-y-1">
                <ApiStateChip state={descriptionAiState} />
                {descriptionAiRationale && (
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">{descriptionAiRationale}</p>
                )}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>주요 부품/소재</Label>
            <TagInput
              value={componentTags}
              onChange={setComponentTags}
              placeholder="부품/소재 입력 후 Enter (최대 20개)"
              maxTags={20}
              maxLength={30}
            />
          </div>
          <Button variant="outline" onClick={askAi} disabled={aiState === "loading"}>
            {aiState === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            공식 데이터 기반 후보 검색
          </Button>
          {isRetrying && retryInSec > 0 && (
            <p className="text-xs text-risk-reviewable">
              요청 한도 초과로 자동 재시도 대기 중입니다. {retryInSec}초 후 다시 호출합니다.
            </p>
          )}
        </CardContent>
      </Card>

      {candidates.length > 0 && (
        <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">HS·HSK 후보</CardTitle>
          <CardDescription>후보 점수 1순위 코드를 자동 반영합니다. 필요하면 직접 변경해 확정하세요.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">복수 품목 입력 시 후보 선택 기준</p>
            <ol className="mt-2 list-decimal space-y-1 pl-4">
                <li>확정 코드는 실제 수출 계약·인보이스에 기재될 주력 1개 품목 기준으로 선택합니다.</li>
                <li>후보 점수는 키워드 매칭 보조 지표입니다. 설명이 핵심 기능·작동 원리·재질과 불일치하면 제외합니다.</li>
                <li>HS 6단위가 맞으면 HSK 10단위는 용도·규격이 더 구체적으로 맞는 후보를 선택합니다.</li>
              <li>서로 다른 품목이면 품목별로 나눠 조회해 각각 코드로 관리합니다.</li>
            </ol>
          </div>
          <div className="mb-4 rounded-md border border-border bg-muted/30 p-3 text-xs">
            <p className="font-medium text-foreground">
              선택 상태: {selectionMeta.label}
              {hsSelectionScore !== null ? ` (${Math.round(hsSelectionScore)}점)` : ""}
            </p>
            <p className="mt-1 text-muted-foreground">{selectionMeta.description}</p>
            <p className="mt-1 text-muted-foreground">
              적용 방식: {getSelectionApplyModeText(hsSelectionSource, effectiveSelectionStatus, hsSelectedCandidateKey)}
            </p>
            {effectiveReviewRequired && (
              <p className="mt-1 text-risk-reviewable">현재 코드는 확인 필요 상태입니다. 계약/인보이스 기준으로 최종 확인하세요.</p>
            )}
            {!confirmed && !REQUIRE_PRODUCT_CONFIRMATION_FOR_STEP3 ? (
              <p className="mt-1 text-risk-reviewable">{PROCEED_REVIEW_REQUIRED_LABEL}: 다음 단계에서 근거를 확인하며 진행합니다.</p>
            ) : null}
          </div>

            <MobileCardList
              items={candidates}
              getKey={(c) => getCandidateKey(c)}
              renderCard={(c) => {
                const sel = isCandidateSelected(c, hsCode, hskCode);
                return (
                  <div className="space-y-2 text-sm">
                    <p className="font-mono text-xs">HS {c.hs_code} · HSK {c.hsk_code ?? "-"}</p>
                    <p>{c.description}</p>
                    <p className="text-xs text-muted-foreground">후보 점수 {resolveCandidateScore(c)}점</p>
                    {c.match_reason && <p className="text-xs text-muted-foreground">근거: {c.match_reason}</p>}
                    <Button
                      size="sm"
                      variant={sel ? "default" : "outline"}
                      className="min-h-11 min-w-11"
                      onClick={() => applyCandidateSelection(c, "manual")}
                    >
                      {sel && <Check className="h-3.5 w-3.5" />}{sel ? "선택됨" : "선택"}
                    </Button>
                  </div>
                );
              }}
            />

            <div className="hidden overflow-hidden rounded-lg border border-border md:block">
              <table className="w-full text-sm" aria-label="HS HSK 후보 표">
                <caption className="sr-only">AI 추천 HS 및 HSK 코드 후보 목록</caption>
                <thead className="bg-muted/60 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">HS 코드</th>
                    <th className="px-3 py-2 text-left">HSK</th>
                    <th className="px-3 py-2 text-left">설명</th>
                    <th className="px-3 py-2 text-right">후보 점수</th>
                    <th className="px-3 py-2 text-right">선택</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {candidates.map((c) => {
                    const sel = isCandidateSelected(c, hsCode, hskCode);
                    return (
                      <tr key={getCandidateKey(c)} className={sel ? "bg-brand-soft/40" : "hover:bg-muted/30"}>
                        <td className="px-3 py-3 font-mono text-xs">{c.hs_code}</td>
                        <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{c.hsk_code ?? "-"}</td>
                        <td className="px-3 py-3">{c.description}</td>
                        <td className="px-3 py-3 text-right text-muted-foreground">{resolveCandidateScore(c)}점</td>
                        <td className="px-3 py-3 text-right">
                          <Button size="sm" variant={sel ? "default" : "outline"} className="min-h-11 min-w-11"
                            onClick={() => applyCandidateSelection(c, "manual")}>
                            {sel && <Check className="h-3.5 w-3.5" />}{sel ? "선택됨" : "선택"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">확정 코드</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5"><Label>HS</Label>
            <Input
              value={hsCode}
              onChange={(e) => {
                setHsCode(e.target.value.replace(/\D/g, ""));
                markUnscoredManualInput();
              }}
              placeholder="예) 850140"
            />
            <p className="text-xs text-muted-foreground">숫자 6~10자리</p>
          </div>
          <div className="space-y-1.5"><Label>HSK</Label>
            <Input
              value={hskCode}
              onChange={(e) => {
                setHskCode(e.target.value.replace(/\D/g, ""));
                markUnscoredManualInput();
              }}
              placeholder="예) 8501401010"
            />
            <p className="text-xs text-muted-foreground">숫자 6~10자리</p>
          </div>
          <label className="md:col-span-2 flex cursor-pointer items-center gap-2 rounded-md border border-border p-3 hover:bg-muted/30">
            <input type="checkbox" checked={confirmed} onChange={(e) => {
              const checked = e.target.checked;
              setConfirmed(checked);
              if (checked) {
                setHsSelectionSource("manual");
              }
            }}
              className="h-4 w-4 accent-brand" />
            <span className="text-sm">
              {REQUIRE_PRODUCT_CONFIRMATION_FOR_STEP3
                ? "Step 3 진행을 위해 확정 체크가 필요합니다"
                : "분석에 이 코드를 사용한다 (확정)"}
            </span>
          </label>
          {REQUIRE_PRODUCT_CONFIRMATION_FOR_STEP3 && !confirmed ? (
            <p className="md:col-span-2 text-xs text-risk-reviewable">
              확정 체크를 완료해야 Step 3으로 이동할 수 있습니다.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </AppShell>
  );
}

async function findLatestProductRowId(projectId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("project_products")
    .select("id")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return typeof data?.id === "string" ? data.id : null;
}

function parseProductMeta(raw: string): ProductMeta {
  if (!raw) return { tags: [] };
  if (!raw.trim().startsWith("{")) {
    return { tags: raw.split(",").map((v) => v.trim()).filter(Boolean) };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ProductMeta> & { tags?: unknown };
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.map((v) => String(v).trim()).filter(Boolean)
      : [];
    return {
      tags,
      modelName: parsed.modelName ? String(parsed.modelName) : undefined,
      targetMarketNote: parsed.targetMarketNote ? String(parsed.targetMarketNote) : undefined,
      hsSelectionSource: parseSelectionSource(parsed.hsSelectionSource),
      hsReviewRequired: typeof parsed.hsReviewRequired === "boolean" ? parsed.hsReviewRequired : undefined,
      hsSelectionScore: Number.isFinite(parsed.hsSelectionScore) ? Number(parsed.hsSelectionScore) : undefined,
      hsSelectionStatus: parseSelectionStatus(parsed.hsSelectionStatus),
      hsSelectedCandidateKey: parsed.hsSelectedCandidateKey ? String(parsed.hsSelectedCandidateKey) : undefined,
    };
  } catch {
    return { tags: [] };
  }
}

function normalizeCandidates(items: HsCandidate[], context?: CandidateRelevanceContext): HsCandidate[] {
  const unique = new Map<string, HsCandidate>();

  for (const candidate of items) {
    const officialKo = sanitize(candidate.official_name_ko ?? "");
    const officialEn = sanitize(candidate.official_name_en ?? "");
    const standardName = sanitizeNullable(candidate.standard_name ?? null);
    const requiredSpecs = sanitizeNullable(candidate.required_specs ?? null);
    const matchReason = sanitizeNullable(candidate.match_reason ?? null);
    const matchScore = Number.isFinite(candidate.match_score)
      ? Math.max(0, Math.min(100, Number(candidate.match_score)))
      : undefined;
    const description = sanitize(candidate.description) || buildFallbackDescription(officialKo, officialEn, standardName);

    const normalized: HsCandidate = {
      hs_code: normalizeCode(candidate.hs_code),
      hsk_code: normalizeCode(candidate.hsk_code ?? "") || undefined,
      description,
      confidence: normalizeConfidence(candidate.confidence),
      source: candidate.source,
      official_name_ko: officialKo || undefined,
      official_name_en: officialEn || undefined,
      standard_name: standardName,
      required_specs: requiredSpecs,
      match_reason: matchReason ?? undefined,
      match_score: matchScore,
    };
    if (!normalized.hs_code) continue;

    const key = getCandidateKey(normalized);
    const existing = unique.get(key);
    if (!existing || shouldPreferCandidate(normalized, existing)) {
      unique.set(key, normalized);
    }
  }

  const sorted = sortCandidatesByScore(Array.from(unique.values()), getCandidateKey);
  if (!context) return sorted;
  return filterRelevantHsCandidates(sorted, {
    productName: context.name,
    description: context.description,
    components: context.components,
  });
}

function getCandidateKey(candidate: HsCandidate): string {
  const hs = normalizeCode(candidate.hs_code);
  const hsk = normalizeCode(candidate.hsk_code ?? "");
  return `${hs}:${hsk || "none"}`;
}

function buildSeedFromCompany(company: CompanySummary | null): ProductSeed | null {
  if (!company) return null;
  const raw = asRecord(company.raw);
  const mainProduct = cleanText(readString(raw.main_product));
  const productKeyword = cleanText(readString(raw.product_keyword));
  const productName = mainProduct || productKeyword;
  if (!productName) return null;

  const tags = buildTags(mainProduct, productKeyword);

  return {
    name: productName,
    tags,
  };
}

function buildDescriptionDraftPayload({
  name,
  tags,
  company,
}: {
  name: string;
  tags: string[];
  company: CompanySummary | null;
}) {
  const raw = asRecord(company?.raw ?? null);
  return {
    name,
    components: tags.join(", "),
    company_name: company?.company_name ?? null,
    industrial_complex: company?.industrial_complex ?? null,
    industry_code: company?.industry_code ?? null,
    main_product: cleanText(readString(raw.main_product)) || null,
    product_keyword: cleanText(readString(raw.product_keyword)) || null,
    region: cleanText(readString(raw.region)) || null,
  };
}

function buildTags(mainProduct: string, productKeyword: string): string[] {
  const items = [...splitTokens(mainProduct), ...splitTokens(productKeyword)];
  return [...new Set(items)].slice(0, 20);
}

function splitTokens(text: string): string[] {
  if (!text) return [];
  return text
    .split(/[,\|/·•]+/g)
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => (v.length > 30 ? v.slice(0, 30) : v));
}

function splitProductNameTokens(text: string): string[] {
  if (!text) return [];
  return [...new Set(
    text
      .split(/[,\|/·•]+/g)
      .map((v) => v.trim().replace(/\s+/g, " "))
      .filter(Boolean),
  )];
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function buildDescriptionParagraphs(text: string): string {
  const normalized = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");
  if (!normalized) return "";

  const sentences = normalized
    .match(/[^.!?。！？]+[.!?。！？]+(?:["'”’)]*)?|[^.!?。！？]+$/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean);

  return sentences?.length ? sentences.join("\n\n") : normalized;
}

function normalizeCode(code: string): string {
  return code.replace(/\D/g, "");
}

function normalizeConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function shouldPreferCandidate(next: HsCandidate, current: HsCandidate): boolean {
  const scoreDiff = resolveCandidateScore(next) - resolveCandidateScore(current);
  if (scoreDiff !== 0) return scoreDiff > 0;
  const confidenceDiff = normalizeConfidence(next.confidence) - normalizeConfidence(current.confidence);
  if (confidenceDiff !== 0) return confidenceDiff > 0;
  return getCandidateKey(next).localeCompare(getCandidateKey(current)) < 0;
}

function getSelectionApplyModeText(
  source: HsSelectionSource | null,
  status: HsSelectionStatus | null,
  selectedCandidateKey: string | null,
): string {
  if (source === "manual") return "사용자 수동 선택";
  if (source === "auto") return "후보 점수 1순위 자동 반영";
  if (status === "review_required" && selectedCandidateKey) return "저신뢰 후보 자동 반영 보류";
  return "선택 이력 없음";
}

function getSelectionStatusMeta(
  status: HsSelectionStatus | null,
  itemSplitRequired: boolean,
  source: HsSelectionSource | null,
): { label: string; description: string } {
  if (itemSplitRequired) {
    return {
      label: "품목 분리 필요",
      description: "복수 품목이 감지되어 코드 오분류 가능성이 높습니다. 품목별로 분리 입력 후 확정하세요.",
    };
  }

  if (status === "high_confidence") {
    return {
      label: "자동 선택 · 신뢰 높음",
      description: "공식 데이터 키워드 매칭 기준 상위 후보입니다.",
    };
  }
  if (status === "review_required") {
    return {
      label: source === null ? "자동 반영 보류 · 확인 필요" : "자동 선택 · 확인 필요",
      description: source === null
        ? "저신뢰 후보는 자동 반영하지 않습니다. 계약/인보이스 기준으로 코드를 직접 선택하세요."
        : "분석은 진행 가능하지만 계약/인보이스 기준으로 코드 확인이 필요합니다.",
    };
  }
  if (status === "insufficient") {
    return {
      label: "임시 후보 · 정보 부족",
      description: "유효 후보는 있으나 제품 정보가 부족해 오분류 가능성이 있습니다.",
    };
  }
  return {
    label: "선택 상태 없음",
    description: "후보 검색 후 자동 선택되거나 사용자가 직접 선택하면 상태가 표시됩니다.",
  };
}

function findCandidateByCodes(candidates: HsCandidate[], hsCode: string, hskCode: string): HsCandidate | undefined {
  const hs = normalizeCode(hsCode);
  const hsk = normalizeCode(hskCode);
  return candidates.find((candidate) => {
    const candidateHs = normalizeCode(candidate.hs_code);
    const candidateHsk = normalizeCode(candidate.hsk_code ?? "");
    if (!candidateHs) return false;
    if (hsk) return candidateHs === hs && candidateHsk === hsk;
    return candidateHs === hs;
  });
}

function isCandidateSelected(candidate: HsCandidate, hsCode: string, hskCode: string): boolean {
  const selectedHs = normalizeCode(hsCode);
  const selectedHsk = normalizeCode(hskCode);
  const candidateHs = normalizeCode(candidate.hs_code);
  const candidateHsk = normalizeCode(candidate.hsk_code ?? "");
  if (!selectedHs || !candidateHs) return false;
  if (selectedHsk) {
    return selectedHs === candidateHs && selectedHsk === candidateHsk;
  }
  return selectedHs === candidateHs;
}

function parseSelectionSource(value: unknown): HsSelectionSource | undefined {
  if (value === "auto" || value === "manual") return value;
  return undefined;
}

function parseSelectionStatus(value: unknown): HsSelectionStatus | undefined {
  if (value === "high_confidence" || value === "review_required" || value === "insufficient") {
    return value;
  }
  return undefined;
}

function buildFallbackDescription(officialKo: string, officialEn: string, standardName: string | null): string {
  const ko = officialKo || UNKNOWN_TEXT;
  const en = officialEn ? ` (${officialEn})` : "";
  if (standardName && standardName !== ko) {
    return `${ko}${en} · 표준품명: ${standardName}`;
  }
  return `${ko}${en}`;
}

function isDescriptionValid(text: string): boolean {
  const len = text.trim().length;
  return len >= 20 && len <= 1000;
}

function isValidCode(code: string): boolean {
  if (!code) return true;
  return /^\d{6,10}$/.test(code);
}

function hasEnglishHsOutput(candidates: HsCandidate[], rationale: string | null): boolean {
  const texts = [rationale ?? "", ...candidates.map((candidate) => candidate.description)];
  return texts.some((text) => isLikelyEnglishText(text));
}

function isLikelyEnglishText(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  const alphabetCount = (text.match(/[A-Za-z]/g) ?? []).length;
  const hangulCount = (text.match(/[가-힣]/g) ?? []).length;
  return alphabetCount >= 12 && hangulCount === 0;
}

