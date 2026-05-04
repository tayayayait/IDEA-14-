export interface SafetySearchForm {
  productName: string;
  modelName: string;
  brandName: string;
  certNum: string;
  barcodeNum: string;
}

const EMPTY_SAFETY_SEARCH: SafetySearchForm = {
  productName: "",
  modelName: "",
  brandName: "",
  certNum: "",
  barcodeNum: "",
};

type ComponentsObject = Record<string, unknown>;

export function normalizeSafetySearchForm(input: Partial<SafetySearchForm> | null | undefined): SafetySearchForm {
  return {
    productName: normalizeField(input?.productName),
    modelName: normalizeField(input?.modelName),
    brandName: normalizeField(input?.brandName),
    certNum: normalizeField(input?.certNum),
    barcodeNum: normalizeField(input?.barcodeNum),
  };
}

export function parseSafetySearchFromComponents(raw: unknown): SafetySearchForm {
  const components = parseComponentsObject(raw);
  const saved = asRecord(components.safetySearch);
  return normalizeSafetySearchForm({
    productName: asText(saved.productName),
    modelName: asText(saved.modelName),
    brandName: asText(saved.brandName),
    certNum: asText(saved.certNum),
    barcodeNum: asText(saved.barcodeNum),
  });
}

export function buildInitialSafetySearch(product: {
  name?: string | null;
  components?: unknown;
}): SafetySearchForm {
  const saved = parseSafetySearchFromComponents(product.components);
  return {
    ...saved,
    productName: saved.productName || normalizeField(product.name),
  };
}

export function mergeSafetySearchIntoComponents(
  raw: unknown,
  search: SafetySearchForm,
  updatedAt = new Date().toISOString(),
): string {
  const components = parseComponentsObject(raw);
  const normalized = normalizeSafetySearchForm(search);

  return JSON.stringify({
    ...components,
    safetySearch: {
      ...normalized,
      updatedAt,
    },
  });
}

function parseComponentsObject(raw: unknown): ComponentsObject {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as ComponentsObject;

  const text = asText(raw);
  if (!text || !text.startsWith("{")) return {};

  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as ComponentsObject;
  } catch {
    return {};
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function normalizeField(value: unknown): string {
  return asText(value).replace(/\s+/g, " ").trim();
}

export const emptySafetySearchForm = (): SafetySearchForm => ({ ...EMPTY_SAFETY_SEARCH });
