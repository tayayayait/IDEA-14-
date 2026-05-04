import { describe, expect, it } from "vitest";
import { mapCsvCacheStatusRows } from "@/lib/csv-cache-status";

const NOW_MS = Date.parse("2026-04-29T00:00:00.000Z");

describe("csv-cache-status", () => {
  it("marks missing rows as idle", () => {
    const mapped = mapCsvCacheStatusRows([], NOW_MS);
    expect(mapped.kotra_csv_export_region_rank.chipState).toBe("idle");
    expect(mapped.kotra_csv_import_regulation.chipState).toBe("idle");
    expect(mapped.kotra_csv_trade_office.chipState).toBe("idle");
  });

  it("marks fresh success row as success", () => {
    const mapped = mapCsvCacheStatusRows(
      [
        {
          cache_key: "kotra_csv_export_region_rank",
          status: "success",
          active_batch_id: "9f2deb32-8d4f-4172-9f51-9ac2b174387e",
          stale_after_days: 30,
          last_success_at: "2026-04-20T12:00:00.000Z",
          total_count: 120,
          fetched_count: 120,
          upserted_count: 120,
        },
      ],
      NOW_MS,
    );

    const row = mapped.kotra_csv_export_region_rank;
    expect(row.chipState).toBe("success");
    expect(row.statusNote).toBeNull();
    expect(row.totalCount).toBe(120);
  });

  it("marks expired row as stale", () => {
    const mapped = mapCsvCacheStatusRows(
      [
        {
          cache_key: "kotra_csv_trade_office",
          status: "success",
          active_batch_id: "2d770f14-b065-4f55-8764-6f9db9dbe6ad",
          stale_after_days: 10,
          last_success_at: "2026-04-01T00:00:00.000Z",
        },
      ],
      NOW_MS,
    );

    expect(mapped.kotra_csv_trade_office.chipState).toBe("stale");
    expect(mapped.kotra_csv_trade_office.statusNote).toContain("10");
  });

  it("marks error row with fallback note", () => {
    const mapped = mapCsvCacheStatusRows(
      [
        {
          cache_key: "kotra_csv_import_regulation",
          status: "error",
          last_error: "",
        },
      ],
      NOW_MS,
    );

    expect(mapped.kotra_csv_import_regulation.chipState).toBe("error");
    expect(mapped.kotra_csv_import_regulation.statusNote).toBe("오류 원인 미기록");
  });

  it("keeps partial success state", () => {
    const mapped = mapCsvCacheStatusRows(
      [
        {
          cache_key: "kotra_csv_trade_office",
          status: "partial_success",
          last_error: "2 rows dropped by dedupe",
        },
      ],
      NOW_MS,
    );

    expect(mapped.kotra_csv_trade_office.chipState).toBe("partial_success");
    expect(mapped.kotra_csv_trade_office.statusNote).toContain("dedupe");
  });
});
