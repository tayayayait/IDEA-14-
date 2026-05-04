import { readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "api가이드 파일(공공데이터)");
const DEFAULT_REPORT_PATH = path.join(
  ROOT_DIR,
  "docs",
  `phase1-kotra-csv-ingest-report-${new Date().toISOString().slice(0, 10)}.json`,
);

const CACHE_CONFIGS = [
  {
    key: "kotra_csv_export_region_rank",
    table: "kotra_csv_export_region_rank_cache",
    file: "수출 지역 순위_20260429145408.csv",
    encoding: "utf8",
    staleAfterDays: 30,
    parse: parseExportRegionRank,
  },
  {
    key: "kotra_csv_import_regulation",
    table: "kotra_csv_import_regulation_cache",
    file: "대한무역투자진흥공사_국별 대세계 수입규제 현황_20250603.csv",
    encoding: "utf8",
    staleAfterDays: 30,
    parse: parseImportRegulation,
  },
  {
    key: "kotra_csv_trade_office",
    table: "kotra_csv_trade_office_cache",
    file: "대한무역투자진흥공사_무역관 정보_20240603.csv",
    encoding: "utf8",
    staleAfterDays: 180,
    parse: parseTradeOffice,
  },
];

const args = process.argv.slice(2);
const writeMode = args.includes("--write");
const reportArg = args.find((arg) => arg.startsWith("--report="));
const reportPath = reportArg ? reportArg.slice("--report=".length) : DEFAULT_REPORT_PATH;

async function main() {
  loadDotEnv(path.join(ROOT_DIR, ".env"));

  const report = {
    generatedAt: new Date().toISOString(),
    mode: writeMode ? "write" : "dry-run",
    datasets: [],
  };

  let adminClient = null;
  if (writeMode) {
    const supabaseUrl = resolveEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
    const serviceRoleKey = resolveEnv("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error(
        "write mode requires SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY",
      );
    }
    adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  for (const config of CACHE_CONFIGS) {
    const filePath = path.join(DATA_DIR, config.file);
    const startedAt = new Date().toISOString();
    const result = {
      key: config.key,
      table: config.table,
      file: path.relative(ROOT_DIR, filePath).replace(/\\/g, "/"),
      startedAt,
      completedAt: null,
      status: "success",
      message: "",
      counts: {
        sourceRows: 0,
        normalizedRows: 0,
        upsertedRows: 0,
        duplicateRows: 0,
        errorRows: 0,
        invalidHsCodes: 0,
        truncatedHsCodes: 0,
        nullFieldCount: 0,
      },
    };

    try {
      const rows = await readCsvRows(filePath, config.encoding);
      const parsed = config.parse(rows);
      result.counts = {
        sourceRows: parsed.stats.sourceRows,
        normalizedRows: parsed.stats.normalizedRows,
        upsertedRows: parsed.stats.normalizedRows,
        duplicateRows: parsed.stats.duplicateRows,
        errorRows: parsed.stats.errorRows,
        invalidHsCodes: parsed.stats.invalidHsCodes,
        truncatedHsCodes: parsed.stats.truncatedHsCodes,
        nullFieldCount: parsed.stats.nullFieldCount,
      };

      if (writeMode && adminClient) {
        const writeState = await writeCacheBatch({
          admin: adminClient,
          cacheKey: config.key,
          table: config.table,
          staleAfterDays: config.staleAfterDays,
          rows: parsed.rows,
        });
        result.status = writeState.status;
        result.message = writeState.message;
        result.counts.upsertedRows = writeState.upsertedCount;
      } else {
        result.message = "dry-run parsed and validated";
      }
    } catch (error) {
      result.status = "error";
      result.message = toErrorMessage(error);
    }

    result.completedAt = new Date().toISOString();
    report.datasets.push(result);
    console.log(
      `[${config.key}] status=${result.status} source=${result.counts.sourceRows} normalized=${result.counts.normalizedRows} ` +
      `duplicates=${result.counts.duplicateRows} errors=${result.counts.errorRows} upserted=${result.counts.upsertedRows}`,
    );
    if (result.message) {
      console.log(`  message: ${result.message}`);
    }
  }

  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`report written: ${reportPath}`);
}

async function readCsvRows(filePath, encoding) {
  if (!existsSync(filePath)) {
    throw new Error(`file not found: ${filePath}`);
  }
  const buffer = await readFile(filePath);
  const text = decodeText(buffer, encoding);
  return parseCsv(text);
}

function decodeText(buffer, encoding) {
  if (encoding === "cp949") {
    try {
      return new TextDecoder("euc-kr").decode(buffer);
    } catch {
      return buffer.toString("utf8");
    }
  }
  return buffer.toString("utf8");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuote = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuote) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuote = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuote = true;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    if (char !== "\r") {
      field += char;
    }
  }

  row.push(field);
  rows.push(row);

  if (rows.length > 0 && rows[0].length > 0) {
    rows[0][0] = rows[0][0].replace(/^\uFEFF/, "");
  }
  return rows.filter((item) => item.some((col) => normalizeText(col) !== ""));
}

function parseExportRegionRank(rows) {
  const stats = newStats();
  const headerIndex = rows.findIndex((row) => normalizeText(row[0]) === "수출 지역 순위");
  if (headerIndex < 0) {
    throw new Error("header not found: 수출 지역 순위");
  }

  const dataRows = rows.slice(headerIndex + 1);
  stats.sourceRows = dataRows.length;

  const normalizedRows = [];
  const dedupe = new Set();
  let sourceRowNo = 0;

  for (const rawRow of dataRows) {
    sourceRowNo += 1;
    const sourceRank = asInt(rawRow[0]);
    const countryName = normalizeRequiredText(rawRow[1]);
    const countryNormalized = normalizeCountryName(countryName);
    const referenceYear = asInt(rawRow[2]);
    const exportAmount = asNumber(rawRow[3]);
    const importAmount = asNumber(rawRow[4]);
    const exportShare = asNumber(rawRow[5]);
    const importShare = asNumber(rawRow[6]);
    const hsRaw = normalizeRequiredText(rawRow[7]);
    const hsNormalized =
      hsRaw === "전체" || hsRaw === ""
        ? { raw: hsRaw, normalized: "", valid: true, issue: null }
        : normalizeHsCode(hsRaw);
    if (hsRaw !== "전체" && hsRaw && !hsNormalized.valid) {
      stats.errorRows += 1;
      stats.invalidHsCodes += 1;
    }
    if (hsNormalized.issue === "truncated") {
      stats.truncatedHsCodes += 1;
    }

    if (!countryNormalized) {
      stats.errorRows += 1;
      continue;
    }

    const uniqueKey = buildDedupeKey([
      countryNormalized,
      String(referenceYear ?? ""),
      hsNormalized.normalized,
      String(sourceRank ?? ""),
    ]);
    if (dedupe.has(uniqueKey)) {
      stats.duplicateRows += 1;
      continue;
    }
    dedupe.add(uniqueKey);

    stats.nullFieldCount += countNull([referenceYear, exportAmount, importAmount, exportShare, importShare]);
    normalizedRows.push({
      source_row_no: sourceRowNo,
      source_rank: sourceRank,
      country_name: countryName,
      country_name_normalized: countryNormalized,
      reference_year: referenceYear,
      export_amount_usd: exportAmount,
        import_amount_usd: importAmount,
        export_share: exportShare,
        import_share: importShare,
        hs_code_raw: hsRaw,
        hs_code_normalized: hsNormalized.normalized,
      unique_key: uniqueKey,
      raw: {
        source_rank: rawRow[0] ?? "",
        country_name: rawRow[1] ?? "",
        reference_year: rawRow[2] ?? "",
        export_amount_usd: rawRow[3] ?? "",
        import_amount_usd: rawRow[4] ?? "",
        export_share: rawRow[5] ?? "",
        import_share: rawRow[6] ?? "",
        hs_code: rawRow[7] ?? "",
      },
    });
  }

  stats.normalizedRows = normalizedRows.length;
  return { rows: normalizedRows, stats };
}

function parseImportRegulation(rows) {
  const stats = newStats();
  if (rows.length < 2) throw new Error("import regulation file has no data rows");

  const header = rows[0].map((col) => normalizeText(col));
  const itemNameIndex = header.indexOf("품목명");
  const regulationTypeIndex = header.findIndex((col) => col.startsWith("규제형태"));
  const targetCountryIndex = header.indexOf("규제대상국");
  const decisionPeriodIndex = header.findIndex((col) => col.includes("부과기간"));
  const decisionTariffIndex = header.findIndex((col) => col.includes("관세율"));
  const koreaYnIndex = header.indexOf("한국대상여부");
  const hsIndexes = header
    .map((col, index) => ({ col, index }))
    .filter(({ col }) => col.includes("(HS_코드"))
    .map(({ index }) => index);

  if (hsIndexes.length === 0) {
    throw new Error("HS columns are missing in import regulation file");
  }
  if (
    itemNameIndex < 0 ||
    regulationTypeIndex < 0 ||
    targetCountryIndex < 0 ||
    decisionPeriodIndex < 0 ||
    decisionTariffIndex < 0 ||
    koreaYnIndex < 0
  ) {
    throw new Error("required columns are missing in import regulation file");
  }

  const dataRows = rows.slice(1);
  stats.sourceRows = dataRows.length;
  const normalizedRows = [];
  const dedupe = new Set();
  let sourceRowNo = 0;

  for (const rawRow of dataRows) {
    sourceRowNo += 1;
    const sourceSeq = asInt(rawRow[0]);
    const countryCode = normalizeRequiredText(rawRow[1]).toUpperCase();
    const countryName = resolveCountryNameFromIso2(countryCode);
    const countryNormalized = normalizeCountryName(countryName || countryCode);
    const itemName = normalizeRequiredText(rawRow[itemNameIndex]);
    const regulationType = normalizeRequiredText(rawRow[regulationTypeIndex]);
    const targetCountryText = normalizeRequiredText(rawRow[targetCountryIndex]);
    const decisionPeriod = normalizeRequiredText(rawRow[decisionPeriodIndex]);
    const decisionTariff = normalizeRequiredText(rawRow[decisionTariffIndex]);
    const koreaTargetYn = normalizeRequiredText(rawRow[koreaYnIndex]).toUpperCase();
    const isKoreaTarget = koreaTargetYn === "Y";

    const hsValues = hsIndexes
      .map((index) => ({ source_hs_column_no: index, hs_raw: normalizeRequiredText(rawRow[index]) }))
      .filter((item) => item.hs_raw !== "");
    if (hsValues.length === 0) {
      hsValues.push({ source_hs_column_no: 0, hs_raw: "" });
    }

    for (const hsValue of hsValues) {
      const hsResult = normalizeHsCode(hsValue.hs_raw);
      if (hsValue.hs_raw && !hsResult.valid) {
        stats.errorRows += 1;
        stats.invalidHsCodes += 1;
        continue;
      }
      if (hsResult.issue === "truncated") {
        stats.truncatedHsCodes += 1;
      }

      const uniqueKey = buildDedupeKey([
        String(sourceSeq ?? ""),
        countryCode,
        hsResult.normalized,
        itemName,
        regulationType,
        targetCountryText,
      ]);
      if (dedupe.has(uniqueKey)) {
        stats.duplicateRows += 1;
        continue;
      }
      dedupe.add(uniqueKey);

      stats.nullFieldCount += countNull([sourceSeq, hsResult.normalized || null, itemName || null]);
      normalizedRows.push({
        source_row_no: sourceRowNo,
        source_seq: sourceSeq,
        regulation_country_code: countryCode,
        regulation_country_name: countryName,
        regulation_country_normalized: countryNormalized,
        source_hs_column_no: hsValue.source_hs_column_no,
        hs_code_raw: hsValue.hs_raw,
        hs_code_normalized: hsResult.normalized,
        item_name: itemName,
        regulation_type: regulationType,
        target_country_text: targetCountryText,
        decision_period: decisionPeriod,
        decision_tariff: decisionTariff,
        korea_target_yn: koreaTargetYn,
        is_korea_target: isKoreaTarget,
        unique_key: uniqueKey,
        raw: {
          source_seq: rawRow[0] ?? "",
          regulation_country_code: rawRow[1] ?? "",
          item_name: rawRow[itemNameIndex] ?? "",
          regulation_type: rawRow[regulationTypeIndex] ?? "",
          target_country_text: rawRow[targetCountryIndex] ?? "",
          decision_period: rawRow[decisionPeriodIndex] ?? "",
          decision_tariff: rawRow[decisionTariffIndex] ?? "",
          korea_target_yn: rawRow[koreaYnIndex] ?? "",
          hs_raw: hsValue.hs_raw,
          source_hs_column_no: hsValue.source_hs_column_no,
        },
      });
    }
  }

  stats.normalizedRows = normalizedRows.length;
  return { rows: normalizedRows, stats };
}

function parseTradeOffice(rows) {
  const stats = newStats();
  if (rows.length < 2) throw new Error("trade office file has no data rows");

  const dataRows = rows.slice(1);
  stats.sourceRows = dataRows.length;
  const normalizedRows = [];
  const dedupe = new Set();
  let sourceRowNo = 0;

  for (const rawRow of dataRows) {
    sourceRowNo += 1;
    const sourceSeq = asInt(rawRow[0]);
    const countryName = normalizeRequiredText(rawRow[1]);
    const countryNormalized = normalizeCountryName(countryName);
    const officeName = normalizeRequiredText(rawRow[2]);
    const officeAddress = normalizeRequiredText(rawRow[3]);
    const airportRoute = normalizeRequiredText(rawRow[4]);

    if (!countryNormalized || !officeName) {
      stats.errorRows += 1;
      continue;
    }

    const uniqueKey = buildDedupeKey([countryNormalized, officeName]);
    if (dedupe.has(uniqueKey)) {
      stats.duplicateRows += 1;
      continue;
    }
    dedupe.add(uniqueKey);

    stats.nullFieldCount += countNull([sourceSeq, officeAddress || null, airportRoute || null]);
    normalizedRows.push({
      source_row_no: sourceRowNo,
      source_seq: sourceSeq,
      country_name: countryName,
      country_name_normalized: countryNormalized,
      office_name: officeName,
      office_address: officeAddress,
      airport_route_text: airportRoute,
      unique_key: uniqueKey,
      raw: {
        source_seq: rawRow[0] ?? "",
        country_name: rawRow[1] ?? "",
        office_name: rawRow[2] ?? "",
        office_address: rawRow[3] ?? "",
        airport_route_text: rawRow[4] ?? "",
      },
    });
  }

  stats.normalizedRows = normalizedRows.length;
  return { rows: normalizedRows, stats };
}

async function writeCacheBatch(params) {
  const startedAt = new Date().toISOString();
  const batchId = crypto.randomUUID();
  const { admin, cacheKey, table, staleAfterDays, rows } = params;

  await updateCacheStatus(admin, cacheKey, {
    status: "running",
    active_batch_id: null,
    total_count: rows.length,
    fetched_count: rows.length,
    upserted_count: 0,
    stale_after_days: staleAfterDays,
    last_attempt_at: startedAt,
    last_error: null,
  });

  const chunkSize = 500;
  let upsertedCount = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize).map((row) => ({
      ...row,
      batch_id: batchId,
      is_active: true,
    }));
    if (chunk.length === 0) continue;
    const { error } = await admin.from(table).insert(chunk);
    if (error) {
      await updateCacheStatus(admin, cacheKey, {
        status: "error",
        active_batch_id: null,
        total_count: rows.length,
        fetched_count: rows.length,
        upserted_count: upsertedCount,
        stale_after_days: staleAfterDays,
        last_attempt_at: startedAt,
        last_error: error.message,
      });
      return { status: "error", message: error.message, upsertedCount };
    }
    upsertedCount += chunk.length;
  }

  const { error: deactivateError } = await admin
    .from(table)
    .update({ is_active: false })
    .eq("is_active", true)
    .neq("batch_id", batchId);
  if (deactivateError) {
    await updateCacheStatus(admin, cacheKey, {
      status: "error",
      active_batch_id: null,
      total_count: rows.length,
      fetched_count: rows.length,
      upserted_count: upsertedCount,
      stale_after_days: staleAfterDays,
      last_attempt_at: startedAt,
      last_error: deactivateError.message,
    });
    return { status: "error", message: deactivateError.message, upsertedCount };
  }

  await updateCacheStatus(admin, cacheKey, {
    status: "success",
    active_batch_id: batchId,
    total_count: rows.length,
    fetched_count: rows.length,
    upserted_count: upsertedCount,
    stale_after_days: staleAfterDays,
    last_attempt_at: startedAt,
    last_success_at: new Date().toISOString(),
    last_error: null,
  });

  return { status: "success", message: "cache sync completed", upsertedCount };
}

async function updateCacheStatus(admin, cacheKey, patch) {
  const payload = {
    cache_key: cacheKey,
    ...patch,
  };
  const { error } = await admin.from("api_cache_status").upsert(payload);
  if (error) {
    throw new Error(`api_cache_status update failed (${cacheKey}): ${error.message}`);
  }
}

function normalizeHsCode(value) {
  const raw = normalizeText(value);
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return { raw, normalized: "", valid: false, issue: "empty" };
  if (digits.length < 6) return { raw, normalized: "", valid: false, issue: "too_short" };
  if (digits.length > 10) return { raw, normalized: digits.slice(0, 10), valid: true, issue: "truncated" };
  return { raw, normalized: digits, valid: true, issue: null };
}

function resolveCountryNameFromIso2(value) {
  const code = normalizeText(value).toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "";
  const fallback = {
    AE: "UAE",
    US: "미국",
    VN: "베트남",
    ID: "인도네시아",
    CN: "중국",
    JP: "일본",
    KR: "한국",
  };
  if (fallback[code]) return fallback[code];
  if (typeof Intl.DisplayNames === "function") {
    try {
      const display = new Intl.DisplayNames(["ko"], { type: "region" });
      const name = display.of(code);
      if (name) return name;
    } catch {
      // no-op
    }
  }
  return code;
}

function normalizeCountryName(value) {
  const raw = normalizeText(value);
  if (!raw) return "";
  const key = raw.toLowerCase().replace(/[\s'".,()/\-]/g, "");
  const aliasMap = {
    "대한민국": "한국",
    "한국": "한국",
    "남한": "한국",
    "republicofkorea": "한국",
    "southkorea": "한국",
    "korea": "한국",
    "미합중국": "미국",
    "미국": "미국",
    "usa": "미국",
    "us": "미국",
    "unitedstates": "미국",
    "unitedstatesofamerica": "미국",
    "중화인민공화국": "중국",
    "중국": "중국",
    "china": "중국",
    "일본국": "일본",
    "일본": "일본",
    "japan": "일본",
    "베트남사회주의공화국": "베트남",
    "베트남": "베트남",
    "vietnam": "베트남",
    "인도네시아공화국": "인도네시아",
    "인도네시아": "인도네시아",
    "indonesia": "인도네시아",
    "아랍에미리트": "UAE",
    "아랍에미리트연합": "UAE",
    "uae": "UAE",
    "unitedarabemirates": "UAE",
  };
  return aliasMap[key] || raw;
}

function normalizeRequiredText(value) {
  return normalizeText(value);
}

function normalizeText(value) {
  if (typeof value === "string") {
    return value.replace(/\uFEFF/g, "").replace(/\s+/g, " ").trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "";
}

function asInt(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return null;
}

function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function countNull(values) {
  let count = 0;
  for (const value of values) {
    if (value === null || value === undefined || value === "") count += 1;
  }
  return count;
}

function buildDedupeKey(parts) {
  return parts
    .map((part) => normalizeText(part === null || part === undefined ? "" : part))
    .map((part) => (part ? part : "-"))
    .join("|")
    .toLowerCase();
}

function newStats() {
  return {
    sourceRows: 0,
    normalizedRows: 0,
    duplicateRows: 0,
    errorRows: 0,
    invalidHsCodes: 0,
    truncatedHsCodes: 0,
    nullFieldCount: 0,
  };
}

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key) continue;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!Object.prototype.hasOwnProperty.call(process.env, key)) {
      process.env[key] = value;
    }
  }
}

function resolveEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim()) return value.trim();
  }
  return "";
}

function toErrorMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

main().catch((error) => {
  console.error(`ingest failed: ${toErrorMessage(error)}`);
  process.exitCode = 1;
});
