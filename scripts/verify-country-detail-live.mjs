import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = readEnvFile(".env");
const requiredEnv = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_CONTEST_DEMO_EMAIL",
  "VITE_CONTEST_DEMO_PASSWORD",
];

for (const key of requiredEnv) {
  if (!env[key]) throw new Error(`${key} is not configured`);
}

const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { error: authError } = await supabase.auth.signInWithPassword({
  email: env.VITE_CONTEST_DEMO_EMAIL,
  password: env.VITE_CONTEST_DEMO_PASSWORD,
});
if (authError) throw new Error(`demo authentication failed: ${authError.message}`);

const selection = await findLatestUsableProject();
if (!selection) throw new Error("a demo project with a confirmed HS6 and recommended country was not found");

const shouldInvoke = process.argv.includes("--invoke");
let invocation = null;
if (shouldInvoke) {
  const startedAt = Date.now();
  const { data, error } = await supabase.functions.invoke("country-detail", {
    body: {
      project_id: selection.project.id,
      country_code: selection.country.country_code,
      force_refresh: true,
    },
  });
  invocation = {
    ok: !error,
    durationMs: Date.now() - startedAt,
    state: text(data?.state) || null,
    message: safeMessage(error?.message || data?.message),
    decisionFactCount: finiteNumber(data?.decision_fact_count),
    actionItemCount: finiteNumber(data?.action_item_count),
    providers: normalizeProviders(data?.provider_statuses),
  };
}

const [{ data: facts, error: factError }, { data: actions, error: actionError }] = await Promise.all([
  supabase
    .from("country_decision_facts")
    .select("fact_key,category,status,severity,summary,value_json,source_name,reference_date,is_stale")
    .eq("project_id", selection.project.id)
    .eq("product_id", selection.product.id)
    .eq("country_code", selection.country.country_code)
    .order("category", { ascending: true }),
  supabase
    .from("country_action_items")
    .select("action_key,title,status,priority,fact_key")
    .eq("project_id", selection.project.id)
    .eq("product_id", selection.product.id)
    .eq("country_code", selection.country.country_code)
    .order("priority", { ascending: true }),
]);

if (factError) throw new Error(`decision fact read failed: ${factError.message}`);
if (actionError) throw new Error(`action item read failed: ${actionError.message}`);

console.log(JSON.stringify({
  authenticated: true,
  invoked: shouldInvoke,
  selection: {
    projectTitle: selection.project.title,
    productName: selection.product.name,
    hs6: selection.product.hs_code,
    hsk10: selection.product.hsk_code,
    countryCode: selection.country.country_code,
    countryName: selection.country.country_name,
    opportunityScore: selection.country.total_score,
  },
  invocation,
  persisted: {
    factCount: facts?.length ?? 0,
    actionCount: actions?.length ?? 0,
    facts: (facts ?? []).map((fact) => ({
      key: fact.fact_key,
      category: fact.category,
      status: fact.status,
      severity: fact.severity,
      summary: safeMessage(fact.summary),
      source: fact.source_name,
      referenceDate: fact.reference_date,
      stale: Boolean(fact.is_stale),
      metrics: pickMetrics(fact.value_json),
    })),
    actions: (actions ?? []).map((action) => ({
      key: action.action_key,
      title: action.title,
      status: action.status,
      priority: action.priority,
      factKey: action.fact_key,
    })),
  },
}, null, 2));

async function findLatestUsableProject() {
  const { data: projects, error } = await supabase
    .from("projects")
    .select("id,title,updated_at")
    .order("updated_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(`project read failed: ${error.message}`);

  for (const project of projects ?? []) {
    const [{ data: products }, { data: countries }] = await Promise.all([
      supabase
        .from("project_products")
        .select("id,name,hs_code,hsk_code,created_at")
        .eq("project_id", project.id)
        .order("created_at", { ascending: false })
        .limit(1),
      supabase
        .from("project_countries")
        .select("country_code,country_name,total_score,rank")
        .eq("project_id", project.id)
        .order("rank", { ascending: true })
        .limit(3),
    ]);
    const product = products?.[0];
    const country = countries?.[0];
    const hs6 = String(product?.hs_code ?? "").replace(/\D/g, "");
    if (product && country && /^\d{6}$/.test(hs6)) {
      return { project, product, country };
    }
  }
  return null;
}

function normalizeProviders(value) {
  if (!Array.isArray(value)) return [];
  return value.map((provider) => ({
    key: text(provider?.key),
    label: text(provider?.label),
    state: text(provider?.state),
    itemCount: finiteNumber(provider?.itemCount) ?? 0,
    message: safeMessage(provider?.message),
    fetchedAt: text(provider?.fetchedAt) || null,
  }));
}

function pickMetrics(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowed = [
    "period",
    "importMarketUsd",
    "importsFromKoreaUsd",
    "koreaSharePct",
    "simpleAveragePct",
    "minRatePct",
    "maxRatePct",
    "currencyUnit",
    "krwPerCurrencyUnit",
    "searchDate",
    "late_payment_rate",
    "average_payment_period",
    "average_late_payment_period",
    "top_payment_term_name",
    "top_payment_term_share",
    "resultCount",
  ];
  return Object.fromEntries(allowed.flatMap((key) => (
    value[key] === undefined || value[key] === null ? [] : [[key, value[key]]]
  )));
}

function readEnvFile(path) {
  const result = {};
  const source = fs.readFileSync(path, "utf8");
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    result[match[1]] = match[2].replace(/^("|')|("|')$/g, "");
  }
  return result;
}

function safeMessage(value) {
  return text(value)
    .replace(/https?:\/\/\S+/g, "[url]")
    .replace(/[?&](?:serviceKey|authkey|apikey|api_key)=[^&\s]+/gi, "")
    .slice(0, 240) || null;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
