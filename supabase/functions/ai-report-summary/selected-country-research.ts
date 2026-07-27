type UnknownRecord = Record<string, unknown>;

export interface SelectedCountryResearchInput {
  company: unknown;
  product: unknown;
  selectedCountry: UnknownRecord;
  programEvidenceCatalog: UnknownRecord[];
  entryStrategies: unknown;
  gateInputs: unknown;
  selectedDetailCounts: unknown;
  evidence: unknown;
  missingEvidence: unknown;
}

export function buildSelectedCountryResearchInput(
  input: UnknownRecord,
): SelectedCountryResearchInput {
  const topCountries = toRecordArray(input.topCountries);
  const programEvidenceCatalog = toRecordArray(input.programEvidenceCatalog)
    .filter((item) => (
      item.category !== "country" || item.evidenceId === "P-COUNTRY-001"
    ));

  return {
    company: input.company ?? null,
    product: input.product ?? null,
    selectedCountry: topCountries[0] ?? {},
    programEvidenceCatalog,
    entryStrategies: input.entryStrategies ?? [],
    gateInputs: input.gateInputs ?? null,
    selectedDetailCounts: input.selectedDetailCounts ?? null,
    evidence: input.evidence ?? null,
    missingEvidence: input.missingEvidence ?? [],
  };
}

function toRecordArray(value: unknown): UnknownRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is UnknownRecord => (
    Boolean(item) && typeof item === "object" && !Array.isArray(item)
  ));
}
