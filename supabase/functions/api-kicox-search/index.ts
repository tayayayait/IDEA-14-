import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { matchesRegionFilter, toApiRegionParam } from "./region.ts";
import { normalizeMainProduct } from "./main-product.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const input = normalizeInput(body);
    const logContext = await createApiLogContext(req, input.project_id);

    const key = Deno.env.get("KICOX_API_KEY");
    if (!key) {
      await writeKicoxApiLog(logContext, input, {
        status: "error",
        http_status: null,
        response_count: 0,
        error_code: "kicox_api_key_missing",
        message: "KICOX_API_KEY is not configured.",
        detail: null,
      });
      return json({
        items: [],
        state: "error",
        message: "KICOX_API_KEY is not configured.",
      });
    }

    const responses = await runRequests(input, key);
    const okResponses = responses.filter((row) => row.ok);
    const failedResponses = responses.filter((row) => !row.ok);

    if (okResponses.length === 0) {
      const errorMessage =
        failedResponses.map((row) => `${row.endpoint}: ${row.message ?? "unknown error"}`).join(" | ") ||
        "KICOX request failed.";
      await writeKicoxApiLog(logContext, input, {
        status: "error",
        http_status: pickPrimaryHttpStatus(responses),
        response_count: 0,
        error_code: pickPrimaryErrorCode(failedResponses),
        message: errorMessage,
        detail: {
          request_count: responses.length,
          success_count: 0,
          failed_endpoints: failedResponses.map((row) => ({
            endpoint: row.endpoint,
            http_status: row.httpStatus,
            error_code: row.errorCode,
            message: row.message,
          })),
        },
      });
      return json({ items: [], state: "error", message: errorMessage });
    }

    const merged = dedupeByFactory(okResponses.flatMap((row) => row.items));
    const filtered = applyClientFilter(merged, input);
    const state = filtered.length > 0 ? (failedResponses.length > 0 ? "partial_success" : "success") : "empty";
    const message = failedResponses.length > 0
      ? failedResponses.map((row) => `${row.endpoint}: ${row.message ?? "unknown error"}`).join(" | ")
      : null;

    await writeKicoxApiLog(logContext, input, {
      status: state,
      http_status: pickPrimaryHttpStatus(responses),
      response_count: filtered.length,
      error_code: state === "partial_success" ? pickPrimaryErrorCode(failedResponses) : null,
      message,
      detail: {
        request_count: responses.length,
        success_count: okResponses.length,
        merged_count: merged.length,
        filtered_count: filtered.length,
        failed_endpoints: failedResponses.map((row) => ({
          endpoint: row.endpoint,
          http_status: row.httpStatus,
          error_code: row.errorCode,
          message: row.message,
        })),
      },
    });

    return json({ items: filtered, state, message });
  } catch (error) {
    return json({
      items: [],
      state: "error",
      message: error instanceof Error ? error.message : "unknown error",
    });
  }
});

type KicoxInput = {
  project_id: string;
  query: string;
  complex: string;
  factory_manage_no: string;
  region: string;
  product_keyword: string;
};

type KicoxItem = {
  business_no: string;
  company_name: string;
  industrial_complex: string;
  address: string;
  industry_code: string;
  employees?: number;
  factory_manage_no: string;
  region: string;
  main_product: string;
};

type KicoxCallResult = {
  ok: boolean;
  endpoint: string;
  message: string | null;
  httpStatus: number | null;
  errorCode: string | null;
  items: KicoxItem[];
};

async function runRequests(input: KicoxInput, key: string): Promise<KicoxCallResult[]> {
  const calls: Array<Promise<KicoxCallResult>> = [];

  if (input.complex) {
    calls.push(
      callKicoxEndpoint("getFctryListInIrsttService_v2", key, {
        irsttNm: input.complex,
      }),
    );
  }

  if (input.factory_manage_no) {
    calls.push(
      callKicoxEndpoint("getFctryByFctryManageNoService_v2", key, {
        fctryManageNo: input.factory_manage_no,
      }),
    );
  }

  if (input.query || input.product_keyword || input.region || (!input.complex && !input.factory_manage_no)) {
    // 우회 기법: 제품명 단독 검색 시 11번 에러(필수 파라미터 누락)를 피하기 위해 cmpnyNm에 공백(" ")을 전달
    const cmpnyNmParam = input.query || (!input.query && !input.region && input.product_keyword ? " " : undefined);

    calls.push(
      callKicoxEndpoint("getFctryPrdctnService_v2", key, {
        cmpnyNm: cmpnyNmParam,
        mainProductCn: input.product_keyword || undefined,
        adres: toApiRegionParam(input.region) || undefined,
      }),
    );
  }

  if (calls.length === 0) {
    calls.push(callKicoxEndpoint("getFctryPrdctnService_v2", key, {}));
  }

  return await Promise.all(calls);
}

async function callKicoxEndpoint(
  path: "getFctryListInIrsttService_v2" | "getFctryPrdctnService_v2" | "getFctryByFctryManageNoService_v2",
  key: string,
  params: Record<string, string | undefined>,
): Promise<KicoxCallResult> {
  try {
    const url = new URL(`https://apis.data.go.kr/B550624/fctryRegistInfo/${path}`);
    url.searchParams.set("serviceKey", key);
    url.searchParams.set("type", "json");
    url.searchParams.set("pageNo", "1");
    url.searchParams.set("numOfRows", "20");
    for (const [k, v] of Object.entries(params)) {
      if (v) url.searchParams.set(k, v);
    }

    const res = await fetch(url.toString());
    if (!res.ok) {
      return {
        ok: false,
        endpoint: path,
        message: `HTTP ${res.status}`,
        httpStatus: res.status,
        errorCode: `http_${res.status}`,
        items: [],
      };
    }

    const xml = await res.text();
    const resultCode = getTagValue(xml, "resultCode");
    const resultMsg = getTagValue(xml, "resultMsg");

    if (resultCode && resultCode !== "00") {
      return {
        ok: false,
        endpoint: path,
        message: `${resultCode}${resultMsg ? ` ${resultMsg}` : ""}`,
        httpStatus: res.status,
        errorCode: resultCode,
        items: [],
      };
    }

    const itemList = normalizeItemsFromXml(xml);
    return {
      ok: true,
      endpoint: path,
      message: null,
      httpStatus: res.status,
      errorCode: null,
      items: itemList,
    };
  } catch (error) {
    return {
      ok: false,
      endpoint: path,
      message: error instanceof Error ? error.message : "unknown error",
      httpStatus: null,
      errorCode: "network_error",
      items: [],
    };
  }
}

function normalizeInput(body: unknown): KicoxInput {
  const b = asRecord(body);
  return {
    project_id: toText(b.project_id),
    query: toText(b.query),
    complex: toText(b.complex),
    factory_manage_no: toText(b.factory_manage_no ?? b.factory_name),
    region: toText(b.region),
    product_keyword: toText(b.product_keyword),
  };
}

function normalizeItemsFromXml(xml: string): KicoxItem[] {
  const itemBlocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);

  return itemBlocks.map((block) => {
    const address = getTagValue(block, "rnAdres");
    const industryCode = getTagValue(block, "rprsntvIndutyCode") || getTagValue(block, "indutyCodes") || getTagValue(block, "indutyNm");

    return {
      business_no: "",
      company_name: getTagValue(block, "cmpnyNm"),
      industrial_complex: getTagValue(block, "irsttNm"),
      address,
      industry_code: industryCode,
      employees: toOptionalNumber(getTagValue(block, "allEmplyCo")),
      factory_manage_no: getTagValue(block, "fctryManageNo"),
      region: extractRegion(address),
      main_product: normalizeMainProduct(getTagValue(block, "mainProductCn")),
    };
  });
}

function dedupeByFactory(items: KicoxItem[]): KicoxItem[] {
  const seen = new Set<string>();
  const out: KicoxItem[] = [];

  for (const item of items) {
    const key = item.factory_manage_no || `${item.company_name}|${item.address}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

function applyClientFilter(items: KicoxItem[], input: KicoxInput): KicoxItem[] {
  const query = input.query.toLowerCase();
  const complex = input.complex.toLowerCase();
  const factoryManageNo = input.factory_manage_no.toLowerCase();
  const region = input.region;
  const productKeyword = input.product_keyword.toLowerCase();

  return items.filter((item) => {
    if (query && !item.company_name.toLowerCase().includes(query)) return false;
    if (
      factoryManageNo &&
      !item.factory_manage_no.toLowerCase().includes(factoryManageNo)
    ) {
      return false;
    }
    if (complex && !item.industrial_complex.toLowerCase().includes(complex)) return false;
    if (!matchesRegionFilter(region, item.address, item.region)) {
      return false;
    }
    if (productKeyword && !item.main_product.toLowerCase().includes(productKeyword)) return false;
    return true;
  });
}

function getTagValue(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  if (!match) return "";
  return decodeXml(match[1]).trim();
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

type ApiLogContext = {
  supa: ReturnType<typeof createClient>;
  userId: string;
  projectId: string;
};

type KicoxLogPayload = {
  status: "success" | "partial_success" | "error" | "empty";
  http_status: number | null;
  response_count: number;
  error_code: string | null;
  message: string | null;
  detail: Record<string, unknown> | null;
};

async function createApiLogContext(req: Request, projectId: string): Promise<ApiLogContext | null> {
  if (!projectId) return null;
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return null;

  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userData } = await supa.auth.getUser();
  if (!userData.user) return null;

  return { supa, userId: userData.user.id, projectId };
}

async function writeKicoxApiLog(
  context: ApiLogContext | null,
  input: KicoxInput,
  payload: KicoxLogPayload,
): Promise<void> {
  if (!context) return;

  const detail = payload.detail ? { ...payload.detail } : {};
  detail.query = input.query || null;
  detail.complex = input.complex || null;
  detail.factory_manage_no = input.factory_manage_no || null;
  detail.region = input.region || null;
  detail.product_keyword = input.product_keyword || null;

  try {
    await context.supa.from("api_call_logs").insert([
      {
        user_id: context.userId,
        project_id: context.projectId,
        api_key_name: "kicox_factory_production",
        status: payload.status,
        http_status: payload.http_status,
        response_count: payload.response_count,
        error_code: payload.error_code,
        message: payload.message,
        detail,
      },
    ]);
  } catch (error) {
    console.error("kicox_log_insert_failed", error);
  }
}

function pickPrimaryHttpStatus(rows: KicoxCallResult[]): number | null {
  for (const row of rows) {
    if (typeof row.httpStatus === "number" && Number.isFinite(row.httpStatus)) return row.httpStatus;
  }
  return null;
}

function pickPrimaryErrorCode(rows: KicoxCallResult[]): string | null {
  for (const row of rows) {
    if (row.errorCode) return row.errorCode;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function toText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function toOptionalNumber(value: unknown): number | undefined {
  const raw = toText(value);
  if (!raw) return undefined;
  const n = Number(raw.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function extractRegion(address: string): string {
  if (!address) return "";
  return address.split(" ")[0] ?? "";
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
