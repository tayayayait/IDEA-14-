import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAuthenticatedUser } from "../_shared/auth.ts";
import {
  BIZINFO_AI_MODEL,
  fetchBizinfoPrograms,
  selectBizinfoProgramsWithAi,
  selectRelevantBizinfoPrograms,
  type BizinfoVerdictSignal,
} from "../_shared/bizinfo-support.ts";

const API_TIMEOUT_MS = 30_000;
const AI_TIMEOUT_MS = 50_000;
const AI_CANDIDATE_LIMIT = 15;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json(null, 204);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await requireAuthenticatedUser(req, corsHeaders);
  if (!auth.ok) return auth.response;

  const bizinfoApiKey = Deno.env.get("BIZINFO_API_KEY") ?? "";
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
  if (!bizinfoApiKey) {
    return json({ error: "기업마당 API 설정이 필요합니다" }, 503);
  }
  if (!geminiApiKey) {
    return json({ error: "AI 지원사업 선별 설정이 필요합니다" }, 503);
  }

  try {
    const body = await req.json();
    const projectId = asText(body.project_id);
    const productName = asText(body.product_name);
    const countryName = asText(body.country_name);
    const verdictSignals = readVerdictSignals(body.verdict_signals);

    if (!projectId || !productName) {
      return json({ error: "project_id and product_name required" }, 400);
    }

    const supabase = createUserClient(req);
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (!project) return json({ error: "Project not found" }, 404);

    const [{ data: company }, { data: product }] = await Promise.all([
      supabase
        .from("project_companies")
        .select("address, industry_code")
        .eq("project_id", projectId)
        .eq("user_id", auth.user.id)
        .maybeSingle(),
      supabase
        .from("project_products")
        .select("name, description, hs_code, hsk_code, components")
        .eq("project_id", projectId)
        .eq("user_id", auth.user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const effectiveProductName = asText(product?.name) || productName;
    const productDescription = [
      asText(product?.description),
      asText(product?.components),
    ].filter(Boolean).join(" / ").slice(0, 1_500);
    const industryCode = asText(company?.industry_code);

    const allPrograms = await fetchBizinfoPrograms(
      bizinfoApiKey,
      fetch,
      AbortSignal.timeout(API_TIMEOUT_MS),
    );
    const checkedAt = new Date().toISOString();
    const candidates = selectRelevantBizinfoPrograms(
      allPrograms,
      {
        productName: effectiveProductName,
        countryName,
        companyAddress: asText(company?.address),
        industryCode,
        verdictSignals,
      },
      toKoreaDateKey(new Date()),
      AI_CANDIDATE_LIMIT,
    );
    const programs = await selectBizinfoProgramsWithAi(
      candidates,
      {
        productName: effectiveProductName,
        productDescription,
        hsCode: asText(product?.hs_code),
        hskCode: asText(product?.hsk_code),
        countryName,
        industryCode,
        verdictSignals,
      },
      geminiApiKey,
      fetch,
      AbortSignal.timeout(AI_TIMEOUT_MS),
    );

    return json({
      programs,
      checked_at: checkedAt,
      selection: {
        method: "ai",
        model: BIZINFO_AI_MODEL,
        candidate_count: candidates.length,
      },
      source: {
        name: "기업마당 지원사업정보 API",
        url: "https://www.bizinfo.go.kr/apiDetail.do?id=bizinfoApi",
      },
    });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "unknown error";
    const safeMessage = redactSecret(
      redactSecret(rawMessage, bizinfoApiKey),
      geminiApiKey,
    )
      .replace(/crtfcKey=[^&\s]+/gi, "crtfcKey=[redacted]");
    console.error("api-bizinfo-support error:", safeMessage);
    return json({ error: "정부지원사업 정보를 불러오지 못했습니다" }, 502);
  }
});

function createUserClient(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const authorization = req.headers.get("Authorization") ?? "";
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function toKoreaDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function json(body: unknown, status = 200): Response {
  if (status === 204 || status === 205 || status === 304) {
    return new Response(null, { status, headers: corsHeaders });
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function redactSecret(message: string, secret: string): string {
  return secret ? message.replaceAll(secret, "[redacted]") : message;
}

function readVerdictSignals(value: unknown): BizinfoVerdictSignal[] {
  return asArray(value)
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const row = item as Record<string, unknown>;
      const source = asText(row.source);
      const text = asText(row.text).slice(0, 1_000);
      if (
        !text ||
        (source !== "action" && source !== "risk" && source !== "summary")
      ) {
        return null;
      }
      return { source, text } as BizinfoVerdictSignal;
    })
    .filter((item): item is BizinfoVerdictSignal => Boolean(item))
    .slice(0, 20);
}
