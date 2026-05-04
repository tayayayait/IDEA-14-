export type StepRequirementMeta = {
  requirementRange: string;
  description: string;
};

const REQUIREMENT_LABEL = "\uC694\uAD6C\uC0AC\uD56D";

export const STEP_REQUIREMENT_MAP: Record<number, StepRequirementMeta> = {
  1: {
    requirementRange: `${REQUIREMENT_LABEL} 1`,
    description: "\uAE30\uC5C5\u00B7\uACF5\uC7A5 \uAE30\uBCF8 \uC815\uBCF4 \uC218\uC9D1",
  },
  2: {
    requirementRange: `${REQUIREMENT_LABEL} 2`,
    description: "\uC81C\uD488/HS\u00B7HSK \uCF54\uB4DC \uD655\uC815",
  },
  3: {
    requirementRange: `${REQUIREMENT_LABEL} 3`,
    description: "\uD6C4\uBCF4\uAD6D \uCD94\uCC9C \uBC0F \uADFC\uAC70 \uC810\uC218\uD654",
  },
  4: {
    requirementRange: `${REQUIREMENT_LABEL} 4~7`,
    description:
      "\uC778\uC99D\u00B7\uADDC\uC81C\u00B7\uAD6D\uAC00/\uC5C5\uC885\u00B7\uACB0\uC81C \uB9AC\uC2A4\uD06C \uC0C1\uC138 \uAC80\uC99D",
  },
  5: {
    requirementRange: `${REQUIREMENT_LABEL} 8`,
    description: "\uCD5C\uC885 \uB9AC\uD3EC\uD2B8 \uBC0F PDF \uC0DD\uC131",
  },
};

const STORAGE_PREFIX = "selected-country:";

export function saveLastSelectedCountry(projectId: string, countryCode: string) {
  if (!projectId || !countryCode || typeof window === "undefined") return;
  window.localStorage.setItem(`${STORAGE_PREFIX}${projectId}`, countryCode.toUpperCase());
}

export function loadLastSelectedCountry(projectId: string): string | null {
  if (!projectId || typeof window === "undefined") return null;
  const value = window.localStorage.getItem(`${STORAGE_PREFIX}${projectId}`) ?? "";
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return null;
  return normalized;
}
