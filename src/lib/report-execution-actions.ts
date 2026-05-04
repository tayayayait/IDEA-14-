import { normalizeReportText, toSafePublicUrl } from "@/lib/report-text";
import { buildTradeOfficeSummary } from "@/lib/trade-office-summary";

export type CountryExecutionActionType = "trade_office_action" | "exhibition_action";

export interface CountryExecutionAction {
  type: CountryExecutionActionType;
  title: string;
  url: string | null;
  summary: string | null;
  displaySummary: string | null;
}

export interface CountryExecutionActions {
  countryCode: string;
  countryName: string;
  tradeOffices: CountryExecutionAction[];
  exhibitions: CountryExecutionAction[];
}

export interface CountryExecutionSource {
  type?: string | null;
  title?: string | null;
  url?: string | null;
  summary?: string | null;
  office_name?: string | null;
  office_address?: string | null;
  airport_route_text?: string | null;
  summary_source?: string | null;
}

export interface CountryExecutionRow {
  country_code: string;
  country_name: string;
  rationale?: {
    sources?: CountryExecutionSource[];
  } | null;
}

export function buildCountryExecutionActions(rows: CountryExecutionRow[]): CountryExecutionActions[] {
  const out: CountryExecutionActions[] = [];

  for (const row of rows) {
    const sources = row.rationale?.sources;
    if (!Array.isArray(sources) || sources.length === 0) continue;

    const tradeOffices = extractCountryExecutionActionSources(sources, "trade_office_action");
    const exhibitions = extractCountryExecutionActionSources(sources, "exhibition_action");
    if (tradeOffices.length === 0 && exhibitions.length === 0) continue;

    out.push({
      countryCode: row.country_code,
      countryName: row.country_name,
      tradeOffices,
      exhibitions,
    });
  }

  return out;
}

function extractCountryExecutionActionSources(
  sources: CountryExecutionSource[],
  targetType: CountryExecutionActionType,
): CountryExecutionAction[] {
  const out: CountryExecutionAction[] = [];
  const seen = new Set<string>();

  for (const source of sources) {
    const sourceType = normalizeReportText(source.type)?.toLowerCase() ?? "";
    if (sourceType !== targetType) continue;

    const title = normalizeReportText(source.title) ?? "";
    if (!title) continue;

    const url = toSafePublicUrl(source.url) ?? null;
    const summary = normalizeReportText(source.summary) ?? null;
    const displaySummary = buildDisplaySummary(source, targetType, title, summary);
    const dedupeKey = `${sourceType}|${title.toLowerCase()}|${url ?? ""}`;
    if (seen.has(dedupeKey)) continue;

    seen.add(dedupeKey);
    out.push({ type: targetType, title, url, summary, displaySummary });
    if (out.length >= 3) break;
  }

  return out;
}

function buildDisplaySummary(
  source: CountryExecutionSource,
  targetType: CountryExecutionActionType,
  title: string,
  summary: string | null,
): string | null {
  if (targetType !== "trade_office_action") return summary;

  const officeName = normalizeReportText(source.office_name);
  const officeAddress = normalizeReportText(source.office_address);
  const airportRouteText = normalizeReportText(source.airport_route_text);
  const summarySource = normalizeReportText(source.summary_source);
  if (officeName || officeAddress || airportRouteText) {
    const rebuilt = buildTradeOfficeSummary({
      title,
      officeName,
      officeAddress,
      airportRouteText,
      summary,
      summarySource,
    });
    return normalizeReportText(rebuilt) ?? null;
  }

  return trimLegacyTruncatedSummary(summary);
}

function trimLegacyTruncatedSummary(value: string | null): string | null {
  const text = normalizeReportText(value);
  if (!text) return null;
  if (!/(?:\.\.\.|…)$/.test(text)) return text;

  const withoutEllipsis = text.replace(/\s*(?:\.\.\.|…)$/, "").trim();
  const boundary = findLastSentenceBoundary(withoutEllipsis);
  if (boundary < 0) return null;
  return withoutEllipsis.slice(0, boundary + 1).trim() || null;
}

function findLastSentenceBoundary(value: string): number {
  const matches = [...value.matchAll(/[.。!?]/g)];
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const boundary = matches[index].index ?? -1;
    if (boundary < 0) continue;

    const previous = value.charAt(boundary - 1);
    if (!/[가-힣]/.test(previous)) continue;

    const next = value.slice(boundary + 1).trimStart().charAt(0);
    if (/^\d$/.test(next)) continue;
    return boundary;
  }
  return -1;
}
