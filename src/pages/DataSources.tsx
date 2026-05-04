import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ExternalLink } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ApiStateChip, type ApiState } from "@/components/ApiStateChip";
import { MobileCardList } from "@/components/MobileCardList";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { supabase } from "@/integrations/supabase/client";
import { API_REGISTRY } from "@/lib/api-registry";
import {
  CSV_CACHE_KEYS,
  mapCsvCacheStatusRows,
  type ApiCacheStatusRowLike,
  type CsvCacheKey,
  type CsvCacheStatusView,
} from "@/lib/csv-cache-status";
import { isSafetyKoreaApprovalPending, resolveSourceStatusView } from "@/lib/source-status";

interface LogRow {
  api_key_name: string;
  status: ApiState;
  called_at: string;
  http_status: number | null;
  response_count: number | null;
  error_code: string | null;
  detail: Record<string, unknown> | null;
}

export default function DataSources() {
  useAuthGuard();

  const [latestLogs, setLatestLogs] = useState<Record<string, LogRow>>({});
  const [failureCounts, setFailureCounts] = useState<Record<string, number>>({});
  const [referenceDate, setReferenceDate] = useState<string | null>(null);
  const [csvCacheStatus, setCsvCacheStatus] = useState<Record<CsvCacheKey, CsvCacheStatusView>>(
    () => mapCsvCacheStatusRows([]),
  );
  const apiKeys = useMemo(() => API_REGISTRY.map((api) => api.key), []);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const [logResult, cacheResult] = await Promise.all([
        supabase
          .from("api_call_logs")
          .select("api_key_name,status,called_at,http_status,response_count,error_code,detail")
          .in("api_key_name", apiKeys)
          .order("called_at", { ascending: false })
          .limit(2000),
        (supabase as any)
          .from("api_cache_status")
          .select(
            "cache_key,status,active_batch_id,total_count,upserted_count,fetched_count,stale_after_days,last_attempt_at,last_success_at,last_error",
          )
          .in("cache_key", CSV_CACHE_KEYS),
      ]);

      if (!mounted) return;

      const rows = (logResult.data as LogRow[]) ?? [];
      const byKey: Record<string, LogRow> = {};
      const failCount: Record<string, number> = {};
      for (const row of rows) {
        if (!byKey[row.api_key_name]) byKey[row.api_key_name] = row;
        if (row.status === "error" && !isSafetyKoreaApprovalPending(row, row.api_key_name)) {
          failCount[row.api_key_name] = (failCount[row.api_key_name] ?? 0) + 1;
        }
      }

      const cacheRows = (cacheResult?.data as ApiCacheStatusRowLike[] | null) ?? [];
      setLatestLogs(byKey);
      setFailureCounts(failCount);
      setReferenceDate(rows[0]?.called_at ?? null);
      setCsvCacheStatus(mapCsvCacheStatusRows(cacheRows));
    };

    load();
    return () => {
      mounted = false;
    };
  }, [apiKeys]);

  const highlightedStates = useMemo(() => {
    const kicox = resolveSourceStatusView(latestLogs.kicox_factory_production, "kicox_factory_production");
    const safety = resolveSourceStatusView(latestLogs.safetykorea_recall, "safetykorea_recall");
    return { kicox, safety };
  }, [latestLogs]);

  const csvStatusRows = useMemo(
    () => CSV_CACHE_KEYS.map((key) => csvCacheStatus[key]).filter(Boolean),
    [csvCacheStatus],
  );

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold">데이터 출처 및 API 상태</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          실제 호출 로그를 기준으로 각 데이터 소스의 최신 상태를 표시합니다.
        </p>
        <div className="mt-3 rounded-md border border-border bg-muted/30 p-3 text-sm">
          <p>
            <span className="font-medium">최근 조회 시각:</span>{" "}
            {formatDateTime(referenceDate)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>KICOX 상태</span>
            <ApiStateChip state={highlightedStates.kicox.chipState} />
            <span>SafetyKorea 상태</span>
            <ApiStateChip state={highlightedStates.safety.chipState} />
            {highlightedStates.safety.statusNote ? (
              <span className="text-risk-reviewable">{highlightedStates.safety.statusNote}</span>
            ) : null}
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">공공데이터 API 10종</CardTitle>
          <CardDescription>실제 호출 로그 기반으로 API 상태를 자동 반영합니다.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <MobileCardList
            items={API_REGISTRY}
            getKey={(api) => api.key}
            className="p-3"
            renderCard={(api) => {
              const log = latestLogs[api.key];
              const failures = failureCounts[api.key] ?? 0;
              const statusView = resolveSourceStatusView(log, api.key);
              return (
                <div className="space-y-1 text-sm">
                  <p className="font-medium">{api.name}</p>
                  <p className="text-xs text-muted-foreground">{api.org}</p>
                  <p className="text-xs text-muted-foreground">{api.purpose}</p>
                  <div className="space-y-1 pt-1">
                    <ApiStateChip state={statusView.chipState} />
                    <p className="text-xs text-muted-foreground">
                      {statusView.statusLabel}
                      {statusView.statusNote ? ` (${statusView.statusNote})` : ""}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">최근 조회: {formatDateTime(log?.called_at ?? null)}</p>
                  <p className="text-xs text-muted-foreground">HTTP 상태: {log?.http_status ?? "정보 없음"}</p>
                  <p className="text-xs text-muted-foreground">응답 건수: {log?.response_count ?? "정보 없음"}</p>
                  <p className="text-xs text-muted-foreground">
                    오류 코드: {statusView.statusNote ?? (log?.error_code ?? "정보 없음")}
                  </p>
                  <p className="text-xs text-muted-foreground">실패 횟수: {failures}</p>
                  {api.endpoint !== "internal" ? (
                    <a
                      href={api.sourceUrl ?? api.endpoint}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center gap-1 text-xs text-brand hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {api.license}
                    </a>
                  ) : (
                    <p className="text-xs text-muted-foreground">{api.license}</p>
                  )}
                </div>
              );
            }}
          />

          <table className="hidden w-full min-w-[980px] text-sm md:table" aria-label="데이터 출처 및 API 상태 표">
            <caption className="sr-only">데이터 출처, API 상태, 최근 조회 이력 표</caption>
            <thead className="bg-muted/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">API</th>
                <th className="px-4 py-3 text-left">기관</th>
                <th className="px-4 py-3 text-left">용도</th>
                <th className="px-4 py-3 text-left">최근 상태</th>
                <th className="px-4 py-3 text-left">최근 조회</th>
                <th className="px-4 py-3 text-left">HTTP</th>
                <th className="px-4 py-3 text-left">응답 건수</th>
                <th className="px-4 py-3 text-left">오류 코드</th>
                <th className="px-4 py-3 text-left">실패 횟수</th>
                <th className="px-4 py-3 text-left">라이선스</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {API_REGISTRY.map((api) => {
                const log = latestLogs[api.key];
                const failures = failureCounts[api.key] ?? 0;
                const statusView = resolveSourceStatusView(log, api.key);
                return (
                  <tr key={api.key}>
                    <td className="px-4 py-3 font-medium">{api.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{api.org}</td>
                    <td className="px-4 py-3 text-muted-foreground">{api.purpose}</td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <ApiStateChip state={statusView.chipState} />
                        <p className="text-xs text-muted-foreground">
                          {statusView.statusLabel}
                          {statusView.statusNote ? ` (${statusView.statusNote})` : ""}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatDateTime(log?.called_at ?? null)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{log?.http_status ?? "정보 없음"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{log?.response_count ?? "정보 없음"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {statusView.statusNote ?? (log?.error_code ?? "정보 없음")}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{failures}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {api.endpoint !== "internal" && (
                        <a
                          href={api.sourceUrl ?? api.endpoint}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-11 items-center gap-1 text-brand hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {api.license}
                        </a>
                      )}
                      {api.endpoint === "internal" && api.license}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">CSV 캐시 데이터 3종</CardTitle>
          <CardDescription>supabase `api_cache_status` 기준 동기화 상태를 표시합니다.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <MobileCardList
            items={csvStatusRows}
            getKey={(row) => row.key}
            className="p-3"
            renderCard={(row) => (
              <div className="space-y-1 text-sm">
                <p className="font-medium">{row.name}</p>
                <div className="space-y-1 pt-1">
                  <ApiStateChip state={row.chipState} />
                  <p className="text-xs text-muted-foreground">
                    {row.statusLabel}
                    {row.statusNote ? ` (${row.statusNote})` : ""}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">최근 성공: {formatDateTime(row.lastSuccessAt)}</p>
                <p className="text-xs text-muted-foreground">최근 시도: {formatDateTime(row.lastAttemptAt)}</p>
                <p className="text-xs text-muted-foreground">
                  건수: total {formatCount(row.totalCount)} / fetched {formatCount(row.fetchedCount)} / upserted {formatCount(row.upsertedCount)}
                </p>
                <a
                  href={row.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center gap-1 text-xs text-brand hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  공공데이터포털
                </a>
              </div>
            )}
          />

          <table className="hidden w-full min-w-[920px] text-sm md:table" aria-label="CSV 캐시 동기화 상태 표">
            <caption className="sr-only">CSV 캐시 3종 동기화 상태</caption>
            <thead className="bg-muted/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">데이터</th>
                <th className="px-4 py-3 text-left">상태</th>
                <th className="px-4 py-3 text-left">최근 성공</th>
                <th className="px-4 py-3 text-left">최근 시도</th>
                <th className="px-4 py-3 text-left">건수(total/fetched/upserted)</th>
                <th className="px-4 py-3 text-left">출처</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {csvStatusRows.map((row) => (
                <tr key={row.key}>
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <ApiStateChip state={row.chipState} />
                      <p className="text-xs text-muted-foreground">
                        {row.statusLabel}
                        {row.statusNote ? ` (${row.statusNote})` : ""}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{formatDateTime(row.lastSuccessAt)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{formatDateTime(row.lastAttemptAt)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatCount(row.totalCount)} / {formatCount(row.fetchedCount)} / {formatCount(row.upsertedCount)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    <a
                      href={row.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center gap-1 text-brand hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      공공데이터포털
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <p className="mt-3 text-xs text-muted-foreground">
        SafetyKorea는 현재 API 승인 대기 상태로만 표시되며, 평가 결함으로 집계하지 않습니다.
      </p>
    </AppShell>
  );
}

function formatDateTime(value: string | null): string {
  if (!value) return "정보 없음";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "정보 없음";
  return format(date, "yyyy.MM.dd HH:mm");
}

function formatCount(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "정보 없음";
  return value.toLocaleString("ko-KR");
}
