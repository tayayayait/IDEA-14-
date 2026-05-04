import { describe, expect, it } from "vitest";
import {
  evaluateKotraImportRegulationCacheFreshness,
  normalizeImportRegulationCacheStatus,
  normalizeKotraImportRegulationItem,
  shouldAttemptKotraImportRegulationApiSync,
  toImportRegulationCacheDbRow,
  toImportRegulationItemFromCacheRow,
} from "../../supabase/functions/_shared/kotra-import-regulation-cache";

describe("kotra-import-regulation-cache", () => {
  it("normalizes DS00000128 record fields", () => {
    const normalized = normalizeKotraImportRegulationItem({
      HQURT_NAME: "도쿄무역관",
      CMDLT_NAME: "평판 디스플레이 모듈",
      HSCD: "852990",
      HSCD_CN: "기타 부분품",
      REG_DT: "20260131",
      REGL_CN: "수입규제 공지",
      ISO_WD2_NAT_CD: "JP",
      REGL_STR_DE: "20260201",
      REGL_END_DE: "20261231",
      PROBE_TGT_NAT_NAME: "일본",
    });

    expect(normalized).toEqual({
      HQURT_NAME: "도쿄무역관",
      CMDLT_NAME: "평판 디스플레이 모듈",
      HSCD: "852990",
      HSCD_CN: "기타 부분품",
      REG_DT: "20260131",
      REGL_CN: "수입규제 공지",
      ISO_WD2_NAT_CD: "JP",
      REGL_STR_DE: "20260201",
      REGL_END_DE: "20261231",
      PROBE_TGT_NAT_NAME: "일본",
    });
  });

  it("maps normalized record into cache row fields", () => {
    const item = normalizeKotraImportRegulationItem({
      HQURT_NAME: "프랑크푸르트무역관",
      CMDLT_NAME: "분광기",
      HSCD: "902730",
      HSCD_CN: "분석기기",
      REG_DT: "20260130",
      REGL_CN: "신규 규제",
      ISO_WD2_NAT_CD: "DE",
      REGL_STR_DE: "20260215",
      REGL_END_DE: "",
      PROBE_TGT_NAT_NAME: "독일",
    });

    const cacheRow = toImportRegulationCacheDbRow({
      batchId: "11111111-1111-1111-1111-111111111111",
      pageNo: 3,
      rowNo: 12,
      item,
    });

    expect(cacheRow.batch_id).toBe("11111111-1111-1111-1111-111111111111");
    expect(cacheRow.source_page_no).toBe(3);
    expect(cacheRow.source_row_no).toBe(12);
    expect(cacheRow.hscd).toBe("902730");
    expect(cacheRow.hscd_cn).toBe("분석기기");
    expect(cacheRow.regl_cn).toBe("신규 규제");
    expect(cacheRow.iso_wd2_nat_cd).toBe("DE");
    expect(cacheRow.probe_tgt_nat_name).toBe("독일");
    expect(cacheRow.raw).toMatchObject({
      HSCD: "902730",
      HSCD_CN: "분석기기",
      REGL_CN: "신규 규제",
      ISO_WD2_NAT_CD: "DE",
      PROBE_TGT_NAT_NAME: "독일",
    });
  });

  it("maps cache DB row back to regulation item shape", () => {
    const item = toImportRegulationItemFromCacheRow({
      hqurt_name: "뉴욕무역관",
      cmdlt_name: "통신장비",
      hscd: "851762",
      hscd_cn: "데이터 통신 장치",
      reg_dt: "20260120",
      regl_cn: "사전허가 필요",
      iso_wd2_nat_cd: "US",
      regl_str_de: "20260201",
      regl_end_de: "",
      probe_tgt_nat_name: "미국",
      raw: {},
    });

    expect(item).toEqual({
      HQURT_NAME: "뉴욕무역관",
      CMDLT_NAME: "통신장비",
      HSCD: "851762",
      HSCD_CN: "데이터 통신 장치",
      REG_DT: "20260120",
      REGL_CN: "사전허가 필요",
      ISO_WD2_NAT_CD: "US",
      REGL_STR_DE: "20260201",
      REGL_END_DE: "",
      PROBE_TGT_NAT_NAME: "미국",
    });
  });

  it("evaluates stale cache status correctly", () => {
    const status = normalizeImportRegulationCacheStatus({
      cache_key: "kotra_import_regulation_ds00000128",
      status: "success",
      active_batch_id: "22222222-2222-2222-2222-222222222222",
      last_success_at: "2026-04-10T00:00:00.000Z",
      stale_after_days: 30,
      total_count: 1000,
      fetched_count: 1000,
      upserted_count: 1000,
      last_attempt_at: "2026-04-10T00:10:00.000Z",
      last_error: null,
    });
    const fresh = evaluateKotraImportRegulationCacheFreshness(status, Date.parse("2026-04-29T00:00:00.000Z"));
    const stale = evaluateKotraImportRegulationCacheFreshness(status, Date.parse("2026-06-29T00:00:00.000Z"));

    expect(fresh.stale).toBe(false);
    expect(stale.stale).toBe(true);
    expect(stale.reason).toBe("expired");
  });

  it("attempts API sync only when cache is unusable", () => {
    const readyStatus = normalizeImportRegulationCacheStatus({
      cache_key: "kotra_import_regulation_ds00000128",
      status: "success",
      active_batch_id: "22222222-2222-2222-2222-222222222222",
      last_success_at: "2026-04-10T00:00:00.000Z",
      stale_after_days: 30,
    });
    const readyFreshness = evaluateKotraImportRegulationCacheFreshness(
      readyStatus,
      Date.parse("2026-04-29T00:00:00.000Z"),
    );

    expect(shouldAttemptKotraImportRegulationApiSync(readyStatus, readyFreshness, null)).toBe(false);
    expect(shouldAttemptKotraImportRegulationApiSync(readyStatus, readyFreshness, "cache read failed")).toBe(true);

    const missingBatchStatus = normalizeImportRegulationCacheStatus({
      cache_key: "kotra_import_regulation_ds00000128",
      status: "idle",
      active_batch_id: null,
      last_success_at: null,
      stale_after_days: 30,
    });
    const missingBatchFreshness = evaluateKotraImportRegulationCacheFreshness(missingBatchStatus);

    expect(shouldAttemptKotraImportRegulationApiSync(missingBatchStatus, missingBatchFreshness, null)).toBe(true);
  });
});
