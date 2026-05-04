import type { ApiState } from "@/components/ApiStateChip";

export type CsvCacheKey =
  | "kotra_csv_export_region_rank"
  | "kotra_csv_import_regulation"
  | "kotra_csv_trade_office";

export interface ApiCacheStatusRowLike {
  cache_key?: string | null;
  status?: string | null;
  active_batch_id?: string | null;
  total_count?: number | null;
  upserted_count?: number | null;
  fetched_count?: number | null;
  stale_after_days?: number | null;
  last_attempt_at?: string | null;
  last_success_at?: string | null;
  last_error?: string | null;
}

export interface CsvCacheStatusView {
  key: CsvCacheKey;
  name: string;
  chipState: ApiState;
  statusLabel: string;
  statusNote: string | null;
  sourceUrl: string;
  activeBatchId: string | null;
  totalCount: number | null;
  upsertedCount: number | null;
  fetchedCount: number | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
}

const CSV_CACHE_META: Record<CsvCacheKey, { name: string; sourceUrl: string }> = {
  kotra_csv_export_region_rank: {
    name: "수출 지역 순위",
    sourceUrl: "https://www.data.go.kr/tcs/dss/selectDataSetList.do?keyword=%EC%88%98%EC%B6%9C%20%EC%A7%80%EC%97%AD%20%EC%88%9C%EC%9C%84",
  },
  kotra_csv_import_regulation: {
    name: "국별 대세계 수입규제 현황",
    sourceUrl: "https://www.data.go.kr/tcs/dss/selectDataSetList.do?keyword=%EA%B5%AD%EB%B3%84%20%EB%8C%80%EC%84%B8%EA%B3%84%20%EC%88%98%EC%9E%85%EA%B7%9C%EC%A0%9C%20%ED%98%84%ED%99%A9",
  },
  kotra_csv_trade_office: {
    name: "무역관 정보",
    sourceUrl: "https://www.data.go.kr/tcs/dss/selectDataSetList.do?keyword=%EB%8C%80%ED%95%9C%EB%AC%B4%EC%97%AD%ED%88%AC%EC%9E%90%EC%A7%84%ED%9D%A5%EA%B3%B5%EC%82%AC_%EB%AC%B4%EC%97%AD%EA%B4%80%20%EC%A0%95%EB%B3%B4",
  },
};

export const CSV_CACHE_KEYS = Object.keys(CSV_CACHE_META) as CsvCacheKey[];

export function mapCsvCacheStatusRows(
  rows: ApiCacheStatusRowLike[],
  nowMs = Date.now(),
): Record<CsvCacheKey, CsvCacheStatusView> {
  const byKey = new Map<string, ApiCacheStatusRowLike>();
  for (const row of rows) {
    const key = asText(row.cache_key);
    if (!key) continue;
    byKey.set(key, row);
  }

  const out = {} as Record<CsvCacheKey, CsvCacheStatusView>;
  for (const key of CSV_CACHE_KEYS) {
    const row = byKey.get(key);
    out[key] = toCsvCacheStatusView(key, row, nowMs);
  }
  return out;
}

function toCsvCacheStatusView(
  key: CsvCacheKey,
  row: ApiCacheStatusRowLike | undefined,
  nowMs: number,
): CsvCacheStatusView {
  const meta = CSV_CACHE_META[key];
  const status = asText(row?.status).toLowerCase();
  const activeBatchId = asText(row?.active_batch_id) || null;
  const totalCount = asNumber(row?.total_count);
  const upsertedCount = asNumber(row?.upserted_count);
  const fetchedCount = asNumber(row?.fetched_count);
  const lastAttemptAt = asText(row?.last_attempt_at) || null;
  const lastSuccessAt = asText(row?.last_success_at) || null;
  const lastError = asText(row?.last_error) || null;
  const staleAfterDays = Math.max(1, asNumber(row?.stale_after_days) ?? 30);
  const stale = evaluateStale(lastSuccessAt, staleAfterDays, nowMs);

  if (!row) {
    return {
      key,
      name: meta.name,
      chipState: "idle",
      statusLabel: "미동기화",
      statusNote: "캐시 상태 정보 없음",
      sourceUrl: meta.sourceUrl,
      activeBatchId,
      totalCount,
      upsertedCount,
      fetchedCount,
      lastAttemptAt,
      lastSuccessAt,
    };
  }

  if (status === "running" || status === "loading") {
    return {
      key,
      name: meta.name,
      chipState: "running",
      statusLabel: "동기화 중",
      statusNote: null,
      sourceUrl: meta.sourceUrl,
      activeBatchId,
      totalCount,
      upsertedCount,
      fetchedCount,
      lastAttemptAt,
      lastSuccessAt,
    };
  }

  if (status === "error") {
    return {
      key,
      name: meta.name,
      chipState: "error",
      statusLabel: "동기화 오류",
      statusNote: lastError || "오류 원인 미기록",
      sourceUrl: meta.sourceUrl,
      activeBatchId,
      totalCount,
      upsertedCount,
      fetchedCount,
      lastAttemptAt,
      lastSuccessAt,
    };
  }

  if (status === "partial_success") {
    return {
      key,
      name: meta.name,
      chipState: "partial_success",
      statusLabel: "부분 성공",
      statusNote: lastError || null,
      sourceUrl: meta.sourceUrl,
      activeBatchId,
      totalCount,
      upsertedCount,
      fetchedCount,
      lastAttemptAt,
      lastSuccessAt,
    };
  }

  if (stale) {
    return {
      key,
      name: meta.name,
      chipState: "stale",
      statusLabel: "오래됨",
      statusNote: `${staleAfterDays}일 기준 초과`,
      sourceUrl: meta.sourceUrl,
      activeBatchId,
      totalCount,
      upsertedCount,
      fetchedCount,
      lastAttemptAt,
      lastSuccessAt,
    };
  }

  if (status === "success" && activeBatchId) {
    return {
      key,
      name: meta.name,
      chipState: "success",
      statusLabel: "사용 가능",
      statusNote: null,
      sourceUrl: meta.sourceUrl,
      activeBatchId,
      totalCount,
      upsertedCount,
      fetchedCount,
      lastAttemptAt,
      lastSuccessAt,
    };
  }

  return {
    key,
    name: meta.name,
    chipState: "idle",
    statusLabel: "미동기화",
    statusNote: lastError || null,
    sourceUrl: meta.sourceUrl,
    activeBatchId,
    totalCount,
    upsertedCount,
    fetchedCount,
    lastAttemptAt,
    lastSuccessAt,
  };
}

function evaluateStale(lastSuccessAt: string | null, staleAfterDays: number, nowMs: number): boolean {
  if (!lastSuccessAt) return true;
  const ts = Date.parse(lastSuccessAt);
  if (!Number.isFinite(ts)) return true;
  const expireMs = staleAfterDays * 24 * 60 * 60 * 1000;
  return nowMs - ts > expireMs;
}

function asText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
