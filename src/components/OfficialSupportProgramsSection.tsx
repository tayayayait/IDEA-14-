import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { normalizeExternalUrl } from "@/lib/url-validator";

interface OfficialSupportProgram {
  id: string;
  title: string;
  ministry: string;
  agency: string;
  category: string;
  target: string;
  summary: string;
  applicationMethod: string;
  applicationUrl: string;
  detailUrl: string;
  applicationPeriod: string;
  applicationStatus: "open" | "check_required";
  applicationStatusLabel: string;
  matchReasons: string[];
  verdictEvidence: string[];
  programEvidence: string[];
  eligibilityNotes: string[];
}

interface VerdictSignal {
  source: "action" | "risk" | "summary";
  text: string;
}

interface Props {
  projectId: string;
  productName: string;
  countryName: string;
  verdictSignals: VerdictSignal[];
}

type LoadState = "loading" | "success" | "error";

export function OfficialSupportProgramsSection({
  projectId,
  productName,
  countryName,
  verdictSignals,
}: Props) {
  const [state, setState] = useState<LoadState>("loading");
  const [programs, setPrograms] = useState<OfficialSupportProgram[]>([]);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const loadPrograms = useCallback(async () => {
    setState("loading");
    try {
      const { data, error } = await supabase.functions.invoke(
        "api-bizinfo-support",
        {
          body: {
            project_id: projectId,
            product_name: productName,
            country_name: countryName,
            verdict_signals: verdictSignals,
          },
        },
      );
      if (error) throw new Error(error.message ?? "정부지원사업 조회 실패");

      setPrograms(normalizePrograms(data?.programs));
      setCheckedAt(typeof data?.checked_at === "string" ? data.checked_at : null);
      setState("success");
    } catch (error) {
      console.error(
        "official support programs error:",
        error instanceof Error ? error.message : "unknown error",
      );
      setPrograms([]);
      setState("error");
    }
  }, [countryName, productName, projectId, verdictSignals]);

  useEffect(() => {
    void loadPrograms();
  }, [loadPrograms]);

  return (
    <section className="rounded-lg border border-emerald-200/80 bg-emerald-50/30 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-700" />
            <h3 className="text-xs font-semibold text-foreground">
              AI 맞춤형 정부지원사업 추천
            </h3>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            제품명·HS/HSK 코드와 AI 최종 판단의 위험·대응·실행 방향을
            기업마당 공식 공고와 비교해 AI가 선택한 결과입니다.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1 bg-background text-xs"
          disabled={state === "loading"}
          onClick={() => void loadPrograms()}
        >
          {state === "loading" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          최신 지원사업 다시 확인
        </Button>
      </div>

      {state === "loading" ? (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-border/60 bg-background/70 px-3 py-4 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
          기업마당에서 최신 모집 공고를 확인하고 있습니다.
        </div>
      ) : null}

      {state === "error" ? (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            정부지원사업 정보를 불러오지 못했습니다. 잠시 후 최신 정보 확인을
            다시 실행해 주세요.
          </p>
        </div>
      ) : null}

      {state === "success" && programs.length === 0 ? (
        <div className="mt-3 rounded-md border border-border/60 bg-background/70 px-3 py-4 text-xs text-muted-foreground">
          AI가 현재 수출 업무에 직접 도움이 된다고 판단한 지원사업이 없습니다.
          후보에 없는 사업은 임의로 추천하지 않습니다.
        </div>
      ) : null}

      {state === "success" && programs.length > 0 ? (
        <ul className="mt-3 space-y-2.5">
          {programs.map((program) => {
            const officialUrl =
              normalizeExternalUrl(program.detailUrl) ||
              normalizeExternalUrl(program.applicationUrl);
            return (
              <li
                key={program.id}
                className="rounded-lg border border-emerald-200/70 bg-background p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={
                          program.applicationStatus === "open"
                            ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800"
                            : "rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800"
                        }
                      >
                        {program.applicationStatusLabel}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {program.applicationPeriod || "신청기간 확인 필요"}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm font-semibold leading-snug text-foreground">
                      {program.title}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {[program.ministry, program.agency].filter(Boolean).join(" · ")}
                    </p>
                  </div>

                  {officialUrl ? (
                    <a
                      href={officialUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
                    >
                      공식 공고 보기
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                </div>

                {program.summary ? (
                  <p className="mt-2 text-xs leading-relaxed text-foreground/80">
                    {program.summary}
                  </p>
                ) : null}

                {program.matchReasons.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {program.matchReasons.map((reason) => (
                      <span
                        key={reason}
                        className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        {reason}
                      </span>
                    ))}
                  </div>
                ) : null}

                {program.verdictEvidence.length > 0 ? (
                  <div className="mt-2 rounded-md border border-blue-100 bg-blue-50/50 px-2.5 py-2">
                    <p className="text-[10px] font-semibold text-blue-800">
                      AI 판단 연결 근거
                    </p>
                    <ul className="mt-1 space-y-1 text-[11px] leading-relaxed text-foreground/75">
                      {program.verdictEvidence.map((evidence) => (
                        <li key={evidence}>{evidence}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {program.programEvidence.length > 0 ? (
                  <div className="mt-2 rounded-md border border-emerald-100 bg-emerald-50/40 px-2.5 py-2">
                    <p className="text-[10px] font-semibold text-emerald-800">
                      공고 확인 근거
                    </p>
                    <ul className="mt-1 space-y-1 text-[11px] leading-relaxed text-foreground/75">
                      {program.programEvidence.map((evidence) => (
                        <li key={evidence}>“{evidence}”</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {program.eligibilityNotes.length > 0 ? (
                  <p className="mt-2 text-[11px] text-amber-800">
                    자격 확인 필요: {program.eligibilityNotes.join(" · ")}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {checkedAt && state === "success" ? (
        <p className="mt-2 text-right text-[10px] text-muted-foreground">
          최종 확인 {formatCheckedAt(checkedAt)}
        </p>
      ) : null}
    </section>
  );
}

function normalizePrograms(value: unknown): OfficialSupportProgram[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const id = text(row.id);
      const title = text(row.title);
      const detailUrl = text(row.detailUrl);
      if (!id || !title || !detailUrl) return null;

      return {
        id,
        title,
        ministry: text(row.ministry),
        agency: text(row.agency),
        category: text(row.category),
        target: text(row.target),
        summary: text(row.summary),
        applicationMethod: text(row.applicationMethod),
        applicationUrl: text(row.applicationUrl),
        detailUrl,
        applicationPeriod: text(row.applicationPeriod),
        applicationStatus:
          row.applicationStatus === "open" ? "open" as const : "check_required" as const,
        applicationStatusLabel:
          text(row.applicationStatusLabel) ||
          (row.applicationStatus === "open" ? "모집 중" : "접수 여부 확인"),
        matchReasons: textArray(row.matchReasons),
        verdictEvidence: textArray(row.verdictEvidence),
        programEvidence: textArray(row.programEvidence),
        eligibilityNotes: textArray(row.eligibilityNotes),
      };
    })
    .filter((item): item is OfficialSupportProgram => Boolean(item))
    .slice(0, 3);
}

function formatCheckedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function textArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(text).filter(Boolean)
    : [];
}
