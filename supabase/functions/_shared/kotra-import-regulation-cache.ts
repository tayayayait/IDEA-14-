export const KOTRA_IMPORT_REGULATION_CACHE_KEY = "kotra_import_regulation_ds00000128";
export const KOTRA_IMPORT_REGULATION_DEFAULT_STALE_DAYS = 30;

export type KotraImportRegulationItem = {
  HQURT_NAME: string;
  CMDLT_NAME: string;
  HSCD: string;
  HSCD_CN: string;
  REG_DT: string;
  REGL_CN: string;
  ISO_WD2_NAT_CD: string;
  REGL_STR_DE: string;
  REGL_END_DE: string;
  PROBE_TGT_NAT_NAME: string;
};

export type KotraImportRegulationCacheDbRow = {
  batch_id: string;
  source_page_no: number;
  source_row_no: number;
  hqurt_name: string;
  cmdlt_name: string;
  hscd: string;
  hscd_cn: string;
  reg_dt: string;
  regl_cn: string;
  iso_wd2_nat_cd: string;
  regl_str_de: string;
  regl_end_de: string;
  probe_tgt_nat_name: string;
  raw: Record<string, unknown>;
  is_active: boolean;
};

export type KotraImportRegulationCacheStatus = {
  cacheKey: string;
  status: string;
  activeBatchId: string | null;
  totalCount: number;
  fetchedCount: number;
  upsertedCount: number;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  staleAfterDays: number;
};

export type KotraImportRegulationCacheFreshness = {
  stale: boolean;
  reason: "missing_status" | "missing_active_batch" | "missing_last_success" | "expired" | null;
  staleAfterDays: number;
  ageDays: number | null;
};

export function normalizeKotraImportRegulationItem(value: unknown): KotraImportRegulationItem {
  const row = asRecord(value);
  return {
    HQURT_NAME: asText(row.HQURT_NAME),
    CMDLT_NAME: asText(row.CMDLT_NAME),
    HSCD: asText(row.HSCD),
    HSCD_CN: asText(row.HSCD_CN),
    REG_DT: asText(row.REG_DT),
    REGL_CN: asText(row.REGL_CN),
    ISO_WD2_NAT_CD: asText(row.ISO_WD2_NAT_CD),
    REGL_STR_DE: asText(row.REGL_STR_DE),
    REGL_END_DE: asText(row.REGL_END_DE),
    PROBE_TGT_NAT_NAME: asText(row.PROBE_TGT_NAT_NAME),
  };
}

export function toImportRegulationCacheDbRow(
  params: {
    batchId: string;
    pageNo: number;
    rowNo: number;
    item: KotraImportRegulationItem;
  },
): KotraImportRegulationCacheDbRow {
  return {
    batch_id: params.batchId,
    source_page_no: params.pageNo,
    source_row_no: params.rowNo,
    hqurt_name: params.item.HQURT_NAME,
    cmdlt_name: params.item.CMDLT_NAME,
    hscd: params.item.HSCD,
    hscd_cn: params.item.HSCD_CN,
    reg_dt: params.item.REG_DT,
    regl_cn: params.item.REGL_CN,
    iso_wd2_nat_cd: params.item.ISO_WD2_NAT_CD,
    regl_str_de: params.item.REGL_STR_DE,
    regl_end_de: params.item.REGL_END_DE,
    probe_tgt_nat_name: params.item.PROBE_TGT_NAT_NAME,
    raw: {
      HQURT_NAME: params.item.HQURT_NAME,
      CMDLT_NAME: params.item.CMDLT_NAME,
      HSCD: params.item.HSCD,
      HSCD_CN: params.item.HSCD_CN,
      REG_DT: params.item.REG_DT,
      REGL_CN: params.item.REGL_CN,
      ISO_WD2_NAT_CD: params.item.ISO_WD2_NAT_CD,
      REGL_STR_DE: params.item.REGL_STR_DE,
      REGL_END_DE: params.item.REGL_END_DE,
      PROBE_TGT_NAT_NAME: params.item.PROBE_TGT_NAT_NAME,
    },
    is_active: true,
  };
}

export function toImportRegulationItemFromCacheRow(value: unknown): KotraImportRegulationItem {
  const row = asRecord(value);
  return {
    HQURT_NAME: asText(row.hqurt_name || asRecord(row.raw).HQURT_NAME),
    CMDLT_NAME: asText(row.cmdlt_name || asRecord(row.raw).CMDLT_NAME),
    HSCD: asText(row.hscd || asRecord(row.raw).HSCD),
    HSCD_CN: asText(row.hscd_cn || asRecord(row.raw).HSCD_CN),
    REG_DT: asText(row.reg_dt || asRecord(row.raw).REG_DT),
    REGL_CN: asText(row.regl_cn || asRecord(row.raw).REGL_CN),
    ISO_WD2_NAT_CD: asText(row.iso_wd2_nat_cd || asRecord(row.raw).ISO_WD2_NAT_CD),
    REGL_STR_DE: asText(row.regl_str_de || asRecord(row.raw).REGL_STR_DE),
    REGL_END_DE: asText(row.regl_end_de || asRecord(row.raw).REGL_END_DE),
    PROBE_TGT_NAT_NAME: asText(row.probe_tgt_nat_name || asRecord(row.raw).PROBE_TGT_NAT_NAME),
  };
}

export function normalizeImportRegulationCacheStatus(value: unknown): KotraImportRegulationCacheStatus | null {
  const row = asRecord(value);
  const cacheKey = asText(row.cache_key);
  if (!cacheKey) return null;
  return {
    cacheKey,
    status: asText(row.status),
    activeBatchId: asText(row.active_batch_id) || null,
    totalCount: asInt(row.total_count),
    fetchedCount: asInt(row.fetched_count),
    upsertedCount: asInt(row.upserted_count),
    lastAttemptAt: asText(row.last_attempt_at) || null,
    lastSuccessAt: asText(row.last_success_at) || null,
    lastError: asText(row.last_error) || null,
    staleAfterDays: Math.max(1, asInt(row.stale_after_days) || KOTRA_IMPORT_REGULATION_DEFAULT_STALE_DAYS),
  };
}

export function evaluateKotraImportRegulationCacheFreshness(
  status: KotraImportRegulationCacheStatus | null,
  nowMs = Date.now(),
): KotraImportRegulationCacheFreshness {
  if (!status) {
    return {
      stale: true,
      reason: "missing_status",
      staleAfterDays: KOTRA_IMPORT_REGULATION_DEFAULT_STALE_DAYS,
      ageDays: null,
    };
  }

  if (!status.activeBatchId) {
    return {
      stale: true,
      reason: "missing_active_batch",
      staleAfterDays: status.staleAfterDays,
      ageDays: null,
    };
  }

  if (!status.lastSuccessAt) {
    return {
      stale: true,
      reason: "missing_last_success",
      staleAfterDays: status.staleAfterDays,
      ageDays: null,
    };
  }

  const lastSuccessAtMs = Date.parse(status.lastSuccessAt);
  if (!Number.isFinite(lastSuccessAtMs)) {
    return {
      stale: true,
      reason: "missing_last_success",
      staleAfterDays: status.staleAfterDays,
      ageDays: null,
    };
  }

  const elapsedMs = Math.max(0, nowMs - lastSuccessAtMs);
  const ageDays = elapsedMs / (24 * 60 * 60 * 1000);
  const stale = elapsedMs > status.staleAfterDays * 24 * 60 * 60 * 1000;
  return {
    stale,
    reason: stale ? "expired" : null,
    staleAfterDays: status.staleAfterDays,
    ageDays,
  };
}

export function shouldAttemptKotraImportRegulationApiSync(
  status: KotraImportRegulationCacheStatus | null,
  freshness: KotraImportRegulationCacheFreshness,
  cacheReadError: string | null,
): boolean {
  if (cacheReadError) return true;
  if (!status?.activeBatchId) return true;
  return freshness.stale;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function asInt(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return 0;
}
