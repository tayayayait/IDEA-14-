import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  KOTRA_IMPORT_REGULATION_CACHE_KEY,
  normalizeKotraImportRegulationItem,
  toImportRegulationCacheDbRow,
} from "../_shared/kotra-import-regulation-cache.ts";

const KOTRA_IMPORT_REGULATION_ENDPOINT =
  "https://apis.data.go.kr/B410001/DS00000128/getDS00000128";
const DEFAULT_NUM_OF_ROWS = 200;
const FETCH_TIMEOUT_MS = 10000;

type ImportRegulationPageResult = {
  ok: boolean;
  status: number | null;
  message: string;
  pageNo: number;
  totalCount: number;
  items: ReturnType<typeof normalizeKotraImportRegulationItem>[];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startedAt = new Date().toISOString();
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !supabaseAnonKey) {
      return json({
        ok: false,
        status: "error",
        totalCount: 0,
        fetchedCount: 0,
        upsertedCount: 0,
        startedAt,
        completedAt: new Date().toISOString(),
        message: "SUPABASE_URL or SUPABASE_ANON_KEY is missing",
      }, 500);
    }

    if (!supabaseServiceRoleKey) {
      return json({
        ok: false,
        status: "error",
        totalCount: 0,
        fetchedCount: 0,
        upsertedCount: 0,
        startedAt,
        completedAt: new Date().toISOString(),
        message: "SUPABASE_SERVICE_ROLE_KEY is missing",
      }, 500);
    }

    const auth = req.headers.get("Authorization") ?? "";
    const bearerToken = auth.replace(/^Bearer\s+/i, "").trim();
    const isInternalServiceRoleCall = Boolean(supabaseServiceRoleKey && bearerToken === supabaseServiceRoleKey);
    if (!isInternalServiceRoleCall) {
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: auth } },
      });
      const { data: userData } = await userClient.auth.getUser();
      if (!userData.user) {
        console.warn("sync-kotra-import-regulations unauthorized");
        return json({
          ok: false,
          status: "error",
          totalCount: 0,
          fetchedCount: 0,
          upsertedCount: 0,
          startedAt,
          completedAt: new Date().toISOString(),
          message: "unauthorized",
        }, 401);
      }
    }

    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
    const body = asRecord(await req.json().catch(() => ({})));
    const requestedRows = asInt(body.numOfRows);
    const numOfRows = Math.min(200, Math.max(1, requestedRows || DEFAULT_NUM_OF_ROWS));
    console.log("sync-kotra-import-regulations started", {
      numOfRows,
      internal: isInternalServiceRoleCall,
    });

    await updateCacheStatus(admin, {
      status: "running",
      total_count: 0,
      fetched_count: 0,
      upserted_count: 0,
      last_attempt_at: startedAt,
      last_error: null,
    });

    const kotraApiKey = resolveKotraKey();
    if (!kotraApiKey) {
      const completedAt = new Date().toISOString();
      await updateCacheStatus(admin, {
        status: "error",
        last_attempt_at: startedAt,
        last_error: "KOTRA_API_KEY is missing",
      });
      return json({
        ok: false,
        status: "error",
        totalCount: 0,
        fetchedCount: 0,
        upsertedCount: 0,
        startedAt,
        completedAt,
        message: "KOTRA_API_KEY is missing",
      });
    }

    const firstPage = await callKotraImportRegulationPage({
      key: kotraApiKey,
      pageNo: 1,
      numOfRows,
    });
    if (!firstPage.ok) {
      const completedAt = new Date().toISOString();
      await updateCacheStatus(admin, {
        status: "error",
        last_attempt_at: startedAt,
        last_error: firstPage.message,
      });
      return json({
        ok: false,
        status: "error",
        totalCount: firstPage.totalCount,
        fetchedCount: 0,
        upsertedCount: 0,
        startedAt,
        completedAt,
        message: firstPage.message,
      });
    }

    const totalCount = firstPage.totalCount;
    const totalPages = Math.max(1, Math.ceil((totalCount || firstPage.items.length) / numOfRows));
    const collectedRows: Array<{
      pageNo: number;
      rowNo: number;
      item: ReturnType<typeof normalizeKotraImportRegulationItem>;
    }> = firstPage.items.map((item, idx) => ({
      pageNo: firstPage.pageNo || 1,
      rowNo: idx + 1,
      item,
    }));

    for (let pageNo = 2; pageNo <= totalPages; pageNo += 1) {
      const pageResult = await callKotraImportRegulationPage({
        key: kotraApiKey,
        pageNo,
        numOfRows,
      });
      if (!pageResult.ok) {
        const completedAt = new Date().toISOString();
        await updateCacheStatus(admin, {
          status: "error",
          total_count: totalCount,
          fetched_count: collectedRows.length,
          upserted_count: 0,
          last_attempt_at: startedAt,
          last_error: pageResult.message,
        });
        return json({
          ok: false,
          status: "error",
          totalCount,
          fetchedCount: collectedRows.length,
          upsertedCount: 0,
          startedAt,
          completedAt,
          message: pageResult.message,
        });
      }

      for (let i = 0; i < pageResult.items.length; i += 1) {
        collectedRows.push({
          pageNo: pageResult.pageNo || pageNo,
          rowNo: i + 1,
          item: pageResult.items[i],
        });
      }
    }

    const batchId = crypto.randomUUID();
    const insertRows = collectedRows.map((row) =>
      toImportRegulationCacheDbRow({
        batchId,
        pageNo: row.pageNo,
        rowNo: row.rowNo,
        item: row.item,
      })
    );

    const chunkSize = 1000;
    let upsertedCount = 0;
    for (let i = 0; i < insertRows.length; i += chunkSize) {
      const chunk = insertRows.slice(i, i + chunkSize);
      if (chunk.length === 0) continue;
      const { error } = await admin
        .from("kotra_import_regulation_cache")
        .insert(chunk);
      if (error) {
        const completedAt = new Date().toISOString();
        await updateCacheStatus(admin, {
          status: "error",
          total_count: totalCount,
          fetched_count: collectedRows.length,
          upserted_count: upsertedCount,
          last_attempt_at: startedAt,
          last_error: error.message,
        });
        return json({
          ok: false,
          status: "error",
          totalCount,
          fetchedCount: collectedRows.length,
          upsertedCount,
          startedAt,
          completedAt,
          message: error.message,
        });
      }
      upsertedCount += chunk.length;
    }

    const { error: deactivateError } = await admin
      .from("kotra_import_regulation_cache")
      .update({ is_active: false })
      .eq("is_active", true)
      .neq("batch_id", batchId);
    if (deactivateError) {
      const completedAt = new Date().toISOString();
      await updateCacheStatus(admin, {
        status: "error",
        total_count: totalCount,
        fetched_count: collectedRows.length,
        upserted_count: upsertedCount,
        last_attempt_at: startedAt,
        last_error: deactivateError.message,
      });
      return json({
        ok: false,
        status: "error",
        totalCount,
        fetchedCount: collectedRows.length,
        upsertedCount,
        startedAt,
        completedAt,
        message: deactivateError.message,
      });
    }

    const completedAt = new Date().toISOString();
    await updateCacheStatus(admin, {
      status: "success",
      active_batch_id: batchId,
      total_count: totalCount,
      fetched_count: collectedRows.length,
      upserted_count: upsertedCount,
      last_attempt_at: startedAt,
      last_success_at: completedAt,
      last_error: null,
    });
    console.log("sync-kotra-import-regulations completed", {
      totalCount,
      fetchedCount: collectedRows.length,
      upsertedCount,
      batchId,
    });

    return json({
      ok: true,
      status: "success",
      totalCount,
      fetchedCount: collectedRows.length,
      upsertedCount,
      startedAt,
      completedAt,
      message: "KOTRA import regulation cache sync completed",
    });
  } catch (error) {
    const completedAt = new Date().toISOString();
    return json({
      ok: false,
      status: "error",
      totalCount: 0,
      fetchedCount: 0,
      upsertedCount: 0,
      startedAt,
      completedAt,
      message: error instanceof Error ? error.message : "unknown error",
    }, 500);
  }
});

async function callKotraImportRegulationPage(params: {
  key: string;
  pageNo: number;
  numOfRows: number;
}): Promise<ImportRegulationPageResult> {
  const url = new URL(KOTRA_IMPORT_REGULATION_ENDPOINT);
  url.searchParams.set("serviceKey", params.key);
  url.searchParams.set("pageNo", String(params.pageNo));
  url.searchParams.set("numOfRows", String(params.numOfRows));
  url.searchParams.set("type", "json");

  const external = await fetchExternal(url.toString());
  if (!external.ok) {
    return {
      ok: false,
      status: null,
      message: external.message,
      pageNo: params.pageNo,
      totalCount: 0,
      items: [],
    };
  }
  const response = external.response;
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: `HTTP ${response.status}`,
      pageNo: params.pageNo,
      totalCount: 0,
      items: [],
    };
  }

  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      status: response.status,
      message: "Invalid JSON response",
      pageNo: params.pageNo,
      totalCount: 0,
      items: [],
    };
  }

  const root = asRecord(parsed);
  const resultCode = asText(root.resultCode);
  const resultMsg = asText(root.resultMsg);
  if (resultCode && resultCode !== "0" && resultCode !== "00") {
    return {
      ok: false,
      status: response.status,
      message: `${resultCode}${resultMsg ? ` ${resultMsg}` : ""}`,
      pageNo: params.pageNo,
      totalCount: asInt(root.totalCount),
      items: [],
    };
  }

  const pageNo = asInt(root.pageNo) || params.pageNo;
  const totalCount = asInt(root.totalCount);
  const items = asArray(root.records)
    .map(normalizeKotraImportRegulationItem)
    .filter((item) => item.HSCD || item.CMDLT_NAME || item.REGL_CN);

  return {
    ok: true,
    status: response.status,
    message: resultMsg || "정상",
    pageNo,
    totalCount,
    items,
  };
}

function resolveKotraKey(): string {
  return normalizeAuthKeyValue(
    Deno.env.get("KOTRA_API_KEY") ||
    Deno.env.get("PUBLIC_DATA_API_KEY") ||
    Deno.env.get("PUBLIC_DATA_PORTAL_KEY") ||
    "",
  );
}

function normalizeAuthKeyValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;

  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if ((first === "\"" && last === "\"") || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

type CacheStatusPatch = {
  status: string;
  active_batch_id?: string;
  total_count?: number;
  fetched_count?: number;
  upserted_count?: number;
  last_attempt_at?: string;
  last_success_at?: string;
  last_error?: string | null;
};

async function updateCacheStatus(
  admin: ReturnType<typeof createClient>,
  patch: CacheStatusPatch,
) {
  await admin.from("api_cache_status").upsert({
    cache_key: KOTRA_IMPORT_REGULATION_CACHE_KEY,
    ...patch,
  });
}

type ExternalFetchResult =
  | { ok: true; response: Response }
  | { ok: false; message: string };

async function fetchExternal(url: string): Promise<ExternalFetchResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return { ok: true, response };
  } catch (error) {
    return { ok: false, message: toExternalFetchMessage(error) };
  } finally {
    clearTimeout(timeoutId);
  }
}

function toExternalFetchMessage(error: unknown): string {
  const raw = asText((error as { message?: unknown } | null | undefined)?.message);
  const normalized = raw.toLowerCase();
  if (normalized.includes("abort") || normalized.includes("timed out") || normalized.includes("timeout")) {
    return `External API timeout after ${FETCH_TIMEOUT_MS}ms`;
  }
  if (!raw) return "External API request failed";
  return `External API request failed: ${raw}`;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
